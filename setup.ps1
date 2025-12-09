# AutoFormFiller - Automated Setup Script
# This script will set up everything needed to run the extension on any PC

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AutoFormFiller - Automated Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Change to script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Step 1: Check Python installation
Write-Host "[1/6] Checking Python installation..." -ForegroundColor Yellow
$pythonPath = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonPath) {
    Write-Host "❌ Python not found!" -ForegroundColor Red
    Write-Host "   Please install Python 3.9+ from: https://www.python.org/downloads/" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Found: $pythonVersion" -ForegroundColor Green

# Step 2: Check/Install Conda (optional but recommended)
Write-Host "`n[2/6] Checking Conda installation..." -ForegroundColor Yellow
$condaPath = Get-Command conda -ErrorAction SilentlyContinue
if ($condaPath) {
    Write-Host "✓ Conda found" -ForegroundColor Green
    $useCondaEnv = Read-Host "Create new conda environment? (y/n)"
    
    if ($useCondaEnv -eq 'y') {
        $envName = "autoformfiller"
        Write-Host "Creating conda environment '$envName'..." -ForegroundColor Cyan
        conda create -n $envName python=3.11 -y
        conda activate $envName
        Write-Host "✓ Conda environment created" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  Conda not found, using system Python" -ForegroundColor Yellow
}

# Step 3: Install Python dependencies
Write-Host "`n[3/6] Installing Python dependencies..." -ForegroundColor Yellow
Set-Location "backend_python"

if (Test-Path "requirements.txt") {
    python -m pip install --upgrade pip
    pip install -r requirements.txt
    Write-Host "✓ Python dependencies installed" -ForegroundColor Green
} else {
    Write-Host "❌ requirements.txt not found!" -ForegroundColor Red
    exit 1
}

# Step 4: Check/Install Ollama
Write-Host "`n[4/6] Checking Ollama installation..." -ForegroundColor Yellow
$ollamaPath = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollamaPath) {
    Write-Host "⚠️  Ollama not found!" -ForegroundColor Yellow
    $installOllama = Read-Host "Download and install Ollama? (y/n)"
    
    if ($installOllama -eq 'y') {
        $ollamaInstaller = "$env:TEMP\OllamaSetup.exe"
        try {
            Write-Host "Downloading Ollama..." -ForegroundColor Cyan
            Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile $ollamaInstaller
            Start-Process -FilePath $ollamaInstaller -Wait
            Write-Host "✓ Ollama installed" -ForegroundColor Green
            Start-Sleep -Seconds 5
        } catch {
            Write-Host "⚠️  Auto-install failed. Please install manually from: https://ollama.ai" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "✓ Ollama found" -ForegroundColor Green
}

# Step 5: Download Llama model
Write-Host "`n[5/6] Checking Llama 3.1 model..." -ForegroundColor Yellow
try {
    $models = ollama list | Select-String "llama3.1"
    if ($models) {
        Write-Host "✓ llama3.1:7b found" -ForegroundColor Green
    } else {
        Write-Host "Downloading llama3.1:7b (~4.7GB)..." -ForegroundColor Cyan
        ollama pull llama3.1:7b
        Write-Host "✓ Model downloaded" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Server will download model on first run" -ForegroundColor Yellow
}

# Step 6: Create startup files
Write-Host "`n[6/6] Creating startup files..." -ForegroundColor Yellow
Set-Location ..

$batchContent = @"
@echo off
cd /d "%~dp0backend_python"
where conda >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    call conda activate autoformfiller 2>nul
)
python server.py
pause
"@

Set-Content -Path "START_SERVER.bat" -Value $batchContent
Write-Host "✓ Created START_SERVER.bat" -ForegroundColor Green

if (-not (Test-Path "backend_python\Knowledge_Base")) {
    New-Item -ItemType Directory -Path "backend_python\Knowledge_Base" | Out-Null
}

# Final instructions
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Setup Complete! 🎉" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Run START_SERVER.bat to start the backend" -ForegroundColor White
Write-Host "2. Load extension in Chrome (chrome://extensions/)" -ForegroundColor White
Write-Host "3. Upload PDFs through extension popup" -ForegroundColor White
Write-Host "4. Start auto-filling forms! 🚀" -ForegroundColor White
Write-Host ""
Write-Host "`n🎉 Happy form filling!" -ForegroundColor Green
