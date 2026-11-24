# SILO Agentic RAG — Evaluation & Benchmark Report

> **Generated:** 2026-11-23 20:47  
> **Local Stack:** `llama3.1:8b` (Ollama) · `BAAI/bge-small-en-v1.5` · `Qdrant/bm25` · `cross-encoder/ms-marco-MiniLM-L-6-v2`  
> **External Judge:** `Gemini (Web Judge)` (Industry-Standard RAGAS / TruLens / FinanceBench Rubric)  
> **Hardware:** 15.31 GB System RAM · Peak Python Process RSS: **1060.2 MB**

## 1. Retrieval Ablation (Dense vs. Hybrid BM25 vs. Hybrid + Cross-Encoder Rerank)

Controlled evaluation on all answerable queries across the NVIDIA FY2024 10-K (96 pages) and 5 seminal ML research papers (ResNet, Transformer, BERT, RAG, ViT):

| Retrieval Strategy | Recall@1 | Recall@3 | Recall@5 | MRR@5 | p50 Latency | p95 Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 1. Dense Vector Only (`bge-small-en-v1.5`) | 65.0% | 87.5% | 90.0% | 0.743 | 41.6 ms | 54.0 ms |
| 2. Hybrid Search (Dense + `Qdrant/bm25`) | 70.0% | 92.5% | 97.5% | 0.820 | 37.0 ms | 47.7 ms |
| **3. SILO Full Stack (Hybrid + `MiniLM-L-6-v2` Rerank)** | 85.0% | 97.5% | 100.0% | 0.909 | 624.1 ms | 649.2 ms |

**Ablation Lift (SILO Full Stack vs. Dense Baseline):** Recall@1 **+20.0 pts**, Recall@3 **+10.0 pts**, Recall@5 **+10.0 pts**, MRR@5 **+0.167**.

## 2. End-to-End Generation Quality (LLM-as-a-Judge)

| Pipeline Mode | Faithfulness | Answer Correctness | Context Precision | Adversarial Safety | Overall Hallucination Rate |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Single-Shot RAG (Hybrid + Rerank) | 88.1% | 84.4% | 90.0% | 90.0% | 12.0% |
| **Agentic LangGraph (CRAG + Self-RAG)** | 90.0% | 84.4% | 90.0% | 90.0% | 12.0% |

## 3. Domain Breakdown (Finance 10-K vs. ML Papers vs. Adversarial)

| Mode | Domain | Questions | Correctness / Safety | Faithfulness | Hallucination Rate |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `simple_rag` | NVIDIA FY2024 10-K (Finance) | 20 | 97.5% | 96.2% | 0.0% |
| `simple_rag` | ML Research Papers (Multi-Doc) | 20 | 71.2% | 80.0% | 25.0% |
| `simple_rag` | Adversarial / Out-of-Corpus | 10 | 90.0% | — | 10.0% |
| `agentic_crag` | NVIDIA FY2024 10-K (Finance) | 20 | 92.5% | 97.5% | 0.0% |
| `agentic_crag` | ML Research Papers (Multi-Doc) | 20 | 76.2% | 82.5% | 25.0% |
| `agentic_crag` | Adversarial / Out-of-Corpus | 10 | 90.0% | — | 10.0% |

## 4. Agentic LangGraph Telemetry (CRAG & Self-RAG)

| Agentic Metric | Value | Detail |
| :--- | :---: | :--- |
| **CRAG Web-Fallback Precision** | 0.0% | When web search fired, how often was it truly out-of-corpus? (TP=0, FP=0) |
| **CRAG Web-Fallback Recall** | 0.0% | Out-of-corpus queries caught by document grader (TP=0, FN=10) |
| **CRAG Routing F1** | 0.0% | Harmonic mean of CRAG routing precision & recall |
| **Local Privacy Retention Rate** | 100.0% | In-corpus queries answered 100% locally without web calls (40/40) |
| **Self-RAG Intervention Rate** | 30.0% | Queries where hallucination check triggered query rewrite + retry (15/50) |
| **Queries Rewritten** | 15 | Total automatic query rewrites executed by LangGraph |

## 5. Latency & Edge Systems Telemetry

| Mode | p50 TTFT | p95 TTFT | p50 Total Latency | p95 Total Latency | Mean Throughput | Peak Process RSS |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `simple_rag` | 2152 ms | 2542 ms | 10.09 s | 19.96 s | 5.7 tok/s | 1060 MB |
| `agentic_crag` | 15735 ms | 58932 ms | 16.30 s | 66.18 s | 2.6 tok/s | 1060 MB |

## 6. Resume-Ready Summary Bullets (Auto-Populated)

- Built **SILO**, a 100% local Agentic RAG assistant (FastAPI, LangGraph, Qdrant, Ollama, React 19) achieving **90.0% Faithfulness** and **84.4% Answer Correctness** on a 50-question Finance 10-K + arXiv benchmark judged by `Gemini (Web Judge)`; Hybrid Search (`bge-small` + `Qdrant/bm25`) with `MiniLM-L-6-v2` cross-encoder reranking achieved **100.0% Recall@5** (**+10.0 pts** over dense-only baseline, p50 retrieval 624 ms).
- Implemented LangGraph **CRAG document grading & Self-RAG verification**, achieving **90.0% adversarial safety** (out-of-corpus hallucination rate: **10.0%** vs. **10.0%** single-shot baseline, CRAG routing F1: **0.0%**).
- Engineered memory-safe local ingestion & SSE streaming for 16 GB consumer hardware, resolving an 805 MB ONNX SPLADE OOM bottleneck via batched BM25 + explicit GC (peak Python RSS **1060.2 MB**, p50 TTFT **2152 ms**).

## 7. Error Analysis & Audit Log (Cases Scoring < 0.75 or Hallucinated)

| Mode | ID | Verdict | Judge Rationale |
| :--- | :--- | :--- | :--- |
| `simple_rag` | `fin_15` | `partial` | Extracted the right digits ($42,978 and $65,728) from the balance sheet but omitted the critical 'in millions' unit, resulting in a major magnitude omission. |
| `simple_rag` | `paper_07` | `hallucinated` | Correctly extracted base model specs and big model hidden dimensions, but misread Table 3 and falsely reported 168 million parameters for the big model instead of 213 million. |
| `simple_rag` | `paper_10` | `hallucinated` | Misread Table 1 columns and reported MNLI-(m/mm) scores (84.6/83.4 and 86.7/85.9) as the GLUE average scores instead of 79.6 and 82.1. |
| `simple_rag` | `paper_11` | `hallucinated` | Misread Table 3 columns: misattributed Test EM (80.0) and Test F1 (83.1) as Dev scores and falsely claimed Test EM was not provided. |
| `simple_rag` | `paper_15` | `hallucinated` | Correctly extracted NQ scores for RAG-Token (44.1), RAG-Sequence (44.5), and DPR (41.5), but misread Table 1 and falsely labeled TQA scores (55.2 and 56.8) as NQ 'answer recall @ 1'. |
| `simple_rag` | `paper_16` | `hallucinated` | Severely misread Table 2 rows and columns, reporting SotA FEVER-2 (92.2*) as RAG-Token FEVER-3 and scrambling BART's scores (81.1 and 72.5 instead of 64.0 and 81.1). |
| `simple_rag` | `paper_20` | `partial` | Correctly noted ViT outperforms BiT ResNets on JFT-300M, but conflated ViT-Large vs. ViT-Base with ViT vs. BiT ResNets on smaller datasets and did not clearly state ViT underperforms BiT ResNets on ImageNet. |
| `simple_rag` | `adv_05` | `hallucinated` | Although it declined to provide a live stock price, it falsely claimed NVIDIA's stock price on Jan 28, 2024 was $1,536.28, misrepresenting the 5-year cumulative return on a $100 investment. |
| `agentic_crag` | `fin_15` | `partial` | Extracted the right digits ($42,978 and $65,728) from the balance sheet but omitted the critical 'in millions' unit, resulting in a major magnitude omission. |
| `agentic_crag` | `paper_07` | `hallucinated` | Table 3 was not retrieved in the contexts; the model leaked d_model and d_ff from parametric memory while falsely citing Table 3 and omitting the requested parameter counts (65M and 213M). |
| `agentic_crag` | `paper_10` | `hallucinated` | Misread Table 1 columns and reported MNLI-(m/mm) scores (84.6/83.4 and 86.7/85.9) as the GLUE average scores instead of 79.6 and 82.1. |
| `agentic_crag` | `paper_14` | `hallucinated` | The retrieved chunks did not contain the training section explaining why BERT_d is fixed; the model fabricated an ungrounded rationale instead of citing the high cost of periodically updating the document index. |
| `agentic_crag` | `paper_15` | `hallucinated` | Misread Table 1 columns and reported TriviaQA (TQA) scores (56.8/68.0 and 57.9/-) as Natural Questions (NQ) scores instead of 44.1, 44.5, and 41.5. |
| `agentic_crag` | `paper_16` | `hallucinated` | Correctly extracted FEVER-2 scores (89.5 and 81.1), but misread Table 2 rows and attributed SotA FEVER-2 (92.2*) to RAG-Token FEVER-3 and SotA FEVER-3 (76.8) to BART FEVER-3. |
| `agentic_crag` | `adv_05` | `hallucinated` | Correctly distinguished the 5-year cumulative return from the stock price, but hallucinated a current NASDAQ stock price ('$640-650 per share') from parametric memory without web search. |
