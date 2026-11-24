# SILO Agentic RAG — Evaluation & Benchmark Report

> **Generated:** 2026-11-23 23:37  
> **Local Stack:** `llama3.1:8b` (Ollama) · `BAAI/bge-small-en-v1.5` · `Qdrant/bm25` · `cross-encoder/ms-marco-MiniLM-L-6-v2`  
> **External Judge:** `Gemini (Web Judge)` (Industry-Standard RAGAS / TruLens / FinanceBench Rubric)  
> **Hardware:** 15.31 GB System RAM · Peak Python Process RSS: **1059.1 MB**

## 0. Engineering Iteration Delta (V1 Baseline vs. V2 Layout-Aware + Calibrated CRAG)

Targeted V2 upgrades driven by V1 error analysis: (1) 2-column & pipe-delimited PDF table parser + unit header propagation, (2) strict grounded generation prompt, (3) cross-encoder score floor (`0.05`) + strict evidence-sufficiency CRAG grader + faithful-refusal Self-RAG.

| Metric | V1 Baseline | V2 Upgraded | Delta |
| :--- | :---: | :---: | :---: |
| Agentic Faithfulness | 90.0% | **92.5%** | **+2.5 pts** (improved) |
| Agentic Answer Correctness | 84.4% | **73.1%** | **-11.3 pts** |
| Single-Shot Answer Correctness | 84.4% | **80.0%** | **-4.4 pts** |
| ML Research Papers Correctness (Agentic) | 76.2% | **58.8%** | **-17.5 pts** |
| ML Research Papers Hallucination Rate (Agentic) | 25.0% | **5.0%** | **-20.0 pts** (improved) |
| Overall Hallucination Rate (Agentic) | 12.0% | **2.0%** | **-10.0 pts** (improved) |
| Adversarial Safety (Agentic) | 90.0% | **100.0%** | **+10.0 pts** (improved) |
| CRAG Web-Fallback Routing F1 | 0.0% | **46.2%** | **+46.2 pts** (improved) |
| Agentic p95 Total Latency | 66.18 s | **24.63 s** | **-41.6 s** (improved) |

## 1. Retrieval Ablation (Dense vs. Hybrid BM25 vs. Hybrid + Cross-Encoder Rerank)

Controlled evaluation on all answerable queries across the NVIDIA FY2024 10-K (96 pages) and 5 seminal ML research papers (ResNet, Transformer, BERT, RAG, ViT):

| Retrieval Strategy | Recall@1 | Recall@3 | Recall@5 | MRR@5 | p50 Latency | p95 Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 1. Dense Vector Only (`bge-small-en-v1.5`) | 62.5% | 80.0% | 92.5% | 0.732 | 42.0 ms | 60.2 ms |
| 2. Hybrid Search (Dense + `Qdrant/bm25`) | 72.5% | 95.0% | 97.5% | 0.840 | 37.4 ms | 54.0 ms |
| **3. SILO Full Stack (Hybrid + `MiniLM-L-6-v2` Rerank)** | 82.5% | 97.5% | 100.0% | 0.894 | 626.6 ms | 668.9 ms |

**Ablation Lift (SILO Full Stack vs. Dense Baseline):** Recall@1 **+20.0 pts**, Recall@3 **+17.5 pts**, Recall@5 **+7.5 pts**, MRR@5 **+0.162**.

## 2. End-to-End Generation Quality (LLM-as-a-Judge)

| Pipeline Mode | Faithfulness | Answer Correctness | Context Precision | Adversarial Safety | Overall Hallucination Rate |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Single-Shot RAG (Hybrid + Rerank) | 86.2% | 80.0% | 86.2% | 95.0% | 16.0% |
| **Agentic LangGraph (CRAG + Self-RAG)** | 92.5% | 73.1% | 75.6% | 100.0% | 2.0% |

## 3. Domain Breakdown (Finance 10-K vs. ML Papers vs. Adversarial)

| Mode | Domain | Questions | Correctness / Safety | Faithfulness | Hallucination Rate |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `simple_rag` | NVIDIA FY2024 10-K (Finance) | 20 | 95.0% | 95.0% | 10.0% |
| `simple_rag` | ML Research Papers (Multi-Doc) | 20 | 65.0% | 77.5% | 25.0% |
| `simple_rag` | Adversarial / Out-of-Corpus | 10 | 95.0% | — | 10.0% |
| `agentic_crag` | NVIDIA FY2024 10-K (Finance) | 20 | 87.5% | 97.5% | 0.0% |
| `agentic_crag` | ML Research Papers (Multi-Doc) | 20 | 58.8% | 87.5% | 5.0% |
| `agentic_crag` | Adversarial / Out-of-Corpus | 10 | 100.0% | — | 0.0% |

## 4. Agentic LangGraph Telemetry (CRAG & Self-RAG)

| Agentic Metric | Value | Detail |
| :--- | :---: | :--- |
| **CRAG Web-Fallback Precision** | 100.0% | When web search fired, how often was it truly out-of-corpus? (TP=3, FP=0) |
| **CRAG Web-Fallback Recall** | 30.0% | Out-of-corpus queries caught by document grader (TP=3, FN=7) |
| **CRAG Routing F1** | 46.2% | Harmonic mean of CRAG routing precision & recall |
| **Local Privacy Retention Rate** | 100.0% | In-corpus queries answered 100% locally without web calls (40/40) |
| **Self-RAG Intervention Rate** | 0.0% | Queries where hallucination check triggered query rewrite + retry (0/50) |
| **Queries Rewritten** | 0 | Total automatic query rewrites executed by LangGraph |

## 5. Latency & Edge Systems Telemetry

| Mode | p50 TTFT | p95 TTFT | p50 Total Latency | p95 Total Latency | Mean Throughput | Peak Process RSS |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `simple_rag` | 2854 ms | 3316 ms | 10.16 s | 22.40 s | 5.3 tok/s | 1059 MB |
| `agentic_crag` | 13345 ms | 23883 ms | 13.71 s | 24.63 s | 3.2 tok/s | 1059 MB |

## 6. Resume-Ready Summary Bullets (Auto-Populated)

- Built **SILO**, a 100% local Agentic RAG assistant (FastAPI, LangGraph, Qdrant, Ollama, React 19) achieving **92.5% Faithfulness** and **73.1% Answer Correctness** on a 50-question Finance 10-K + arXiv benchmark judged by `Gemini (Web Judge)`; Hybrid Search (`bge-small` + `Qdrant/bm25`) with `MiniLM-L-6-v2` cross-encoder reranking achieved **100.0% Recall@5** (**+7.5 pts** over dense-only baseline, p50 retrieval 627 ms).
- Implemented LangGraph **CRAG document grading & Self-RAG verification**, achieving **100.0% adversarial safety** (out-of-corpus hallucination rate: **0.0%** vs. **10.0%** single-shot baseline, CRAG routing F1: **46.2%**).
- Engineered memory-safe local ingestion & SSE streaming for 16 GB consumer hardware, resolving an 805 MB ONNX SPLADE OOM bottleneck via batched BM25 + explicit GC (peak Python RSS **1059.1 MB**, p50 TTFT **2854 ms**).

## 7. Error Analysis & Audit Log (Cases Scoring < 0.75 or Hallucinated)

| Mode | ID | Verdict | Judge Rationale |
| :--- | :--- | :--- | :--- |
| `simple_rag` | `fin_08` | `hallucinated` | Self-contradictory answer: incorrectly states 'No' customer represented 10% or more, contradicting both the context and its own next sentence citing Customer A at 13%. |
| `simple_rag` | `fin_13` | `hallucinated` | Extracted segment revenues correctly ($47,405M and $13,517M), but misquoted YoY revenue dollar changes ($32,337M and $1,611M) as operating income instead of $32,016M and $5,846M. |
| `simple_rag` | `paper_04` | `hallucinated` | Misread the truncated context header: attributed 3.8 billion FLOPs to ResNet-34 instead of ResNet-50 and misstated '3-layer bottleneck block' as '2-layer bottleneck block'. |
| `simple_rag` | `paper_08` | `hallucinated` | Incorrectly outputted a stray pipe symbol '/' as the scaling factor instead of 1/sqrt(d_k), which is present in the retrieved context. |
| `simple_rag` | `paper_14` | `partial` | Faithfully quoted that updating BERT_d is not necessary for strong performance, but omitted the primary reason stated in context: it is costly because it requires periodically updating the document index. |
| `simple_rag` | `paper_16` | `hallucinated` | Table 2 was truncated before RAG-Token's row; the model fabricated RAG-Token's FEVER-3 (81.1%) and FEVER-2 (92.2%) scores by misquoting BART's and SotA's FEVER-2 scores. |
| `simple_rag` | `paper_18` | `hallucinated` | Incorrectly reported 90% accuracy (scraped from Figure 2) and 9.9k TPUv3-core-days (BiT-L's compute) instead of 88.55% and 2.5k TPUv3-core-days. |
| `simple_rag` | `paper_19` | `hallucinated` | Missed the Section 3.1 inductive bias explanation (local/equivariant MLPs vs global self-attention) and introduced unsupported claims about CNN receptive field limits. |
| `simple_rag` | `adv_05` | `hallucinated` | Correctly refused today's NASDAQ stock price, but hallucinated that NVIDIA's stock price as of Jan 28, 2024 was $1,536.28 (which is actually the cumulative return of a $100 investment since 2019). |
| `agentic_crag` | `paper_03` | `partial` | Correctly extracted the 4.49% top-5 error rate from Table 4, but falsely claimed Table 4 does not contain top-1 error rates despite 19.38% appearing in the retrieved table. |
| `agentic_crag` | `paper_05` | `partial` | Correctly extracted N = 6 identical encoder layers and honestly noted that h (number of attention heads) was absent from the single retrieved chunk. |
| `agentic_crag` | `paper_06` | `partial` | Faithfully extracted big model scores from Section 6.1 (28.4 EN-DE, 41.0 EN-FR) and honestly noted base model scores were missing because Table 2 was not retrieved. |
| `agentic_crag` | `paper_07` | `partial` | Extracted the raw big-model row values (1024, 4096, 16, 213) from the partial Table 3 chunk and noted base values were missing, though misattributed the row to (D) and questioned the paper source. |
| `agentic_crag` | `paper_13` | `partial` | Faithfully reported the generation diversity difference from the retrieved chunk, but missed the core architectural difference because Section 2.1 was not retrieved. |
| `agentic_crag` | `paper_14` | `partial` | Faithfully stated that updating BERT_d is unnecessary for strong performance, but omitted the primary reason in context: it is costly because it requires periodically updating the document index. |
| `agentic_crag` | `paper_18` | `hallucinated` | Incorrectly reported 90% accuracy (scraped from Figure 2) and 9.9k TPUv3-core-days (BiT-L's compute) instead of 88.55% and 2.5k TPUv3-core-days. |
| `agentic_crag` | `paper_19` | `partial` | Quoted the general inductive bias statement from the retrieved chunk (mislabeling it as Section 3), but missed Section 3.1's architectural comparison of local MLPs vs global self-attention. |
