# AutoFormFiller AI - Browser Extension

An intelligent browser extension that automatically fills application forms using **RAG (Retrieval Augmented Generation)** and **LLM** technology. It searches your personal knowledge base (PDFs, documents) and provides accurate suggestions for form fields.

## 🎯 Features

- **Smart Form Filling**: AI-powered suggestions for form fields based on your knowledge base
- **Local LLM**: Uses Llama 3.1:7B running locally via Ollama (auto-downloads if not present)
- **Local Embeddings**: sentence-transformers for vector embeddings (no API calls!)
- **RAG Implementation**: Python backend with cached vector database for fast retrieval
- **Knowledge Base Management**: Upload, view, and delete PDF, TXT, and DOCX files
- **Manual Query Mode**: Test your knowledge base with custom queries
- **Field Rejection**: Reject suggestions for specific fields - won't suggest again
- **Automated Setup**: One-click setup script handles everything
- **Privacy First**: All processing happens locally, returns "Not in DB" if info not found

## 📋 Prerequisites

- **Python** (3.9 or higher)
- **Chrome** or **Edge** browser
- **Ollama** (auto-installed by setup script if not present)
- **Optional**: Anaconda/Miniconda for isolated environment

## 🚀 Installation

### 1. Clone/Download the Project

```bash
cd "c:\Users\ASUS\Documents\vscode\Web Dev\AutoFormFiller"
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your Gemini API key:

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
LLAMA_API_URL=http://localhost:11434
LLAMA_MODEL_NAME=llama3.1:7b
```

### 4. Start Backend Server

**Easy Way (Double-click):**
```
Double-click START_SERVER.bat
```

**Or via Terminal:**
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

The backend will run on `http://localhost:3000`

⚠️ **Important:** Keep the server running while using the extension!

### 5. Load Extension in Browser

**Chrome/Edge:**
1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `AutoFormFiller` folder
5. The extension icon should appear in your toolbar

## 📁 Project Structure

```
AutoFormFiller/
├── backend/
│   ├── server.js              # Express server
│   ├── services/
│   │   ├── ragService.js      # RAG implementation with vector DB
│   │   └── llmService.js      # LLM service (Llama + Gemini)
├── Knowledge_Base/            # Upload your PDFs/documents here
├── vector_db/                 # Cached vector database
├── manifest.json              # Extension manifest
├── config.js                  # Configuration settings
├── popup.html                 # Extension popup UI
├── popup.js                   # Popup logic
├── styles.css                 # Popup styles
├── content.js                 # Content script (form detection)
├── background.js              # Background service worker
├── package.json               # Dependencies
├── .env                       # Environment variables (create this)
└── README.md                  # This file
```

## 🔧 Usage

### 1. Upload Documents

1. Click the extension icon in your browser toolbar
2. Go to **Files** tab
3. Click **Upload Files** and select your PDFs/documents
4. Click **Update Vector Database** (required after uploading)

### 2. Enable Auto-Fill

1. Toggle **Auto Fill** switch in the extension popup
2. Visit any webpage with forms
3. Click on a form field
4. AI suggestions will appear based on your knowledge base

### 3. Manual Query (Testing)

1. Go to **Query** tab in the extension popup
2. Enter a test question (e.g., "What is my email?")
3. Optionally add field context
4. Click **Get Answer**

### 4. Settings

- Configure backend URL (default: `http://localhost:3000`)
- Toggle notifications
- Prefer local Llama (when available)

## 🧠 How It Works

### RAG Pipeline

1. **Document Processing**: Extracts text from PDFs, DOCX, TXT files
2. **Chunking**: Splits text into manageable chunks (1000 chars, 200 overlap)
3. **Embedding**: Generates vector embeddings using Gemini embedding model
4. **Storage**: Caches embeddings in `vector_db/cache.json`
5. **Retrieval**: Finds relevant chunks using cosine similarity
6. **Generation**: LLM generates precise answer from retrieved context

### LLM Strategy

```
Query → Check Local Llama → Available? 
                             ├─ Yes → Use Llama 3.1:7B
                             └─ No  → Use Gemini API
```

### Form Field Detection

1. Content script monitors form field focus events
2. Extracts field context (label, placeholder, name, aria-label)
3. Builds intelligent query based on field type
4. Retrieves answer from backend
5. Shows suggestion popup with apply/copy options

## 🔌 Optional: Local Llama Setup

To use local Llama 3.1:7B (faster, more private, no API costs):

### Install Ollama

Download from: https://ollama.ai

### Pull Llama Model

```bash
ollama pull llama3.1:7b
```

### Verify It's Running

```bash
ollama list
```

The extension will automatically detect and prefer the local model.

## 🛠️ API Endpoints

### Backend Server (`http://localhost:3000`)

- `GET /health` - Health check
- `GET /api/check-llama` - Check if local Llama is available
- `POST /api/query` - Query with RAG
  ```json
  {
    "query": "What is my email?",
    "fieldContext": "Email field"
  }
  ```
- `POST /api/update-vectordb` - Update vector database
- `POST /api/upload` - Upload file (multipart/form-data)
- `GET /api/list-files` - List knowledge base files
- `DELETE /api/delete/:filename` - Delete file

## ⚙️ Configuration

Edit `config.js` to customize:

- LLM settings (temperature, max tokens)
- Vector DB parameters (chunk size, overlap, top-K)
- Supported file formats
- Cache expiry time

## 🔒 Security & Privacy

- All data stays local (except Gemini API calls for embeddings/generation)
- No telemetry or tracking
- Knowledge base files stored locally
- Returns "Not in DB" if information not found (no hallucinations)

## 🐛 Troubleshooting

### Backend Won't Start

```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000

# Use different port
$env:PORT=3001; npm start
```

### Extension Not Working

1. Check backend is running (`http://localhost:3000/health`)
2. Open browser console (F12) and check for errors
3. Verify extension is enabled in `chrome://extensions/`
4. Reload extension after making changes

### "Not in DB" Responses

1. Ensure you've uploaded documents to Knowledge_Base
2. Click **Update Vector Database** in extension
3. Check backend logs for errors
4. Verify Gemini API key is valid in `.env`

### Local Llama Not Detected

1. Ensure Ollama is running: `ollama list`
2. Check model name matches in `.env`: `llama3.1:7b`
3. Verify URL in `.env`: `http://localhost:11434`

## 📦 Dependencies

### Backend
- `express` - Web server
- `@google/generative-ai` - Gemini API
- `pdf-parse` - PDF text extraction
- `mammoth` - DOCX parsing
- `multer` - File uploads
- `axios` - HTTP client
- `dotenv` - Environment variables

### Extension
- Chrome Extension Manifest V3
- Vanilla JavaScript (no frameworks)

## 🚧 Known Limitations

- Only supports text-based PDFs (not scanned images)
- Vector DB regeneration required after adding/removing files
- Gemini API has rate limits (100 requests/minute on free tier)
- Local Llama requires ~8GB RAM for 7B model

## 📝 Future Enhancements

- [ ] OCR support for scanned PDFs
- [ ] Support for more file formats (CSV, JSON, etc.)
- [ ] Incremental vector DB updates (add/remove single files)
- [ ] Support for other local LLMs (LM Studio, GPT4All)
- [ ] Form field mapping and auto-complete
- [ ] Export/import knowledge base

## 📄 License

MIT License - Feel free to modify and distribute

## 🤝 Contributing

Contributions welcome! Please open issues or submit PRs.

## 📧 Support

For issues or questions, please check the troubleshooting section or open a GitHub issue.

---
