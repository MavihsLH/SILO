"""
FastAPI Backend
================
REST API for the Agentic RAG Agent frontend.
Serves the static frontend and provides endpoints for
collections management, file upload, and chat.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import os
import requests

from rag_engine import RAGEngine

# ============================================================
# Initialize
# ============================================================
app = FastAPI(title="Agentic RAG Agent", version="1.0.0")

# Initialize RAG engine (loads models on startup)
print("🔧 Initializing RAG Engine...")
engine = RAGEngine()
print("✅ RAG Engine ready!")

# ============================================================
# Pydantic models for request/response
# ============================================================

class CreateCollectionRequest(BaseModel):
    name: str
    description: str = ""
    color: str = "#6366f1"

class UpdateCollectionRequest(BaseModel):
    color: Optional[str] = None
    description: Optional[str] = None

class ChatRequest(BaseModel):
    collection: str
    message: str
    online_mode: bool = False

class ChatResponse(BaseModel):
    answer: str
    sources: list

class CreateChatRequest(BaseModel):
    collection: str
    title: Optional[str] = None

class RenameChatRequest(BaseModel):
    title: str

class SendMessageRequest(BaseModel):
    message: str
    online_mode: bool = False

class SettingsRequest(BaseModel):
    chat_model: str
    ingestion_model: str

class IngestRequest(BaseModel):
    smart_mode: bool = False

# ============================================================
# API Routes — Settings & Models
# ============================================================

@app.get("/api/models")
def get_models():
    """Fetch available local Ollama models."""
    try:
        ollama_base = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        response = requests.get(f"{ollama_base}/api/tags", timeout=5)
        if response.status_code == 200:
            return response.json().get("models", [])
        return []
    except Exception:
        return []

@app.get("/api/settings")
def get_settings():
    """Get current AI model settings."""
    return engine.get_settings()

@app.post("/api/settings")
def update_settings(req: SettingsRequest):
    """Update AI model settings."""
    return engine.update_settings(
        chat_model=req.chat_model,
        ingestion_model=req.ingestion_model
    )

# ============================================================
# API Routes — Collections
# ============================================================

@app.get("/api/collections")
async def list_collections():
    """List all collections."""
    try:
        return await engine.list_collections()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/collections")
async def create_collection(req: CreateCollectionRequest):
    """Create a new collection."""
    try:
        meta = await engine.create_collection(
            name=req.name,
            description=req.description,
            color=req.color,
        )
        return meta
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/collections/{safe_name}")
async def get_collection(safe_name: str):
    """Get collection details including files."""
    try:
        result = await engine.get_collection(safe_name)
        if result is None:
            raise HTTPException(status_code=404, detail="Collection not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/collections/{safe_name}")
async def update_collection(safe_name: str, req: UpdateCollectionRequest):
    """Update collection metadata (color, description)."""
    try:
        result = await engine.update_collection(
            safe_name, color=req.color, description=req.description
        )
        if result is None:
            raise HTTPException(status_code=404, detail="Collection not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/collections/{safe_name}")
async def delete_collection(safe_name: str):
    """Delete a collection and all its data."""
    try:
        success = await engine.delete_collection(safe_name)
        if not success:
            raise HTTPException(status_code=404, detail="Collection not found")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# API Routes — File Upload & Ingestion
# ============================================================

@app.post("/api/collections/{safe_name}/upload")
async def upload_file(safe_name: str, file: UploadFile = File(...)):
    """Upload a file to a collection."""
    # Validate collection exists
    if engine.get_collection(safe_name) is None:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Validate file type
    allowed_extensions = {".pdf", ".txt", ".md", ".csv"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not supported. Allowed: {', '.join(allowed_extensions)}",
        )

    # Save file
    content = await file.read()
    file_path = engine.save_uploaded_file(safe_name, file.filename, content)

    return {
        "filename": file.filename,
        "size": len(content),
        "path": str(file_path),
        "status": "uploaded",
    }


# Tracking ingestion status globally (simple memory store)
ingestion_status = {}

@app.post("/api/collections/{safe_name}/ingest")
async def ingest_collection(safe_name: str, background_tasks: BackgroundTasks, req: Optional[IngestRequest] = None):
    """Start indexing files into Qdrant in the background."""
    if await engine.get_collection(safe_name) is None:
        raise HTTPException(status_code=404, detail="Collection not found")

    smart_mode = req.smart_mode if req else False
    
    # Mark as indexing with enriched status
    ingestion_status[safe_name] = {
        "status": "indexing",
        "stage": "loading",
        "progress": 0,
        "message": "Starting indexing...",
        "documents_indexed": 0,
        "smart_mode": smart_mode,
    }
    
    def on_progress(stage: str, progress: int, message: str):
        ingestion_status[safe_name].update({
            "stage": stage,
            "progress": progress,
            "message": message,
        })
        # If the engine reports "ready" or "error", update top-level status too
        if stage in ("ready", "error"):
            ingestion_status[safe_name]["status"] = stage

    async def background_ingest():
        try:
            count = await engine.ingest_collection(safe_name, smart_mode=smart_mode, progress_callback=on_progress)
            ingestion_status[safe_name].update({
                "status": "ready",
                "stage": "ready",
                "progress": 100,
                "message": f"Successfully indexed {count} document(s)!",
                "documents_indexed": count,
            })
        except Exception as e:
            ingestion_status[safe_name].update({
                "status": "error",
                "stage": "error",
                "progress": 0,
                "message": str(e),
            })

    background_tasks.add_task(background_ingest)
    
    return {"status": "indexing_started", "smart_mode": smart_mode}

@app.get("/api/collections/{safe_name}/status")
async def get_ingest_status(safe_name: str):
    """Get the indexing status of a collection."""
    if safe_name in ingestion_status:
        return ingestion_status[safe_name]
    # If not in tracking dictionary, assume ready if it exists
    collection = await engine.get_collection(safe_name)
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"status": "ready" if collection.get("indexed") else "unindexed"}


# ============================================================
# API Routes — Chat
# ============================================================

@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    Send a message to the AI about a specific collection.
    Returns the answer and source documents used.
    """
    try:
        result = await engine.aquery(safe_name=req.collection, question=req.message, online_mode=req.online_mode)
        return ChatResponse(answer=result["answer"], sources=result["sources"])
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to generate response. Check backend logs.")


# ============================================================
# API Routes — Multi-Chat Sessions
# ============================================================

@app.get("/api/chats")
def list_chats():
    """List all chat sessions."""
    try:
        return engine.list_chats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/chats/{chat_id}")
def get_chat(chat_id: str):
    """Get a specific chat session with its messages."""
    chat = engine.get_chat(chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return chat


@app.post("/api/chats")
def create_chat(req: CreateChatRequest):
    """Create a new chat session."""
    try:
        if req.collection not in engine._collections_meta:
            raise HTTPException(status_code=404, detail="Collection not found")
        return engine.create_chat(collection=req.collection, title=req.title)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/chats/{chat_id}")
def rename_chat(chat_id: str, req: RenameChatRequest):
    """Rename a chat session."""
    chat = engine.update_chat(chat_id, title=req.title)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return chat


@app.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: str):
    """Delete a chat session."""
    success = engine.delete_chat(chat_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return {"status": "deleted"}


@app.post("/api/chats/{chat_id}/message")
async def send_chat_message(chat_id: str, req: SendMessageRequest):
    """Send a message to a specific chat session and run RAG query."""
    chat = engine.get_chat(chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    collection = chat["collection"]
    
    try:
        result = await engine.aquery(safe_name=collection, question=req.message, online_mode=req.online_mode)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate response: {str(e)}")
        
    engine.add_chat_message(chat_id, "user", req.message)
    updated_chat = engine.add_chat_message(chat_id, "assistant", result["answer"], sources=result["sources"])
    
    return {
        "answer": result["answer"],
        "sources": result["sources"],
        "chat_title": updated_chat["title"] if updated_chat else chat["title"]
    }


# ============================================================
# Serve Frontend (static files)
# ============================================================

# Mount static files directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
async def root():
    return FileResponse("static/html/index.html")
