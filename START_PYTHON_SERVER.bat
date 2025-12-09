@echo off
echo ========================================
echo   AutoFormFiller Python Backend
echo ========================================
echo.
echo Activating mltorch311 environment...
echo Starting server on http://localhost:3000
echo Using sentence-transformers (same as your Implementation.ipynb)
echo.
echo Keep this window open while using the extension
echo Press Ctrl+C to stop the server
echo.
echo ========================================
echo.

cd /d "%~dp0"
call conda activate mltorch311
cd backend_python
python server.py

pause
