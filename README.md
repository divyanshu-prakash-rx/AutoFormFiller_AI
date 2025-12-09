# AutoFormFiller AI

A Chrome extension that fills out forms using your own documents using RAG and Local LLM. Upload your resume, cover letters, or any PDFs, and the extension suggests answers based on what's in your files.

## Features

- Automatic form field suggestions from your documents
- Local LLM (Llama 3.1:8b via Ollama) - no API costs
- Upload PDFs, TXT, or DOCX files as knowledge base
- Privacy-focused: everything runs locally
- Real-time suggestion updates as you type

## Setup

**Requirements:**
- Python 3.9+
- Chrome or Edge
- Conda (recommended for Python environment)

**Quick Start:**

<div align="center">
  <img src="https://github.com/user-attachments/assets/d6d45c8c-41a0-4619-a202-2a58ed8bb9f2" alt="Image 1" width="467" style="border: 2px solid #ddd; border-radius: 8px;"/>
</div>

1. Run the setup script (installs Ollama and Python dependencies):
   ```powershell
   .\setup.ps1
   ```

2. Start the backend server:
   ```powershell
   # Double-click START_PYTHON_SERVER.bat
   # Or run manually:
   cd backend_python
   conda activate mltorch311
   python server.py
   ```

<div align="center">
  <img src="https://github.com/user-attachments/assets/95fd0fbf-6ce8-46f0-ae1a-03ac8bdf61a7" alt="Image 2" width="1142" style="border: 2px solid #ddd; border-radius: 8px;"/>
</div>


3. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable Developer mode
   - Click "Load unpacked" and select this folder
     
<div align="center">
  <img src="https://github.com/user-attachments/assets/46183d5f-5005-4732-a087-c5a08a91e936" alt="Image 3" width="458" style="border: 2px solid #fff; border-radius: 8px;"/>
</div>

That's it. The server runs on `localhost:3000` and needs to stay open while using the extension.

## Usage

1. **Upload your documents**: Click the extension icon → Files tab → Upload PDFs/DOCX/TXT files
2. **Update Vector DB**: Click "Update Vector Database" (do this after uploading files)
3. **Enable Auto-Fill**: Toggle the switch in the extension popup
4. **Fill forms**: Click on any form field, suggestions appear automatically

**Tips:**
- Type partial text in fields to filter suggestions (e.g., type "medi" to get emails containing "medi")
- Accept suggestions by clicking ✓ Apply - these get saved for future use
- Reject suggestions you don't want with ✕ Reject
- Test queries in the Query tab before using on forms

## How It Works

The extension extracts text from your documents, converts them to vector embeddings using sentence-transformers, and stores them locally. When you click a form field, it searches the embeddings for relevant content and uses Llama to generate a concise answer.

Everything runs on your machine - no data leaves your computer.

## Troubleshooting

**Backend not starting?**
- Check if port 3000 is already in use: `netstat -ano | findstr :3000`
- Make sure conda environment is activated: `conda activate mltorch311`

**No suggestions appearing?**
- Verify backend is running: open `http://localhost:3000/health`
- Check that Auto-Fill toggle is ON in the extension popup
- Make sure you've uploaded documents and updated the vector database

**"Not in DB" responses?**
- Upload relevant documents in the Files tab
- Click "Update Vector Database" after uploading
- The extension only suggests info from your uploaded files

## Tech Stack

- Backend: Python/Flask + sentence-transformers + Ollama
- Extension: Vanilla JS (Manifest V3)
- Embeddings: all-MiniLM-L6-v2 (local)
- LLM: Llama 3.1:8b (local)

## License

MIT
