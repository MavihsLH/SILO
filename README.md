<p align="center">
  <img src="static/img/logo-dark-transparent.png" alt="SILO Logo" width="220">
</p>

<h1 align="center">SILO — Local Agentic RAG Assistant</h1>

<p align="center">
  (⌐■_■) 100% Local. 100% Private. Zero Cloud Uploads. (⌐■_■)
</p>

<p align="center">
  <strong>FastAPI · LangGraph (CRAG + Self-RAG) · Qdrant Hybrid Search · Ollama · React 19 + TypeScript</strong>
</p>

---

## (⊙_⊙) What is SILO?

**SILO** is a privacy-first, local Agentic Retrieval-Augmented Generation (RAG) workspace engineered to run cleanly on consumer hardware (tested on 16 GB RAM). Partition your PDFs, Markdown notes, TXT, and CSV files into isolated vector **collections (silos)**, index them with table-preserving layout parsing, and query them with real-time token streaming, verifiable citations, and optional **Corrective RAG (CRAG)** web fallback.

## (•_•) Why was SILO built?

Most AI document tools force you to upload proprietary 10-Ks, research, or private notes to cloud APIs. SILO keeps your vector database, embeddings, reranker, and LLM **100% on your machine** via **Ollama** + **Qdrant** — zero API bills, zero document leakage. Even when you explicitly enable **Web Fallback**, only the rewritten query goes to DuckDuckGo when local evidence isn't enough; your files never leave disk.

---

## (▀̿Ĺ̯▀̿ ̿) UI Walkthrough & Live Demos

> All visuals below are captured directly from the live React 19 + FastAPI build running locally.  
> *(High-DPI Dark Mode is shown by default so we don't flashbang you. Expand the Light Theme section below if you prefer daytime mode!)*

### 1. Workspace Overview & Hybrid Citations
Isolated vector collections in the left rail, real-time streaming chat in the center, and expandable cross-encoder citation cards underneath every answer:

![SILO Workspace Overview](static/demo/screenshot_dark_hero.png)

| Local Finance 10-K Retrieval + Sources | Agentic CRAG False-Premise Defense + Web Fallback |
| :---: | :---: |
| ![Finance 10-K Citations](static/demo/screenshot_dark_finance.png) | ![CRAG Web Fallback](static/demo/screenshot_dark_crag_web.png) |

---

### 2. Seamless Collection Creation & Batched Indexing (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧
Create a silo, drop in PDFs, choose **Standard Hybrid Chunking** or **LLM-Enriched Contextual Indexing**, and watch real-time batch embedding progress automatically flip the collection badge from `Pending` to `Indexed` with zero page refreshes:

<p align="center">
  <img src="static/demo/silo_indexing_dark.webp" alt="SILO Seamless Collection Indexing Demo" width="100%" />
</p>

<details>
<summary>(o_O) Step-by-step indexing stills &amp; downloadable MP4</summary>

| 1. Pick Indexing Strategy | 2. Batched Progress Tracking | 3. Auto-Updated `Indexed` State |
| :---: | :---: | :---: |
| ![Indexing Strategy Dialog](static/demo/screenshot_indexing_strategy.png) | ![Live Embedding Progress](static/demo/screenshot_indexing_progress.png) | ![Indexing Complete](static/demo/screenshot_indexing_complete.png) |

Download crisp MP4: [`silo_indexing_dark.mp4`](static/demo/silo_indexing_dark.mp4)

</details>

---

### 3. Live Agentic Chat, CRAG Routing & Citations (☞ﾟヮﾟ)☞
Watch SILO extract `$60,922M` / `$47,525M` directly from NVIDIA's 96-page FY2024 10-K, expand local source excerpts, and then switch silos with **Web Fallback** enabled to catch a false-premise question (`DeepSeek-R1 in the 2020 RAG paper`) via DuckDuckGo:

<p align="center">
  <img src="static/demo/silo_chat_dark.webp" alt="SILO Agentic Chat and CRAG Web Fallback Demo" width="100%" />
</p>

*(Prefer `.mp4`? Download [`silo_chat_dark.mp4`](static/demo/silo_chat_dark.mp4).)*

---

<details>
<summary>(☆▽☆) Wanna see it in Light Mode? Click to expand!</summary>

<br/>

| Light Mode — BERT Table 3 Extraction &amp; Sources | Light Mode — Inference &amp; Self-RAG Settings |
| :---: | :---: |
| ![Light Mode Research Papers](static/demo/screenshot_light_papers.png) | ![Light Mode Settings Dialog](static/demo/screenshot_light_settings.png) |

</details>

---

## (ง'̀-'́)ง Architecture & Under the Hood

```text
  User Query ──▶ Hybrid Qdrant Search (bge-small-en-v1.5 + Qdrant/bm25)
                        │
                        ▼ (Top-15 candidates)
                 Cross-Encoder Rerank (ms-marco-MiniLM-L-6-v2, floor >= 0.05)
                        │
                        ▼
                 LangGraph CRAG Sufficiency Grader (Entity / Timeframe / Metric check)
                   ├──[Sufficient]──────────────────────┐
                   └──[Insufficient & Web Fallback ON]──▶ DuckDuckGo Search ──┐
                                                                              ▼
                 Self-RAG Factuality Check ◀── Grounded LLM Stream (Ollama) ◀─┘
                   ├──[Grounded / Honest Refusal]──▶ Done & Saved to Session
                   └──[Hallucination Caught]───────▶ Rewrite Query & Retry
```

- **Hybrid Retrieval + Cross-Encoder Reranking:** Combines `BAAI/bge-small-en-v1.5` dense embeddings with `Qdrant/bm25` sparse vectors, then reranks top candidates with `cross-encoder/ms-marco-MiniLM-L-6-v2`.
- **2-Column & Table-Preserving PDF Ingestion ([`pdf_parser.py`](pdf_parser.py)):** Custom PyMuPDF layout parser splits 2-column academic papers cleanly, reconstructs tabular columns with `|` delimiters, and propagates table titles/unit scales (e.g., `(In millions)`) onto split chunks.
- **Stateful LangGraph Agent ([`agent_graph.py`](agent_graph.py)):** Executes strict CRAG evidence grading, strips conversational filler for DuckDuckGo fallback, enforces grounded synthesis, and supports optional Self-RAG verification + query rewriting.
- **Minimalist React 19 UI (`frontend/`):** Built with Vite, TypeScript, Radix UI, Tailwind CSS, and Motion — `requestAnimationFrame` SSE token batching, `@tanstack/react-virtual` message virtualization, zero layout shift, Light/Dark themes, and a live Windows RAM pressure advisory bar.
- **16 GB Consumer Hardware Safe:** Batched node ingestion (`batch_size=24`) with `Qdrant/bm25` + explicit `gc.collect()` eliminates an 805 MB ONNX SPLADE OOM bottleneck, keeping Python peak RSS near **1.06 GB**.

---

## (¬‿¬) Benchmarks & Engineering Iteration (V1 -> V2)

Evaluated headlessly on a **50-question golden test suite** ([`benchmarks/eval_dataset.json`](benchmarks/eval_dataset.json)) covering **NVIDIA's FY2024 Form 10-K** (20 Qs), **5 seminal ML papers** (`ResNet`, `Transformer`, `BERT`, `RAG`, `ViT` — 20 Qs), and **adversarial / false-premise / real-time traps** (10 Qs), running **`llama3.1:8b`** locally on **15.3 GB RAM** and judged externally with **Gemini** under a strict RAGAS / TruLens / FinanceBench rubric ([`benchmarks/BENCHMARK_REPORT.md`](benchmarks/BENCHMARK_REPORT.md)).

### 1. 3-Way Retrieval Ablation (40 Answerable Queries)

| Retrieval Strategy | Recall@1 | Recall@3 | Recall@5 | MRR@5 | p50 Latency |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Dense Only (`bge-small-en-v1.5`) | 62.5% | 80.0% | 92.5% | 0.732 | 42.0 ms |
| Hybrid Search (Dense + `Qdrant/bm25`) | 72.5% | 95.0% | 97.5% | 0.840 | 37.4 ms |
| **SILO Full Stack (Hybrid + `MiniLM-L-6-v2` Rerank)** | **82.5%** | **97.5%** | **100.0%** | **0.894** | 626.6 ms |

> **Ablation Lift vs. Dense Baseline:** **+20.0 pts** Recall@1, **+17.5 pts** Recall@3, and **+0.162** MRR@5.

### 2. V1 Baseline -> V2 Architecture Delta

After V1 error analysis revealed that flattened multi-column LaTeX tables caused table-reading hallucinations and permissive CRAG grading triggered redundant Self-RAG retry loops, **V2** introduced the pipe-delimited 2-column parser, calibrated rerank score floor (`0.05`), strict entity/timeframe sufficiency grading, and faithful-refusal Self-RAG:

| Metric | V1 Baseline | V2 Upgraded | Delta |
| :--- | :---: | :---: | :---: |
| **Agentic Faithfulness** | 90.0% | **92.5%** *(97.5% on 10-K)* | **+2.5 pts** |
| **Overall Hallucination Rate (Agentic)** | 12.0% | **2.0%** *(1/50 queries)* | **-83% relative** |
| **ML Papers Hallucination Rate** | 25.0% | **5.0%** | **-20.0 pts** |
| **Adversarial Safety** | 90.0% | **100.0%** *(0/10 hallucinated)* | **+10.0 pts** |
| **CRAG Web-Fallback Precision / F1** | 0.0% / 0.0% | **100.0% / 46.2%** | **+46.2 pts F1** |
| **Agentic p95 Tail Latency** | 66.18 s | **24.63 s** | **-63% faster** |
| **Peak Python Process RSS** | 1060.2 MB | **1059.1 MB** | **~1.04 GB ceiling** |

*(Honest engineering note: On an 8B local grader, stricter V2 evidence pruning dropped multi-part paper coverage (`73.1%` agentic vs. `80.0%` single-shot correctness) because the model chose honest refusals over guessing whenever a table row landed across chunk splits — a textbook Safety-vs-Coverage Pareto tradeoff on small local models.)*

---

## (＠_＠;) Prerequisites

1. **Docker** (for Qdrant vector DB) & **Ollama** installed on your host.
2. Pull the local models in Ollama:
   ```bash
   ollama pull llama3.1:8b
   ollama pull llama3.2:1b
   ```

---

## (☞ﾟヮﾟ)☞ Quick Start

### Option A: Local Run (Windows One-Click Launcher — Lightest RAM Footprint)
1. Clone the repo and install Python dependencies in your env (`pip install -r requirements.txt`), then build the UI once if needed:
   ```bash
   cd frontend && npm install && npm run build && cd ..
   ```
2. Double-click **[`start_silo.bat`](start_silo.bat)** (or run directly):
   ```powershell
   docker start Qdrant-db
   uvicorn app:app --host 0.0.0.0 --port 8001
   ```
3. Open **[http://localhost:8001/](http://localhost:8001/)** (auto-launches with `start_silo.bat`).

### Option B: Full Docker Compose Stack
```bash
docker compose up --build
```
Open **[http://localhost:8000/](http://localhost:8000/)** once `RAG Engine ready!` appears in the logs. To shut down: `docker compose down`.

### Reproducing the Benchmarks
Run the headless benchmark suite (with your IDE/browser closed for max LLM RAM headroom) via **[`run_benchmark.bat`](run_benchmark.bat)** or:
```bash
python benchmarks/run_benchmark.py
python benchmarks/prepare_and_compile.py --export
```

---

## (っ˘ڡ˘ς) License & Attribution

This project is open source and released under the **[MIT No Attribution (MIT-0)](LICENSE)** license. You are free to download, use, modify, and distribute it without restrictions.

Attribution to the original author (**Shivam Thakur**) is appreciated, but completely optional!
