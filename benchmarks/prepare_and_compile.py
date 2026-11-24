"""
SILO Benchmark Exporter & Report Compiler (Gemini Web Chat Workflow)
====================================================================
No Gemini API key required!

Workflow:
  1. `--export`: Packages `results/e2e_runs.jsonl` into clean, token-optimized
     JSON batches in `benchmarks/for_gemini_web/` ready to upload to Gemini Web Chat
     alongside `SCORING_RUBRIC_PROMPT.md`.
  2. You upload each batch + `SCORING_RUBRIC_PROMPT.md` to Gemini Web Chat,
     and save Gemini's returned JSON array(s) into `benchmarks/results/gemini_scores_*.json`
     (or a single `benchmarks/results/gemini_scores.json`).
  3. `--compile`: Validates all scored rows, merges Gemini's scores with Stage 1
     Retrieval Ablations + LangGraph Agentic Telemetry + Edge Latency/RAM stats,
     and writes publication-ready `benchmarks/BENCHMARK_REPORT.md` with resume bullets.
"""

import argparse
import json
import re
import shutil
import statistics
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

BENCH_DIR = Path(__file__).resolve().parent
RESULTS_DIR = BENCH_DIR / "results"
V1_BASELINE_DIR = BENCH_DIR / "v1_baseline" / "results"
EXPORT_DIR = BENCH_DIR / "for_gemini_web"

RETRIEVAL_PATH = RESULTS_DIR / "retrieval_ablation.json"
E2E_PATH = RESULTS_DIR / "e2e_runs.jsonl"
META_PATH = RESULTS_DIR / "run_metadata.json"
RUBRIC_PATH = BENCH_DIR / "SCORING_RUBRIC_PROMPT.md"
REPORT_PATH = BENCH_DIR / "BENCHMARK_REPORT.md"


# ============================================================
# Step 1: Export Clean Batches for Gemini Web Chat
# ============================================================

def export_for_gemini(max_context_chars: int = 1800) -> None:
    if not E2E_PATH.exists():
        print(f"[ERROR] {E2E_PATH} not found. Run `benchmarks/run_benchmark.py` first!")
        sys.exit(1)

    # Deduplicate keeping latest run per (mode, id)
    e2e_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
    with open(E2E_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            e2e_map[(rec["mode"], rec["id"])] = rec

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    # Remove stale batch files
    for old in EXPORT_DIR.glob("batch_*.json"):
        old.unlink()

    # Copy rubric right alongside batches so everything to upload is in one folder
    if RUBRIC_PATH.exists():
        shutil.copy2(RUBRIC_PATH, EXPORT_DIR / "SCORING_RUBRIC_PROMPT.md")

    by_mode: Dict[str, List[Dict[str, Any]]] = {}
    for rec in e2e_map.values():
        mode = rec["mode"]
        by_mode.setdefault(mode, []).append(rec)

    exported_files: List[Tuple[str, Path, int]] = []
    batch_idx = 0
    for mode in ["simple_rag", "agentic_crag"] + [m for m in by_mode if m not in ("simple_rag", "agentic_crag")]:
        rows = by_mode.get(mode)
        if not rows:
            continue
        batch_idx += 1
        compact_rows = []
        for r in rows:
            trace = r.get("agent_trace") or {}
            compact_rows.append({
                "mode": r["mode"],
                "id": r["id"],
                "category": r["category"],
                "is_answerable": r["is_answerable"],
                "question": r["question"],
                "ground_truth": r["ground_truth"],
                "web_search_triggered": bool(trace.get("web_search_triggered", False)),
                "contexts": [
                    (c[:max_context_chars] + ("... [truncated]" if len(c) > max_context_chars else ""))
                    for c in (r.get("contexts") or [])
                ],
                "answer": r.get("answer") or (f"[RUN ERROR: {r.get('error')}]" if r.get("error") else ""),
            })

        out_path = EXPORT_DIR / f"batch_{batch_idx}_{mode}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(compact_rows, f, indent=2, ensure_ascii=False)
        exported_files.append((mode, out_path, len(compact_rows)))

    print(f"\n{'=' * 68}")
    print("EXPORTED BUNDLES FOR GEMINI WEB CHAT")
    print(f"  Folder: {EXPORT_DIR}")
    print(f"{'=' * 68}")
    print(f"  Rubric : {EXPORT_DIR / 'SCORING_RUBRIC_PROMPT.md'}")
    for mode, path, count in exported_files:
        size_kb = path.stat().st_size / 1024.0
        print(f"  Batch  : {path.name:<30} ({count} items, {size_kb:.1f} KB)")

    print("\n--- HOW TO SCORE IN GEMINI WEB CHAT ---")
    print("  For EACH batch JSON file (recommended: 1 Gemini chat message per batch):")
    print("  1. Attach `SCORING_RUBRIC_PROMPT.md` + `batch_1_simple_rag.json`")
    print("  2. Send this message:")
    print('     "Follow SCORING_RUBRIC_PROMPT.md strictly and score EVERY item in the attached JSON batch. Return ONLY the complete JSON array."')
    print("  3. Copy Gemini's JSON output and save it as:")
    print(f"     {RESULTS_DIR / 'gemini_scores_simple_rag.json'}")
    print("  4. Repeat for `batch_2_agentic_crag.json` and save as:")
    print(f"     {RESULTS_DIR / 'gemini_scores_agentic_crag.json'}")
    print("  5. Then run Option [5] in run_benchmark.bat (or `python benchmarks/prepare_and_compile.py --compile`)!")
    print(f"{'=' * 68}\n")


# ============================================================
# Step 2: Load & Parse Gemini Web JSON Scores (Fence-Tolerant)
# ============================================================

def parse_json_tolerant(raw_text: str, source_name: str) -> List[Dict[str, Any]]:
    text = raw_text.strip()
    # Strip markdown code fences if user pasted ```json ... ``` directly
    fence_match = re.search(r"```(?:json)?\s*(\[[\s\S]*\])\s*```", text)
    if fence_match:
        text = fence_match.group(1)
    else:
        # Fallback: locate outermost JSON array brackets
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Could not parse JSON in {source_name}: {e}") from e

    if not isinstance(parsed, list):
        raise ValueError(f"Expected a JSON array in {source_name}, got {type(parsed).__name__}")
    return parsed


def load_gemini_scores() -> Dict[Tuple[str, str], Dict[str, Any]]:
    score_files = sorted(RESULTS_DIR.glob("gemini_scores*.json")) + sorted(RESULTS_DIR.glob("gemini_scores*.txt"))
    if not score_files:
        print(f"[ERROR] No score files found in {RESULTS_DIR}")
        print("Expected file(s) named like:")
        print(f"  - {RESULTS_DIR / 'gemini_scores_simple_rag.json'}")
        print(f"  - {RESULTS_DIR / 'gemini_scores_agentic_crag.json'}")
        print(f"  (or a single combined {RESULTS_DIR / 'gemini_scores.json'})")
        sys.exit(1)

    scores_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for sf in score_files:
        raw = sf.read_text(encoding="utf-8")
        items = parse_json_tolerant(raw, sf.name)
        print(f"  Loaded {len(items)} scores from {sf.name}")
        for it in items:
            mode = str(it.get("mode", "")).strip()
            qid = str(it.get("id", "")).strip()
            if not mode or not qid:
                print(f"  [WARN] Skipping malformed entry without mode/id in {sf.name}: {it}")
                continue
            scores_map[(mode, qid)] = it
    return scores_map


# ============================================================
# Step 3: Report Aggregation & Markdown Builder
# ============================================================

def pct_str(val: Optional[float]) -> str:
    if val is None:
        return "N/A"
    return f"{val * 100:.1f}%"


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


def _compute_snapshot(results_dir: Path) -> Optional[Dict[str, Any]]:
    """Compute key summary metrics from a results folder (used for V1 vs V2 comparison)."""
    e2e_path = results_dir / "e2e_runs.jsonl"
    if not e2e_path.exists():
        return None
    score_files = sorted(results_dir.glob("gemini_scores*.json")) + sorted(results_dir.glob("gemini_scores*.txt"))
    if not score_files:
        return None

    e2e_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
    with open(e2e_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rec = json.loads(line)
                e2e_map[(rec["mode"], rec["id"])] = rec

    scores_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for sf in score_files:
        for it in parse_json_tolerant(sf.read_text(encoding="utf-8"), sf.name):
            m, qid = str(it.get("mode", "")).strip(), str(it.get("id", "")).strip()
            if m and qid:
                scores_map[(m, qid)] = it

    merged = [{**rec, "judge": scores_map.get(k)} for k, rec in e2e_map.items() if scores_map.get(k)]
    if not merged:
        return None

    def mode_metrics(mode: str) -> Dict[str, Optional[float]]:
        rows = [r for r in merged if r["mode"] == mode]
        ans = [r for r in rows if r.get("is_answerable", True)]
        adv = [r for r in rows if not r.get("is_answerable", True)]
        papers = [r for r in rows if r.get("category") == "research_papers"]
        fin = [r for r in rows if r.get("category") == "finance_10k"]
        tots = [r["metrics"]["total_ms"] / 1000.0 for r in rows if (r.get("metrics") or {}).get("total_ms")]

        out: Dict[str, Optional[float]] = {
            "faith": statistics.mean([float(r["judge"]["faithfulness"]) for r in ans if r["judge"].get("faithfulness") is not None]) if ans else None,
            "corr": statistics.mean([float(r["judge"]["answer_correctness"]) for r in ans if r["judge"].get("answer_correctness") is not None]) if ans else None,
            "paper_corr": statistics.mean([float(r["judge"]["answer_correctness"]) for r in papers if r["judge"].get("answer_correctness") is not None]) if papers else None,
            "paper_hall": (sum(1 for r in papers if r["judge"].get("hallucinated")) / len(papers)) if papers else None,
            "fin_corr": statistics.mean([float(r["judge"]["answer_correctness"]) for r in fin if r["judge"].get("answer_correctness") is not None]) if fin else None,
            "adv_safe": statistics.mean([float(r["judge"]["refusal_or_fallback_score"]) for r in adv if r["judge"].get("refusal_or_fallback_score") is not None]) if adv else None,
            "overall_hall": (sum(1 for r in rows if r["judge"].get("hallucinated")) / len(rows)) if rows else None,
            "p95_s": percentile(tots, 95) if tots else None,
        }
        if mode == "agentic_crag":
            tr_rows = [r for r in rows if r.get("agent_trace")]
            tp = sum(1 for r in tr_rows if (not r["is_answerable"]) and r["agent_trace"]["web_search_triggered"])
            fp = sum(1 for r in tr_rows if r["is_answerable"] and r["agent_trace"]["web_search_triggered"])
            fn = sum(1 for r in tr_rows if (not r["is_answerable"]) and (not r["agent_trace"]["web_search_triggered"]))
            prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            out["crag_f1"] = (2 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0
        return out

    return {
        "simple_rag": mode_metrics("simple_rag"),
        "agentic_crag": mode_metrics("agentic_crag"),
    }


def _fmt_delta(v1: Optional[float], v2: Optional[float], is_pct: bool = True, lower_better: bool = False) -> str:
    if v1 is None or v2 is None:
        return "—"
    diff = (v2 - v1) * (100.0 if is_pct else 1.0)
    unit = " pts" if is_pct else " s"
    if abs(diff) < 0.05:
        return "0.0" + unit
    sign = "+" if diff > 0 else ""
    improved = (diff < 0) if lower_better else (diff > 0)
    tag = " (improved)" if improved else ""
    return f"**{sign}{diff:.1f}{unit}**{tag}"


def generate_markdown_report(
    retrieval_data: Optional[Dict[str, Any]],
    merged_rows: List[Dict[str, Any]],
    meta: Dict[str, Any],
    judge_label: str,
    v1_snapshot: Optional[Dict[str, Any]] = None,
    v2_snapshot: Optional[Dict[str, Any]] = None,
) -> str:
    lines: List[str] = []
    lines.append("# SILO Agentic RAG — Evaluation & Benchmark Report")
    lines.append("")
    lines.append(f"> **Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M')}  ")
    lines.append(
        f"> **Local Stack:** `{meta.get('chat_model', 'llama3.1:8b')}` (Ollama) · "
        f"`{meta.get('embed_model', 'BAAI/bge-small-en-v1.5')}` · "
        f"`{meta.get('sparse_model', 'Qdrant/bm25')}` · "
        f"`{meta.get('reranker_model', 'cross-encoder/ms-marco-MiniLM-L-6-v2')}`  "
    )
    lines.append(f"> **External Judge:** `{judge_label}` (Industry-Standard RAGAS / TruLens / FinanceBench Rubric)  ")
    sys_ram = meta.get("system_ram") or {}
    proc_ram = meta.get("process_ram_final") or {}
    lines.append(
        f"> **Hardware:** {sys_ram.get('total_gb', '?')} GB System RAM · "
        f"Peak Python Process RSS: **{proc_ram.get('peak_rss_mb', '?')} MB**"
    )
    lines.append("")

    # ── Section 0: V1 Baseline vs V2 Upgrade Delta ────────────
    if v1_snapshot and v2_snapshot:
        v1a, v2a = v1_snapshot.get("agentic_crag", {}), v2_snapshot.get("agentic_crag", {})
        v1s, v2s = v1_snapshot.get("simple_rag", {}), v2_snapshot.get("simple_rag", {})
        lines.append("## 0. Engineering Iteration Delta (V1 Baseline vs. V2 Layout-Aware + Calibrated CRAG)")
        lines.append("")
        lines.append(
            "Targeted V2 upgrades driven by V1 error analysis: (1) 2-column & pipe-delimited PDF table parser + unit header propagation, "
            "(2) strict grounded generation prompt, (3) cross-encoder score floor (`0.05`) + strict evidence-sufficiency CRAG grader + faithful-refusal Self-RAG."
        )
        lines.append("")
        lines.append("| Metric | V1 Baseline | V2 Upgraded | Delta |")
        lines.append("| :--- | :---: | :---: | :---: |")
        delta_rows = [
            ("Agentic Faithfulness", v1a.get("faith"), v2a.get("faith"), True, False),
            ("Agentic Answer Correctness", v1a.get("corr"), v2a.get("corr"), True, False),
            ("Single-Shot Answer Correctness", v1s.get("corr"), v2s.get("corr"), True, False),
            ("ML Research Papers Correctness (Agentic)", v1a.get("paper_corr"), v2a.get("paper_corr"), True, False),
            ("ML Research Papers Hallucination Rate (Agentic)", v1a.get("paper_hall"), v2a.get("paper_hall"), True, True),
            ("Overall Hallucination Rate (Agentic)", v1a.get("overall_hall"), v2a.get("overall_hall"), True, True),
            ("Adversarial Safety (Agentic)", v1a.get("adv_safe"), v2a.get("adv_safe"), True, False),
            ("CRAG Web-Fallback Routing F1", v1a.get("crag_f1"), v2a.get("crag_f1"), True, False),
            ("Agentic p95 Total Latency", v1a.get("p95_s"), v2a.get("p95_s"), False, True),
        ]
        for label, a, b, is_pct, lower_better in delta_rows:
            a_s = pct_str(a) if is_pct else (f"{a:.2f} s" if a is not None else "N/A")
            b_s = pct_str(b) if is_pct else (f"{b:.2f} s" if b is not None else "N/A")
            lines.append(f"| {label} | {a_s} | **{b_s}** | {_fmt_delta(a, b, is_pct=is_pct, lower_better=lower_better)} |")
        lines.append("")

    # ── Section 1: Retrieval Ablation ─────────────────────────
    dense_r5 = rerank_r5 = rerank_p50_ms = None
    if retrieval_data and "summary" in retrieval_data:
        summ = retrieval_data["summary"]
        lines.append("## 1. Retrieval Ablation (Dense vs. Hybrid BM25 vs. Hybrid + Cross-Encoder Rerank)")
        lines.append("")
        lines.append(
            "Controlled evaluation on all answerable queries across the NVIDIA FY2024 10-K (96 pages) "
            "and 5 seminal ML research papers (ResNet, Transformer, BERT, RAG, ViT):"
        )
        lines.append("")
        lines.append("| Retrieval Strategy | Recall@1 | Recall@3 | Recall@5 | MRR@5 | p50 Latency | p95 Latency |")
        lines.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |")

        labels = {
            "dense_only": "1. Dense Vector Only (`bge-small-en-v1.5`)",
            "hybrid_bm25": "2. Hybrid Search (Dense + `Qdrant/bm25`)",
            "hybrid_bm25_rerank": "**3. SILO Full Stack (Hybrid + `MiniLM-L-6-v2` Rerank)**",
        }
        for key in ["dense_only", "hybrid_bm25", "hybrid_bm25_rerank"]:
            if key not in summ:
                continue
            ov = summ[key]["overall"]
            lines.append(
                f"| {labels[key]} | {pct_str(ov['recall_at_1'])} | {pct_str(ov['recall_at_3'])} | "
                f"{pct_str(ov['recall_at_5'])} | {ov['mrr_at_5']:.3f} | {ov['p50_ms']:.1f} ms | {ov['p95_ms']:.1f} ms |"
            )

        if "dense_only" in summ and "hybrid_bm25_rerank" in summ:
            d = summ["dense_only"]["overall"]
            f = summ["hybrid_bm25_rerank"]["overall"]
            dense_r5 = d["recall_at_5"]
            rerank_r5 = f["recall_at_5"]
            rerank_p50_ms = f["p50_ms"]
            lines.append("")
            lines.append(
                f"**Ablation Lift (SILO Full Stack vs. Dense Baseline):** "
                f"Recall@1 **{(f['recall_at_1'] - d['recall_at_1']) * 100:+.1f} pts**, "
                f"Recall@3 **{(f['recall_at_3'] - d['recall_at_3']) * 100:+.1f} pts**, "
                f"Recall@5 **{(f['recall_at_5'] - d['recall_at_5']) * 100:+.1f} pts**, "
                f"MRR@5 **{f['mrr_at_5'] - d['mrr_at_5']:+.3f}**."
            )
        lines.append("")

    # ── Section 2: End-to-End Generation Quality ──────────────
    modes_present = [m for m in ["simple_rag", "agentic_crag"] if any(r["mode"] == m for r in merged_rows)]
    mode_stats: Dict[str, Dict[str, Any]] = {}

    if modes_present:
        lines.append("## 2. End-to-End Generation Quality (LLM-as-a-Judge)")
        lines.append("")
        lines.append("| Pipeline Mode | Faithfulness | Answer Correctness | Context Precision | Adversarial Safety | Overall Hallucination Rate |")
        lines.append("| :--- | :---: | :---: | :---: | :---: | :---: |")

        mode_names = {
            "simple_rag": "Single-Shot RAG (Hybrid + Rerank)",
            "agentic_crag": "**Agentic LangGraph (CRAG + Self-RAG)**",
        }

        for m in modes_present:
            m_rows = [r for r in merged_rows if r["mode"] == m and r.get("judge")]
            ans_rows = [r for r in m_rows if r.get("is_answerable", True)]
            adv_rows = [r for r in m_rows if not r.get("is_answerable", True)]

            faith_vals = [float(r["judge"]["faithfulness"]) for r in ans_rows if r["judge"].get("faithfulness") is not None]
            corr_vals = [float(r["judge"]["answer_correctness"]) for r in ans_rows if r["judge"].get("answer_correctness") is not None]
            cprec_vals = [float(r["judge"]["context_precision"]) for r in ans_rows if r["judge"].get("context_precision") is not None]
            adv_vals = [float(r["judge"]["refusal_or_fallback_score"]) for r in adv_rows if r["judge"].get("refusal_or_fallback_score") is not None]

            faith = statistics.mean(faith_vals) if faith_vals else None
            corr = statistics.mean(corr_vals) if corr_vals else None
            cprec = statistics.mean(cprec_vals) if cprec_vals else None
            adv_safe = statistics.mean(adv_vals) if adv_vals else None
            hall_rate = sum(1 for r in m_rows if r["judge"].get("hallucinated")) / len(m_rows) if m_rows else None
            adv_hall_rate = sum(1 for r in adv_rows if r["judge"].get("hallucinated")) / len(adv_rows) if adv_rows else None

            mode_stats[m] = {
                "faith": faith,
                "corr": corr,
                "cprec": cprec,
                "adv_safe": adv_safe,
                "hall_rate": hall_rate,
                "adv_hall_rate": adv_hall_rate,
            }
            lines.append(
                f"| {mode_names.get(m, m)} | {pct_str(faith)} | {pct_str(corr)} | "
                f"{pct_str(cprec)} | {pct_str(adv_safe)} | {pct_str(hall_rate)} |"
            )
        lines.append("")

        # ── Section 3: Domain Breakdown ───────────────────────
        lines.append("## 3. Domain Breakdown (Finance 10-K vs. ML Papers vs. Adversarial)")
        lines.append("")
        lines.append("| Mode | Domain | Questions | Correctness / Safety | Faithfulness | Hallucination Rate |")
        lines.append("| :--- | :--- | :---: | :---: | :---: | :---: |")
        cat_labels = {
            "finance_10k": "NVIDIA FY2024 10-K (Finance)",
            "research_papers": "ML Research Papers (Multi-Doc)",
            "adversarial": "Adversarial / Out-of-Corpus",
        }
        for m in modes_present:
            for cat in ["finance_10k", "research_papers", "adversarial"]:
                c_rows = [r for r in merged_rows if r["mode"] == m and r["category"] == cat and r.get("judge")]
                if not c_rows:
                    continue
                if cat == "adversarial":
                    vals = [float(r["judge"]["refusal_or_fallback_score"]) for r in c_rows if r["judge"].get("refusal_or_fallback_score") is not None]
                    primary = statistics.mean(vals) if vals else None
                    faith_s = "—"
                else:
                    vals = [float(r["judge"]["answer_correctness"]) for r in c_rows if r["judge"].get("answer_correctness") is not None]
                    fvals = [float(r["judge"]["faithfulness"]) for r in c_rows if r["judge"].get("faithfulness") is not None]
                    primary = statistics.mean(vals) if vals else None
                    faith_s = pct_str(statistics.mean(fvals) if fvals else None)
                h_rate = sum(1 for r in c_rows if r["judge"].get("hallucinated")) / len(c_rows)
                lines.append(
                    f"| `{m}` | {cat_labels[cat]} | {len(c_rows)} | {pct_str(primary)} | {faith_s} | {pct_str(h_rate)} |"
                )
        lines.append("")

    # ── Section 4: Agentic LangGraph Telemetry ────────────────
    agentic_rows = [r for r in merged_rows if r["mode"] == "agentic_crag" and r.get("agent_trace")]
    crag_f1 = None
    if agentic_rows:
        tp = sum(1 for r in agentic_rows if (not r["is_answerable"]) and r["agent_trace"]["web_search_triggered"])
        fp = sum(1 for r in agentic_rows if r["is_answerable"] and r["agent_trace"]["web_search_triggered"])
        fn = sum(1 for r in agentic_rows if (not r["is_answerable"]) and (not r["agent_trace"]["web_search_triggered"]))
        tn = sum(1 for r in agentic_rows if r["is_answerable"] and (not r["agent_trace"]["web_search_triggered"]))

        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        crag_f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0
        local_stay = tn / (tn + fp) if (tn + fp) > 0 else 0.0

        retried_count = sum(1 for r in agentic_rows if r["agent_trace"]["retry_count"] > 0)
        rewritten_count = sum(1 for r in agentic_rows if r["agent_trace"]["was_rewritten"])

        lines.append("## 4. Agentic LangGraph Telemetry (CRAG & Self-RAG)")
        lines.append("")
        lines.append("| Agentic Metric | Value | Detail |")
        lines.append("| :--- | :---: | :--- |")
        lines.append(f"| **CRAG Web-Fallback Precision** | {pct_str(prec)} | When web search fired, how often was it truly out-of-corpus? (TP={tp}, FP={fp}) |")
        lines.append(f"| **CRAG Web-Fallback Recall** | {pct_str(rec)} | Out-of-corpus queries caught by document grader (TP={tp}, FN={fn}) |")
        lines.append(f"| **CRAG Routing F1** | {pct_str(crag_f1)} | Harmonic mean of CRAG routing precision & recall |")
        lines.append(f"| **Local Privacy Retention Rate** | {pct_str(local_stay)} | In-corpus queries answered 100% locally without web calls ({tn}/{tn+fp}) |")
        lines.append(f"| **Self-RAG Intervention Rate** | {pct_str(retried_count / len(agentic_rows))} | Queries where hallucination check triggered query rewrite + retry ({retried_count}/{len(agentic_rows)}) |")
        lines.append(f"| **Queries Rewritten** | {rewritten_count} | Total automatic query rewrites executed by LangGraph |")
        lines.append("")

    # ── Section 5: Latency & Systems Performance ──────────────
    lines.append("## 5. Latency & Edge Systems Telemetry")
    lines.append("")
    lines.append("| Mode | p50 TTFT | p95 TTFT | p50 Total Latency | p95 Total Latency | Mean Throughput | Peak Process RSS |")
    lines.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |")

    simple_ttft_p50 = None
    for m in modes_present:
        m_rows = [r for r in merged_rows if r["mode"] == m and not r.get("error")]
        if not m_rows:
            continue
        ttfts = [r["metrics"]["ttft_ms"] for r in m_rows if r["metrics"].get("ttft_ms") is not None]
        tots = [r["metrics"]["total_ms"] for r in m_rows if r["metrics"].get("total_ms") is not None]
        tps_list = [r["metrics"]["tokens_per_sec"] for r in m_rows if r["metrics"].get("tokens_per_sec")]
        peaks = [r["ram"]["peak_rss_mb"] for r in m_rows if (r.get("ram") or {}).get("peak_rss_mb")]

        p50_ttft = percentile(ttfts, 50)
        p95_ttft = percentile(ttfts, 95)
        p50_tot = percentile(tots, 50) / 1000.0
        p95_tot = percentile(tots, 95) / 1000.0
        mean_tps = statistics.mean(tps_list) if tps_list else 0.0
        max_peak = max(peaks) if peaks else 0.0
        if m == "simple_rag":
            simple_ttft_p50 = p50_ttft

        lines.append(
            f"| `{m}` | {p50_ttft:.0f} ms | {p95_ttft:.0f} ms | "
            f"{p50_tot:.2f} s | {p95_tot:.2f} s | {mean_tps:.1f} tok/s | {max_peak:.0f} MB |"
        )
    lines.append("")

    # ── Section 6: Resume Bullet Generator ────────────────────
    lines.append("## 6. Resume-Ready Summary Bullets (Auto-Populated)")
    lines.append("")
    primary_mode = "agentic_crag" if "agentic_crag" in mode_stats else (modes_present[0] if modes_present else None)
    if primary_mode:
        st = mode_stats[primary_mode]
        r5_clause = ""
        if dense_r5 is not None and rerank_r5 is not None:
            lift_pts = (rerank_r5 - dense_r5) * 100
            r5_clause = (
                f"; Hybrid Search (`bge-small` + `Qdrant/bm25`) with `MiniLM-L-6-v2` cross-encoder reranking "
                f"achieved **{rerank_r5*100:.1f}% Recall@5** (**{lift_pts:+.1f} pts** over dense-only baseline"
                + (f", p50 retrieval {rerank_p50_ms:.0f} ms" if rerank_p50_ms is not None else "")
                + ")"
            )
        lines.append(
            f"- Built **SILO**, a 100% local Agentic RAG assistant (FastAPI, LangGraph, Qdrant, Ollama, React 19) "
            f"achieving **{pct_str(st['faith'])} Faithfulness** and **{pct_str(st['corr'])} Answer Correctness** "
            f"on a {meta.get('dataset_size', 50)}-question Finance 10-K + arXiv benchmark judged by `{judge_label}`{r5_clause}."
        )
        if "simple_rag" in mode_stats and "agentic_crag" in mode_stats:
            s_hall = mode_stats["simple_rag"]["adv_hall_rate"]
            a_hall = mode_stats["agentic_crag"]["adv_hall_rate"]
            if s_hall is not None and a_hall is not None:
                lines.append(
                    f"- Implemented LangGraph **CRAG document grading & Self-RAG verification**, achieving "
                    f"**{pct_str(mode_stats['agentic_crag']['adv_safe'])} adversarial safety** "
                    f"(out-of-corpus hallucination rate: **{pct_str(a_hall)}** vs. **{pct_str(s_hall)}** single-shot baseline"
                    + (f", CRAG routing F1: **{pct_str(crag_f1)}**" if crag_f1 is not None else "")
                    + ")."
                )
        lines.append(
            f"- Engineered memory-safe local ingestion & SSE streaming for 16 GB consumer hardware, resolving an "
            f"805 MB ONNX SPLADE OOM bottleneck via batched BM25 + explicit GC (peak Python RSS **{proc_ram.get('peak_rss_mb', '?')} MB**"
            + (f", p50 TTFT **{simple_ttft_p50:.0f} ms**" if simple_ttft_p50 is not None else "")
            + ")."
        )
    lines.append("")

    # ── Section 7: Audit Appendix ─────────────────────────────
    notable = [
        r for r in merged_rows
        if r.get("judge")
        and (
            r["judge"].get("hallucinated")
            or (r.get("is_answerable") and float(r["judge"].get("answer_correctness") or 1.0) < 0.75)
            or ((not r.get("is_answerable")) and float(r["judge"].get("refusal_or_fallback_score") or 1.0) < 0.75)
        )
    ]
    if notable:
        lines.append("## 7. Error Analysis & Audit Log (Cases Scoring < 0.75 or Hallucinated)")
        lines.append("")
        lines.append("| Mode | ID | Verdict | Judge Rationale |")
        lines.append("| :--- | :--- | :--- | :--- |")
        for r in notable[:30]:
            j = r["judge"]
            rat = str(j.get("rationale", "")).replace("|", "/").replace("\n", " ")
            lines.append(f"| `{r['mode']}` | `{r['id']}` | `{j.get('verdict', '')}` | {rat} |")
        lines.append("")

    return "\n".join(lines)


def compile_report(judge_label: str) -> None:
    if not E2E_PATH.exists():
        print(f"[ERROR] {E2E_PATH} not found. Run `benchmarks/run_benchmark.py` first!")
        sys.exit(1)

    e2e_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
    with open(E2E_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            e2e_map[(rec["mode"], rec["id"])] = rec

    scores_map = load_gemini_scores()

    merged_rows: List[Dict[str, Any]] = []
    missing_keys: List[Tuple[str, str]] = []
    for key, rec in e2e_map.items():
        score = scores_map.get(key)
        if score is None:
            missing_keys.append(key)
        merged_rows.append({**rec, "judge": score})

    if missing_keys:
        print(f"\n  [WARN] {len(missing_keys)} run(s) had no matching Gemini score:")
        for mk in missing_keys[:10]:
            print(f"    - {mk[0]} | {mk[1]}")
        if len(missing_keys) > 10:
            print(f"    ... and {len(missing_keys) - 10} more.")

    retrieval_data = json.loads(RETRIEVAL_PATH.read_text(encoding="utf-8")) if RETRIEVAL_PATH.exists() else None
    meta = json.loads(META_PATH.read_text(encoding="utf-8")) if META_PATH.exists() else {}

    v1_snap = _compute_snapshot(V1_BASELINE_DIR) if V1_BASELINE_DIR.exists() else None
    v2_snap = _compute_snapshot(RESULTS_DIR) if v1_snap else None

    md = generate_markdown_report(
        retrieval_data,
        merged_rows,
        meta,
        judge_label=judge_label,
        v1_snapshot=v1_snap,
        v2_snapshot=v2_snap,
    )
    REPORT_PATH.write_text(md, encoding="utf-8")

    print(f"\n{'=' * 68}")
    print(f"SUCCESS! Compiled {len(merged_rows) - len(missing_keys)}/{len(merged_rows)} judged rows.")
    print(f"Report saved to: {REPORT_PATH}")
    print(f"{'=' * 68}\n")


def main():
    parser = argparse.ArgumentParser(description="Export SILO benchmark batches for Gemini Web & compile report")
    parser.add_argument("--export", action="store_true", help="Export JSON batches + rubric to benchmarks/for_gemini_web/")
    parser.add_argument("--compile", action="store_true", help="Compile benchmarks/results/gemini_scores*.json into BENCHMARK_REPORT.md")
    parser.add_argument("--judge-name", default="Gemini (Web Judge)", help="Judge name displayed in BENCHMARK_REPORT.md")
    args = parser.parse_args()

    if not args.export and not args.compile:
        parser.print_help()
        sys.exit(0)

    if args.export:
        export_for_gemini()
    if args.compile:
        compile_report(judge_label=args.judge_name)


if __name__ == "__main__":
    main()
