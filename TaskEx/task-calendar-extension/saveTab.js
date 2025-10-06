/*
   SAVETAB.JS - Save Tab functionality for TaskEx Chrome Extension
   This module handles all Save Tab feature logic including UI interactions,
   tab saving, group management, and display of saved tabs
*/

// --- LinkHive storage keys (support both old and new) ---
const LH_ITEMS_KEYS = ['linkHiveItems', 'savedTabs']; // try both
const LH_GROUPS_KEY = 'linkHiveGroups';

// Returns an array of saved tabs, no matter how the data was previously stored.
async function getSavedTabsArray() {
  const data = await chrome.storage.local.get(LH_ITEMS_KEYS);
  let items = data.linkHiveItems ?? data.savedTabs ?? [];

  // If JSON string, parse
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  // If object map, convert to array
  if (items && typeof items === 'object' && !Array.isArray(items)) {
    items = Object.values(items);
  }
  // Final guard
  if (!Array.isArray(items)) items = [];

  // Normalize minimal fields so renderer never breaks
  return items.map(it => ({
    id: it.id || crypto.randomUUID?.() || String(Date.now()+Math.random()),
    title: it.title || '',
    url: it.url || '',
    note: it.note || it.notes || '',
    group: it.group || '',
    starred: !!it.starred
  }));
}

// Persist back in the new canonical key
async function setSavedTabsArray(arr) {
  await chrome.storage.local.set({ linkHiveItems: arr });
  // Optional: clean up the legacy key
  await chrome.storage.local.remove('savedTabs');
}

// One-time migration (safe to run every load)
async function migrateLinkHiveIfNeeded() {
  const arr = await getSavedTabsArray();
  await setSavedTabsArray(arr);
}

// =============================================================================
// SAVE TAB MODULE - Main functionality
// =============================================================================

let savedTabsCache = [];

class SaveTabManager {
    constructor() {
        this.currentTab = null;
        this.savedTabs = {};
        this.isFormVisible = false;
        
        // Bind methods to preserve context
        this.init = this.init.bind(this);
        this.showSaveTabForm = this.showSaveTabForm.bind(this);
        this.hideSaveTabForm = this.hideSaveTabForm.bind(this);
        this.handleSaveTabFormSubmit = this.handleSaveTabFormSubmit.bind(this);
        this.handleCancelSaveTab = this.handleCancelSaveTab.bind(this);
        this.loadSavedTabs = this.loadSavedTabs.bind(this);
        this.renderSavedTabs = this.renderSavedTabs.bind(this);
        this.handleTabClick = this.handleTabClick.bind(this);
        this.handleDeleteTab = this.handleDeleteTab.bind(this);
        this.handleClearAllTabs = this.handleClearAllTabs.bind(this);
        this.handleRefreshTabs = this.handleRefreshTabs.bind(this);
        this.handleUseCurrentUrl = this.handleUseCurrentUrl.bind(this);
        this.updateGroupSelector = this.updateGroupSelector.bind(this);
    }

    /**
     * Initialize the Save Tab manager
     */
    async init() {
        console.log('Initializing Save Tab manager...');
        
        // Run migration first
        await migrateLinkHiveIfNeeded();
        
        // Load starred tabs first
        if (typeof loadStarredSavedTabs === 'function') {
            loadStarredSavedTabs();
        }
        
        // Get current tab information
        await this.getCurrentTabInfo();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Load and display saved tabs
        await this.loadSavedTabs();
        
        console.log('Save Tab manager initialized');
    }

    /**
     * Get current tab information
     */
    async getCurrentTabInfo() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
                this.currentTab = tabs[0];
                console.log('Current tab:', this.currentTab.title, this.currentTab.url);
            }
        } catch (error) {
            console.error('Error getting current tab:', error);
        }
    }

    /**
     * Set up event listeners for Save Tab functionality
     */
    setupEventListeners() {
        // Save current tab button
        const saveCurrentTabBtn = document.getElementById('save-current-tab-btn');
        if (saveCurrentTabBtn) {
            saveCurrentTabBtn.addEventListener('click', this.showSaveTabForm);
        }

        // Cancel save tab button
        const cancelSaveTabBtn = document.getElementById('cancel-save-tab');
        if (cancelSaveTabBtn) {
            cancelSaveTabBtn.addEventListener('click', this.handleCancelSaveTab);
        }

        // Save tab form submission
        const saveTabForm = document.getElementById('save-tab-form-element');
        if (saveTabForm) {
            saveTabForm.addEventListener('submit', this.handleSaveTabFormSubmit);
        }

        // Refresh saved tabs button
        const refreshTabsBtn = document.getElementById('refresh-savedtabs-btn');
        if (refreshTabsBtn) {
            refreshTabsBtn.addEventListener('click', this.handleRefreshTabs);
        }

        // Clear all tabs button
        const clearAllTabsBtn = document.getElementById('clear-all-btn');
        if (clearAllTabsBtn) {
            clearAllTabsBtn.addEventListener('click', this.handleClearAllTabs);
        }

        // Use current URL button
        const useCurrentUrlBtn = document.getElementById('insert-current-tab-url');
        if (useCurrentUrlBtn) {
            useCurrentUrlBtn.addEventListener('click', this.handleUseCurrentUrl);
        }
    }

    /**
     * Show the save tab form and populate with current tab data
     */
    async showSaveTabForm() {
        if (typeof openSaveTabForm === 'function') {
            await openSaveTabForm();
        } else {
            // Fallback to old method
            await this.showSaveTabFormLegacy();
        }
    }

    /**
     * Legacy show save tab form method (fallback)
     */
    async showSaveTabFormLegacy() {
        // Clear the form first
        this.clearSaveTabForm();

        try {
            // Always get the current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                this.currentTab = tab;
                
                // Populate form with current tab data
                const urlInput = document.getElementById('saved-tab-url');
                const titleInput = document.getElementById('saved-tab-title');
                const noteInput = document.getElementById('saved-tab-note');

                if (urlInput) urlInput.value = tab.url || '';
                if (titleInput) titleInput.value = tab.title || '';
                if (noteInput) noteInput.value = '';
            } else {
                showError('Could not get current tab information');
                return;
            }
        } catch (err) {
            console.error('Could not fetch current tab info:', err);
            showError('Failed to get current tab information');
            return;
        }

        // Show the form
        const saveTabForm = document.getElementById('save-tab-form');
        if (saveTabForm) {
            saveTabForm.style.display = 'block';
            this.isFormVisible = true;
            
            // Load groups into the dropdown
            if (typeof loadGroupsIntoSelect === 'function') {
                await loadGroupsIntoSelect();
            }
            
            // Focus on title input
            const titleInput = document.getElementById('saved-tab-title');
            if (titleInput) titleInput.focus();
        }
    }

    /**
     * Clear the Save Current Tab form
     */
    clearSaveTabForm() {
        const titleEl = document.getElementById('saved-tab-title');
        const noteEl  = document.getElementById('saved-tab-note');
        const urlEl   = document.getElementById('saved-tab-url');
        const groupEl = document.getElementById('saved-tab-group');
        const newGroupInputEl = document.getElementById('new-group-name');
        
        if (titleEl) titleEl.value = '';
        if (noteEl)  noteEl.value  = '';
        if (urlEl)   urlEl.value   = '';
        if (groupEl) groupEl.value = '';
        if (newGroupInputEl) newGroupInputEl.value = '';
    }

    /**
     * Hide the save tab form
     */
    hideSaveTabForm() {
        const saveTabForm = document.getElementById('save-tab-form');
        if (saveTabForm) {
            saveTabForm.style.display = 'none';
            this.isFormVisible = false;
        }
    }

    /**
     * Handle save tab form submission
     */
    async handleSaveTabFormSubmit(event) {
        event.preventDefault();

        const idEl   = document.getElementById('editing-savedtab-id');
        const editingId = idEl ? idEl.value.trim() : '';
        const title = document.getElementById('saved-tab-title').value.trim();
        const note  = document.getElementById('saved-tab-note').value.trim();
        const url   = document.getElementById('saved-tab-url').value.trim();
        let group   = document.getElementById('saved-tab-group').value;

        if (!title) { 
            if (typeof showError === 'function') showError('Title is required'); 
            return; 
        }
        if (!url)   { 
            if (typeof showError === 'function') showError('URL is required'); 
            return; 
        }
        if (!group) group = 'General';

        // Ensure group container exists
        if (typeof createGroup === 'function') {
            createGroup(group);
        }

        try {
            const formData = {
                id: editingId || undefined,
                title,
                note,
                url,
                group
            };

            await saveOrUpdateSavedTab(formData);
            
            if (editingId) {
                if (typeof showStatus === 'function') showStatus('Link updated', 'success');
            } else {
                if (typeof showStatus === 'function') showStatus('Link saved', 'success');
            }
            
            // Clear form and hide
            this.clearSaveTabForm();
            this.hideSaveTabForm();
            
        } catch (error) {
            console.error('Error saving tab:', error);
            if (typeof showError === 'function') showError('Failed to save tab: ' + error.message);
        }
    }

    /**
     * Handle cancel save tab
     */
    handleCancelSaveTab() {
        this.clearSaveTabForm();
        this.hideSaveTabForm();
    }


    /**
     * Update group selector with current groups
     */
    async updateGroupSelector() {
        const groupSelector = document.getElementById('saved-tab-group');
        if (!groupSelector) return;

        try {
            const groups = await getTabGroups();
            
            // Clear existing options except the first one
            groupSelector.innerHTML = '<option value="">Select or create group...</option>';
            
            // Add existing groups
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group;
                option.textContent = group;
                groupSelector.appendChild(option);
            });
            
            // Add "Create new group" option
            const newOption = document.createElement('option');
            newOption.value = 'new';
            newOption.textContent = '+ Create new group';
            groupSelector.appendChild(newOption);
            
        } catch (error) {
            console.error('Error updating group selector:', error);
        }
    }

    /**
     * Load saved tabs from storage
     */
    async loadSavedTabs() {
        try {
            savedTabsCache = await getSavedTabsArray();   // <-- always an array now
            await this.renderSavedTabs();
        } catch (error) {
            console.error('Error loading saved tabs:', error);
            if (typeof showError === 'function') showError('Failed to load saved links');
        }
    }

    /**
     * Render saved tabs in the UI
     */
    async renderSavedTabs() {
        const list = document.getElementById('saved-tabs-list');
        if (!list) return;
        list.innerHTML = '';

        // Group by group name
        const grouped = savedTabsCache.reduce((acc, it) => {
            const key = (it.group || 'General').trim();
            (acc[key] ||= []).push(it);
            return acc;
        }, {});

        // Within each group: starred first, keep original order otherwise
        Object.entries(grouped).forEach(([groupName, items]) => {
            items.sort((a,b) => (b.starred === true) - (a.starred === true));

            // Use your existing group/card builder so visuals don't change.
            const groupEl = this.createGroupElement(groupName, items);
            list.appendChild(groupEl);
        });
    }

    /**
     * Create a group element with its tabs
     */
    createGroupElement(groupName, tabs) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'saved-tab-group';
        
        // Group header
        const groupHeader = document.createElement('div');
        groupHeader.className = 'group-header';
        groupHeader.innerHTML = `
            <h5 class="group-title">${groupName} (${tabs.length})</h5>
            <button class="group-toggle-btn" data-group="${groupName}">
                <span class="toggle-icon">▼</span>
            </button>
        `;
        
        // Group content (collapsible)
        const groupContent = document.createElement('div');
        groupContent.className = 'group-content';
        groupContent.style.display = 'block'; // Start expanded
        
        // Add tabs to group content
        tabs.forEach(tab => {
            const tabElement = this.createTabElement(tab, groupName);
            groupContent.appendChild(tabElement);
        });
        
        // Toggle functionality
        const toggleBtn = groupHeader.querySelector('.group-toggle-btn');
        toggleBtn.addEventListener('click', () => {
            const isVisible = groupContent.style.display !== 'none';
            groupContent.style.display = isVisible ? 'none' : 'block';
            const icon = toggleBtn.querySelector('.toggle-icon');
            icon.textContent = isVisible ? '▶' : '▼';
        });
        
        groupDiv.appendChild(groupHeader);
        groupDiv.appendChild(groupContent);
        
        return groupDiv;
    }

    /**
     * Create a tab element
     */
    createTabElement(tab, groupName) {
        const tabDiv = document.createElement('div');
        tabDiv.className = 'saved-tab-item';
        tabDiv.setAttribute('data-tab-id', tab.id);
        
        // Extract domain for favicon
        let domain = '';
        try {
            const url = new URL(tab.url);
            domain = url.hostname;
        } catch (error) {
            domain = 'unknown';
        }
        
        tabDiv.innerHTML = `
            <div class="saved-tab-content">
                <div class="saved-tab-title">${tab.title}</div>
                <a href="${tab.url}" target="_blank" rel="noopener noreferrer" class="saved-tab-url">
                    ${tab.url}
                </a>
            </div>
            <div class="tab-actions">
                <button class="action-btn edit-btn" title="Edit">✏️</button>
                <button class="action-btn delete-btn" title="Delete">🗑️</button>
                <button class="action-btn star-btn" title="Star">${tab.starred ? '⭐' : '☆'}</button>
            </div>
        `;
        
        // Add click handler for opening tab
        const tabContent = tabDiv.querySelector('.saved-tab-content');
        tabContent.addEventListener('click', () => this.handleTabClick(tab.url));
        
        // Add action button handlers
        const editBtn = tabDiv.querySelector('.edit-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onEditSavedTab(tab.id);
        });

        const deleteBtn = tabDiv.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await onDeleteSavedTab(tab.id);
        });

        const starBtn = tabDiv.querySelector('.star-btn');
        starBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await onToggleStar(tab.id);
        });
        
        return tabDiv;
    }

    /**
     * Handle tab click - open in new tab
     */
    async handleTabClick(url) {
        try {
            await chrome.tabs.create({ url });
            showStatus('Tab opened in new window', 'success');
        } catch (error) {
            console.error('Error opening tab:', error);
            showError('Failed to open tab');
        }
    }

    /**
     * Handle delete tab
     */
    async handleDeleteTab(tabId, groupName) {
        if (confirm('Are you sure you want to delete this saved tab?')) {
            try {
                await deleteSavedTab(groupName, tabId);
                await this.loadSavedTabs();
                showStatus('Tab deleted successfully', 'success');
            } catch (error) {
                console.error('Error deleting tab:', error);
                showError('Failed to delete tab');
            }
        }
    }

    /**
     * Handle clear all tabs
     */
    async handleClearAllTabs() {
        if (confirm('Are you sure you want to delete ALL saved tabs? This cannot be undone.')) {
            try {
                await clearAllSavedTabs();
                await this.loadSavedTabs();
                showStatus('All tabs cleared successfully', 'success');
            } catch (error) {
                console.error('Error clearing tabs:', error);
                showError('Failed to clear tabs');
            }
        }
    }

    /**
     * Handle refresh tabs
     */
    async handleRefreshTabs() {
        await this.loadSavedTabs();
        if (typeof showStatus === 'function') showStatus('Tabs refreshed', 'success');
    }

    /**
     * Handle use current URL button
     */
    async handleUseCurrentUrl() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url) {
                document.getElementById('saved-tab-url').value = tab.url;
                if (typeof showStatus === 'function') showStatus('Current page URL added', 'success');
            }
        } catch (err) {
            console.error('Could not fetch current tab URL:', err);
            if (typeof showError === 'function') showError('Failed to fetch current tab URL');
        }
    }

    /**
     * Get saved items from storage
     */
    async getItems() {
        try {
            const data = await chrome.storage.local.get(['savedTabs']);
            return data.savedTabs || [];
        } catch (error) {
            console.error('Error getting items:', error);
            return [];
        }
    }

    /**
     * Save items to storage
     */
    async saveItems(items) {
        try {
            await chrome.storage.local.set({ savedTabs: items });
        } catch (error) {
            console.error('Error saving items:', error);
            throw error;
        }
    }
}

// =============================================================================
// CACHE-BASED HANDLERS
// =============================================================================

function onEditSavedTab(id) {
    const item = savedTabsCache.find(it => it.id === id);
    if (!item) return;
    // Reuse the same form you use for "Save current tab", prefilled:
    if (typeof openSaveTabForm === 'function') {
        openSaveTabForm({
            id: item.id,
            title: item.title,
            note: item.note,
            url: item.url,
            group: item.group
        });
    }
}

async function onToggleStar(id) {
    const i = savedTabsCache.findIndex(it => it.id === id);
    if (i === -1) return;
    savedTabsCache[i].starred = !savedTabsCache[i].starred;
    await setSavedTabsArray(savedTabsCache);
    if (saveTabManager) {
        await saveTabManager.renderSavedTabs();
    }
}

async function onDeleteSavedTab(id) {
    savedTabsCache = savedTabsCache.filter(it => it.id !== id);
    await setSavedTabsArray(savedTabsCache);
    if (saveTabManager) {
        await saveTabManager.renderSavedTabs();
    }
}

async function saveOrUpdateSavedTab(formData) {
    const isUpdate = !!formData.id;
    if (isUpdate) {
        const idx = savedTabsCache.findIndex(it => it.id === formData.id);
        if (idx !== -1) {
            savedTabsCache[idx] = { ...savedTabsCache[idx], ...formData };
        }
    } else {
        savedTabsCache.push({ ...formData, id: crypto.randomUUID?.() || String(Date.now()+Math.random()), starred:false });
    }
    await setSavedTabsArray(savedTabsCache);
    if (saveTabManager) {
        await saveTabManager.renderSavedTabs();
    }
    if (typeof resetSaveTabForm === 'function') {
        resetSaveTabForm(); // keep fields blank after submit
    }
}

// =============================================================================
// GLOBAL SAVE TAB MANAGER INSTANCE
// =============================================================================

let saveTabManager = null;

/**
 * Initialize Save Tab functionality
 */
async function initSaveTab() {
    if (!saveTabManager) {
        saveTabManager = new SaveTabManager();
        await saveTabManager.init();
    }
}

/**
 * Get the Save Tab manager instance
 */
function getSaveTabManager() {
    return saveTabManager;
}

// =============================================================================
// EXPORT FUNCTIONS
// =============================================================================

window.initSaveTab = initSaveTab;
window.getSaveTabManager = getSaveTabManager;

console.log('Save Tab module loaded successfully');
