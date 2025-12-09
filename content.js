// ============================================================================
// AutoFormFiller - Content Script
// Detects form fields and provides AI-powered suggestions
// ============================================================================

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  TYPING_DELAY: 300,           // ms to wait after user stops typing
  NOTIFICATION_DURATION: 2000, // ms to show notifications
  SUGGESTION_OFFSET: 5         // px offset below form field
};

// ============================================================================
// STATE
// ============================================================================

let autoFillEnabled = false;
let currentField = null;
let suggestionPopup = null;
let settings = {};
let rejectedFields = new Set();

// Initialize
async function init() {
  // Load settings and rejected fields
  const result = await chrome.storage.local.get(['settings', 'rejectedFields']);
  if (result.settings) {
    settings = result.settings;
    autoFillEnabled = settings.autoFillEnabled || false;
  }
  
  // Load rejected fields for current page
  if (result.rejectedFields) {
    const pageUrl = window.location.href;
    if (result.rejectedFields[pageUrl]) {
      rejectedFields = new Set(result.rejectedFields[pageUrl]);
    }
  }
  
  // Create suggestion popup
  createSuggestionPopup();
  
  // Listen for form field focus
  document.addEventListener('focusin', handleFieldFocus, true);
  document.addEventListener('focusout', handleFieldFocusOut, true);
  
  console.log('AutoFormFiller: Content script initialized');
}

// Generate unique identifier for a field
function getFieldIdentifier(field) {
  // Use combination of stable attributes - prioritize id and name over xpath
  const tag = field.tagName.toLowerCase();
  const id = field.id || '';
  const name = field.name || '';
  const type = field.type || '';
  const placeholder = field.placeholder || '';
  const ariaLabel = field.getAttribute('aria-label') || '';
  
  // If field has id or name, use that (most stable)
  if (id) return `${tag}:${type}:id:${id}`;
  if (name) return `${tag}:${type}:name:${name}`;
  
  // Fallback to placeholder and aria-label
  if (placeholder) return `${tag}:${type}:placeholder:${placeholder}`;
  if (ariaLabel) return `${tag}:${type}:aria:${ariaLabel}`;
  
  // Last resort: use xpath
  const xpath = getElementXPath(field);
  return `${tag}:${type}:xpath:${xpath}`;
}

// Get XPath of element
function getElementXPath(element) {
  if (element.id) return `//*[@id="${element.id}"]`;
  
  const parts = [];
  while (element && element.nodeType === Node.ELEMENT_NODE) {
    let index = 0;
    let sibling = element.previousSibling;
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === element.tagName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }
    
    const tagName = element.tagName.toLowerCase();
    const pathIndex = index > 0 ? `[${index + 1}]` : '';
    parts.unshift(`${tagName}${pathIndex}`);
    
    element = element.parentNode;
    if (parts.length > 5) break; // Limit depth
  }
  
  return '/' + parts.join('/');
}

// Save rejected field
async function saveRejectedField(fieldIdentifier) {
  rejectedFields.add(fieldIdentifier);
  
  // Save to storage with page URL as key
  const pageUrl = window.location.href;
  const result = await chrome.storage.local.get(['rejectedFields']);
  const allRejected = result.rejectedFields || {};
  
  allRejected[pageUrl] = Array.from(rejectedFields);
  
  await chrome.storage.local.set({ rejectedFields: allRejected });
  console.log('Rejected field saved:', fieldIdentifier);
}

// Create floating suggestion popup
function createSuggestionPopup() {
  suggestionPopup = document.createElement('div');
  suggestionPopup.id = 'autoformfiller-popup';
  suggestionPopup.style.cssText = `
    position: absolute;
    display: none;
    background: white;
    border: 2px solid #667eea;
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 999999;
    max-width: 300px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 13px;
  `;
  
  suggestionPopup.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 8px;">
      <span style="font-weight: 600; color: #667eea; flex: 1;">🤖 AI Suggestion</span>
      <button id="autoformfiller-close" style="
        background: none;
        border: none;
        font-size: 16px;
        cursor: pointer;
        color: #999;
      ">✕</button>
    </div>
    <div id="autoformfiller-content" style="
      color: #333;
      line-height: 1.4;
      margin-bottom: 8px;
      min-height: 30px;
    ">
      <span style="color: #999;">Loading suggestion...</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button id="autoformfiller-apply" style="
        flex: 1;
        padding: 6px 12px;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
      ">Apply</button>
      <button id="autoformfiller-copy" style="
        padding: 6px 12px;
        background: #e0e0e0;
        color: #333;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      ">📋</button>
      <button id="autoformfiller-reject" style="
        padding: 6px 12px;
        background: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      ">✕ Reject</button>
    </div>
  `;
  
  document.body.appendChild(suggestionPopup);
  
  // Event listeners for popup buttons
  document.getElementById('autoformfiller-close').addEventListener('click', hideSuggestionPopup);
  document.getElementById('autoformfiller-apply').addEventListener('click', applySuggestion);
  document.getElementById('autoformfiller-copy').addEventListener('click', copySuggestion);
  document.getElementById('autoformfiller-reject').addEventListener('click', rejectSuggestion);
}

// Reject suggestion - mark field to never suggest again
async function rejectSuggestion() {
  if (currentField) {
    const fieldId = getFieldIdentifier(currentField);
    await saveRejectedField(fieldId);
    
    // Show feedback
    const contentEl = document.getElementById('autoformfiller-content');
    contentEl.innerHTML = '<span style="color: #f44336;">✓ Won\'t suggest for this field again</span>';
    
    setTimeout(() => {
      hideSuggestionPopup();
    }, 1500);
  }
}

// Handle field focus
async function handleFieldFocus(event) {
  if (!autoFillEnabled) return;
  
  const field = event.target;
  
  // Check if it's a form field
  if (!isFormField(field)) return;
  
  // Check if this field was rejected before
  const fieldId = getFieldIdentifier(field);
  if (rejectedFields.has(fieldId)) {
    console.log('Skipping rejected field:', fieldId);
    return; // Don't suggest for rejected fields
  }
  
  currentField = field;
  
  // Store the partial input user has typed (if any)
  const partialInput = field.value.trim();
  if (partialInput) {
    field.dataset.partialInput = partialInput;
  }
  
  // Get field context
  const fieldContext = getFieldContext(field);
  const query = buildQuery(field, fieldContext);
  
  // Show popup at field position
  showSuggestionPopup(field);
  
  // Fetch suggestion with partial input as hint
  fetchSuggestion(query, fieldContext, partialInput);
  
  // Listen for input changes to update suggestions in real-time
  if (!field.dataset.inputListenerAdded) {
    field.dataset.inputListenerAdded = 'true';
    
    let typingTimeout;
    field.addEventListener('input', (e) => {
      // Skip if not the current field or popup is hidden
      if (e.target !== currentField || suggestionPopup.style.display === 'none') return;
      
      clearTimeout(typingTimeout);
      
      // Show updating indicator immediately
      const contentEl = document.getElementById('autoformfiller-content');
      contentEl.innerHTML = '<span style="color: #999;">🔄 Updating...</span>';
      
      // Wait after user stops typing
      typingTimeout = setTimeout(() => {
        const newPartialInput = e.target.value.trim();
        const fieldContext = getFieldContext(e.target);
        const query = buildQuery(e.target, fieldContext);
        
        // Update suggestion with new partial input
        fetchSuggestion(query, fieldContext, newPartialInput);
      }, CONFIG.TYPING_DELAY);
    });
  }
}

// Handle field focus out
function handleFieldFocusOut(event) {
  // Don't hide if clicking on popup
  setTimeout(() => {
    if (!suggestionPopup.contains(document.activeElement)) {
      // hideSuggestionPopup(); // Commented out to keep popup visible
    }
  }, 100);
}

// Check if element is a form field
function isFormField(element) {
  const tagName = element.tagName.toLowerCase();
  
  if (tagName === 'input') {
    const type = element.type.toLowerCase();
    return ['text', 'email', 'tel', 'url', 'search', 'number', 'date'].includes(type);
  }
  
  return tagName === 'textarea';
}

// Get field context from labels, placeholders, etc.
function getFieldContext(field) {
  let context = '';
  
  // Check for label
  if (field.id) {
    const label = document.querySelector(`label[for="${field.id}"]`);
    if (label) {
      context = label.textContent.trim();
    }
  }
  
  // Check for closest label
  if (!context) {
    const closestLabel = field.closest('label');
    if (closestLabel) {
      context = closestLabel.textContent.trim();
    }
  }
  
  // Check for placeholder
  if (!context && field.placeholder) {
    context = field.placeholder;
  }
  
  // Check for name attribute
  if (!context && field.name) {
    context = field.name.replace(/[-_]/g, ' ');
  }
  
  // Check for aria-label
  if (!context && field.getAttribute('aria-label')) {
    context = field.getAttribute('aria-label');
  }
  
  return context || 'form field';
}

// Build query for the field
function buildQuery(field, fieldContext) {
  // Try to infer what information is needed based on context
  const contextLower = fieldContext.toLowerCase();
  
  // Common field patterns
  const patterns = {
    email: ['email', 'e-mail', 'mail address'],
    phone: ['phone', 'telephone', 'mobile', 'contact number'],
    name: ['name', 'full name', 'first name', 'last name'],
    address: ['address', 'street', 'location'],
    city: ['city', 'town'],
    state: ['state', 'province', 'region'],
    zip: ['zip', 'postal', 'pincode'],
    company: ['company', 'organization', 'employer'],
    position: ['position', 'title', 'role', 'designation'],
    education: ['education', 'degree', 'university', 'college'],
    experience: ['experience', 'years of experience'],
    skills: ['skills', 'expertise', 'proficiency']
  };
  
  // Match context to patterns
  for (const [key, keywords] of Object.entries(patterns)) {
    if (keywords.some(keyword => contextLower.includes(keyword))) {
      return `What is my ${key}?`;
    }
  }
  
  // Generic query
  return `What should I enter for ${fieldContext}?`;
}

// Show suggestion popup
function showSuggestionPopup(field) {
  const rect = field.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  
  suggestionPopup.style.display = 'block';
  suggestionPopup.style.top = `${rect.bottom + scrollTop + CONFIG.SUGGESTION_OFFSET}px`;
  suggestionPopup.style.left = `${rect.left + scrollLeft}px`;
  
  // Reset content
  document.getElementById('autoformfiller-content').innerHTML = 
    '<span style="color: #999;">🔍 Searching knowledge base...</span>';
}

// Hide suggestion popup
function hideSuggestionPopup() {
  suggestionPopup.style.display = 'none';
  currentField = null;
}

// Fetch suggestion from backend
async function fetchSuggestion(query, fieldContext, partialInput = '') {
  try {
    const backendUrl = settings.backendUrl || 'http://localhost:3000';
    
    const response = await fetch(`${backendUrl}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        query, 
        fieldContext,
        partialInput: partialInput || undefined  // Include as hint if user typed something
      })
    });
    
    const data = await response.json();
    
    const contentEl = document.getElementById('autoformfiller-content');
    
    if (data.answer === 'Not in DB' || !data.answer) {
      contentEl.innerHTML = `
        <span style="color: #ff9800;">ℹ️ No information found in knowledge base</span>
      `;
      document.getElementById('autoformfiller-apply').disabled = true;
    } else {
      contentEl.innerHTML = `
        <div style="font-weight: 500; color: #333;">${escapeHtml(data.answer)}</div>
        ${data.source ? `<div style="font-size: 11px; color: #999; margin-top: 4px;">Source: ${data.source}</div>` : ''}
      `;
      document.getElementById('autoformfiller-apply').disabled = false;
      
      // Store answer for applying
      suggestionPopup.dataset.answer = data.answer;
    }
    
  } catch (error) {
    console.error('AutoFormFiller error:', error);
    document.getElementById('autoformfiller-content').innerHTML = 
      `<span style="color: #f44336;">❌ Error: ${escapeHtml(error.message)}</span>`;
    document.getElementById('autoformfiller-apply').disabled = true;
  }
}

// Apply suggestion to field
async function applySuggestion() {
  if (!currentField || !suggestionPopup.dataset.answer) return;
  
  const suggestedAnswer = suggestionPopup.dataset.answer;
  const fieldContext = getFieldContext(currentField);
  const partialInput = currentField.dataset.partialInput || '';
  
  // Set value
  currentField.value = suggestedAnswer;
  
  // Trigger input event for frameworks like React
  currentField.dispatchEvent(new Event('input', { bubbles: true }));
  currentField.dispatchEvent(new Event('change', { bubbles: true }));
  
  // Save accepted answer immediately
  try {
    await fetch(`${settings.backendUrl}/api/save-accepted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fieldContext: fieldContext,
        answer: suggestedAnswer,
        partialInput: partialInput || undefined,
        timestamp: new Date().toISOString()
      })
    });
    console.log('Accepted answer saved:', suggestedAnswer);
  } catch (error) {
    console.error('Failed to save accepted answer:', error);
  }
  
  // Show notification
  if (settings.showNotifications) {
    showNotification('Applied & Saved ✓', 'success');
  }
  
  hideSuggestionPopup();
}

// Copy suggestion to clipboard
async function copySuggestion() {
  if (!suggestionPopup.dataset.answer) return;
  
  try {
    await navigator.clipboard.writeText(suggestionPopup.dataset.answer);
    showNotification('Copied ✓', 'success');
  } catch (error) {
    console.error('Copy failed:', error);
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#4caf50' : '#2196f3'};
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 9999999;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
    font-weight: 500;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, CONFIG.NOTIFICATION_DURATION);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleAutoFill') {
    autoFillEnabled = message.enabled;
    
    if (autoFillEnabled) {
      showNotification('Auto Fill Enabled 🤖', 'success');
    } else {
      showNotification('Auto Fill Disabled', 'info');
      hideSuggestionPopup();
    }
  } else if (message.action === 'clearRejectedFields') {
    // Clear rejected fields for this page
    rejectedFields.clear();
    showNotification('Rejected fields cleared ✓', 'success');
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
