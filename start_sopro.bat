@echo off
title Sopro V2 Turbo CPU Server
echo ===================================================
echo   Starting Sopro V2 Turbo CPU Local Voice Server
echo ===================================================
echo.
python -m uvicorn server.app:app --host 127.0.0.1 --port 8000 --reload
pause
