<p align="center">
  <img src="static/img/logo-dark-transparent.png" alt="SILO Logo" width="220">
</p>

<h1 align="center">SILO — Local Agentic RAG Assistant</h1>

<p align="center">
  (⌐■_■) 100% Local. 100% Private. Zero Cloud Uploads. (⌐■_■)
</p>

---

## (⊙_⊙) What is SILO?

**SILO** is an agentic, local Retrieval-Augmented Generation (RAG) web application designed to run entirely on your own hardware. It allows you to partition your documents into custom, isolated knowledge databases (silos), upload documents (PDFs, TXT, MD, CSV), index them, and chat interactively with your files. 

## (•_•) Why was SILO built?

Most modern AI document tools require you to upload proprietary research, financial files, or private documents to third-party cloud services. SILO was built to solve this privacy problem. By combining **FastAPI**, **LlamaIndex**, **Qdrant**, and **Ollama**, SILO runs entirely locally on your CPU or GPU. Your data never leaves your system, protecting your privacy while avoiding expensive cloud API subscription fees.

---

## (▀̿Ĺ̯▀̿ ̿) Dashboard Preview

### 1. Collections & Document Management View
This view shows the unified sidebar tab selector where you upload files, configure indexing settings, and monitor vectorization progress.

<img width="2560" height="1416" alt="image" src="https://github.com/user-attachments/assets/94f40ff3-de34-4067-8db3-b1fce58e38f4" />


### 2. Multi-Chat Session History
This view highlights the chat tab where you manage persistent chat sessions, toggle web search, and see AI answers complete with cited sources.

<img width="2560" height="1422" alt="image" src="https://github.com/user-attachments/assets/4efcf92f-0a82-409a-bb5b-b7aa00c9309b" />

---

## (^_−)☆ Core Features

- **Isolated Collections:** Partition documents into distinct knowledge spaces so queries don't bleed across unrelated topics.
- **Persistent Multi-Chat:** Create, rename, delete, and switch between chat sessions. Histories are persisted in a local database.
- **Agentic Routing:** Toggle web search to let the local model query the web (via DuckDuckGo) as a fallback if your local knowledge base is insufficient.
- **Smart Indexing:** A lightweight secondary model reads document chunks during ingestion to enrich vectors with AI-extracted titles and keywords.
- **Docker-Compose Architecture:** Spin up Qdrant DB and the FastAPI web service with a single command.

---

## (＠_＠;) Prerequisites

Before running SILO, make sure you have:
1. **Docker & Docker Compose** installed.
2. **Ollama** running on your host machine.
3. The necessary models pulled in Ollama:
   ```bash
   ollama pull llama3.1:8b
   ollama pull llama3.2:1b
   ```

---

## (☞ﾟヮﾟ)☞ Quick Start

1. Start Ollama on your host machine.
2. Clone/download the codebase and navigate to the root directory:
   ```bash
   cd Agentic-RAG-Agent
   ```
3. Run the application stack using Docker Compose:
   ```bash
   docker compose up --build
   ```
4. Once the logs show `✅ RAG Engine ready!`, open your browser and navigate to:
   ```
   http://localhost:8000
   ```

To shut down the application stack, run:
```bash
docker compose down
```

---

## (ง'̀-'́)ง Data Persistence Mechanics

To ensure you don't lose any documents or chat history, SILO mounts two persistent volumes onto your host machine:
- **`./data`:** Stored uploaded documents, active collections, and `chats.json`.
- **`./qdrant_storage`:** Stored Qdrant database vector indices.
