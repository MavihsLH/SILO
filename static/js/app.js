/**
 * Agentic RAG Agent — Frontend Logic
 * ====================================
 * Handles: collection management, file uploads, chat, and UI state.
 */

// ════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════
const state = {
  collections: [],
  activeCollection: null, // safe_name of the active collection
  messages: [],           // chat messages for current active chat
  isLoading: false,
  chats: [],              // list of chat sessions
  activeChatId: null,     // active chat session ID
};

// Color presets for collection creation
const COLOR_PRESETS = [
  '#f87171', // red
  '#fb923c', // orange
  '#fbbf24', // amber
  '#34d399', // emerald
  '#22d3ee', // cyan
  '#6366f1', // indigo
  '#a78bfa', // violet
  '#f472b6', // pink
  '#818cf8', // periwinkle
  '#2dd4bf', // teal
];

// Suggested queries per collection (based on name)
const SUGGESTED_QUERIES = {
  anime_knowledge_base: [
    'What are some good space opera anime?',
    'Recommend a dark fantasy anime',
    'Which Studio Ghibli movies are the highest rated?',
    'Find anime with strong female leads',
  ],
  _default: [
    'Summarize the key topics in this collection',
    'What are the most important findings?',
    'Find information about...',
  ],
};

// ════════════════════════════════════════════════════════
// DOM ELEMENTS
// ════════════════════════════════════════════════════════
const $collectionsList = document.getElementById('collections-list');
const $addCollectionBtn = document.getElementById('add-collection-btn');
const $sidebarFiles = document.getElementById('sidebar-files');
const $filesList = document.getElementById('files-list');
const $fileCountBadge = document.getElementById('file-count-badge');
const $uploadBtn = document.getElementById('upload-btn');
const $ingestBtn = document.getElementById('ingest-btn');
const $indexingProgress = document.getElementById('indexing-progress');
const $indexingProgressFill = document.getElementById('indexing-progress-fill');
const $indexingProgressLabel = document.getElementById('indexing-progress-label');
const $indexingProgressPct = document.getElementById('indexing-progress-pct');
const $chatMessages = document.getElementById('chat-messages');
const $emptyState = document.getElementById('empty-state');
const $suggestedQueries = document.getElementById('suggested-queries');
const $chatInput = document.getElementById('chat-input');
const $sendBtn = document.getElementById('send-btn');
const $attachBtn = document.getElementById('attach-btn');
const $chatCollectionBadge = document.getElementById('chat-collection-badge');
const $chatCollectionDot = document.getElementById('chat-collection-dot');
const $chatCollectionName = document.getElementById('chat-collection-name');
// Removed old top-level collection options elements

const $tabCollections = document.getElementById('tab-collections');
const $tabChats = document.getElementById('tab-chats');
const $viewCollections = document.getElementById('view-collections');
const $viewChats = document.getElementById('view-chats');
const $chatsList = document.getElementById('chats-list');
const $addChatBtn = document.getElementById('add-chat-btn');

const $dropOverlay = document.getElementById('drop-overlay');
const $createModal = document.getElementById('create-modal');
const $collectionNameInput = document.getElementById('collection-name-input');
const $collectionDescInput = document.getElementById('collection-desc-input');
const $collectionColorInput = document.getElementById('collection-color-input');
const $colorPresets = document.getElementById('color-presets');
const $modalCancelBtn = document.getElementById('modal-cancel-btn');
const $modalCreateBtn = document.getElementById('modal-create-btn');

const $editModal = document.getElementById('edit-modal');
const $editCollectionNameInput = document.getElementById('edit-collection-name-input');
const $editCollectionDescInput = document.getElementById('edit-collection-desc-input');
const $editCollectionColorInput = document.getElementById('edit-collection-color-input');
const $editColorPresets = document.getElementById('edit-color-presets');
const $editModalCancelBtn = document.getElementById('edit-modal-cancel-btn');
const $editModalSaveBtn = document.getElementById('edit-modal-save-btn');
const $editModalDeleteBtn = document.getElementById('edit-modal-delete-btn');

const $fileInput = document.getElementById('file-input');
const $toastContainer = document.getElementById('toast-container');
const $onlineModeToggle = document.getElementById('online-mode-toggle');

const $settingsBtn = document.getElementById('settings-btn');
const $settingsModal = document.getElementById('settings-modal');
const $settingsCancelBtn = document.getElementById('settings-cancel-btn');
const $settingsSaveBtn = document.getElementById('settings-save-btn');
const $chatModelSelect = document.getElementById('chat-model-select');
const $ingestModelSelect = document.getElementById('ingest-model-select');
const $themeSelect = document.getElementById('theme-select');
const $settingsStrictMode = document.getElementById('settings-strict-mode');

const $indexingModal = document.getElementById('indexing-modal');
const $indexingCancelBtn = document.getElementById('indexing-cancel-btn');
const $indexingStartBtn = document.getElementById('indexing-start-btn');

// ════════════════════════════════════════════════════════
// API HELPERS
// ════════════════════════════════════════════════════════

async function api(endpoint, options = {}) {
  const res = await fetch(`/api${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'API Error');
  }
  return res.json();
}

async function apiUpload(endpoint, file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api${endpoint}`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Upload Error');
  }
  return res.json();
}

// ════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ════════════════════════════════════════════════════════

function showToast(message, type = 'success') {
  // Toasts disabled per user request
}

// ════════════════════════════════════════════════════════
// COLLECTIONS
// ════════════════════════════════════════════════════════

async function loadCollections() {
  try {
    state.collections = await api('/collections');
    renderCollections();
    resetIngestButton();
    if (state.activeCollection) {
      await loadCollectionDetails(state.activeCollection);
    }
  } catch (err) {
    console.error('Failed to load collections:', err);
  }
}

function renderCollections() {
  $collectionsList.innerHTML = '';

  if (state.collections.length === 0) {
    $collectionsList.innerHTML = `
      <div style="padding: 12px 16px; color: var(--text-muted); font-size: 12px; text-align: center;">
        No collections yet.<br>Create one to get started!
      </div>
    `;
    return;
  }

  state.collections.forEach(col => {
    const item = document.createElement('div');
    item.className = `collection-item ${col.safe_name === state.activeCollection ? 'active' : ''}`;
    item.dataset.collection = col.safe_name;
    item.title = col.name;

    const statusClass = col.indexed ? 'indexed' : 'pending';
    const statusText = col.indexed ? 'Indexed' : 'Pending';

    item.innerHTML = `
      <span class="collection-dot" style="background: ${col.color}; color: ${col.color};"></span>
      <div class="collection-info">
        <div class="collection-name">${col.name}</div>
        <div class="collection-count">${col.file_count} file${col.file_count !== 1 ? 's' : ''}</div>
      </div>
      <span class="collection-status ${statusClass}">${statusText}</span>
      <div class="collection-item-actions">
        <button class="collection-action-btn manage-collection" title="Manage Collection">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
        </button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.collection-action-btn')) return;
      selectCollection(col.safe_name);
    });

    item.querySelector('.manage-collection').addEventListener('click', async (e) => {
      e.stopPropagation();
      await selectCollection(col.safe_name);
      openEditModal();
    });

    $collectionsList.appendChild(item);
  });
}

async function selectCollection(safeName) {
  state.activeCollection = safeName;

  // Clear active chat — the user is now browsing a collection directly
  state.activeChatId = null;

  // Reset progress bar when switching collections
  hideProgressBar();

  // Update UI
  renderCollections();
  await loadCollectionDetails(safeName);
  
  // Reset chat area to empty state for this collection
  state.messages = [];
  renderChat();
  updateChatHeader();
  updateAccentColor();

  // Set correct button text: Index vs Reindex
  resetIngestButton();

  // Check if it's currently indexing
  pollIngestionStatus(safeName);
}

function updateChatHeader() {
  if (state.activeChatId) {
    const chat = state.chats.find(c => c.id === state.activeChatId);
    const col = chat ? state.collections.find(c => c.safe_name === chat.collection) : null;
    if (col) {
      $chatCollectionBadge.style.display = 'flex';
      $chatCollectionName.textContent = `${chat.title} (${col.name})`;
      $chatCollectionDot.style.background = col.color;
    } else {
      $chatCollectionName.textContent = 'No collection selected';
      $chatCollectionDot.style.background = 'var(--text-muted)';
    }
  } else {
    const col = state.collections.find(c => c.safe_name === state.activeCollection);
    if (col) {
      $chatCollectionBadge.style.display = 'flex';
      $chatCollectionName.textContent = col.name;
      $chatCollectionDot.style.background = col.color;
    } else {
      $chatCollectionName.textContent = 'No collection selected';
      $chatCollectionDot.style.background = 'var(--text-muted)';
    }
  }
}

function updateAccentColor() {
  let targetColName = state.activeCollection;
  if (state.activeChatId) {
    const chat = state.chats.find(c => c.id === state.activeChatId);
    if (chat) targetColName = chat.collection;
  }

  const col = state.collections.find(c => c.safe_name === targetColName);
  if (col) {
    document.documentElement.style.setProperty('--accent', col.color);
    // Generate soft/glow variants
    document.documentElement.style.setProperty('--accent-soft', col.color + '22');
    document.documentElement.style.setProperty('--accent-glow', col.color + '40');
    document.documentElement.style.setProperty('--border-accent', col.color + '4d');
  }
}

async function loadCollectionDetails(safeName) {
  try {
    const details = await api(`/collections/${safeName}`);
    renderFiles(details.files || []);
  } catch (err) {
    console.error('Failed to load collection details:', err);
  }
}

function renderFiles(files) {
  $fileCountBadge.textContent = files.length;

  if (files.length === 0) {
    $filesList.innerHTML = `
      <div style="padding: 8px; color: var(--text-muted); font-size: 11px; text-align: center;">
        No files yet. Upload a PDF to get started.
      </div>
    `;
    return;
  }

  const col = state.collections.find(c => c.safe_name === state.activeCollection);
  const isIndexed = col && col.indexed;
  const badgeText = isIndexed ? 'Indexed' : 'Pending';
  const badgeClass = isIndexed ? 'indexed' : 'pending';

  $filesList.innerHTML = files.map(f => {
    const icon = getFileIcon(f.type || f.name?.split('.').pop()?.toUpperCase());
    const sizeStr = formatFileSize(f.size);
    return `
      <div class="file-item">
        <span class="file-icon">${icon}</span>
        <span class="file-name">${f.name}</span>
        <span class="file-status-badge ${badgeClass}">${badgeText}</span>
        <span class="file-size">${sizeStr}</span>
      </div>
    `;
  }).join('');
}

function getFileIcon(type) {
  const icons = { PDF: '📄', TXT: '📄', MD: '📄', CSV: '📄' };
  return icons[type] || '📄';
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ════════════════════════════════════════════════════════
// CREATE COLLECTION MODAL
// ════════════════════════════════════════════════════════

function openCreateModal() {
  $collectionNameInput.value = '';
  $collectionDescInput.value = '';
  $collectionDescInput.style.height = 'auto'; // Reset height
  $collectionColorInput.value = COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)];
  renderColorPresets();
  $createModal.classList.add('visible');
  $collectionNameInput.focus();
}

function closeCreateModal() {
  $createModal.classList.remove('visible');
}

function renderColorPresets() {
  $colorPresets.innerHTML = COLOR_PRESETS.map(c => `
    <div class="color-preset ${c === $collectionColorInput.value ? 'selected' : ''}" 
         style="background: ${c};" 
         data-color="${c}">
    </div>
  `).join('');

  $colorPresets.querySelectorAll('.color-preset').forEach(el => {
    el.addEventListener('click', () => {
      $collectionColorInput.value = el.dataset.color;
      renderColorPresets();
    });
  });
}

async function createCollection() {
  const name = $collectionNameInput.value.trim();
  if (!name) {
    showToast('Please enter a collection name', 'error');
    return;
  }

  try {
    await api('/collections', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: $collectionDescInput.value.trim(),
        color: $collectionColorInput.value,
      }),
    });
    closeCreateModal();
    showToast(`Collection "${name}" created!`);
    await loadCollections();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ════════════════════════════════════════════════════════
// FILE UPLOAD
// ════════════════════════════════════════════════════════

function triggerFileUpload() {
  if (!state.activeCollection) {
    showToast('Select a collection first', 'error');
    return;
  }
  $fileInput.click();
}

async function handleFileUpload(file) {
  if (!state.activeCollection) {
    showToast('Select a collection first', 'error');
    return;
  }

  try {
    showToast(`Uploading ${file.name}...`);
    await apiUpload(`/collections/${state.activeCollection}/upload`, file);
    showToast(`${file.name} uploaded successfully!`);
    await loadCollectionDetails(state.activeCollection);
    await loadCollections(); // Refresh file counts
  } catch (err) {
    showToast(`Upload failed: ${err.message}`, 'error');
  }
}

function openIndexingModal() {
  if (!state.activeCollection) {
    showToast('Select a collection first', 'error');
    return;
  }

  // Set modal text based on indexed status
  const col = state.collections.find(c => c.safe_name === state.activeCollection);
  const isIndexed = col && col.indexed;

  const modalTitle = document.querySelector('#indexing-modal h2');
  const startBtn = document.getElementById('indexing-start-btn');

  if (isIndexed) {
    if (modalTitle) modalTitle.textContent = 'Choose Reindexing Strategy';
    if (startBtn) startBtn.textContent = 'Start Reindexing';
  } else {
    if (modalTitle) modalTitle.textContent = 'Choose Indexing Strategy';
    if (startBtn) startBtn.textContent = 'Start Indexing';
  }

  $indexingModal.classList.add('visible');
}

function closeIndexingModal() {
  $indexingModal.classList.remove('visible');
}

async function startIngestion() {
  const smartMode = document.getElementById('strategy-smart').checked;
  closeIndexingModal();

  try {
    $ingestBtn.disabled = true;
    $ingestBtn.textContent = 'Indexing...';
    showProgressBar(0, 'Starting indexing...');

    await api(`/collections/${state.activeCollection}/ingest`, {
      method: 'POST',
      body: JSON.stringify({ smart_mode: smartMode }),
    });

    pollIngestionStatus(state.activeCollection);
  } catch (err) {
    showToast(`Failed to start indexing: ${err.message}`, 'error');
    hideProgressBar();
    resetIngestButton();
  }
}

function showProgressBar(progress, label) {
  $indexingProgress.style.display = 'block';
  $indexingProgress.classList.add('active');
  $indexingProgressFill.style.width = progress + '%';
  $indexingProgressLabel.textContent = label;
  $indexingProgressPct.textContent = progress + '%';
}

function hideProgressBar() {
  $indexingProgress.style.display = 'none';
  $indexingProgress.classList.remove('active');
}

function updateProgressBar(progress, label) {
  $indexingProgressFill.style.width = progress + '%';
  $indexingProgressLabel.textContent = label;
  $indexingProgressPct.textContent = progress + '%';
}

function resetIngestButton() {
  const col = state.collections.find(c => c.safe_name === state.activeCollection);
  const isIndexed = col && col.indexed;
  $ingestBtn.disabled = false;
  $ingestBtn.textContent = isIndexed ? 'Reindex' : 'Index';
}

async function pollIngestionStatus(safeName) {
  try {
    const res = await api(`/collections/${safeName}/status`);

    if (res.status === 'indexing') {
      if (state.activeCollection === safeName) {
        $ingestBtn.disabled = true;
        $ingestBtn.textContent = 'Indexing...';
        showProgressBar(res.progress || 0, res.message || 'Indexing...');
      }
      setTimeout(() => pollIngestionStatus(safeName), 1500);

    } else if (res.status === 'ready') {
      if (state.activeCollection === safeName) {
        const wasIndexing = $indexingProgress.style.display === 'block';
        if (wasIndexing) {
          // Brief flash of 100% before hiding
          updateProgressBar(100, res.message || 'Done!');
          setTimeout(() => {
            hideProgressBar();
            resetIngestButton();
          }, 1500);
        } else {
          hideProgressBar();
          resetIngestButton();
        }
        loadCollections(); // refresh indexed badge
      }

    } else if (res.status === 'error') {
      if (state.activeCollection === safeName) {
        showToast(`Indexing failed: ${res.message || 'Unknown error'}`, 'error');
        alert(`Indexing failed: ${res.message || 'Unknown error'}`);
        hideProgressBar();
        resetIngestButton();
      }

    } else {
      // unindexed or unknown — just reset
      if (state.activeCollection === safeName) {
        hideProgressBar();
        resetIngestButton();
      }
    }
  } catch (err) {
    console.error('Error polling status:', err);
  }
}

// ════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════

async function loadModelsAndSettings() {
  try {
    const models = await api('/models');
    if (models && models.length > 0) {
      const optionsHtml = models.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
      $chatModelSelect.innerHTML = optionsHtml;
      $ingestModelSelect.innerHTML = optionsHtml;
    }

    const settings = await api('/settings');
    if (settings) {
      if (Array.from($chatModelSelect.options).some(o => o.value === settings.chat_model)) {
        $chatModelSelect.value = settings.chat_model;
      } else if (settings.chat_model) {
        $chatModelSelect.innerHTML += `<option value="${settings.chat_model}">${settings.chat_model}</option>`;
        $chatModelSelect.value = settings.chat_model;
      }
      
      if (Array.from($ingestModelSelect.options).some(o => o.value === settings.ingestion_model)) {
        $ingestModelSelect.value = settings.ingestion_model;
      } else if (settings.ingestion_model) {
        $ingestModelSelect.innerHTML += `<option value="${settings.ingestion_model}">${settings.ingestion_model}</option>`;
        $ingestModelSelect.value = settings.ingestion_model;
      }
      $settingsStrictMode.checked = settings.strict_mode || false;
    }
  } catch (e) {
    console.error("Failed to load models/settings", e);
  }
}

function openSettingsModal() {
  $settingsModal.classList.add('visible');
}

function closeSettingsModal() {
  $settingsModal.classList.remove('visible');
}

// Live preview of theme
$themeSelect.addEventListener('change', (e) => {
  if (e.target.value === 'light') {
    document.documentElement.classList.add('theme-light');
  } else {
    document.documentElement.classList.remove('theme-light');
  }
});

async function saveSettings() {
  try {
    $settingsSaveBtn.disabled = true;
    $settingsSaveBtn.textContent = 'Saving...';
    
    await api('/settings', {
      method: 'POST',
      body: JSON.stringify({
        chat_model: $chatModelSelect.value,
        ingestion_model: $ingestModelSelect.value,
        strict_mode: $settingsStrictMode.checked
      })
    });
    
    // Save theme to local storage
    localStorage.setItem('silo_theme', $themeSelect.value);
    
    showToast('Settings saved successfully!');
    closeSettingsModal();
  } catch (e) {
    showToast('Failed to save settings: ' + e.message, 'error');
  } finally {
    $settingsSaveBtn.disabled = false;
    $settingsSaveBtn.textContent = 'Save Settings';
  }
}

// ════════════════════════════════════════════════════════
// DRAG & DROP
// ════════════════════════════════════════════════════════

let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  $dropOverlay.classList.add('visible');
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) $dropOverlay.classList.remove('visible');
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragCounter = 0;
  $dropOverlay.classList.remove('visible');

  const files = Array.from(e.dataTransfer.files);
  for (const file of files) {
    await handleFileUpload(file);
  }
});

// ════════════════════════════════════════════════════════
// CHAT
// ════════════════════════════════════════════════════════

function renderChat() {
  // Clear existing messages (except empty state)
  const existingMessages = $chatMessages.querySelectorAll('.message');
  existingMessages.forEach(m => m.remove());

  if (state.messages.length === 0) {
    $emptyState.style.display = 'flex';
    renderSuggestedQueries();
  } else {
    $emptyState.style.display = 'none';
    state.messages.forEach(msg => appendMessageToDOM(msg));
  }

  scrollToBottom();
}

function renderSuggestedQueries() {
  let targetCol = state.activeCollection;
  if (state.activeChatId) {
    const chat = state.chats.find(c => c.id === state.activeChatId);
    if (chat) targetCol = chat.collection;
  }
  const queries = SUGGESTED_QUERIES[targetCol] || SUGGESTED_QUERIES._default;
  $suggestedQueries.innerHTML = queries.map(q => `
    <button class="suggested-query" data-query="${q}">${q}</button>
  `).join('');

  $suggestedQueries.querySelectorAll('.suggested-query').forEach(btn => {
    btn.addEventListener('click', () => {
      $chatInput.value = btn.dataset.query;
      $sendBtn.disabled = false;
      sendMessage();
    });
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatInlineMarkdown(text) {
  let html = text;
  // Bold (**text** or __text__)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic (*text* or _text_)
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');

  // Inline Code (`code`)
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  return html;
}

function formatMarkdown(text) {
  if (!text) return '';
  
  // Escape HTML to prevent XSS
  let safeText = escapeHTML(text);

  // Split into block elements by double newlines
  const blocks = safeText.split(/\n\n+/);
  const formattedBlocks = blocks.map(block => {
    block = block.trim();
    if (!block) return '';

    // Check if it's a bulleted list
    if (block.startsWith('- ') || block.startsWith('* ')) {
      const items = block.split(/\n/).map(line => {
        const match = line.match(/^[-*]\s+(.*)/);
        return match ? `<li style="list-style-type: disc; margin-bottom: 4px; line-height: 1.4;">${formatInlineMarkdown(match[1])}</li>` : `<li style="list-style-type: disc; margin-bottom: 4px; line-height: 1.4;">${formatInlineMarkdown(line)}</li>`;
      });
      return `<ul class="markdown-list" style="margin-left: var(--space-md); margin-top: 4px; margin-bottom: 8px; padding-left: 0;">${items.join('')}</ul>`;
    }

    // Check if it's a numbered list
    if (/^\d+\.\s+/.test(block)) {
      const items = block.split(/\n/).map(line => {
        const match = line.match(/^\d+\.\s+(.*)/);
        return match ? `<li style="list-style-type: decimal; margin-bottom: 4px; line-height: 1.4;">${formatInlineMarkdown(match[1])}</li>` : `<li style="list-style-type: decimal; margin-bottom: 4px; line-height: 1.4;">${formatInlineMarkdown(line)}</li>`;
      });
      return `<ol class="markdown-list" style="margin-left: var(--space-md); margin-top: 4px; margin-bottom: 8px; padding-left: 0;">${items.join('')}</ol>`;
    }

    // Otherwise, it is a paragraph
    // Replace single newlines inside paragraph with a <br>
    const paragraphContent = formatInlineMarkdown(block).replace(/\n/g, '<br>');
    return `<p style="margin-bottom: 8px; margin-top: 0; line-height: 1.5;">${paragraphContent}</p>`;
  });

  return formattedBlocks.filter(b => b).join('');
}

function appendMessageToDOM(msg) {
  const div = document.createElement('div');
  div.className = `message ${msg.role}`;

  const avatar = msg.role === 'user' ? '👤' : '🧠';
  let sourcesHTML = '';

  if (msg.sources && msg.sources.length > 0) {
    sourcesHTML = `
      <div class="message-sources">
        ${msg.sources.map((s, i) => {
          const isWeb = s.type === 'web';
          const icon = isWeb ? '🌐' : '📎';
          const chipClass = isWeb ? 'source-chip web' : 'source-chip';
          const title = isWeb ? 'Web Source' : `Source ${i + 1}`;
          const urlHtml = isWeb && s.metadata?.url ? 
            `<div style="margin-top: 6px; word-break: break-all; font-family: var(--font-mono); color: inherit;"><a href="${s.metadata.url}" target="_blank" style="color: inherit;">${s.metadata.url}</a></div>` : '';
          
          return `
          <span class="${chipClass}">
            ${icon} ${title}
            <div class="source-tooltip">
              ${s.text}
              ${urlHtml}
              ${!isWeb ? `<div class="source-tooltip-score">Relevance: ${(s.score * 100).toFixed(1)}%</div>` : ''}
            </div>
          </span>
          `;
        }).join('')}
      </div>
    `;
  }

  const renderedContent = msg.role === 'assistant' ? formatMarkdown(msg.content) : escapeHTML(msg.content);
  div.innerHTML = `<div class="message-avatar">${avatar}</div><div class="message-content">${renderedContent}${sourcesHTML}</div>`;

  $emptyState.style.display = 'none';
  $chatMessages.appendChild(div);
}

function showLoadingMessage() {
  const div = document.createElement('div');
  div.className = 'message assistant loading';
  div.id = 'loading-message';

  div.innerHTML = `
    <div class="message-avatar">🧠</div>
    <div class="message-content">
      <div class="thinking-dots">
        <span></span><span></span><span></span>
      </div>
      <span class="thinking-text">Searching knowledge base...</span>
    </div>
  `;

  $chatMessages.appendChild(div);
  scrollToBottom();
}

function removeLoadingMessage() {
  const loading = document.getElementById('loading-message');
  if (loading) loading.remove();
}

async function sendMessage() {
  const message = $chatInput.value.trim();
  if (!message || state.isLoading) return;

  if (!state.activeCollection && !state.activeChatId) {
    alert('Please select a collection or a chat first');
    return;
  }

  // If no chat session is active, auto-create one for the active collection
  if (!state.activeChatId) {
    try {
      const newChat = await api('/chats', {
        method: 'POST',
        body: JSON.stringify({ collection: state.activeCollection })
      });
      state.activeChatId = newChat.id;
      await loadChats();
      switchTab('chats');
    } catch (err) {
      alert('Failed to start chat: ' + err.message);
      return;
    }
  }

  // Add user message
  const userMsg = { role: 'user', content: message };
  state.messages.push(userMsg);
  appendMessageToDOM(userMsg);
  
  // Clear input
  $chatInput.value = '';
  $sendBtn.disabled = true;
  autoResizeTextarea();

  // Show loading
  state.isLoading = true;
  showLoadingMessage();
  scrollToBottom();

  const currentChatId = state.activeChatId;

  try {
    const response = await fetch(`/api/chats/${state.activeChatId}/message?stream=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        online_mode: $onlineModeToggle ? $onlineModeToggle.checked : false,
      }),
    });

    // If user switched chats while the fetch was pending, discard response
    if (state.activeChatId !== currentChatId) return;

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Failed to generate response.');
    }

    removeLoadingMessage();

    // Setup an empty AI response bubble
    const aiMsg = {
      role: 'assistant',
      content: '',
      sources: []
    };

    const $msgDiv = document.createElement('div');
    $msgDiv.className = 'message assistant';
    $msgDiv.innerHTML = `<div class="message-avatar">🧠</div><div class="message-content"><div class="assistant-status-text" style="color: var(--text-muted); font-style: italic; font-size: 12.5px; margin-bottom: 8px; display: none; align-items: center; gap: 8px;"></div><div class="assistant-answer-text" style="white-space: normal;"></div><div class="message-sources" style="margin-top: var(--space-sm); display: flex; flex-wrap: wrap; gap: var(--space-xs);"></div></div>`;

    $emptyState.style.display = 'none';
    $chatMessages.appendChild($msgDiv);
    scrollToBottom();

    const $textDiv = $msgDiv.querySelector('.assistant-answer-text');
    const $sourcesDiv = $msgDiv.querySelector('.message-sources');
    const $statusDiv = $msgDiv.querySelector('.assistant-status-text');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      // If user switched chats while streaming, cancel the reader and exit
      if (state.activeChatId !== currentChatId) {
        reader.cancel();
        break;
      }

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Hold onto incomplete lines

      for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned) continue;
        if (cleaned.startsWith('data: ')) {
          try {
            const data = JSON.parse(cleaned.slice(6));
            if (data.type === 'sources') {
              aiMsg.sources = data.sources;
              if (data.sources && data.sources.length > 0) {
                $sourcesDiv.innerHTML = data.sources.map((s, i) => {
                  const isWeb = s.type === 'web';
                  const icon = isWeb ? '🌐' : '📎';
                  const chipClass = isWeb ? 'source-chip web' : 'source-chip';
                  const title = isWeb ? 'Web Source' : `Source ${i + 1}`;
                  const urlHtml = isWeb && s.metadata?.url ? 
                    `<div style="margin-top: 6px; word-break: break-all; font-family: var(--font-mono); color: inherit;"><a href="${s.metadata.url}" target="_blank" style="color: inherit;">${s.metadata.url}</a></div>` : '';
                  
                  return `
                  <span class="${chipClass}">
                    ${icon} ${title}
                    <div class="source-tooltip">
                      ${s.text}
                      ${urlHtml}
                      ${!isWeb ? `<div class="source-tooltip-score">Relevance: ${(s.score * 100).toFixed(1)}%</div>` : ''}
                    </div>
                  </span>
                  `;
                }).join('');
              }
            } else if (data.type === 'clear') {
              aiMsg.content = '';
              $textDiv.innerHTML = '';
              $sourcesDiv.innerHTML = '';
              if ($statusDiv) {
                $statusDiv.innerHTML = '';
                $statusDiv.style.display = 'none';
              }
            } else if (data.type === 'status') {
              if ($statusDiv) {
                $statusDiv.innerHTML = `<div class="thinking-text" style="display: flex; align-items: center; gap: 8px;">
                  <div class="spinner-small" style="width: 12px; height: 12px; border: 2px solid var(--border-subtle); border-top-color: var(--accent-color); border-radius: 50%; animation: spin 1s linear infinite; flex-shrink: 0;"></div>
                  <span>${data.status}</span>
                </div>`;
                $statusDiv.style.display = 'flex';
              }
              scrollToBottom();
            } else if (data.type === 'token') {
              aiMsg.content += data.token;
              $textDiv.innerHTML = formatMarkdown(aiMsg.content);
              scrollToBottom();
            } else if (data.type === 'done') {
              if ($statusDiv) {
                $statusDiv.innerHTML = '';
                $statusDiv.style.display = 'none';
              }
              const chat = state.chats.find(c => c.id === state.activeChatId);
              if (chat && chat.title !== data.chat_title) {
                chat.title = data.chat_title;
                renderChats();
                updateChatHeader();
              }
            } else if (data.type === 'error') {
              throw new Error(data.message);
            }
          } catch (err) {
            console.error('Error parsing token stream chunk:', err);
          }
        }
      }
    }

    if (state.activeChatId === currentChatId) {
      state.messages.push(aiMsg);
    }

  } catch (err) {
    if (state.activeChatId !== currentChatId) return;
    removeLoadingMessage();
    const errorMsg = {
      role: 'assistant',
      content: `Error: ${err.message}. Please try again.`,
      sources: [],
    };
    state.messages.push(errorMsg);
    appendMessageToDOM(errorMsg);
  }

  state.isLoading = false;
  scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    $chatMessages.scrollTop = $chatMessages.scrollHeight;
  });
}

// ════════════════════════════════════════════════════════
// CHAT SESSION MANAGEMENT (API HELPERS)
// ════════════════════════════════════════════════════════

async function switchTab(tab) {
  if (tab === 'collections') {
    $tabCollections.classList.add('active');
    $tabChats.classList.remove('active');
    $viewCollections.classList.remove('hidden');
    $viewChats.classList.add('hidden');
  } else {
    $tabCollections.classList.remove('active');
    $tabChats.classList.add('active');
    $viewCollections.classList.add('hidden');
    $viewChats.classList.remove('hidden');
    await loadChats();
    if (!state.activeChatId && state.chats.length > 0) {
      await selectChat(state.chats[0].id);
    }
  }
}

async function loadChats() {
  try {
    state.chats = await api('/chats');
    renderChats();
  } catch (err) {
    console.error('Failed to load chats:', err);
  }
}

function renderChats() {
  $chatsList.innerHTML = '';
  if (state.chats.length === 0) {
    $chatsList.innerHTML = `
      <div style="padding: 12px 16px; color: var(--text-muted); font-size: 12px; text-align: center;">
        No chats yet.<br>Click "+ New Chat" to start!
      </div>
    `;
    return;
  }
  state.chats.forEach(chat => {
    const col = state.collections.find(c => c.safe_name === chat.collection);
    const colColor = col ? col.color : 'var(--text-muted)';
    const colName = col ? col.name : 'Unknown Collection';
    
    const item = document.createElement('div');
    item.className = `chat-item ${chat.id === state.activeChatId ? 'active' : ''}`;
    item.dataset.id = chat.id;
    item.title = chat.title;
    
    item.innerHTML = `
      <div class="chat-item-icon">💬</div>
      <div class="chat-item-info">
        <div class="chat-item-title">${chat.title}</div>
        <div class="chat-item-meta">
          <span class="collection-dot" style="background: ${colColor}; box-shadow: none; width: 6px; height: 6px; display: inline-block; margin-right: 4px;"></span>
          ${colName}
        </div>
      </div>
      <div class="chat-item-actions">
        <button class="chat-action-btn rename-chat" title="Rename Chat">✏️</button>
        <button class="chat-action-btn delete-chat delete" title="Delete Chat">🗑️</button>
      </div>
    `;
    
    item.addEventListener('click', (e) => {
      if (e.target.closest('.chat-action-btn')) return;
      selectChat(chat.id);
    });
    
    item.querySelector('.rename-chat').addEventListener('click', (e) => {
      e.stopPropagation();
      const newTitle = prompt('Enter new chat title:', chat.title);
      if (newTitle && newTitle.trim()) {
        renameChat(chat.id, newTitle.trim());
      }
    });
    
    item.querySelector('.delete-chat').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Are you sure you want to delete this chat session?')) {
        deleteChat(chat.id);
      }
    });
    
    $chatsList.appendChild(item);
  });
}

async function selectChat(chatId) {
  state.activeChatId = chatId;
  try {
    const chatDetails = await api(`/chats/${chatId}`);
    state.messages = chatDetails.messages || [];
    state.activeCollection = chatDetails.collection;
    
    renderChats();
    updateChatHeader();
    updateAccentColor();
    renderChat();
    
    $chatInput.disabled = false;
    $chatInput.placeholder = "Ask a question about your documents...";
    
    await loadCollectionDetails(state.activeCollection);
    resetIngestButton();
    pollIngestionStatus(state.activeCollection);
    
  } catch (err) {
    console.error('Failed to load chat details:', err);
  }
}

async function createNewChat(collectionName) {
  const collection = collectionName || state.activeCollection;
  if (!collection) {
    if (state.collections.length > 0) {
      const defaultCol = state.collections[0].safe_name;
      await selectCollection(defaultCol);
      await createNewChat(defaultCol);
      return;
    }
    alert('Please create a collection first.');
    return;
  }
  
  try {
    const newChat = await api('/chats', {
      method: 'POST',
      body: JSON.stringify({ collection })
    });
    
    state.activeChatId = newChat.id;
    await loadChats();
    await selectChat(newChat.id);
    switchTab('chats');
  } catch (err) {
    alert('Failed to create new chat: ' + err.message);
  }
}

async function renameChat(chatId, newTitle) {
  try {
    await api(`/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: newTitle })
    });
    await loadChats();
    if (state.activeChatId === chatId) {
      updateChatHeader();
    }
  } catch (err) {
    alert('Failed to rename chat: ' + err.message);
  }
}

async function deleteChat(chatId) {
  try {
    await api(`/chats/${chatId}`, {
      method: 'DELETE'
    });
    
    if (state.activeChatId === chatId) {
      state.activeChatId = null;
      state.messages = [];
      renderChat();
    }
    await loadChats();
    if (state.chats.length > 0) {
      await selectChat(state.chats[0].id);
    } else {
      updateChatHeader();
    }
  } catch (err) {
    alert('Failed to delete chat: ' + err.message);
  }
}

// ════════════════════════════════════════════════════════
// INPUT HANDLING
// ════════════════════════════════════════════════════════

function autoResizeTextarea() {
  $chatInput.style.height = 'auto';
  $chatInput.style.height = Math.min($chatInput.scrollHeight, 120) + 'px';
}

$chatInput.addEventListener('input', () => {
  $sendBtn.disabled = !$chatInput.value.trim();
  autoResizeTextarea();
});

$chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ════════════════════════════════════════════════════════
// EDIT / DELETE COLLECTION
// ════════════════════════════════════════════════════════

function renderEditColorPresets() {
  $editColorPresets.innerHTML = COLOR_PRESETS.map(c => `
    <div class="color-preset ${c === $editCollectionColorInput.value ? 'selected' : ''}" 
         style="background: ${c};" 
         data-color="${c}">
    </div>
  `).join('');

  $editColorPresets.querySelectorAll('.color-preset').forEach(el => {
    el.addEventListener('click', () => {
      $editCollectionColorInput.value = el.dataset.color;
      renderEditColorPresets();
    });
  });
}

function openEditModal() {
  const col = state.collections.find(c => c.safe_name === state.activeCollection);
  if (!col) return;
  $editCollectionNameInput.value = col.name;
  $editCollectionDescInput.value = col.description || '';
  $editCollectionColorInput.value = col.color || '#6366f1';
  
  renderEditColorPresets();

  $editModal.classList.add('visible');
}

function closeEditModal() {
  $editModal.classList.remove('visible');
}

async function saveEditCollection() {
  const color = $editCollectionColorInput.value;
  const description = $editCollectionDescInput.value;

  try {
    $editModalSaveBtn.disabled = true;
    $editModalSaveBtn.textContent = 'Saving...';
    await api(`/collections/${state.activeCollection}`, {
      method: 'PATCH',
      body: JSON.stringify({ color, description })
    });
    await loadCollections(); // Re-render the sidebar
    updateChatHeader(); // Re-render the header
    updateAccentColor(); // Re-render accent color
    closeEditModal();
  } catch (err) {
    alert("Failed to update collection: " + err.message);
  } finally {
    $editModalSaveBtn.disabled = false;
    $editModalSaveBtn.textContent = 'Save Changes';
  }
}

async function deleteCollection() {
  try {
    await api(`/collections/${state.activeCollection}`, {
      method: 'DELETE'
    });
    
    // Delete any chats associated with this collection
    const chatsToDelete = state.chats.filter(c => c.collection === state.activeCollection);
    for (const chat of chatsToDelete) {
      try {
        await api(`/chats/${chat.id}`, { method: 'DELETE' });
      } catch (e) {
        console.error(e);
      }
    }
    
    state.activeCollection = null;
    state.activeChatId = null;
    state.messages = [];
    
    await loadCollections();
    await loadChats();
    if (state.collections.length > 0) {
      await selectCollection(state.collections[0].safe_name);
    } else {
      renderCollections();
      updateChatHeader();
      renderChat();
    }
  } catch (err) {
    alert("Failed to delete collection: " + err.message);
  }
}

// ════════════════════════════════════════════════════════
// EVENT LISTENERS
// ════════════════════════════════════════════════════════

const $sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const $sidebar = document.getElementById('sidebar');

$sendBtn.addEventListener('click', sendMessage);
$addCollectionBtn.addEventListener('click', openCreateModal);
$modalCancelBtn.addEventListener('click', closeCreateModal);
$modalCreateBtn.addEventListener('click', createCollection);
$uploadBtn.addEventListener('click', triggerFileUpload);
$attachBtn.addEventListener('click', triggerFileUpload);
$ingestBtn.addEventListener('click', openIndexingModal);
$indexingCancelBtn.addEventListener('click', closeIndexingModal);
$indexingStartBtn.addEventListener('click', startIngestion);

// Tabs listeners
if ($tabCollections) $tabCollections.addEventListener('click', () => switchTab('collections'));
if ($tabChats) $tabChats.addEventListener('click', () => switchTab('chats'));

// Chats buttons listeners
if ($addChatBtn) $addChatBtn.addEventListener('click', () => createNewChat());

if ($sidebarToggleBtn) {
  $sidebarToggleBtn.addEventListener('click', () => {
    $sidebar.classList.toggle('collapsed');
  });
}

if ($settingsBtn) $settingsBtn.addEventListener('click', openSettingsModal);
if ($settingsCancelBtn) $settingsCancelBtn.addEventListener('click', closeSettingsModal);
if ($settingsSaveBtn) $settingsSaveBtn.addEventListener('click', saveSettings);

$fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  for (const file of files) {
    await handleFileUpload(file);
  }
  e.target.value = ''; // Reset
});

$collectionColorInput.addEventListener('input', renderColorPresets);
$editCollectionColorInput.addEventListener('input', renderEditColorPresets);

if ($collectionDescInput) {
  $collectionDescInput.addEventListener('input', () => {
    $collectionDescInput.style.height = 'auto';
    $collectionDescInput.style.height = Math.min($collectionDescInput.scrollHeight, 150) + 'px';
  });
}

if ($onlineModeToggle) {
  $onlineModeToggle.addEventListener('change', (e) => {
    // The visual state of the toggle is enough feedback
  });
}

// Close modal on backdrop click
$createModal.addEventListener('click', (e) => {
  if (e.target === $createModal) closeCreateModal();
});
$settingsModal.addEventListener('click', (e) => {
  if (e.target === $settingsModal) closeSettingsModal();
});
$indexingModal.addEventListener('click', (e) => {
  if (e.target === $indexingModal) closeIndexingModal();
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeCreateModal();
});

// Enter key in modal creates collection
$collectionNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createCollection();
});



$editModalCancelBtn.addEventListener('click', closeEditModal);
$editModalSaveBtn.addEventListener('click', saveEditCollection);
if ($editModalDeleteBtn) {
  $editModalDeleteBtn.addEventListener('click', () => {
    const col = state.collections.find(c => c.safe_name === state.activeCollection);
    const colName = col ? col.name : 'this collection';
    if (confirm(`Are you sure you want to completely delete the collection "${colName}"? This cannot be undone.`)) {
      closeEditModal();
      deleteCollection();
    }
  });
}
$editModal.addEventListener('click', (e) => {
  if (e.target === $editModal) closeEditModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeEditModal();
});

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════

async function init() {
  // Load Theme
  const savedTheme = localStorage.getItem('silo_theme') || 'dark';
  if (savedTheme === 'light') {
    document.documentElement.classList.add('theme-light');
    if ($themeSelect) $themeSelect.value = 'light';
  } else {
    document.documentElement.classList.remove('theme-light');
    if ($themeSelect) $themeSelect.value = 'dark';
  }

  await loadModelsAndSettings();
  await loadCollections();
  await loadChats();

  // Auto-restore the last active session
  if (state.chats.length > 0) {
    await selectChat(state.chats[0].id);
    switchTab('chats');
  } else if (state.collections.length > 0) {
    await selectCollection(state.collections[0].safe_name);
    switchTab('collections');
  } else {
    switchTab('collections');
  }
}

init();
