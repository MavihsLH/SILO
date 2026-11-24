"""
SILO Headless Benchmark Runner
==============================
Runs controlled retrieval ablations and end-to-end RAG / Agentic LangGraph
benchmarks directly against RAGEngine (no browser or FastAPI overhead).

Features:
- Stage 1: 3-Way Retrieval Ablation (Dense-Only vs. Hybrid BM25 vs. Hybrid + Cross-Encoder Rerank)
           Measures Recall@1, Recall@3, Recall@5, MRR@5, and p50/p95 retrieval latency.
- Stage 2: End-to-End Generation & Agentic LangGraph Benchmark
           Compares `simple_rag` vs `agentic_crag` (with Self-RAG strict verification).
           Measures TTFT, total latency, tokens/sec, peak process RAM, CRAG routing accuracy,
           Self-RAG retry rate, and captures full contexts for cloud LLM-as-a-Judge scoring.
- Crash-safe JSONL checkpointing (auto-resumes where you left off).
"""

import argparse
import asyncio
import ctypes
import gc
import json
import os
import platform
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Ensure project root is importable
BENCH_DIR = Path(__file__).resolve().parent
ROOT_DIR = BENCH_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from llama_index.core import VectorStoreIndex
from llama_index.vector_stores.qdrant import QdrantVectorStore

from rag_engine import RAGEngine
from agent_graph import agent_graph

RESULTS_DIR = BENCH_DIR / "results"
DATASET_PATH = BENCH_DIR / "eval_dataset.json"
RETRIEVAL_OUT_PATH = RESULTS_DIR / "retrieval_ablation.json"
E2E_OUT_PATH = RESULTS_DIR / "e2e_runs.jsonl"
META_OUT_PATH = RESULTS_DIR / "run_metadata.json"


# ============================================================
# Windows-Native RAM & Process Telemetry (Zero Extra Deps)
# ============================================================

def get_system_ram() -> Dict[str, Any]:
    if platform.system() == "Windows":
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]
        stat = MEMORYSTATUSEX()
        stat.dwLength = ctypes.sizeof(stat)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
        return {
            "total_gb": round(stat.ullTotalPhys / (1024 ** 3), 2),
            "available_gb": round(stat.ullAvailPhys / (1024 ** 3), 2),
            "percent_used": int(stat.dwMemoryLoad),
        }
    return {"total_gb": None, "available_gb": None, "percent_used": None}


def get_process_ram_mb() -> Dict[str, Optional[float]]:
    if platform.system() == "Windows":
        class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
            _fields_ = [
                ("cb", ctypes.c_ulong),
                ("PageFaultCount", ctypes.c_ulong),
                ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t),
            ]
        counters = PROCESS_MEMORY_COUNTERS()
        counters.cb = ctypes.sizeof(counters)
        kernel32 = ctypes.windll.kernel32
        psapi = ctypes.windll.psapi
        kernel32.GetCurrentProcess.restype = ctypes.c_void_p
        psapi.GetProcessMemoryInfo.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(PROCESS_MEMORY_COUNTERS),
            ctypes.c_ulong,
        ]
        psapi.GetProcessMemoryInfo.restype = ctypes.c_bool
        h_proc = kernel32.GetCurrentProcess()
        if psapi.GetProcessMemoryInfo(h_proc, ctypes.byref(counters), counters.cb):
            return {
                "current_rss_mb": round(counters.WorkingSetSize / (1024 ** 2), 1),
                "peak_rss_mb": round(counters.PeakWorkingSetSize / (1024 ** 2), 1),
            }
    return {"current_rss_mb": None, "peak_rss_mb": None}


def percentile(values: List[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(s) - 1)
    if f == c:
        return round(s[f], 2)
    return round(s[f] + (k - f) * (s[c] - s[f]), 2)


# ============================================================
# Retrieval Hit Evaluation
# ============================================================

def is_node_relevant(node_text: str, metadata: Dict[str, Any], item: Dict[str, Any]) -> bool:
    expected_file = (item.get("expected_file") or "").lower()
    expected_pages = {str(p).strip() for p in item.get("expected_pages", [])}
    expected_keywords = [kw.lower() for kw in item.get("expected_keywords", [])]

    file_name = str(metadata.get("file_name") or "").lower()
    if expected_file and file_name and os.path.basename(file_name) != os.path.basename(expected_file):
        return False

    page_str = str(metadata.get("source") or metadata.get("page_label") or "").strip()
    page_match = bool(expected_pages and page_str in expected_pages)

    text_lower = (node_text or "").lower()
    kw_hits = sum(1 for kw in expected_keywords if kw in text_lower)
    kw_match = kw_hits > 0 if len(expected_keywords) <= 2 else kw_hits >= 2

    return page_match or kw_match


# ============================================================
# Stage 1: Controlled 3-Way Retrieval Ablation
# ============================================================

async def run_retrieval_ablation(
    engine: RAGEngine,
    dataset: List[Dict[str, Any]],
    candidate_k: int = 15,
    eval_k: int = 5,
) -> Dict[str, Any]:
    answerable = [q for q in dataset if q.get("is_answerable", True)]
    print(f"\n{'=' * 64}")
    print(f"STAGE 1: 3-Way Retrieval Ablation ({len(answerable)} answerable queries)")
    print(f"  Modes: dense_only | hybrid_bm25 | hybrid_bm25_rerank (SILO)")
    print(f"{'=' * 64}")

    # Pre-build VectorStoreIndex per collection so we don't re-init sparse models per query
    collections = sorted({q["collection"] for q in answerable})
    indices: Dict[str, VectorStoreIndex] = {}
    for col in collections:
        vs = QdrantVectorStore(
            aclient=engine.qdrant_client,
            collection_name=col,
            enable_hybrid=True,
            fastembed_sparse_model="Qdrant/bm25",
        )
        indices[col] = VectorStoreIndex.from_vector_store(vector_store=vs)

    modes = ["dense_only", "hybrid_bm25", "hybrid_bm25_rerank"]
    per_mode_rows: Dict[str, List[Dict[str, Any]]] = {m: [] for m in modes}

    for idx_i, item in enumerate(answerable, start=1):
        col = item["collection"]
        q = item["question"]
        index = indices[col]

        for mode in modes:
            t0 = time.perf_counter()
            if mode == "dense_only":
                retriever = index.as_retriever(
                    similarity_top_k=eval_k,
                    vector_store_query_mode="default",
                )
                nodes = await retriever.aretrieve(q)
            elif mode == "hybrid_bm25":
                retriever = index.as_retriever(
                    similarity_top_k=eval_k,
                    vector_store_query_mode="hybrid",
                )
                nodes = await retriever.aretrieve(q)
            else:  # hybrid_bm25_rerank
                retriever = index.as_retriever(
                    similarity_top_k=candidate_k,
                    vector_store_query_mode="hybrid",
                )
                cand_nodes = await retriever.aretrieve(q)
                engine.reranker.top_n = eval_k
                nodes = engine.reranker.postprocess_nodes(cand_nodes, query_str=q)

            latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)

            ranks = []
            top_files = []
            top_pages = []
            for r_idx, node in enumerate(nodes[:eval_k], start=1):
                md = node.metadata or {}
                top_files.append(md.get("file_name"))
                top_pages.append(str(md.get("source", "")))
                if is_node_relevant(node.text, md, item):
                    ranks.append(r_idx)

            first_hit = ranks[0] if ranks else None
            per_mode_rows[mode].append({
                "id": item["id"],
                "category": item["category"],
                "collection": col,
                "latency_ms": latency_ms,
                "first_hit_rank": first_hit,
                "hit_at_1": 1 if (first_hit is not None and first_hit <= 1) else 0,
                "hit_at_3": 1 if (first_hit is not None and first_hit <= 3) else 0,
                "hit_at_5": 1 if (first_hit is not None and first_hit <= 5) else 0,
                "mrr_at_5": round(1.0 / first_hit, 4) if first_hit else 0.0,
                "top_files": top_files,
                "top_pages": top_pages,
            })

        if idx_i % 5 == 0 or idx_i == len(answerable):
            print(f"  [Retrieval] Completed {idx_i}/{len(answerable)} queries...")

    summary: Dict[str, Any] = {}
    for mode in modes:
        rows = per_mode_rows[mode]
        lats = [r["latency_ms"] for r in rows]

        def agg(subset: List[Dict[str, Any]]) -> Dict[str, Any]:
            n = max(len(subset), 1)
            sub_lats = [r["latency_ms"] for r in subset]
            return {
                "count": len(subset),
                "recall_at_1": round(sum(r["hit_at_1"] for r in subset) / n, 4),
                "recall_at_3": round(sum(r["hit_at_3"] for r in subset) / n, 4),
                "recall_at_5": round(sum(r["hit_at_5"] for r in subset) / n, 4),
                "mrr_at_5": round(sum(r["mrr_at_5"] for r in subset) / n, 4),
                "p50_ms": percentile(sub_lats, 50),
                "p95_ms": percentile(sub_lats, 95),
                "mean_ms": round(statistics.mean(sub_lats), 2) if sub_lats else 0.0,
            }

        by_cat = {}
        for cat in sorted({r["category"] for r in rows}):
            by_cat[cat] = agg([r for r in rows if r["category"] == cat])

        summary[mode] = {
            "overall": agg(rows),
            "by_category": by_cat,
        }

    output = {
        "timestamp": datetime.now().isoformat(),
        "eval_k": eval_k,
        "candidate_k": candidate_k,
        "summary": summary,
        "details": per_mode_rows,
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    with open(RETRIEVAL_OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print("\n  Retrieval Ablation Summary:")
    print(f"  {'Mode':<22} {'R@1':>7} {'R@3':>7} {'R@5':>7} {'MRR@5':>7} {'p50(ms)':>9}")
    print(f"  {'-' * 62}")
    for mode in modes:
        s = summary[mode]["overall"]
        print(
            f"  {mode:<22} "
            f"{s['recall_at_1']*100:>6.1f}% "
            f"{s['recall_at_3']*100:>6.1f}% "
            f"{s['recall_at_5']*100:>6.1f}% "
            f"{s['mrr_at_5']:>7.3f} "
            f"{s['p50_ms']:>9.1f}"
        )

    gc.collect()
    return output


# ============================================================
# Stage 2: End-to-End Generation & Agentic LangGraph Runs
# ============================================================

async def run_single_simple_rag(
    engine: RAGEngine,
    index: VectorStoreIndex,
    item: Dict[str, Any],
    top_k: int,
) -> Dict[str, Any]:
    q = item["question"]
    t_start = time.perf_counter()

    # 1. Hybrid Retrieve + Rerank
    retriever = index.as_retriever(
        similarity_top_k=max(15, top_k * 5),
        vector_store_query_mode="hybrid",
    )
    cand_nodes = await retriever.aretrieve(q)
    engine.reranker.top_n = top_k
    nodes = engine.reranker.postprocess_nodes(cand_nodes, query_str=q)
    retrieval_ms = round((time.perf_counter() - t_start) * 1000.0, 2)

    contexts = [n.text for n in nodes]
    sources_meta = [
        {
            "file_name": (n.metadata or {}).get("file_name"),
            "page": str((n.metadata or {}).get("source", "")),
            "score": round(float(n.score or 0.0), 4),
            "type": "local",
        }
        for n in nodes
    ]

    # Exact production prompt from rag_engine.py (v2 strict grounding + table/unit alignment)
    if contexts:
        context_block = "\n\n---\n\n".join(contexts)
        prompt = (
            f"You are a precise, strictly grounded document analyst. Answer the user's question using ONLY the provided Context.\n"
            f"Rules:\n"
            f"1. Never invent, guess, or pull facts/numbers from outside memory. If the Context does not contain the specific entity, time period, or metric requested (or if the question has a false premise), explicitly state that the provided documents do not contain that information.\n"
            f"2. Always preserve exact units and scale (e.g., 'in millions', 'in billions', '%') shown in table headers or context headers.\n"
            f"3. When reading pipe-delimited ('|') tables, carefully match each number to its exact row label and column header before reporting it.\n"
            f"4. Be concise, accurate, and direct.\n\n"
            f"## Context:\n{context_block}\n\n"
            f"## Question:\n{q}"
        )
    else:
        prompt = (
            f"You are a precise document analyst. The local knowledge base returned no relevant passages for this query.\n"
            f"Explicitly state that the uploaded documents do not contain information to answer this question. Do not guess or fabricate facts.\n\n"
            f"## Question:\n{q}"
        )

    # 2. Stream generation to measure exact TTFT & TPS
    t_gen_start = time.perf_counter()
    ttft_ms: Optional[float] = None
    chunks: List[str] = []
    token_events = 0
    error_msg = None

    try:
        stream_gen = await engine.llm.astream_complete(prompt)
        async for chunk in stream_gen:
            delta = chunk.delta or ""
            if delta:
                if ttft_ms is None:
                    ttft_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
                chunks.append(delta)
                token_events += 1
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"

    t_end = time.perf_counter()
    total_ms = round((t_end - t_start) * 1000.0, 2)
    gen_sec = max(t_end - t_gen_start, 0.001)
    answer = "".join(chunks).strip()
    approx_tokens = max(token_events, int(len(answer.split()) * 1.3))
    tps = round(approx_tokens / gen_sec, 2) if answer else 0.0

    return {
        "mode": "simple_rag",
        "id": item["id"],
        "category": item["category"],
        "collection": item["collection"],
        "is_answerable": item["is_answerable"],
        "question": q,
        "ground_truth": item["ground_truth"],
        "answer": answer,
        "contexts": contexts,
        "sources_meta": sources_meta,
        "metrics": {
            "retrieval_ms": retrieval_ms,
            "ttft_ms": ttft_ms if ttft_ms is not None else total_ms,
            "total_ms": total_ms,
            "approx_tokens": approx_tokens,
            "tokens_per_sec": tps,
        },
        "agent_trace": None,
        "ram": {**get_process_ram_mb(), "sys_percent_used": get_system_ram().get("percent_used")},
        "error": error_msg,
        "timestamp": datetime.now().isoformat(),
    }


async def run_single_agentic_crag(
    engine: RAGEngine,
    item: Dict[str, Any],
    top_k: int,
    strict_mode: bool,
) -> Dict[str, Any]:
    q = item["question"]
    t_start = time.perf_counter()
    ttft_ms: Optional[float] = None
    token_events = 0
    status_events: List[str] = []
    error_msg = None

    async def on_token_collector(data: Dict[str, Any]):
        nonlocal ttft_ms, token_events
        ev_type = data.get("type")
        if ev_type == "status":
            status_events.append(str(data.get("status", "")))
        elif ev_type == "token":
            if ttft_ms is None:
                ttft_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
            token_events += 1

    initial_state = {
        "question": q,
        "original_question": q,
        "documents": [],
        "sources": [],
        "web_search": False,
        "generation": "",
        "retry_count": 0,
        "strict_mode": strict_mode,
        "is_grounded": True,
    }
    config = {
        "configurable": {
            "engine": engine,
            "safe_name": item["collection"],
            "top_k": top_k,
            "on_token": on_token_collector,
        }
    }

    final_state: Dict[str, Any] = {}
    try:
        final_state = await agent_graph.ainvoke(initial_state, config)
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"

    t_end = time.perf_counter()
    total_ms = round((t_end - t_start) * 1000.0, 2)
    answer = str(final_state.get("generation", "")).strip()
    docs = final_state.get("documents", []) or []
    contexts = [str(d.get("text", "")) for d in docs]
    sources_meta = [
        {
            "file_name": (d.get("metadata") or {}).get("file_name") or (d.get("metadata") or {}).get("title"),
            "page": str((d.get("metadata") or {}).get("source", "")),
            "url": (d.get("metadata") or {}).get("url"),
            "score": round(float(d.get("score") or 0.0), 4),
            "type": d.get("type", "local"),
        }
        for d in docs
    ]

    web_triggered = bool(final_state.get("web_search", False)) or any(
        d.get("type") == "web" for d in docs
    )
    rewritten_q = final_state.get("question")
    was_rewritten = bool(rewritten_q and rewritten_q.strip() != q.strip())
    approx_tokens = max(token_events, int(len(answer.split()) * 1.3))

    return {
        "mode": "agentic_crag",
        "id": item["id"],
        "category": item["category"],
        "collection": item["collection"],
        "is_answerable": item["is_answerable"],
        "question": q,
        "ground_truth": item["ground_truth"],
        "answer": answer,
        "contexts": contexts,
        "sources_meta": sources_meta,
        "metrics": {
            "retrieval_ms": None,
            "ttft_ms": ttft_ms if ttft_ms is not None else total_ms,
            "total_ms": total_ms,
            "approx_tokens": approx_tokens,
            "tokens_per_sec": round(approx_tokens / max(total_ms / 1000.0, 0.001), 2) if answer else 0.0,
        },
        "agent_trace": {
            "strict_mode": strict_mode,
            "web_search_triggered": web_triggered,
            "retry_count": int(final_state.get("retry_count", 0)),
            "is_grounded": bool(final_state.get("is_grounded", True)),
            "was_rewritten": was_rewritten,
            "rewritten_question": rewritten_q if was_rewritten else None,
            "docs_final_count": len(docs),
            "local_docs_count": sum(1 for d in docs if d.get("type") == "local"),
            "web_docs_count": sum(1 for d in docs if d.get("type") == "web"),
            "status_events": status_events,
        },
        "ram": {**get_process_ram_mb(), "sys_percent_used": get_system_ram().get("percent_used")},
        "error": error_msg,
        "timestamp": datetime.now().isoformat(),
    }


def load_completed_keys(path: Path) -> Set[Tuple[str, str]]:
    done: Set[Tuple[str, str]] = set()
    if not path.exists():
        return done
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                if not rec.get("error"):
                    done.add((rec["mode"], rec["id"]))
            except Exception:
                continue
    return done


async def run_e2e_suite(
    engine: RAGEngine,
    dataset: List[Dict[str, Any]],
    modes: List[str],
    top_k: int,
    strict_mode: bool,
    fresh: bool,
) -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    if fresh and E2E_OUT_PATH.exists():
        E2E_OUT_PATH.unlink()

    completed = load_completed_keys(E2E_OUT_PATH)
    total_jobs = len(dataset) * len(modes)
    already_done = sum(1 for m in modes for q in dataset if (m, q["id"]) in completed)

    print(f"\n{'=' * 64}")
    print(f"STAGE 2: End-to-End Generation & Agentic LangGraph Benchmark")
    print(f"  Modes: {modes} | top_k={top_k} | strict_mode={strict_mode}")
    print(f"  Total runs: {total_jobs} (resuming: {already_done} already checkpointed)")
    print(f"{'=' * 64}")

    # Pre-build VectorStoreIndex objects for simple_rag
    indices: Dict[str, VectorStoreIndex] = {}
    if "simple_rag" in modes:
        for col in sorted({q["collection"] for q in dataset}):
            vs = QdrantVectorStore(
                aclient=engine.qdrant_client,
                collection_name=col,
                enable_hybrid=True,
                fastembed_sparse_model="Qdrant/bm25",
            )
            indices[col] = VectorStoreIndex.from_vector_store(vector_store=vs)

    # Warm up Ollama once so question #1 doesn't pay cold model-load latency in TTFT stats
    print("  Warming up local Ollama LLM (excluding cold-start from latency stats)...")
    try:
        t_warm = time.perf_counter()
        await engine.llm.acomplete("Reply with OK.")
        print(f"  Model warm-up complete in {time.perf_counter() - t_warm:.1f}s.")
    except Exception as e:
        print(f"  [WARN] Warm-up failed ({e}). Continuing anyway...")

    job_idx = 0
    for mode in modes:
        print(f"\n--- Running mode: {mode} ---")
        for item in dataset:
            job_idx += 1
            key = (mode, item["id"])
            if key in completed:
                print(f"  [{job_idx}/{total_jobs}] SKIP {mode} | {item['id']} (already checkpointed)")
                continue

            print(f"  [{job_idx}/{total_jobs}] RUN  {mode} | {item['id']} ({item['category']})...", end=" ", flush=True)
            if mode == "simple_rag":
                rec = await run_single_simple_rag(engine, indices[item["collection"]], item, top_k=top_k)
            else:
                rec = await run_single_agentic_crag(engine, item, top_k=top_k, strict_mode=strict_mode)

            with open(E2E_OUT_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")

            if rec["error"]:
                print(f"ERROR: {rec['error']}")
            else:
                m = rec["metrics"]
                extra = ""
                if rec["agent_trace"]:
                    tr = rec["agent_trace"]
                    extra = f" | web={tr['web_search_triggered']} retries={tr['retry_count']}"
                print(
                    f"done in {m['total_ms']/1000:.1f}s "
                    f"(TTFT {m['ttft_ms']/1000:.1f}s, {m['tokens_per_sec']:.1f} tok/s{extra})"
                )

            gc.collect()


# ============================================================
# Main CLI
# ============================================================

async def async_main(args: argparse.Namespace) -> None:
    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        dataset: List[Dict[str, Any]] = json.load(f)

    if args.quick:
        # Balanced 6-question smoke test: 2 finance + 2 papers + 2 adversarial
        fin = [q for q in dataset if q["category"] == "finance_10k"][:2]
        pap = [q for q in dataset if q["category"] == "research_papers"][:2]
        adv = [q for q in dataset if q["category"] == "adversarial"][:2]
        dataset = fin + pap + adv
        print(f"[Quick Smoke Test] Selected {len(dataset)} representative questions.")
    elif args.limit:
        dataset = dataset[: args.limit]
        print(f"[Limit] Running first {len(dataset)} questions.")

    print("Initializing SILO RAGEngine (headless)...")
    t_init = time.perf_counter()
    engine = RAGEngine()
    init_sec = round(time.perf_counter() - t_init, 2)
    settings = engine.get_settings()

    if args.chat_model:
        settings = engine.update_settings(
            chat_model=args.chat_model,
            ingestion_model=settings.get("ingestion_model", "llama3.2:1b"),
            strict_mode=settings.get("strict_mode", False),
        )

    print(f"RAGEngine ready in {init_sec}s | Chat Model: {settings.get('chat_model')} | Sys RAM: {get_system_ram()}")

    # Verify required Qdrant collections exist
    cols_resp = await engine.qdrant_client.get_collections()
    existing_cols = {c.name for c in cols_resp.collections}
    needed_cols = {q["collection"] for q in dataset}
    missing = needed_cols - existing_cols
    if missing:
        print(f"\n[ERROR] Missing Qdrant collections: {missing}")
        print("Make sure Qdrant Docker container is running (`docker start Qdrant-db`) and collections are indexed.")
        sys.exit(1)

    if not args.skip_retrieval:
        await run_retrieval_ablation(engine, dataset, candidate_k=15, eval_k=5)

    if not args.skip_e2e:
        modes = [m.strip() for m in args.modes.split(",") if m.strip()]
        await run_e2e_suite(
            engine=engine,
            dataset=dataset,
            modes=modes,
            top_k=args.top_k,
            strict_mode=not args.no_strict,
            fresh=args.fresh,
        )

    # Save hardware & run metadata for the report generator
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    meta = {
        "timestamp": datetime.now().isoformat(),
        "chat_model": settings.get("chat_model"),
        "embed_model": "BAAI/bge-small-en-v1.5",
        "sparse_model": "Qdrant/bm25",
        "reranker_model": "cross-encoder/ms-marco-MiniLM-L-6-v2",
        "top_k": args.top_k,
        "strict_mode": not args.no_strict,
        "dataset_size": len(dataset),
        "engine_init_sec": init_sec,
        "system_ram": get_system_ram(),
        "process_ram_final": get_process_ram_mb(),
        "platform": platform.platform(),
        "processor": platform.processor(),
    }
    with open(META_OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"\n{'=' * 64}")
    print("LOCAL BENCHMARK COMPLETE!")
    print(f"  Peak Process RAM : {meta['process_ram_final'].get('peak_rss_mb')} MB")
    print(f"  Retrieval Output : {RETRIEVAL_OUT_PATH}")
    print(f"  E2E Runs Output  : {E2E_OUT_PATH}")
    print("Next step: Export bundles for Gemini Web Chat (`prepare_and_compile.py --export` or Option [4] in run_benchmark.bat)!")
    print(f"{'=' * 64}")


def main():
    parser = argparse.ArgumentParser(description="SILO Headless Benchmark Runner")
    parser.add_argument("--modes", default="simple_rag,agentic_crag", help="Comma-separated modes: simple_rag,agentic_crag")
    parser.add_argument("--top-k", type=int, default=4, help="Top-K reranked chunks passed to LLM (default: 4)")
    parser.add_argument("--chat-model", default=None, help="Override Ollama chat model (e.g., llama3.1:8b)")
    parser.add_argument("--no-strict", action="store_true", help="Disable Self-RAG strict hallucination check in agentic_crag")
    parser.add_argument("--skip-retrieval", action="store_true", help="Skip Stage 1 retrieval ablation")
    parser.add_argument("--skip-e2e", action="store_true", help="Skip Stage 2 end-to-end LLM generation")
    parser.add_argument("--quick", action="store_true", help="Run 6-question smoke test (2 finance + 2 papers + 2 adversarial)")
    parser.add_argument("--limit", type=int, default=None, help="Run only first N questions")
    parser.add_argument("--fresh", action="store_true", help="Clear previous E2E checkpoints and start from scratch")
    args = parser.parse_args()

    asyncio.run(async_main(args))


if __name__ == "__main__":
    main()
