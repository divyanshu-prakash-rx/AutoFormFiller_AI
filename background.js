// ============================================================================
// AutoFormFiller - Background Service Worker
// Handles extension lifecycle and backend communication
// ============================================================================

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  BACKEND_URL: 'http://localhost:3000',
  HEALTH_CHECK_TIMEOUT: 5000  // ms
};

const DEFAULT_SETTINGS = {
  autoFillEnabled: false,
  backendUrl: CONFIG.BACKEND_URL,
  showNotifications: true,
  preferLocalLlm: true
};

// ============================================================================
// INITIALIZATION
// ============================================================================

console.log('AutoFormFiller: Background service worker initialized');

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('AutoFormFiller: Extension installed');
    chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'query') {
    // Handle query requests
    handleQuery(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true; // Keep message channel open for async response
  }
  
  if (message.action === 'checkBackend') {
    // Check if backend is running
    checkBackendHealth(message.backendUrl)
      .then(isHealthy => sendResponse({ healthy: isHealthy }))
      .catch(() => sendResponse({ healthy: false }));
    
    return true;
  }
});

// ============================================================================
// HANDLERS
// ============================================================================

async function handleQuery(data) {
  const settings = await chrome.storage.local.get(['settings']);
  const backendUrl = settings.settings?.backendUrl || CONFIG.BACKEND_URL;
  
  const response = await fetch(`${backendUrl}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }
  
  return await response.json();
}

async function checkBackendHealth(backendUrl) {
  try {
    const response = await fetch(`${backendUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(CONFIG.HEALTH_CHECK_TIMEOUT)
    });
    return response.ok;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
}

// Handle extension icon click (optional - opens popup by default)
chrome.action.onClicked.addListener((tab) => {
  // Popup opens automatically, but we can add additional logic here if needed
  console.log('Extension icon clicked');
});
