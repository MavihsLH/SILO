import os
import re
import json
import logging
import asyncio
from typing import List, Dict, Any, TypedDict, Optional
from ddgs import DDGS
from tenacity import retry, stop_after_attempt, wait_exponential

from llama_index.core import VectorStoreIndex
from llama_index.vector_stores.qdrant import QdrantVectorStore

from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, END

logger = logging.getLogger("agent_graph")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# ============================================================
# Graph State Definition
# ============================================================
class GraphState(TypedDict):
    question: str
    original_question: str
    documents: List[Dict[str, Any]]
    sources: List[Dict[str, Any]]
    web_search: bool
    generation: str
    retry_count: int
    strict_mode: bool
    is_grounded: bool

# ============================================================
# Helper Functions
# ============================================================
def parse_json_list(text: str) -> List[int]:
    """Parse a list of integers from LLM's text output."""
    text = text.strip()
    match = re.search(r'\[\s*\d*(?:\s*,\s*\d+)*\s*\]', text)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass
    return []

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _ddg_search_sync(query: str) -> List[Dict[str, Any]]:
    """Execute blocking DDG search in a retry loop."""
    try:
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=3))
    except Exception as e:
        logger.error(f"DuckDuckGo search error: {e}")
        return []

# ============================================================
# Node Functions
# ============================================================

async def retrieve_node(state: GraphState, config: RunnableConfig) -> Dict[str, Any]:
    """Retrieve documents from the local Qdrant collection."""
    logger.info("--- LANGGRAPH: RETRIEVE ---")
    engine = config["configurable"]["engine"]
    safe_name = config["configurable"]["safe_name"]
    top_k = config["configurable"].get("top_k", 3)
    question = state["question"]
    
    on_token = config["configurable"].get("on_token", None)
    if on_token:
        await on_token({"type": "status", "status": "Searching local database..."})
    
    try:
        collections_response = await engine.qdrant_client.get_collections()
        qdrant_collections = {c.name for c in collections_response.collections}
    except Exception as e:
        logger.error(f"Error querying Qdrant collections: {e}")
        qdrant_collections = set()

    if safe_name not in qdrant_collections:
        logger.warning(f"Collection '{safe_name}' does not exist in Qdrant.")
        return {"documents": []}

    try:
        vector_store = QdrantVectorStore(aclient=engine.qdrant_client, collection_name=safe_name, enable_hybrid=True)
        index = VectorStoreIndex.from_vector_store(vector_store=vector_store)
        
        # Pull candidate chunks
        retriever = index.as_retriever(similarity_top_k=max(15, top_k * 5), vector_store_query_mode="hybrid")
        nodes = await retriever.aretrieve(question)
        
        # Apply sentence transformer reranker
        engine.reranker.top_n = top_k
        nodes = engine.reranker.postprocess_nodes(nodes, query_str=question)
        
        documents = []
        for node in nodes:
            documents.append({
                "text": node.text,
                "score": node.score,
                "metadata": node.metadata,
                "type": "local"
            })
            
        logger.info(f"Retrieved {len(documents)} document nodes.")
        return {"documents": documents}
    except Exception as e:
        logger.error(f"Retrieval node error: {e}")
        return {"documents": []}


async def grade_documents_node(state: GraphState, config: RunnableConfig) -> Dict[str, Any]:
    """Grade the relevance of retrieved documents in a batch to save LLM roundtrips."""
    logger.info("--- LANGGRAPH: GRADE DOCUMENTS ---")
    engine = config["configurable"]["engine"]
    question = state["question"]
    documents = state["documents"]
    
    on_token = config["configurable"].get("on_token", None)
    if on_token:
        await on_token({"type": "status", "status": "Grading relevance of documents..."})
    
    if not documents:
        logger.info("No documents retrieved. Triggering web search fallback.")
        return {"web_search": True, "documents": []}
        
    # Format all documents with indices for batch grading
    docs_formatted = ""
    for idx, doc in enumerate(documents):
        docs_formatted += f"Document [{idx}]:\n{doc['text']}\n\n"
        
    prompt = (
        f"You are a relevance grader. Grade the relevance of the following retrieved documents to the user's question.\n"
        f"User Question: {question}\n\n"
        f"Documents:\n{docs_formatted}"
        f"For each document, determine if it contains information relevant to answer the user's question.\n"
        f"Output your evaluation as a JSON list of indices of the relevant documents. For example, if Document 0 and Document 2 are relevant, output:\n"
        f"[0, 2]\n"
        f"If none of the documents are relevant, output:\n"
        f"[]\n\n"
        f"Output ONLY the raw JSON list of indices, with no explanation, no preamble, and no extra text."
    )
    
    try:
        response = await engine.llm.acomplete(prompt)
        res_text = str(response)
        logger.info(f"Batch Relevance Grader output: {res_text}")
        relevant_indices = parse_json_list(res_text)
        logger.info(f"Parsed relevant indices: {relevant_indices}")
        
        filtered_docs = []
        for idx in relevant_indices:
            if 0 <= idx < len(documents):
                filtered_docs.append(documents[idx])
                
        if not filtered_docs:
            logger.info("No documents are relevant. Setting web_search = True.")
            return {"web_search": True, "documents": []}
        else:
            logger.info(f"Kept {len(filtered_docs)} relevant documents. Web search not required.")
            return {"web_search": False, "documents": filtered_docs}
            
    except Exception as e:
        logger.error(f"Error in grade_documents_node: {e}")
        # On error, play it safe and proceed with all retrieved documents
        return {"web_search": False, "documents": documents}


def clean_search_query(query: str) -> str:
    """Lowercase and strip conversational filler words for better DDG search yields."""
    q = query.lower().strip()
    q = re.sub(r'[^\w\s]', '', q)
    fillers = [
        "whats the", "what is the", "what is", "tell me about",
        "show me", "can you find", "can you search", "search for",
        "give me", "do you know", "how is", "how is the",
        "what's the", "what's", "whats"
    ]
    for filler in fillers:
        if q.startswith(filler):
            q = q[len(filler):].strip()
            
    stop_words = {"please", "tell", "me", "about"}
    words = q.split()
    filtered_words = [w for w in words if w not in stop_words]
    
    if not filtered_words:
        return query
    return " ".join(filtered_words)


async def web_search_node(state: GraphState, config: RunnableConfig) -> Dict[str, Any]:
    """Orchestrate web search using DuckDuckGo as a fallback."""
    logger.info("--- LANGGRAPH: WEB SEARCH ---")
    question = state["question"]
    documents = state["documents"]
    
    on_token = config["configurable"].get("on_token", None)
    if on_token:
        await on_token({"type": "status", "status": "Local sources insufficient. Searching the web..."})
    
    try:
        cleaned_query = clean_search_query(question)
        logger.info(f"Cleaned query for search: '{cleaned_query}' (original: '{question}')")
        results = await asyncio.to_thread(_ddg_search_sync, cleaned_query)
        web_docs = []
        for r in results:
            web_docs.append({
                "text": f"[{r['title']}] {r['body']}",
                "score": 1.0,
                "metadata": {"url": r['href'], "title": r['title']},
                "type": "web"
            })
            
        logger.info(f"Web search completed with {len(web_docs)} results.")
        # Combine local documents and web results
        return {"documents": list(documents) + web_docs}
    except Exception as e:
        logger.error(f"web_search_node failed: {e}")
        return {}


async def generate_node(state: GraphState, config: RunnableConfig) -> Dict[str, Any]:
    """Generate final response text, streaming to UI if a callback is provided."""
    logger.info("--- LANGGRAPH: GENERATE ---")
    engine = config["configurable"]["engine"]
    on_token = config["configurable"].get("on_token", None)
    
    question = state["question"]
    documents = state["documents"]
    
    # Process and deduplicate sources to report back to UI
    sources = []
    seen_texts = set()
    for doc in documents:
        txt = doc["text"]
        if txt not in seen_texts:
            seen_texts.add(txt)
            sources.append({
                "text": txt[:300] + ("..." if len(txt) > 300 else ""),
                "score": round(doc.get("score", 1.0), 4),
                "metadata": doc.get("metadata", {}),
                "type": doc.get("type", "local")
            })
            
    # Construct synthesis prompt
    if documents:
        context_block = "\n\n---\n\n".join([doc["text"] for doc in documents])
        prompt = (
            f"You are an intelligent assistant. Use the following context to answer the user's question.\n"
            f"If the context is not relevant to the question, you may ignore it and answer based on your own knowledge.\n"
            f"Always be helpful and concise.\n\n"
            f"## Context:\n{context_block}\n\n"
            f"## Question:\n{question}"
        )
    else:
        prompt = (
            f"You are an intelligent assistant. Answer based on your own knowledge. Always be helpful and concise.\n\n"
            f"## Question:\n{question}"
        )
        
    strict_mode = state.get("strict_mode", False)
    retry_count = state.get("retry_count", 0)
    should_stream_now = not strict_mode or retry_count >= 2
    
    generation = ""
    try:
        if on_token and should_stream_now:
            # Stream tokens directly to UI
            await on_token({"type": "clear"})
            await on_token({"type": "sources", "sources": sources})
            stream_gen = await engine.llm.astream_complete(prompt)
            async for chunk in stream_gen:
                token = chunk.delta
                generation += token
                await on_token({"type": "token", "token": token})
        else:
            # Generate in background silently
            response = await engine.llm.acomplete(prompt)
            generation = str(response)
    except Exception as e:
        logger.error(f"Error during response generation: {e}")
        generation = f"An error occurred during response generation: {str(e)}"
        
    return {"generation": generation, "sources": sources}


async def grade_generation_node(state: GraphState, config: RunnableConfig) -> Dict[str, Any]:
    """Grades the generated response to verify it is grounded in the retrieved sources (Self-RAG)."""
    logger.info("--- LANGGRAPH: GRADE GENERATION (HALLUCINATION CHECK) ---")
    engine = config["configurable"]["engine"]
    strict_mode = state.get("strict_mode", False)
    
    on_token = config["configurable"].get("on_token", None)
    if on_token and strict_mode:
        await on_token({"type": "status", "status": "Verifying answer factuality..."})
    
    if not strict_mode:
        logger.info("Strict mode is disabled. Skipping hallucination check.")
        return {"is_grounded": True}
        
    generation = state["generation"]
    documents = state["documents"]
    
    if not documents or not generation:
        logger.info("No sources or generation content. Skipping check.")
        if on_token:
            await on_token({"type": "clear"})
            await on_token({"type": "sources", "sources": state.get("sources", [])})
            
            # Stream the generated answer smoothly to user
            words = generation.split(' ')
            for i, word in enumerate(words):
                space = ' ' if i > 0 else ''
                await on_token({"type": "token", "token": space + word})
                await asyncio.sleep(0.01)
        return {"is_grounded": True}
        
    context_block = "\n\n---\n\n".join([doc["text"] for doc in documents])
    
    prompt = (
        f"You are a factuality grader. Assess whether the assistant's answer is grounded in and fully supported by the retrieved documents.\n"
        f"Do not allow any facts or assumptions that cannot be verified directly from the documents.\n\n"
        f"## Retrieved Documents:\n{context_block}\n\n"
        f"## Assistant's Answer:\n{generation}\n\n"
        f"Is the assistant's answer fully supported by the retrieved documents? (yes or no)\n"
        f"Output ONLY 'yes' or 'no' with no other words."
    )
    
    try:
        response = await engine.llm.acomplete(prompt)
        res_text = str(response).strip().lower()
        logger.info(f"Hallucination Grader raw output: {res_text}")
        
        is_grounded = "yes" in res_text
        retry_count = state.get("retry_count", 0)
        
        # If validated grounded or hit max retries, stream to user now
        if is_grounded or retry_count >= 2:
            if on_token:
                await on_token({"type": "clear"})
                await on_token({"type": "sources", "sources": state["sources"]})
                
                # Stream the text smoothly to the user
                words = generation.split(' ')
                for i, word in enumerate(words):
                    space = ' ' if i > 0 else ''
                    await on_token({"type": "token", "token": space + word})
                    await asyncio.sleep(0.01) # 10ms yield
            return {"is_grounded": True}
        else:
            logger.warning("Hallucination detected in generated output!")
            return {"is_grounded": False}
    except Exception as e:
        logger.error(f"Error running hallucination grading: {e}")
        # Default fallback to stream whatever we generated if grading fails
        if on_token:
            await on_token({"type": "clear"})
            await on_token({"type": "sources", "sources": state["sources"]})
            await on_token({"type": "token", "token": generation})
        return {"is_grounded": True}


async def rewrite_query_node(state: GraphState, config: RunnableConfig) -> Dict[str, Any]:
    """Rewrites the query if hallucination is detected to pull better search results."""
    logger.info("--- LANGGRAPH: REWRITE QUERY ---")
    engine = config["configurable"]["engine"]
    on_token = config["configurable"].get("on_token", None)
    question = state["question"]
    
    # Notify UI that we are retrying
    if on_token:
        await on_token({"type": "status", "status": "Hallucination detected. Rewriting query and retrying..."})
        
    prompt = (
        f"You are an AI query rewriter. The previous search query failed to retrieve sufficient "
        f"or correct documents to answer the user's question, resulting in a hallucination.\n"
        f"Analyze the user's original query and rewrite it to improve search results.\n\n"
        f"Original query: {question}\n\n"
        f"Return ONLY the rewritten query text, with no explanation, no preamble, and no quotes."
    )
    
    try:
        response = await engine.llm.acomplete(prompt)
        rewritten = str(response).strip()
        logger.info(f"Rewritten query text: '{rewritten}'")
        return {
            "question": rewritten,
            "retry_count": state["retry_count"] + 1
        }
    except Exception as e:
        logger.error(f"Error rewriting search query: {e}")
        return {
            "retry_count": state["retry_count"] + 1
        }

# ============================================================
# Router Functions
# ============================================================

def decide_web_search(state: GraphState) -> str:
    """Decide whether to execute web search or generate directly."""
    if state["web_search"]:
        return "web_search"
    else:
        return "generate"

def decide_retry(state: GraphState) -> str:
    """Decide whether to rewrite query and retry retrieval or exit."""
    if not state.get("is_grounded", True) and state["retry_count"] < 2:
        return "rewrite_query"
    else:
        return END

# ============================================================
# Compile the Graph
# ============================================================
workflow = StateGraph(GraphState)

# Add nodes
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("grade_documents", grade_documents_node)
workflow.add_node("web_search", web_search_node)
workflow.add_node("generate", generate_node)
workflow.add_node("grade_generation", grade_generation_node)
workflow.add_node("rewrite_query", rewrite_query_node)

# Set entry point
workflow.set_entry_point("retrieve")

# Define edges
workflow.add_edge("retrieve", "grade_documents")

workflow.add_conditional_edges(
    "grade_documents",
    decide_web_search,
    {
        "web_search": "web_search",
        "generate": "generate"
    }
)

workflow.add_edge("web_search", "generate")
workflow.add_edge("generate", "grade_generation")

workflow.add_conditional_edges(
    "grade_generation",
    decide_retry,
    {
        "rewrite_query": "rewrite_query",
        END: END
    }
)

workflow.add_edge("rewrite_query", "retrieve")

# Compile the StateGraph
agent_graph = workflow.compile()
