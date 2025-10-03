/*
   SAVETAB.JS - Save Tab functionality for TaskEx Chrome Extension
   This module handles all Save Tab feature logic including UI interactions,
   tab saving, group management, and display of saved tabs
*/

// =============================================================================
// SAVE TAB MODULE - Main functionality
// =============================================================================

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
        this.updateGroupSelector = this.updateGroupSelector.bind(this);
    }

    /**
     * Initialize the Save Tab manager
     */
    async init() {
        console.log('Initializing Save Tab manager...');
        
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
        const cancelSaveTabBtn = document.getElementById('cancel-save-tab-btn');
        if (cancelSaveTabBtn) {
            cancelSaveTabBtn.addEventListener('click', this.handleCancelSaveTab);
        }

        // Save tab form submission
        const saveTabForm = document.getElementById('save-tab-form-element');
        if (saveTabForm) {
            saveTabForm.addEventListener('submit', this.handleSaveTabFormSubmit);
        }

        // Group selector change
        const groupSelector = document.getElementById('saved-tab-group');
        if (groupSelector) {
            groupSelector.addEventListener('change', this.handleGroupSelectorChange);
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
    }

    /**
     * Show the save tab form and populate with current tab data
     */
    async showSaveTabForm() {
        if (!this.currentTab) {
            showError('Could not get current tab information');
            return;
        }

        // Populate form with current tab data
        const urlInput = document.getElementById('saved-tab-url');
        const titleInput = document.getElementById('saved-tab-title');
        const noteInput = document.getElementById('saved-tab-note');

        if (urlInput) urlInput.value = this.currentTab.url;
        if (titleInput) titleInput.value = this.currentTab.title || '';
        if (noteInput) noteInput.value = '';

        // Update group selector
        await this.updateGroupSelector();

        // Show the form
        const saveTabForm = document.getElementById('save-tab-form');
        if (saveTabForm) {
            saveTabForm.style.display = 'block';
            this.isFormVisible = true;
            
            // Focus on title input
            if (titleInput) titleInput.focus();
        }
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
        
        const titleInput = document.getElementById('saved-tab-title');
        const noteInput = document.getElementById('saved-tab-note');
        const groupSelector = document.getElementById('saved-tab-group');
        const newGroupInput = document.getElementById('new-group-name');

        if (!titleInput || !groupSelector) {
            showError('Form elements not found');
            return;
        }

        const title = titleInput.value.trim();
        const note = noteInput ? noteInput.value.trim() : '';
        let group = groupSelector.value.trim();

        // Validate required fields
        if (!title) {
            showError('Title is required');
            return;
        }

        if (!group) {
            showError('Please select or create a group');
            return;
        }

        // Handle new group creation
        if (group === 'new' && newGroupInput) {
            group = newGroupInput.value.trim();
            if (!group) {
                showError('Please enter a group name');
                return;
            }
        }

        try {
            // Save the tab
            const tabData = {
                title,
                url: this.currentTab.url,
                note,
                group
            };

            await saveTab(tabData);
            
            // Hide form and refresh display
            this.hideSaveTabForm();
            await this.loadSavedTabs();
            
            showStatus('Tab saved successfully!', 'success');
            
        } catch (error) {
            console.error('Error saving tab:', error);
            showError('Failed to save tab: ' + error.message);
        }
    }

    /**
     * Handle cancel save tab
     */
    handleCancelSaveTab() {
        this.hideSaveTabForm();
    }

    /**
     * Handle group selector change
     */
    handleGroupSelectorChange(event) {
        const groupSelector = event.target;
        const newGroupInput = document.getElementById('new-group-name');
        
        if (groupSelector.value === 'new' && newGroupInput) {
            newGroupInput.style.display = 'block';
            newGroupInput.focus();
        } else if (newGroupInput) {
            newGroupInput.style.display = 'none';
            newGroupInput.value = '';
        }
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
            this.savedTabs = await getSavedTabs();
            await this.renderSavedTabs();
        } catch (error) {
            console.error('Error loading saved tabs:', error);
            showError('Failed to load saved tabs');
        }
    }

    /**
     * Render saved tabs in the UI
     */
    async renderSavedTabs() {
        const container = document.getElementById('saved-tabs-list');
        const noTabsMessage = document.getElementById('no-saved-tabs-message');
        
        if (!container) return;

        // Clear container
        container.innerHTML = '';

        const groups = Object.keys(this.savedTabs);
        
        if (groups.length === 0) {
            // Show no tabs message
            if (noTabsMessage) {
                noTabsMessage.style.display = 'block';
            }
            return;
        }

        // Hide no tabs message
        if (noTabsMessage) {
            noTabsMessage.style.display = 'none';
        }

        // Render each group
        groups.forEach(groupName => {
            const groupElement = this.createGroupElement(groupName, this.savedTabs[groupName]);
            container.appendChild(groupElement);
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
            <div class="tab-content" data-url="${tab.url}">
                <div class="tab-favicon">
                    <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=16" 
                         alt="" 
                         onerror="this.style.display='none'">
                </div>
                <div class="tab-info">
                    <div class="tab-title">${tab.title}</div>
                    ${tab.note ? `<div class="tab-note">${tab.note}</div>` : ''}
                    <div class="tab-url">${tab.url}</div>
                </div>
            </div>
            <div class="tab-actions">
                <button class="action-btn delete-btn" data-tab-id="${tab.id}" data-group="${groupName}" title="Delete">
                    🗑️
                </button>
            </div>
        `;
        
        // Add click handler for opening tab
        const tabContent = tabDiv.querySelector('.tab-content');
        tabContent.addEventListener('click', () => this.handleTabClick(tab.url));
        
        // Add delete handler
        const deleteBtn = tabDiv.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleDeleteTab(tab.id, groupName);
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
        showStatus('Tabs refreshed', 'success');
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
