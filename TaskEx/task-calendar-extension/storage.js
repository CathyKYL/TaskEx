/*
   STORAGE.JS - Shared storage logic for TaskEx Chrome Extension
   This module handles all chrome.storage.local operations for both tasks and saved tabs
   Provides a unified interface for data persistence
*/

// =============================================================================
// STORAGE KEYS - Centralized key management
// =============================================================================

const STORAGE_KEYS = {
    // TaskEx settings
    THEME: 'theme',
    TIME_FORMAT: 'timeFormat',
    STARRED_TASKS: 'starredTasks',
    
    // Save Tab feature
    SAVED_TABS: 'savedTabs',
    TAB_GROUPS: 'tabGroups'
};

// =============================================================================
// STORAGE UTILITIES - Generic storage operations
// =============================================================================

/**
 * Generic function to get data from Chrome storage
 * @param {string|Array|Object} keys - Key(s) to retrieve
 * @returns {Promise<Object>} - Retrieved data
 */
async function getStorageData(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (result) => {
            if (chrome.runtime.lastError) {
                console.error('Storage get error:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * Generic function to set data in Chrome storage
 * @param {Object} data - Data to store
 * @returns {Promise<void>}
 */
async function setStorageData(data) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(data, () => {
            if (chrome.runtime.lastError) {
                console.error('Storage set error:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
}

/**
 * Generic function to remove data from Chrome storage
 * @param {string|Array} keys - Key(s) to remove
 * @returns {Promise<void>}
 */
async function removeStorageData(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.remove(keys, () => {
            if (chrome.runtime.lastError) {
                console.error('Storage remove error:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
}

// =============================================================================
// SAVE TAB STORAGE FUNCTIONS - Specific to Save Tab feature
// =============================================================================

/**
 * Get all saved tabs from storage
 * @returns {Promise<Object>} - Saved tabs grouped by category
 */
async function getSavedTabs() {
    try {
        const result = await getStorageData(STORAGE_KEYS.SAVED_TABS);
        return result[STORAGE_KEYS.SAVED_TABS] || {};
    } catch (error) {
        console.error('Error getting saved tabs:', error);
        return {};
    }
}

/**
 * Save a tab to storage
 * @param {Object} tabData - Tab data to save
 * @param {string} tabData.title - Tab title
 * @param {string} tabData.url - Tab URL
 * @param {string} tabData.note - Optional note
 * @param {string} tabData.group - Group name
 * @returns {Promise<void>}
 */
async function saveTab(tabData) {
    try {
        const savedTabs = await getSavedTabs();
        const { title, url, note, group } = tabData;
        
        // Create group if it doesn't exist
        if (!savedTabs[group]) {
            savedTabs[group] = [];
        }
        
        // Add tab to group
        const tabEntry = {
            id: Date.now().toString(), // Simple ID generation
            title: title.trim(),
            url: url.trim(),
            note: note ? note.trim() : '',
            savedAt: new Date().toISOString()
        };
        
        savedTabs[group].push(tabEntry);
        
        // Save back to storage
        await setStorageData({ [STORAGE_KEYS.SAVED_TABS]: savedTabs });
        
        console.log('Tab saved successfully:', tabEntry);
        return tabEntry;
    } catch (error) {
        console.error('Error saving tab:', error);
        throw error;
    }
}

/**
 * Delete a saved tab
 * @param {string} groupName - Group name
 * @param {string} tabId - Tab ID to delete
 * @returns {Promise<void>}
 */
async function deleteSavedTab(groupName, tabId) {
    try {
        const savedTabs = await getSavedTabs();
        
        if (savedTabs[groupName]) {
            savedTabs[groupName] = savedTabs[groupName].filter(tab => tab.id !== tabId);
            
            // Remove group if empty
            if (savedTabs[groupName].length === 0) {
                delete savedTabs[groupName];
            }
            
            // Save back to storage
            await setStorageData({ [STORAGE_KEYS.SAVED_TABS]: savedTabs });
            
            console.log('Tab deleted successfully:', tabId);
        }
    } catch (error) {
        console.error('Error deleting tab:', error);
        throw error;
    }
}

/**
 * Clear all saved tabs
 * @returns {Promise<void>}
 */
async function clearAllSavedTabs() {
    try {
        await removeStorageData(STORAGE_KEYS.SAVED_TABS);
        console.log('All saved tabs cleared');
    } catch (error) {
        console.error('Error clearing saved tabs:', error);
        throw error;
    }
}

/**
 * Get all group names
 * @returns {Promise<Array<string>>} - Array of group names
 */
async function getTabGroups() {
    try {
        const savedTabs = await getSavedTabs();
        return Object.keys(savedTabs).sort();
    } catch (error) {
        console.error('Error getting tab groups:', error);
        return [];
    }
}

// =============================================================================
// TASKEX STORAGE FUNCTIONS - Specific to TaskEx features
// =============================================================================

/**
 * Get starred tasks
 * @returns {Promise<Set>} - Set of starred task IDs
 */
async function getStarredTasks() {
    try {
        const result = await getStorageData(STORAGE_KEYS.STARRED_TASKS);
        const starredArray = result[STORAGE_KEYS.STARRED_TASKS] || [];
        return new Set(starredArray);
    } catch (error) {
        console.error('Error getting starred tasks:', error);
        return new Set();
    }
}

/**
 * Save starred tasks
 * @param {Set} starredTasks - Set of starred task IDs
 * @returns {Promise<void>}
 */
async function saveStarredTasks(starredTasks) {
    try {
        const starredArray = Array.from(starredTasks);
        await setStorageData({ [STORAGE_KEYS.STARRED_TASKS]: starredArray });
        console.log('Starred tasks saved:', starredArray);
    } catch (error) {
        console.error('Error saving starred tasks:', error);
        throw error;
    }
}

/**
 * Get user settings (theme, time format)
 * @returns {Promise<Object>} - User settings
 */
async function getUserSettings() {
    try {
        const result = await getStorageData([STORAGE_KEYS.THEME, STORAGE_KEYS.TIME_FORMAT]);
        return {
            theme: result[STORAGE_KEYS.THEME] || 'light',
            timeFormat: result[STORAGE_KEYS.TIME_FORMAT] || '12h'
        };
    } catch (error) {
        console.error('Error getting user settings:', error);
        return { theme: 'light', timeFormat: '12h' };
    }
}

/**
 * Save user settings
 * @param {Object} settings - Settings to save
 * @param {string} settings.theme - Theme preference
 * @param {string} settings.timeFormat - Time format preference
 * @returns {Promise<void>}
 */
async function saveUserSettings(settings) {
    try {
        const dataToSave = {};
        if (settings.theme) dataToSave[STORAGE_KEYS.THEME] = settings.theme;
        if (settings.timeFormat) dataToSave[STORAGE_KEYS.TIME_FORMAT] = settings.timeFormat;
        
        await setStorageData(dataToSave);
        console.log('User settings saved:', dataToSave);
    } catch (error) {
        console.error('Error saving user settings:', error);
        throw error;
    }
}

// =============================================================================
// EXPORT FUNCTIONS - Make functions available to other modules
// =============================================================================

// Save Tab functions
window.getSavedTabs = getSavedTabs;
window.saveTab = saveTab;
window.deleteSavedTab = deleteSavedTab;
window.clearAllSavedTabs = clearAllSavedTabs;
window.getTabGroups = getTabGroups;

// TaskEx functions
window.getStarredTasks = getStarredTasks;
window.saveStarredTasks = saveStarredTasks;
window.getUserSettings = getUserSettings;
window.saveUserSettings = saveUserSettings;

// Generic storage functions
window.getStorageData = getStorageData;
window.setStorageData = setStorageData;
window.removeStorageData = removeStorageData;

console.log('Storage module loaded successfully');
