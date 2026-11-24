# Benchmark Datasets for SILO

This directory contains 4 diverse benchmark datasets covering distinct document structures and retrieval challenges. 
*(Note: None of these are indexed yet. You can upload or copy them into your collections to test indexing and retrieval on demand).*

---

### 1. Financial Domain: `1_Financial_NVIDIA_10K/NVIDIA_FY2024_10K.pdf` (1.02 MB)
* **What it is:** NVIDIA's official Form 10-K Annual SEC Report for Fiscal Year 2024.
* **Why it tests SILO:** High density of financial tables, granular numbers, revenue breakdowns, and legal footnotes.
* **Sample Test Queries:**
  - *"What was NVIDIA's total revenue and Data Center segment revenue for fiscal year 2024?"*
  - *"What are the primary risk factors mentioned concerning supply chain dependencies and foundry manufacturing?"*
  - *"How much did NVIDIA spend on research and development (R&D) in FY2024 compared to FY2023?"*

---

### 2. Narrative Synthesis: `2_Narrative_Paul_Graham/paul_graham_essay.txt` (75 KB)
* **What it is:** Paul Graham's classic reflective essay *"What I Worked On"* (the standard LlamaIndex narrative benchmark).
* **Why it tests SILO:** Evaluates whether the model can connect narrative threads across paragraphs and summarize abstract personal philosophies.
* **Sample Test Queries:**
  - *"What were the two main things Paul Graham worked on before college?"*
  - *"Why did he leave Y Combinator and what did he work on next?"*
  - *"What did he learn about the relationship between art, painting, and software development?"*

---

### 3. Frontier AI Paper: `3_AI_Paper_LoRA/LoRA_Low_Rank_Adaptation.pdf` (1.53 MB)
* **What it is:** The seminal paper *"LoRA: Low-Rank Adaptation of Large Language Models"* (Edward Hu et al., ArXiv:2106.09685).
* **Why it tests SILO:** Evaluates handling of mathematical equations, technical terminology, and architecture benchmarks.
* **Sample Test Queries:**
  - *"What is the core mathematical hypothesis behind Low-Rank Adaptation (LoRA)?"*
  - *"How does LoRA reduce the number of trainable parameters compared to full fine-tuning on GPT-3?"*
  - *"Which weight matrices in the Transformer attention layers are adapted by LoRA in the paper's experiments?"*

---

### 4. Structured Tabular Catalog: `4_Structured_IMDb_Catalog/IMDB_Top_Movies.csv` (308 KB)
* **What it is:** A clean tabular dataset of the top 1,000 IMDb movies, including Title, Genre, Description, Director, Actors, Year, Runtime, Rating, Votes, and Revenue.
* **Why it tests SILO:** Tests how your chunker and hybrid search (BM25 sparse vectors + dense embeddings) perform on structured CSV rows and entity search.
* **Sample Test Queries:**
  - *"Find Christopher Nolan sci-fi movies in the dataset and what are their ratings?"*
  - *"Which movies directed by Quentin Tarantino are in the dataset?"*
  - *"Summarize the plot of the highest revenue animated movie."*

