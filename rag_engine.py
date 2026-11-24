"""
RAG Engine Module
==================
Reusable RAG logic extracted into a clean class.
Manages multiple Qdrant collections, handles queries with source retrieval,
and supports PDF ingestion into any collection.
"""

import os
import json
import logging
import asyncio
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from qdrant_client import AsyncQdrantClient, QdrantClient
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger("rag_engine")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)
from llama_index.core import (
    VectorStoreIndex,
    Document,
    Settings,
    StorageContext,
    SimpleDirectoryReader,
)
from llama_index.core.tools import FunctionTool
from llama_index.core.agent import ReActAgent
from llama_index.vector_stores.qdrant import QdrantVectorStore
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.llms.ollama import Ollama
from llama_index.postprocessor.sbert_rerank import SentenceTransformerRerank
try:
    from ddgs import DDGS
except ImportError:
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        DDGS = None

# --- PATCH FOR LlamaIndex/dirtyjson BUG ---
# LlamaIndex uses dirtyjson to parse malformed LLM outputs.
# dirtyjson's AttributedDict has a broken __init__ that doesn't accept arguments,
# causing crashes when LlamaIndex tries to copy or convert it.
try:
    import dirtyjson.attributed_containers
    _orig_init = dirtyjson.attributed_containers.AttributedDict.__init__
    def _patched_init(self, *args, **kwargs):
        _orig_init(self)
        if args:
            self.update(args[0])
        if kwargs:
            self.update(kwargs)
    dirtyjson.attributed_containers.AttributedDict.__init__ = _patched_init
except ImportError:
    pass
# ------------------------------------------




# ============================================================
# Data directory for uploaded files (per collection)
# ============================================================
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
COLLECTIONS_META_FILE = DATA_DIR / "collections.json"
SETTINGS_FILE = DATA_DIR / "settings.json"
CHATS_FILE = DATA_DIR / "chats.json"


class RAGEngine:
    """
    Central RAG engine that manages collections, ingestion, and queries.
    
    Each collection maps to:
    - A Qdrant vector collection (for search)
    - A folder under data/<collection_name>/ (for stored files)
    - Metadata in data/collections.json (name, color, description)
    """

    def __init__(
        self,
        qdrant_host: str = None,
        qdrant_port: int = None,
        embed_model_name: str = "BAAI/bge-small-en-v1.5",
        llm_timeout: float = 600.0,
    ):
        self.llm_timeout = llm_timeout
        
        # Read from environment variables if not provided
        if qdrant_host is None:
            qdrant_host = os.environ.get("QDRANT_HOST", "localhost")
        if qdrant_port is None:
            try:
                qdrant_port = int(os.environ.get("QDRANT_PORT", "6333"))
            except ValueError:
                qdrant_port = 6333
                
        self.ollama_base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

        # Ensure data directory exists
        DATA_DIR.mkdir(parents=True, exist_ok=True)

        # Load settings
        self._settings = self._load_settings()

        # Initialize embedding model and LLM with Ollama base URL
        self.embed_model = HuggingFaceEmbedding(model_name=embed_model_name)
        self.llm = Ollama(
            model=self._settings.get("chat_model", "llama3.1:8b"), 
            base_url=self.ollama_base_url,
            request_timeout=llm_timeout
        )

        # Set as global defaults for LlamaIndex
        Settings.embed_model = self.embed_model
        Settings.llm = self.llm

        # Connect to Qdrant (Async and Sync)
        self.qdrant_client = AsyncQdrantClient(host=qdrant_host, port=qdrant_port)
        self.qdrant_client_sync = QdrantClient(host=qdrant_host, port=qdrant_port)
        
        # Initialize Re-ranker
        self.reranker = SentenceTransformerRerank(model="cross-encoder/ms-marco-MiniLM-L-6-v2", top_n=4)

        # Load or initialize collections metadata and chats
        self._collections_meta = self._load_collections_meta()
        self._chats = self._load_chats()

    # ────────────────────────────────────────────────────────
    # Settings Management
    # ────────────────────────────────────────────────────────

    def _load_settings(self) -> dict:
        if SETTINGS_FILE.exists():
            try:
                with open(SETTINGS_FILE, "r") as f:
                    settings = json.load(f)
                    if "strict_mode" not in settings:
                        settings["strict_mode"] = False
                    return settings
            except Exception:
                pass
        return {"chat_model": "llama3.1:8b", "ingestion_model": "llama3.2:1b", "strict_mode": False}

    def _save_settings(self):
        with open(SETTINGS_FILE, "w") as f:
            json.dump(self._settings, f, indent=2)

    def get_settings(self) -> dict:
        return self._settings

    def update_settings(self, chat_model: str, ingestion_model: str, strict_mode: bool = False) -> dict:
        self._settings["chat_model"] = chat_model
        self._settings["ingestion_model"] = ingestion_model
        self._settings["strict_mode"] = strict_mode
        self._save_settings()
        
        # Re-initialize LLM
        self.llm = Ollama(model=chat_model, base_url=self.ollama_base_url, request_timeout=self.llm_timeout)
        Settings.llm = self.llm
        
        return self._settings

    # ────────────────────────────────────────────────────────
    # Collections Management
    # ────────────────────────────────────────────────────────

    def _load_collections_meta(self) -> dict:
        """Load collections metadata from disk."""
        if COLLECTIONS_META_FILE.exists():
            with open(COLLECTIONS_META_FILE, "r") as f:
                return json.load(f)
        return {}

    def _save_collections_meta(self):
        """Persist collections metadata to disk."""
        with open(COLLECTIONS_META_FILE, "w") as f:
            json.dump(self._collections_meta, f, indent=2)

    def create_collection(
        self, name: str, description: str = "", color: str = "#6366f1"
    ) -> dict:
        """Create a new collection (metadata + data folder)."""
        # Sanitize name for use as folder/collection name
        safe_name = name.lower().replace(" ", "_")

        if safe_name in self._collections_meta:
            return self._collections_meta[safe_name]

        # Create data folder for this collection
        collection_dir = DATA_DIR / safe_name
        collection_dir.mkdir(parents=True, exist_ok=True)

        # Store metadata
        meta = {
            "name": name,
            "safe_name": safe_name,
            "description": description,
            "color": color,
            "file_count": 0,
        }
        self._collections_meta[safe_name] = meta
        self._save_collections_meta()

        return meta

    async def list_collections(self) -> list[dict]:
        """List all collections with their metadata and file counts."""
        result = []

        # Also check Qdrant for existing vector collections
        try:
            collections_response = await self.qdrant_client.get_collections()
            qdrant_collections = {c.name for c in collections_response.collections}
        except Exception as e:
            logger.warning(f"Could not reach Qdrant: {e}")
            qdrant_collections = set()

        for safe_name, meta in self._collections_meta.items():
            collection_dir = DATA_DIR / safe_name
            files = []
            if collection_dir.exists():
                files = [
                    f.name
                    for f in collection_dir.iterdir()
                    if f.is_file() and f.name != ".gitkeep"
                ]

            result.append(
                {
                    **meta,
                    "file_count": len(files),
                    "files": files,
                    "indexed": safe_name in qdrant_collections,
                }
            )

        return result

    async def get_collection(self, safe_name: str) -> Optional[dict]:
        """Get a single collection's details."""
        if safe_name not in self._collections_meta:
            return None

        meta = self._collections_meta[safe_name]
        collection_dir = DATA_DIR / safe_name
        files = []
        if collection_dir.exists():
            files = []
            for f in collection_dir.iterdir():
                if f.is_file() and f.name != ".gitkeep":
                    files.append(
                        {
                            "name": f.name,
                            "size": f.stat().st_size,
                            "type": f.suffix.lstrip(".").upper(),
                        }
                    )

        try:
            collections_response = await self.qdrant_client.get_collections()
            qdrant_collections = {c.name for c in collections_response.collections}
        except Exception:
            qdrant_collections = set()

        return {
            **meta,
            "files": files,
            "file_count": len(files),
            "indexed": safe_name in qdrant_collections,
        }

    async def update_collection(self, safe_name: str, color: str = None, description: str = None) -> Optional[dict]:
        """Update a collection's metadata (color, description)."""
        if safe_name not in self._collections_meta:
            return None
        if color is not None:
            self._collections_meta[safe_name]["color"] = color
        if description is not None:
            self._collections_meta[safe_name]["description"] = description
        self._save_collections_meta()
        return self._collections_meta[safe_name]

    async def delete_collection(self, safe_name: str) -> bool:
        """Delete a collection (metadata, files, and Qdrant vectors)."""
        if safe_name not in self._collections_meta:
            return False

        # Delete from Qdrant
        try:
            await self.qdrant_client.delete_collection(safe_name)
        except Exception:
            pass  # Collection might not exist in Qdrant yet

        # Delete files
        collection_dir = DATA_DIR / safe_name
        if collection_dir.exists():
            import shutil
            shutil.rmtree(collection_dir)

        # Remove metadata
        del self._collections_meta[safe_name]
        self._save_collections_meta()

        return True

    # ────────────────────────────────────────────────────────
    # File Upload & Ingestion
    # ────────────────────────────────────────────────────────

    def save_uploaded_file(self, safe_name: str, filename: str, content: bytes) -> Path:
        """Save an uploaded file to the collection's data folder."""
        collection_dir = DATA_DIR / safe_name
        collection_dir.mkdir(parents=True, exist_ok=True)

        file_path = collection_dir / filename
        with open(file_path, "wb") as f:
            f.write(content)

        return file_path

    async def ingest_collection(self, safe_name: str, smart_mode: bool = False, progress_callback=None) -> int:
        """
        Ingest all files in a collection's folder into Qdrant.
        
        Args:
            progress_callback: Optional callable(stage, progress, message) to report progress.
        Returns the number of documents indexed.
        """
        def report(stage: str, progress: int, message: str):
            if progress_callback:
                progress_callback(stage, progress, message)

        collection_dir = DATA_DIR / safe_name
        if not collection_dir.exists():
            return 0

        # Check if there are any files to ingest
        files = [f for f in collection_dir.iterdir() if f.is_file()]
        if not files:
            return 0

        # ── Stage 1: Loading files ──
        report("loading", 10, f"Loading {len(files)} file(s) from disk...")
        try:
            from pdf_parser import LayoutAwarePDFReader
            extractor = {".pdf": LayoutAwarePDFReader()}
            reader = SimpleDirectoryReader(input_dir=str(collection_dir), file_extractor=extractor)
            documents = reader.load_data()
        except Exception as e:
            logger.error(f"Error reading files from {collection_dir}: {e}")
            report("error", 0, f"Failed to read files: {e}")
            return 0

        if not documents:
            report("error", 0, "No documents found to index.")
            return 0

        # Add collection metadata to each document
        for doc in documents:
            doc.metadata["collection"] = safe_name

        # ── Stage 2: Delete old index ──
        report("chunking", 20, f"Preparing {len(documents)} document(s) for indexing...")
        try:
            await self.qdrant_client.delete_collection(safe_name)
        except Exception:
            pass

        # Create vector store and index
        vector_store = QdrantVectorStore(
            client=self.qdrant_client_sync,
            aclient=self.qdrant_client,
            collection_name=safe_name,
            enable_hybrid=True,
            fastembed_sparse_model="Qdrant/bm25",
            batch_size=16,
        )
        storage_context = StorageContext.from_defaults(vector_store=vector_store)

        if smart_mode:
            from llama_index.core.extractors import TitleExtractor, KeywordExtractor
            from llama_index.core.node_parser import SentenceSplitter
            from llama_index.core.ingestion import IngestionPipeline

            # ── Stage 3: Chunking ──
            report("chunking", 25, "Splitting documents into chunks...")

            ingestion_model_name = self._settings.get("ingestion_model", "llama3.2:1b")
            enrichment_llm = Ollama(model=ingestion_model_name, base_url=self.ollama_base_url, request_timeout=120.0)

            # ── Stage 4: Enriching (Smart mode only) ──
            report("enriching", 30, "AI is extracting titles and keywords from chunks...")

            # Use num_workers=1 to prevent concurrent connection socket exhaustion in local Ollama instances
            CUSTOM_TITLE_NODE_TEMPLATE = (
                "Context: {context_str}\n\n"
                "Extract a single, concise title for this text. "
                "Return ONLY the title itself, with no preamble, no quotes, and no explanation."
            )
            CUSTOM_TITLE_COMBINE_TEMPLATE = (
                "Context: {context_str}\n\n"
                "Based on the above candidate titles and content, extract a single, comprehensive title for this document. "
                "Return ONLY the title itself, with no preamble, no quotes, no conversational text, and no explanation."
            )
            CUSTOM_KEYWORD_TEMPLATE = (
                "Context: {context_str}\n\n"
                "Extract exactly {keywords} unique keywords for this document. "
                "Return ONLY a comma-separated list of keywords, with no preamble, no explanation, and no formatting."
            )
            
            pipeline = IngestionPipeline(
                transformations=[
                    SentenceSplitter(chunk_size=512, chunk_overlap=64),
                    TitleExtractor(
                        llm=enrichment_llm, 
                        nodes=3, 
                        num_workers=1,
                        node_template=CUSTOM_TITLE_NODE_TEMPLATE,
                        combine_template=CUSTOM_TITLE_COMBINE_TEMPLATE
                    ),
                    KeywordExtractor(
                        llm=enrichment_llm, 
                        keywords=5, 
                        num_workers=1,
                        prompt_template=CUSTOM_KEYWORD_TEMPLATE
                    ),
                    self.embed_model,
                ]
            )
            # Use arun (async run) directly on the main thread loop for nested async safety
            nodes = await pipeline.arun(documents=documents, show_progress=True)

            # ── Stage 5: Storing ──
            report("storing", 90, f"Writing {len(nodes)} enriched chunks to vector database...")
            VectorStoreIndex(nodes=nodes, storage_context=storage_context)
        else:
            import gc
            from llama_index.core.node_parser import SentenceSplitter
            # ── Stage 3: Chunking ──
            report("chunking", 15, f"Splitting {len(documents)} document pages into passages...")
            splitter = SentenceSplitter(chunk_size=512, chunk_overlap=64)
            nodes = splitter.get_nodes_from_documents(documents)
            # Propagate table/statement unit headers (e.g., "(In millions)") into split chunks
            # so bottom table rows never lose their scale or statement context.
            for node in nodes:
                header = (node.metadata or {}).get("page_header")
                if header and header[:40].lower() not in node.text[:250].lower():
                    node.text = f"[Context Header: {header}]\n{node.text}"
            total_nodes = len(nodes)
            report("chunking", 25, f"Split into {total_nodes} passages. Preparing embeddings...")

            # ── Stage 4: Embedding + Storing in bounded batches ──
            batch_step = 24

            def _insert_all_nodes():
                index = None
                for i in range(0, total_nodes, batch_step):
                    chunk = nodes[i : i + batch_step]
                    end_idx = min(i + len(chunk), total_nodes)
                    pct = 25 + int((end_idx / total_nodes) * 70)
                    report("embedding", pct, f"Embedding passages {end_idx} of {total_nodes} ({pct}%)...")
                    if index is None:
                        index = VectorStoreIndex(nodes=chunk, storage_context=storage_context, show_progress=False)
                    else:
                        index.insert_nodes(chunk)
                    gc.collect()

            await asyncio.to_thread(_insert_all_nodes)

        report("ready", 100, f"Successfully indexed {len(documents)} document(s) ({total_nodes} passages)!")
        return len(documents)

    # ────────────────────────────────────────────────────────
    # Query / Chat
    # ────────────────────────────────────────────────────────

    async def aquery(self, safe_name: str, question: str, top_k: int = 4, online_mode: bool = False) -> dict:
        """
        Query a collection's knowledge base.
        
        Normal mode: Simple retrieve → generate (fast, works with any model).
        Online mode: Uses ReAct agent for multi-tool routing (KB + web search).
        
        Returns:
            {
                "answer": "The AI-generated answer...",
                "sources": [
                    {"text": "...", "score": 0.85, "metadata": {...}, "type": "local" | "web"},
                    ...
                ]
            }
        """
        sources = []

        # ── Helper: retrieve from local KB ──
        async def _retrieve_from_kb(query: str) -> list:
            """Retrieve relevant nodes from the local knowledge base."""
            try:
                collections_response = await self.qdrant_client.get_collections()
                qdrant_collections = {c.name for c in collections_response.collections}
            except Exception:
                qdrant_collections = set()

            if safe_name not in qdrant_collections:
                return []

            vector_store = QdrantVectorStore(
                aclient=self.qdrant_client,
                collection_name=safe_name,
                enable_hybrid=True,
                fastembed_sparse_model="Qdrant/bm25",
            )
            index = VectorStoreIndex.from_vector_store(vector_store=vector_store)
            
            # Retrieve more candidate chunks and use hybrid search
            retriever = index.as_retriever(similarity_top_k=max(15, top_k * 5), vector_store_query_mode="hybrid")
            nodes = await retriever.aretrieve(query)
            
            # Apply cross-encoder re-ranking
            self.reranker.top_n = top_k
            nodes = self.reranker.postprocess_nodes(nodes, query_str=query)
            return nodes

        # ════════════════════════════════════════════════════
        # PATH 1: Simple RAG (no agent, single LLM call)
        # ════════════════════════════════════════════════════
        if not online_mode:
            nodes = await _retrieve_from_kb(question)

            # Build sources list
            context_texts = []
            for node in nodes:
                sources.append({
                    "text": node.text[:300] + ("..." if len(node.text) > 300 else ""),
                    "score": round(node.score, 4),
                    "metadata": node.metadata,
                    "type": "local"
                })
                context_texts.append(node.text)

            # Build the prompt (strict grounding + table-alignment & unit-preservation rules)
            if context_texts:
                context_block = "\n\n---\n\n".join(context_texts)
                prompt = (
                    f"You are a precise, strictly grounded document analyst. Answer the user's question using ONLY the provided Context.\n"
                    f"Rules:\n"
                    f"1. Never invent, guess, or pull facts/numbers from outside memory. If the Context does not contain the specific entity, time period, or metric requested (or if the question has a false premise), explicitly state that the provided documents do not contain that information.\n"
                    f"2. Always preserve exact units and scale (e.g., 'in millions', 'in billions', '%') shown in table headers or context headers.\n"
                    f"3. When reading pipe-delimited ('|') tables, carefully match each number to its exact row label and column header before reporting it.\n"
                    f"4. Be concise, accurate, and direct.\n\n"
                    f"## Context:\n{context_block}\n\n"
                    f"## Question:\n{question}"
                )
            else:
                prompt = (
                    f"You are a precise document analyst. The local knowledge base returned no relevant passages for this query.\n"
                    f"Explicitly state that the uploaded documents do not contain information to answer this question. Do not guess or fabricate facts.\n\n"
                    f"## Question:\n{question}"
                )

            try:
                response = await self.llm.acomplete(prompt)
                answer_text = str(response)
            except Exception as e:
                logger.error(f"LLM error: [{type(e).__name__}] {e}")
                raise e

            return {"answer": answer_text, "sources": sources}

        # ════════════════════════════════════════════════════
        # PATH 2: Agent mode (online_mode=True, LangGraph CRAG)
        # ════════════════════════════════════════════════════
        try:
            from agent_graph import agent_graph
        except ImportError as e:
            raise RuntimeError("LangGraph is not installed. Please run 'pip install langgraph' to use Agentic mode.") from e

        initial_state = {
            "question": question,
            "original_question": question,
            "documents": [],
            "sources": [],
            "web_search": False,
            "generation": "",
            "retry_count": 0,
            "strict_mode": self._settings.get("strict_mode", False),
            "is_grounded": True
        }

        config = {
            "configurable": {
                "engine": self,
                "safe_name": safe_name,
                "top_k": top_k
            }
        }

        try:
            final_state = await agent_graph.ainvoke(initial_state, config)
            return {
                "answer": final_state["generation"],
                "sources": final_state["sources"]
            }
        except Exception as e:
            logger.error(f"LangGraph execution error: {e}")
            raise e

    async def astream_query(self, safe_name: str, question: str, top_k: int = 4, online_mode: bool = False):
        """
        Query a collection's knowledge base and stream tokens/sources.
        Yields dictionaries.
        """
        sources = []

        # ── Helper: retrieve from local KB ──
        async def _retrieve_from_kb(query: str) -> list:
            try:
                collections_response = await self.qdrant_client.get_collections()
                qdrant_collections = {c.name for c in collections_response.collections}
            except Exception:
                qdrant_collections = set()

            if safe_name not in qdrant_collections:
                return []

            vector_store = QdrantVectorStore(
                aclient=self.qdrant_client,
                collection_name=safe_name,
                enable_hybrid=True,
                fastembed_sparse_model="Qdrant/bm25",
            )
            index = VectorStoreIndex.from_vector_store(vector_store=vector_store)
            
            # Retrieve more candidate chunks and use hybrid search
            retriever = index.as_retriever(similarity_top_k=max(15, top_k * 5), vector_store_query_mode="hybrid")
            nodes = await retriever.aretrieve(query)
            
            # Apply cross-encoder re-ranking
            self.reranker.top_n = top_k
            nodes = self.reranker.postprocess_nodes(nodes, query_str=query)
            return nodes

        if not online_mode:
            nodes = await _retrieve_from_kb(question)

            # Build sources list
            context_texts = []
            for node in nodes:
                sources.append({
                    "text": node.text[:300] + ("..." if len(node.text) > 300 else ""),
                    "score": round(node.score, 4),
                    "metadata": node.metadata,
                    "type": "local"
                })
                context_texts.append(node.text)

            # Yield sources first
            yield {"type": "sources", "sources": sources}

            # Build the prompt (strict grounding + table-alignment & unit-preservation rules)
            if context_texts:
                context_block = "\n\n---\n\n".join(context_texts)
                prompt = (
                    f"You are a precise, strictly grounded document analyst. Answer the user's question using ONLY the provided Context.\n"
                    f"Rules:\n"
                    f"1. Never invent, guess, or pull facts/numbers from outside memory. If the Context does not contain the specific entity, time period, or metric requested (or if the question has a false premise), explicitly state that the provided documents do not contain that information.\n"
                    f"2. Always preserve exact units and scale (e.g., 'in millions', 'in billions', '%') shown in table headers or context headers.\n"
                    f"3. When reading pipe-delimited ('|') tables, carefully match each number to its exact row label and column header before reporting it.\n"
                    f"4. Be concise, accurate, and direct.\n\n"
                    f"## Context:\n{context_block}\n\n"
                    f"## Question:\n{question}"
                )
            else:
                prompt = (
                    f"You are a precise document analyst. The local knowledge base returned no relevant passages for this query.\n"
                    f"Explicitly state that the uploaded documents do not contain information to answer this question. Do not guess or fabricate facts.\n\n"
                    f"## Question:\n{question}"
                )

            try:
                stream_gen = await self.llm.astream_complete(prompt)
                async for chunk in stream_gen:
                    yield {"type": "token", "token": chunk.delta}
            except Exception as e:
                logger.error(f"LLM error: [{type(e).__name__}] {e}")
                raise e

        else:
            # Agent mode streaming (LangGraph CRAG)
            try:
                from agent_graph import agent_graph
            except ImportError as e:
                yield {"type": "error", "message": "LangGraph is not installed. Please run 'pip install langgraph' to use Agentic mode."}
                return

            queue = asyncio.Queue()

            async def on_token_callback(data: dict):
                await queue.put(data)

            initial_state = {
                "question": question,
                "original_question": question,
                "documents": [],
                "sources": [],
                "web_search": False,
                "generation": "",
                "retry_count": 0,
                "strict_mode": self._settings.get("strict_mode", False),
                "is_grounded": True
            }

            config = {
                "configurable": {
                    "engine": self,
                    "safe_name": safe_name,
                    "top_k": top_k,
                    "on_token": on_token_callback
                }
            }

            async def run_graph():
                try:
                    await agent_graph.ainvoke(initial_state, config)
                except Exception as e:
                    logger.error(f"Error inside LangGraph stream task: {e}")
                    await queue.put({"type": "error", "message": str(e)})
                finally:
                    await queue.put(None)

            graph_task = asyncio.create_task(run_graph())

            while True:
                item = await queue.get()
                if item is None:
                    break
                yield item
                queue.task_done()

            await graph_task

    # ────────────────────────────────────────────────────────
    # Chat Sessions Management
    # ────────────────────────────────────────────────────────

    def _load_chats(self) -> dict:
        """Load chats metadata and messages from disk."""
        if CHATS_FILE.exists():
            try:
                with open(CHATS_FILE, "r") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load chats: {e}")
        return {}

    def _save_chats(self):
        """Persist chats to disk."""
        try:
            with open(CHATS_FILE, "w") as f:
                json.dump(self._chats, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save chats: {e}")

    def list_chats(self) -> list[dict]:
        """List all chat sessions, returning metadata only (no messages)."""
        result = []
        for chat_id, chat in self._chats.items():
            result.append({
                "id": chat_id,
                "title": chat.get("title", "New Chat"),
                "collection": chat.get("collection"),
                "created_at": chat.get("created_at"),
                "updated_at": chat.get("updated_at"),
            })
        # Sort by updated_at descending (newest first)
        result.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        return result

    def get_chat(self, chat_id: str) -> Optional[dict]:
        """Get details of a single chat session including its messages."""
        return self._chats.get(chat_id)

    def create_chat(self, collection: str, title: str = None) -> dict:
        """Create a new chat session."""
        chat_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        # Get collection name to use as default title if none provided
        if not title:
            col_meta = self._collections_meta.get(collection)
            col_name = col_meta.get("name", "Collection") if col_meta else "Collection"
            title = f"Chat about {col_name}"

        chat_session = {
            "id": chat_id,
            "title": title,
            "collection": collection,
            "created_at": now,
            "updated_at": now,
            "messages": []
        }
        
        self._chats[chat_id] = chat_session
        self._save_chats()
        return chat_session

    def update_chat(self, chat_id: str, title: str = None, collection: str = None) -> Optional[dict]:
        """Update chat session metadata (title, collection)."""
        if chat_id not in self._chats:
            return None
            
        chat = self._chats[chat_id]
        if title is not None:
            chat["title"] = title
        if collection is not None:
            chat["collection"] = collection
            
        chat["updated_at"] = datetime.now().isoformat()
        self._save_chats()
        return chat

    def delete_chat(self, chat_id: str) -> bool:
        """Delete a chat session."""
        if chat_id in self._chats:
            del self._chats[chat_id]
            self._save_chats()
            return True
        return False

    def add_chat_message(self, chat_id: str, role: str, content: str, sources: list = None) -> Optional[dict]:
        """Add a single message to a chat session. Auto-generates title if needed."""
        if chat_id not in self._chats:
            return None
            
        chat = self._chats[chat_id]
        
        message = {
            "role": role,
            "content": content
        }
        if sources is not None:
            message["sources"] = sources
            
        chat["messages"].append(message)
        chat["updated_at"] = datetime.now().isoformat()
        
        # Auto-rename "New Chat" or collection-default title on the first user message
        if role == "user" and (len(chat["messages"]) <= 1 or chat["title"].startswith("Chat about ")):
            # Clean up user message text to make a short title
            title_candidate = content.strip()
            if len(title_candidate) > 40:
                title_candidate = title_candidate[:37] + "..."
            chat["title"] = title_candidate

        self._save_chats()
        return chat
