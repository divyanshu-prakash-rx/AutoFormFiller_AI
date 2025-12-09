// ============================================================================
// AutoFormFiller - Popup Script
// Extension popup interface and controls
// ============================================================================

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  BACKEND_URL: 'http://localhost:3000',
  STATUS_MESSAGE_DURATION: 3000,  // ms
  HEALTH_CHECK_TIMEOUT: 3000      // ms
};

const DEFAULT_SETTINGS = {
  autoFillEnabled: false,
  backendUrl: CONFIG.BACKEND_URL,
  showNotifications: true,
  preferLocalLlm: true
};

// ============================================================================
// STATE
// ============================================================================

let settings = { ...DEFAULT_SETTINGS };

// Load settings on startup
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings']);
  if (result.settings) {
    settings = { ...settings, ...result.settings };
  }
  updateUI();
}

// Save settings
async function saveSettings() {
  await chrome.storage.local.set({ settings });
  showStatus('Settings saved successfully', 'success');
}

// Update UI with current settings
function updateUI() {
  document.getElementById('autoFillToggle').checked = settings.autoFillEnabled;
  document.getElementById('backendUrl').value = settings.backendUrl;
  document.getElementById('showNotifications').checked = settings.showNotifications;
  document.getElementById('preferLocalLlm').checked = settings.preferLocalLlm;
}

// Show status message
function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('statusMessage');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = 'status-message';
  }, CONFIG.STATUS_MESSAGE_DURATION);
}

// Check LLM status
async function checkLlmStatus() {
  try {
    const response = await fetch(`${settings.backendUrl}/api/check-llama`);
    const data = await response.json();
    
    const statusEl = document.getElementById('llmStatus');
    if (data.available) {
      statusEl.textContent = '🟢 Llama Local';
      statusEl.style.background = '#c8e6c9';
      statusEl.style.color = '#2e7d32';
    } else {
      statusEl.textContent = '🔴 Llama Not Found';
      statusEl.style.background = '#ffcdd2';
      statusEl.style.color = '#c62828';
    }
  } catch (error) {
    const statusEl = document.getElementById('llmStatus');
    statusEl.textContent = '🔴 Offline';
    statusEl.style.background = '#ffcdd2';
    statusEl.style.color = '#c62828';
  }
}

// Check backend server status
async function checkBackendStatus() {
  const backendStatusEl = document.getElementById('backendStatus');
  const backendAlertEl = document.getElementById('backendAlert');
  
  try {
    const response = await fetch(`${settings.backendUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(CONFIG.HEALTH_CHECK_TIMEOUT)
    });
    
    if (response.ok) {
      backendStatusEl.textContent = '🟢 Online';
      backendStatusEl.className = 'status-value status-online';
      backendAlertEl.style.display = 'none';
      return true;
    } else {
      throw new Error('Backend not responding');
    }
  } catch (error) {
    backendStatusEl.textContent = '🔴 Offline';
    backendStatusEl.className = 'status-value status-offline';
    backendAlertEl.style.display = 'block';
    return false;
  }
}

// Check Vector DB status
async function checkVectorDbStatus() {
  const isBackendOnline = await checkBackendStatus();
  
  if (!isBackendOnline) {
    document.getElementById('vectorDbStatus').textContent = '⚫ N/A';
    return;
  }
  
  try {
    const response = await fetch(`${settings.backendUrl}/health`);
    if (response.ok) {
      document.getElementById('vectorDbStatus').textContent = '🟢 Ready';
    } else {
      document.getElementById('vectorDbStatus').textContent = '🟡 Unknown';
    }
  } catch (error) {
    document.getElementById('vectorDbStatus').textContent = '🔴 Offline';
  }
}

// Load file list
async function loadFileList() {
  const fileListEl = document.getElementById('fileList');
  fileListEl.innerHTML = '<div class="loading">Loading files...</div>';
  
  try {
    const response = await fetch(`${settings.backendUrl}/api/list-files`);
    const data = await response.json();
    
    if (data.files.length === 0) {
      fileListEl.innerHTML = '<div class="empty-state">No files uploaded yet. Upload PDFs, TXT, or DOCX files to get started.</div>';
      return;
    }
    
    fileListEl.innerHTML = '';
    data.files.forEach(file => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      
      const sizeKB = (file.size / 1024).toFixed(2);
      const date = new Date(file.modified).toLocaleDateString();
      
      fileItem.innerHTML = `
        <div class="file-info">
          <span class="file-name">${file.name}</span>
          <span class="file-meta">${sizeKB} KB • ${date}</span>
        </div>
        <div class="file-actions">
          <button onclick="deleteFile('${file.name}')">🗑️ Delete</button>
        </div>
      `;
      
      fileListEl.appendChild(fileItem);
    });
  } catch (error) {
    fileListEl.innerHTML = `<div class="empty-state">Error loading files: ${error.message}</div>`;
  }
}

// Delete file
async function deleteFile(filename) {
  if (!confirm(`Delete ${filename}?`)) return;
  
  try {
    const response = await fetch(`${settings.backendUrl}/api/delete/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (data.success) {
      showStatus('File deleted. Remember to update vector DB!', 'success');
      loadFileList();
    } else {
      showStatus('Failed to delete file', 'error');
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  }
}

// Upload files
async function uploadFiles(files) {
  const formData = new FormData();
  
  for (let file of files) {
    formData.append('file', file);
  }
  
  try {
    showStatus('Uploading files...', 'info');
    
    for (let file of files) {
      const singleFormData = new FormData();
      singleFormData.append('file', file);
      
      const response = await fetch(`${settings.backendUrl}/api/upload`, {
        method: 'POST',
        body: singleFormData
      });
      
      if (!response.ok) {
        throw new Error(`Failed to upload ${file.name}`);
      }
    }
    
    showStatus(`Uploaded ${files.length} file(s). Update vector DB to use them.`, 'success');
    loadFileList();
  } catch (error) {
    showStatus(`Upload error: ${error.message}`, 'error');
  }
}

// Update vector database
async function updateVectorDb() {
  const btn = document.getElementById('updateVectorDbBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Updating...';
  
  showStatus('Updating vector database... This may take a while.', 'info');
  
  try {
    const response = await fetch(`${settings.backendUrl}/api/update-vectordb`, {
      method: 'POST'
    });
    
    const data = await response.json();
    
    if (data.success) {
      showStatus('Vector database updated successfully!', 'success');
      checkVectorDbStatus();
    } else {
      showStatus('Failed to update vector database', 'error');
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Update Vector Database';
  }
}

// Manual query
async function performQuery() {
  const query = document.getElementById('queryInput').value.trim();
  const fieldContext = document.getElementById('fieldContextInput').value.trim();
  
  if (!query) {
    showStatus('Please enter a query', 'error');
    return;
  }
  
  const btn = document.getElementById('queryBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Querying...';
  
  const resultEl = document.getElementById('queryResult');
  const metaEl = document.getElementById('queryMeta');
  
  resultEl.textContent = 'Processing...';
  metaEl.textContent = '';
  
  try {
    const response = await fetch(`${settings.backendUrl}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, fieldContext })
    });
    
    const data = await response.json();
    
    resultEl.textContent = data.answer || 'Not in DB';
    
    if (data.source) {
      metaEl.textContent = `Source: ${data.source} | Confidence: ${(data.confidence * 100).toFixed(1)}%`;
    }
    
  } catch (error) {
    resultEl.textContent = `Error: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Get Answer';
  }
}

// Tab switching
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`${tabName}Tab`).classList.add('active');
}

// Copy start command to clipboard
function copyStartCommand() {
  const command = 'cd "c:\\Users\\ASUS\\Documents\\vscode\\Web Dev\\AutoFormFiller" && npm start';
  navigator.clipboard.writeText(command).then(() => {
    showStatus('Command copied! Paste in terminal and press Enter', 'success');
  }).catch(() => {
    showStatus('Failed to copy command', 'error');
  });
}

// Show startup instructions
function showStartupInstructions() {
  const instructions = `
To start the backend server:

1. Open PowerShell or Terminal
2. Run these commands:

   cd "c:\\Users\\ASUS\\Documents\\vscode\\Web Dev\\AutoFormFiller"
   npm start

3. Keep the terminal window open
4. Refresh this popup

The server must be running for AutoFormFiller to work.
  `.trim();
  
  alert(instructions);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  checkBackendStatus();
  checkLlmStatus();
  checkVectorDbStatus();
  loadFileList();
  
  // Backend alert buttons
  document.getElementById('copyStartCmd')?.addEventListener('click', copyStartCommand);
  document.getElementById('openTerminalHelp')?.addEventListener('click', showStartupInstructions);
  
  // Auto-fill toggle
  document.getElementById('autoFillToggle').addEventListener('change', (e) => {
    settings.autoFillEnabled = e.target.checked;
    saveSettings();
    
    // Notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleAutoFill',
          enabled: settings.autoFillEnabled
        });
      }
    });
  });
  
  // Tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });
  
  // Upload button
  document.getElementById('uploadBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
  
  document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      uploadFiles(e.target.files);
      e.target.value = ''; // Reset input
    }
  });
  
  // Refresh files
  document.getElementById('refreshFilesBtn').addEventListener('click', loadFileList);
  
  // Update vector DB
  document.getElementById('updateVectorDbBtn').addEventListener('click', updateVectorDb);
  
  // Query button
  document.getElementById('queryBtn').addEventListener('click', performQuery);
  
  // Query input enter key
  document.getElementById('queryInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performQuery();
    }
  });
  
  // Save settings
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    settings.backendUrl = document.getElementById('backendUrl').value;
    settings.showNotifications = document.getElementById('showNotifications').checked;
    settings.preferLocalLlm = document.getElementById('preferLocalLlm').checked;
    saveSettings();
  });
  
  // Clear rejected fields
  document.getElementById('clearRejectedBtn')?.addEventListener('click', async () => {
    if (confirm('Clear all rejected fields? Suggestions will appear again for all fields.')) {
      await chrome.storage.local.set({ rejectedFields: {} });
      showStatus('All rejected fields cleared', 'success');
      
      // Notify all content scripts to reload rejected fields
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: 'clearRejectedFields' }).catch(() => {});
        });
      });
    }
  });
});

// Make deleteFile available globally
window.deleteFile = deleteFile;
