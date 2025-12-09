"""
AutoFormFiller - Python RAG Backend Server
"""


# ============================================================================
# IMPORTS
# ============================================================================

import os
import json
from pathlib import Path
from typing import List, Dict, Optional
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import PyPDF2
from docx import Document
import pickle
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# ============================================================================
# CONFIGURATION
# ============================================================================

# Server Configuration
SERVER_HOST = '0.0.0.0'
SERVER_PORT = 3000

# Paths
KNOWLEDGE_BASE_PATH = Path("Knowledge_Base") if 'Path' in dir() else None
VECTOR_DB_PATH = Path("vector_db") if 'Path' in dir() else None

# Model Configuration
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
OLLAMA_MODEL = "llama3.1:8b"
LLM_TEMPERATURE = 0.3
LLM_MAX_TOKENS = 100

# RAG Configuration
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
TOP_K = 3

# Path configuration (after imports)
KNOWLEDGE_BASE_PATH = Path("Knowledge_Base")
VECTOR_DB_PATH = Path("vector_db")



# ============================================================================
# DEPENDENCY CHECKS
# ============================================================================

try:
    import torch
    print("✓ PyTorch loaded")
except ImportError:
    print("Warning: PyTorch not found")

SENTENCE_TRANSFORMERS_AVAILABLE = False
try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
    print("✓ sentence-transformers loaded")
except Exception as e:
    print(f"Warning: sentence-transformers not available: {e}")

OLLAMA_AVAILABLE = False
try:
    import ollama
    OLLAMA_AVAILABLE = True
    print("✓ ollama loaded")
except ImportError:
    print("Warning: ollama not available")

# ============================================================================
# INITIALIZATION
# ============================================================================

app = Flask(__name__)
CORS(app)

encoder = None
documents = []
embeddings = None
vector_db_initialized = False


def load_embedding_model():
    """Load the sentence-transformers model"""
    global encoder
    if encoder is None:
        print(f"Loading embedding model: {EMBEDDING_MODEL}...")
        encoder = SentenceTransformer(EMBEDDING_MODEL)
        print("✓ Embedding model loaded")
    return encoder


def extract_text_from_pdf(file_path: Path) -> str:
    """Extract text from PDF file"""
    text = ""
    with open(file_path, 'rb') as file:
        pdf_reader = PyPDF2.PdfReader(file)
        for page in pdf_reader.pages:
            text += page.extract_text()
    return text


def extract_text_from_docx(file_path: Path) -> str:
    """Extract text from DOCX file"""
    doc = Document(file_path)
    return "\n".join([paragraph.text for paragraph in doc.paragraphs])


def extract_text_from_txt(file_path: Path) -> str:
    """Extract text from TXT file"""
    with open(file_path, 'r', encoding='utf-8') as file:
        return file.read()


def extract_text_from_file(file_path: Path) -> str:
    """Extract text based on file extension"""
    ext = file_path.suffix.lower()
    
    if ext == '.pdf':
        return extract_text_from_pdf(file_path)
    elif ext == '.docx':
        return extract_text_from_docx(file_path)
    elif ext == '.txt':
        return extract_text_from_txt(file_path)
    else:
        raise ValueError(f"Unsupported file format: {ext}")


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping chunks"""
    chunks = []
    start = 0
    
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end].strip()
        
        if chunk:
            chunks.append(chunk)
        
        start += chunk_size - overlap
    
    return chunks


def load_vector_db_cache():
    """Load cached vector database"""
    global documents, embeddings, vector_db_initialized
    
    cache_path = VECTOR_DB_PATH / "cache.pkl"
    
    if cache_path.exists():
        try:
            with open(cache_path, 'rb') as f:
                cache = pickle.load(f)
            
            documents = cache['documents']
            embeddings = cache['embeddings']
            vector_db_initialized = len(documents) > 0
            
            print(f"✓ Loaded cached vector DB with {len(documents)} documents")
            return True
        except Exception as e:
            print(f"Failed to load cache: {e}")
            return False
    
    return False


def save_vector_db_cache():
    """Save vector database to cache"""
    VECTOR_DB_PATH.mkdir(exist_ok=True)
    
    cache = {
        'documents': documents,
        'embeddings': embeddings,
        'timestamp': datetime.now().isoformat(),
        'model': EMBEDDING_MODEL
    }
    
    cache_path = VECTOR_DB_PATH / "cache.pkl"
    with open(cache_path, 'wb') as f:
        pickle.dump(cache, f)
    
    print("✓ Vector DB cache saved")


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.now().isoformat(),
        'vector_db_initialized': vector_db_initialized,
        'documents_count': len(documents)
    })


@app.route('/api/check-llama', methods=['GET'])
def check_llama():
    """Check if Ollama is available"""
    try:
        response = ollama.list()
        # ollama.list() returns ListResponse with .models attribute
        llama_available = any('llama3.1' in model.model for model in response.models)
        return jsonify({'available': llama_available})
    except Exception as e:
        return jsonify({'available': False, 'error': str(e)})


@app.route('/api/update-vectordb', methods=['POST'])
def update_vector_db():
    """Update the vector database from knowledge base files"""
    global documents, embeddings, vector_db_initialized
    
    try:
        print("Starting vector database update...")
        
        # Ensure knowledge base directory exists
        KNOWLEDGE_BASE_PATH.mkdir(exist_ok=True)
        
        # Get all files
        files = list(KNOWLEDGE_BASE_PATH.glob('*'))
        files = [f for f in files if f.is_file() and f.suffix.lower() in ['.pdf', '.txt', '.docx']]
        
        if not files:
            print("⚠ No files in knowledge base")
            documents = []
            embeddings = None
            vector_db_initialized = False
            save_vector_db_cache()
            return jsonify({
                'success': True,
                'message': 'No files to process',
                'documents_count': 0
            })
        
        print(f"Processing {len(files)} files...")
        
        # Load model
        model = load_embedding_model()
        
        # Process files
        documents = []
        all_texts = []
        
        for file_path in files:
            try:
                print(f"Processing: {file_path.name}")
                
                # Extract text
                text = extract_text_from_file(file_path)
                
                # Chunk text
                chunks = chunk_text(text)
                print(f"  Created {len(chunks)} chunks")
                
                # Store documents
                for i, chunk in enumerate(chunks):
                    documents.append({
                        'content': chunk,
                        'source': file_path.name,
                        'chunkIndex': i,
                        'totalChunks': len(chunks)
                    })
                    all_texts.append(chunk)
                
            except Exception as e:
                print(f"Error processing {file_path.name}: {e}")
        
        # Generate embeddings in batch (faster)
        print(f"Generating embeddings for {len(all_texts)} chunks...")
        embeddings = model.encode(all_texts, show_progress_bar=True, convert_to_numpy=True)
        
        # Normalize embeddings
        embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
        
        print(f"✓ Processed {len(documents)} document chunks")
        print(f"  Embedding shape: {embeddings.shape}")
        
        # Save cache
        save_vector_db_cache()
        
        vector_db_initialized = True
        
        return jsonify({
            'success': True,
            'message': 'Vector database updated successfully',
            'documents_count': len(documents),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        print(f"Error updating vector database: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/query', methods=['POST'])
def query():
    """Query the RAG system"""
    try:
        data = request.json
        query_text = data.get('query')
        field_context = data.get('fieldContext', '')
        partial_input = data.get('partialInput', '')  # User's partial typing as hint
        
        if not query_text:
            return jsonify({'error': 'Query is required'}), 400
        
        if not vector_db_initialized:
            return jsonify({
                'answer': 'Not in DB',
                'error': 'Vector database not initialized'
            })
        
        # QUICK CHECK: For personal info queries, use first few document chunks (resume header)
        query_lower = query_text.lower()
        field_lower = field_context.lower() if field_context else ''
        
        is_personal_info = any(keyword in query_lower + ' ' + field_lower for keyword in [
            'name', 'email', 'phone', 'mobile', 'contact', 'address'
        ])
        
        if is_personal_info and len(documents) > 0:
            # Use first 3 chunks (resume header contains personal info)
            context = "\n\n".join([doc['content'] for doc in documents[:3]])
            answer = generate_answer(query_text, context, field_context, partial_input)
            print(f"Quick personal info extraction: {answer}")
            return jsonify({
                'answer': answer,
                'source': 'header-extraction',
                'confidence': 1.0
            })
        
        # Load model for semantic search
        model = load_embedding_model()
        
        # Enhance query with field context
        enhanced_query = f"{field_context}: {query_text}" if field_context else query_text
        
        # Generate query embedding
        query_embedding = model.encode([enhanced_query], convert_to_numpy=True)[0]
        query_embedding = query_embedding / np.linalg.norm(query_embedding)
        
        # Calculate similarities
        similarities = np.dot(embeddings, query_embedding)
        
        # Get top K results
        top_indices = np.argsort(similarities)[::-1][:TOP_K]
        top_scores = similarities[top_indices]
        
        print(f"Query: '{query_text}' | Enhanced: '{enhanced_query}' | Top scores: {top_scores}")
        
        # Always use at least top 3 documents (don't filter by strict threshold)
        # This ensures we always have context for extraction
        if len(top_indices) == 0:
            print("⚠️  No documents in database")
            return jsonify({'answer': 'Not in DB'})
        
        # Use top K documents regardless of score
        relevant_indices = top_indices[:min(TOP_K, len(top_indices))]
        
        # Get relevant documents
        relevant_docs = [
            {
                'content': documents[idx]['content'],
                'source': documents[idx]['source'],
                'score': float(top_scores[i])
            }
            for i, idx in enumerate(relevant_indices)
        ]
        
        scores_str = [f"{d['score']:.3f}" for d in relevant_docs]
        sources_str = [d['source'] for d in relevant_docs]
        print(f"✓ Using top {len(relevant_docs)} documents (scores: {scores_str})")
        print(f"  Sources: {sources_str}")
        
        # Generate answer using LLM
        context = "\n\n".join([doc['content'] for doc in relevant_docs])
        
        # Debug: show first 300 chars of context
        print(f"  Context preview: {context[:300]}...")
        
        answer = generate_answer(query_text, context, field_context, partial_input)
        
        print(f"  → Answer: {answer}")
        
        return jsonify({
            'answer': answer,
            'source': 'llama-local' if check_llama_available() else 'simple-extraction',
            'confidence': float(top_scores[0])
        })
        
    except Exception as e:
        print(f"Query error: {e}")
        return jsonify({'error': str(e), 'answer': 'Not in DB'}), 500


def check_llama_available():
    """Check if Ollama with llama3.1 is available"""
    try:
        response = ollama.list()
        return any('llama3.1' in model.model for model in response.models)
    except:
        return False


def generate_answer(query: str, context: str, field_context: str = '', partial_input: str = '') -> str:
    """Generate answer from context using Llama or simple extraction"""
    
    # Try Ollama first
    if check_llama_available():
        try:
            # Build hint section if user typed something
            hint_text = ''
            if partial_input:
                hint_text = f"\nUser's Partial Input (as hint): {partial_input}\nNote: The user typed '{partial_input}' - use this to correct or complete the answer if relevant (e.g., if they typed 'medi' and email contains 'medi', prioritize that email)."
            
            # Detect if multiple values are requested
            is_multiple = any(word in field_context.lower() for word in ['examples', 'links', 'websites', 'multiple', 'list'])
            multiple_hint = '\n- If the field asks for multiple items (e.g., "Examples:", "Links:"), provide ALL relevant items separated by commas' if is_multiple else ''
            
            prompt = f"""You are a form-filling assistant. Based on the provided context, answer the question concisely.

Context:
{context}

Field Context: {field_context or 'General field'}
Question: {query}{hint_text}

Instructions:
- Provide ONLY the answer for the form field
- Keep it brief (1-3 words for short fields, 1-2 sentences for text areas){multiple_hint}
- If the user provided partial input, use it as a hint to correct or complete the answer
- If information is not in context, respond with exactly "Not in DB"
- No explanations or extra text

Answer:"""
            
            response = ollama.generate(
                model=OLLAMA_MODEL,
                prompt=prompt,
                options={'temperature': LLM_TEMPERATURE, 'num_predict': LLM_MAX_TOKENS}
            )
            
            answer = response['response'].strip()
            return answer
            
        except Exception as e:
            print(f"Llama generation failed: {e}")
    
    # Fallback: Intelligent extraction based on query type
    query_lower = query.lower()
    import re
    
    # Check what type of information is requested
    if any(word in query_lower for word in ['name', 'called', 'who', 'your name', 'my name']):
        # Extract name - look at first line only (resume header)
        # Split by any newline character and get truly first line
        lines = [line.strip() for line in re.split(r'[\n\r]+', context) if line.strip()]
        first_line = lines[0] if lines else ""
        
        # Match full names with 2-3 parts (First Last or First Middle Last)
        name_match = re.match(r'^([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*$', first_line)
        if name_match:
            name = name_match.group(1).strip()
            print(f"  → Extracted name from first line: '{name}'")
            return name
        
        # Fallback: try to find name pattern anywhere in first 300 chars
        first_part = context[:300]
        name_patterns = [
            r'(?:Name|NAME|name)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)',  # "Name: John Doe"
            r'\n([A-Z][a-z]+\s+[A-Z][a-z]+)\n',  # Name on its own line
        ]
        
        for pattern in name_patterns:
            match = re.search(pattern, first_part)
            if match:
                name = match.group(1).strip()
                if len(name.split()) >= 2:
                    print(f"  → Extracted name: {name}")
                    return name
    
    elif any(word in query_lower for word in ['email', 'mail']):
        import re
        # Find all emails
        email_matches = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', context)
        if email_matches:
            # If user typed partial input, filter by it
            if partial_input:
                matching = [e for e in email_matches if partial_input.lower() in e.lower()]
                if matching:
                    return matching[0]
            return email_matches[0]
    
    elif any(word in query_lower for word in ['phone', 'mobile', 'contact', 'number']):
        import re
        phone_match = re.search(r'[+]?\d[\d\s()-]{8,}', context)
        if phone_match:
            return phone_match.group(0).strip()
    
    elif any(word in query_lower + ' ' + field_context.lower() for word in ['website', 'link', 'github', 'linkedin', 'portfolio', 'url']):
        import re
        # Extract URLs from context
        url_pattern = r'https?://[^\s,)]+'
        urls = re.findall(url_pattern, context)
        
        # If field asks for examples/multiple, return common links (GitHub, LinkedIn, Portfolio)
        if any(keyword in field_context.lower() for keyword in ['example', 'examples', 'links', 'websites']):
            # Filter for main professional links
            main_links = []
            for url in urls:
                if any(site in url.lower() for site in ['github.com', 'linkedin.com', 'portfolio', 'render.com', 'vercel.app']):
                    main_links.append(url)
            
            if main_links:
                # Return up to 3 links, comma-separated
                return ', '.join(main_links[:3])
        
        # If asking for specific link type
        if 'github' in query_lower or 'github' in field_context.lower():
            github = [u for u in urls if 'github.com' in u.lower()]
            if github:
                return github[0]
        
        if 'linkedin' in query_lower or 'linkedin' in field_context.lower():
            linkedin = [u for u in urls if 'linkedin.com' in u.lower()]
            if linkedin:
                return linkedin[0]
        
        if 'portfolio' in query_lower or 'portfolio' in field_context.lower():
            portfolio = [u for u in urls if 'github.com' not in u.lower() and 'linkedin.com' not in u.lower()]
            if portfolio:
                return portfolio[0]
        
        # Default: return first URL found
        if urls:
            return urls[0]
    
    # General extraction: find relevant sentences
    sentences = context.split('.')
    relevant = [s.strip() for s in sentences if any(word in s.lower() for word in query_lower.split())]
    
    if relevant:
        return relevant[0][:200]
    
    return "Not in DB"


@app.route('/api/debug-docs', methods=['GET'])
def debug_docs():
    """Debug endpoint to inspect document chunks"""
    try:
        return jsonify({
            'total_chunks': len(documents),
            'first_5_chunks': [
                {
                    'source': doc['source'],
                    'chunkIndex': doc['chunkIndex'],
                    'content_preview': doc['content'][:200] + '...' if len(doc['content']) > 200 else doc['content']
                }
                for doc in documents[:5]
            ]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/list-files', methods=['GET'])
def list_files():
    """List files in knowledge base"""
    try:
        KNOWLEDGE_BASE_PATH.mkdir(exist_ok=True)
        
        files = []
        for file_path in KNOWLEDGE_BASE_PATH.glob('*'):
            if file_path.is_file():
                stat = file_path.stat()
                files.append({
                    'name': file_path.name,
                    'size': stat.st_size,
                    'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    'type': file_path.suffix
                })
        
        return jsonify({'files': files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/delete/<filename>', methods=['DELETE'])
def delete_file(filename):
    """Delete a file from knowledge base"""
    try:
        file_path = KNOWLEDGE_BASE_PATH / filename
        
        # Security check
        if not file_path.is_relative_to(KNOWLEDGE_BASE_PATH):
            return jsonify({'error': 'Invalid file path'}), 403
        
        if file_path.exists():
            file_path.unlink()
            return jsonify({
                'success': True,
                'message': 'File deleted successfully'
            })
        else:
            return jsonify({'error': 'File not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/save-accepted', methods=['POST'])
def save_accepted_answer():
    """Save accepted answer to a file for future reference"""
    try:
        data = request.json
        field_context = data.get('fieldContext', 'Unknown Field')
        answer = data.get('answer', '')
        partial_input = data.get('partialInput', '')
        timestamp = data.get('timestamp', datetime.now().isoformat())
        
        if not answer:
            return jsonify({'success': False, 'error': 'No answer provided'}), 400
        
        # Create accepted answers file in Knowledge_Base
        accepted_file = KNOWLEDGE_BASE_PATH / "AcceptedAnswers.txt"
        
        # Check if this exact field+value combination already exists
        if accepted_file.exists():
            with open(accepted_file, 'r', encoding='utf-8') as f:
                content = f.read()
                entries = content.split('='*60)
                for entry in entries:
                    if f"Field: {field_context}" in entry and f"Answer: {answer}" in entry:
                        print(f"Skipping duplicate: {field_context} = {answer}")
                        return jsonify({'success': True, 'message': 'Already saved'})
        
        # Append to file
        with open(accepted_file, 'a', encoding='utf-8') as f:
            f.write(f"\n{'='*60}\n")
            f.write(f"Field: {field_context}\n")
            if partial_input:
                f.write(f"User Typed (Hint): {partial_input}\n")
            f.write(f"Answer: {answer}\n")
            f.write(f"Date: {timestamp}\n")
            f.write(f"{'='*60}\n")
        
        print(f"✓ Saved accepted answer: {field_context} = {answer}")
        
        return jsonify({
            'success': True,
            'message': 'Accepted answer saved'
        })
        
    except Exception as e:
        print(f"Error saving accepted answer: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/save-field-value', methods=['POST'])
def save_field_value():
    """Auto-save any field value user enters (even rejected fields)"""
    try:
        data = request.json
        field_context = data.get('fieldContext', 'Unknown Field')
        value = data.get('value', '')
        timestamp = data.get('timestamp', datetime.now().isoformat())
        
        if not value:
            return jsonify({'success': False, 'error': 'No value provided'}), 400
        
        # Save to AcceptedAnswers.txt
        accepted_file = KNOWLEDGE_BASE_PATH / "AcceptedAnswers.txt"
        
        # Check if this exact field+value combination already exists
        existing_entries = set()
        if accepted_file.exists():
            with open(accepted_file, 'r', encoding='utf-8') as f:
                content = f.read()
                # Simple check: if both field and value appear together, skip
                if f"Field: {field_context}" in content and f"Answer: {value}" in content:
                    # Check if they're in the same entry
                    entries = content.split('='*60)
                    for entry in entries:
                        if f"Field: {field_context}" in entry and value in entry:
                            print(f"Skipping duplicate: {field_context} = {value}")
                            return jsonify({'success': True, 'message': 'Already saved'})
        
        # Append new entry
        with open(accepted_file, 'a', encoding='utf-8') as f:
            f.write(f"\n{'='*60}\n")
            f.write(f"Field: {field_context}\n")
            f.write(f"Answer: {value}\n")
            f.write(f"Date: {timestamp}\n")
            f.write(f"{'='*60}\n")
        
        print(f"✓ Auto-saved field value: {field_context} = {value}")
        
        return jsonify({
            'success': True,
            'message': 'Field value saved'
        })
        
    except Exception as e:
        print(f"Error saving field value: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def check_and_download_ollama_model():
    """Check if Ollama model exists, download if not"""
    if not OLLAMA_AVAILABLE:
        print("⚠️  Ollama not available, skipping model check")
        return False
    
    try:
        print("Checking Ollama models...")
        response = ollama.list()
        has_llama = any('llama3.1' in model.model for model in response.models)
        
        if has_llama:
            # Find which llama3.1 variant is available
            llama_model = next((m.model for m in response.models if 'llama3.1' in m.model), None)
            print(f"✓ {llama_model} model found")
            return True
        else:
            print("⚠️  llama3.1 not found, downloading 8b version... (this may take several minutes)")
            print("   Model size: ~4.9GB")
            ollama.pull('llama3.1:8b')
            print("✓ llama3.1:8b downloaded successfully")
            return True
    except Exception as e:
        print(f"⚠️  Could not check/download Ollama model: {e}")
        print("   Please install Ollama manually from: https://ollama.ai")
        return False


if __name__ == '__main__':
    print("="*60)
    print("AutoFormFiller - Python RAG Backend")
    print("="*60)
    
    # Create directories
    KNOWLEDGE_BASE_PATH.mkdir(exist_ok=True)
    VECTOR_DB_PATH.mkdir(exist_ok=True)
    
    # Check and download Ollama model
    check_and_download_ollama_model()
    
    # Load cached vector DB
    load_vector_db_cache()
    
    # Start server
    print(f"\n🚀 Server starting on http://localhost:{SERVER_PORT}")
    print(f"📁 Knowledge Base: {KNOWLEDGE_BASE_PATH.absolute()}")
    print(f"🧠 Embedding Model: {EMBEDDING_MODEL}")
    print(f"🤖 LLM Model: {OLLAMA_MODEL}")
    print("\n")
    
    app.run(host=SERVER_HOST, port=SERVER_PORT, debug=False)
