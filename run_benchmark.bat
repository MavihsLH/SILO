@echo off
setlocal
title SILO - Agentic RAG Benchmark Suite
cd /d "%~dp0"

set "PY=C:\ProgramData\miniconda3\envs\agentic_rag\python.exe"

echo ==============================================================
echo   SILO Agentic RAG - Headless Benchmark Suite (Gemini Web)
echo ==============================================================
echo.
echo   TIP: Close Antigravity IDE and Chrome before Option [1]
echo        to free ~2 GB RAM for Ollama!
echo.
echo   [1] Run FULL Local Benchmark (50 Qs) ^& Export for Gemini Web
echo   [2] Run QUICK Smoke Test (6 Qs, ~2-3 min) ^& Export for Gemini Web
echo   [3] Run Retrieval Ablation ONLY (40 Qs, zero LLM, ~30 sec)
echo   [4] Export Existing Results for Gemini Web Chat
echo   [5] Compile Gemini's JSON Scores into BENCHMARK_REPORT.md
echo   [6] Exit
echo.
set /p choice="Select an option [1-6]: "

if "%choice%"=="1" goto full_run
if "%choice%"=="2" goto quick_run
if "%choice%"=="3" goto retrieval_only
if "%choice%"=="4" goto export_only
if "%choice%"=="5" goto compile_report
goto end

:ensure_qdrant
echo.
echo Checking Qdrant Docker container...
docker start Qdrant-db >nul 2>&1
exit /b 0

:full_run
call :ensure_qdrant
echo.
echo Starting FULL 50-question benchmark (auto-resumes if interrupted)...
"%PY%" benchmarks\run_benchmark.py
if %errorlevel% equ 0 (
    "%PY%" benchmarks\prepare_and_compile.py --export
)
goto done

:quick_run
call :ensure_qdrant
echo.
echo Starting QUICK 6-question smoke test...
"%PY%" benchmarks\run_benchmark.py --quick --fresh
if %errorlevel% equ 0 (
    "%PY%" benchmarks\prepare_and_compile.py --export
)
goto done

:retrieval_only
call :ensure_qdrant
echo.
echo Starting Retrieval Ablation ONLY (no LLM required)...
"%PY%" benchmarks\run_benchmark.py --skip-e2e
goto done

:export_only
echo.
"%PY%" benchmarks\prepare_and_compile.py --export
goto done

:compile_report
echo.
set /p jname="Judge label for report (press Enter for 'Gemini Web Judge'): "
if "%jname%"=="" (
    "%PY%" benchmarks\prepare_and_compile.py --compile --judge-name "Gemini Web Judge"
) else (
    "%PY%" benchmarks\prepare_and_compile.py --compile --judge-name "%jname%"
)
goto done

:done
echo.
echo ==============================================================
echo   All done!
echo ==============================================================
pause

:end
endlocal
