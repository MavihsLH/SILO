@echo off
setlocal
title SILO - Agentic RAG Assistant
cd /d "%~dp0"

echo ==================================================
echo   Starting SILO (Agentic RAG Assistant)
echo ==================================================
echo.

:: 1. Ensure Qdrant Docker container is running
echo [1/3] Checking Qdrant vector database...
docker start Qdrant-db >nul 2>&1
if %errorlevel% equ 0 (
    echo       Qdrant container is running.
) else (
    echo       [Note] Could not start Docker container "Qdrant-db".
    echo              Make sure Docker Desktop is running if you use Qdrant via Docker.
)

:: 2. Open browser automatically once the FastAPI server finishes loading
echo [2/3] Launching browser watcher (will open http://localhost:8001/ when ready)...
start "" /b powershell -NoProfile -WindowStyle Hidden -Command ^
  "for ($i = 0; $i -lt 60; $i++) { try { $r = Invoke-WebRequest -Uri 'http://localhost:8001/api/collections' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { Start-Process 'http://localhost:8001/'; break } } catch {}; Start-Sleep -Seconds 2 }"

:: 3. Start FastAPI backend + production frontend
echo [3/3] Starting SILO server on http://localhost:8001/ ...
echo       (Close this window or press Ctrl+C to stop SILO)
echo.
"C:\ProgramData\miniconda3\envs\agentic_rag\python.exe" -m uvicorn app:app --host 0.0.0.0 --port 8001

echo.
echo SILO server stopped.
pause
