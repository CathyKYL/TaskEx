/*
   BACKGROUND.JS - Service Worker for TaskEx Chrome Extension
   This file handles Google OAuth authentication using chrome.identity.getAuthToken
   and manages communication between popup and Google APIs.
*/

// Initialize the extension
console.log('TaskEx background script loaded');

// Side panel behavior is configured in the main onInstalled listener below

// =============================================================================
// AUTHENTICATION FUNCTIONS - Handle Google OAuth using Chrome Identity API
// =============================================================================

/**
 * Get authentication token using Chrome's built-in OAuth flow
 * This is the CORRECT way to authenticate in Chrome extensions
 * @param {boolean} interactive - Whether to show login UI if needed
 * @returns {Promise<string|null>} - Access token or null if failed
 */
async function getToken(interactive = false) {
    return new Promise((resolve) => {
        console.log(`[Background] Getting auth token (interactive: ${interactive})...`);
        
        // Use Chrome's built-in OAuth flow - no custom URLs needed!
        chrome.identity.getAuthToken({ interactive }, (token) => {
            if (chrome.runtime.lastError) {
                console.warn('[Background] getAuthToken error:', chrome.runtime.lastError.message);
                resolve(null);
            } else if (token) {
                console.log('[Background] ✓ Token obtained successfully');
                resolve(token);
            } else {
                console.warn('[Background] ✗ No token received (user may have cancelled)');
                resolve(null);
            }
        });
    });
}

/**
 * Sign out user by revoking token and clearing cache
 * This removes the user's authentication completely
 */
async function signOut() {
    console.log('Signing out user...');
    
    // Get current token (non-interactive)
    const token = await getToken(false);
    if (!token) {
        console.log('No token to revoke');
        return;
    }
    
    try {
        // Revoke the token with Google
        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${encodeURIComponent(token)}`);
        console.log('Token revoked with Google');
    } catch (error) {
        console.warn('Error revoking token:', error);
    }
    
    // Remove cached token from Chrome
    chrome.identity.removeCachedAuthToken({ token }, () => {
        console.log('Cached token removed');
    });
}

/**
 * Check if user is currently authenticated
 * @returns {Promise<boolean>} - Whether user has valid token
 */
async function isAuthenticated() {
    const token = await getToken(false); // Non-interactive check
    return !!token;
}

// =============================================================================
// GOOGLE TASKS API FUNCTIONS - Interact with Google Tasks
// =============================================================================

/**
 * Get tasks from Google Tasks API
 * @returns {Promise<Array>} - Array of tasks
 */
async function getTasks() {
    console.log('Fetching tasks from Google Tasks API...');
    
    const token = await getToken(true); // Interactive if needed
    if (!token) {
        throw new Error('Authentication required');
    }
    
    const response = await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Tasks API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Fetched ${data.items?.length || 0} tasks`);
    return data.items || [];
}

/**
 * Create a new task in Google Tasks
 * @param {Object} taskData - Task data (title, notes, etc.)
 * @returns {Promise<Object>} - Created task
 */
async function createTask(taskData) {
    console.log('Creating new task:', taskData.title);
    
    const token = await getToken(true);
    if (!token) {
        throw new Error('Authentication required');
    }
    
    const response = await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(taskData)
    });
    
    if (!response.ok) {
        throw new Error(`Tasks API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Task created successfully:', data.id);
    return data;
}

/**
 * Update a task in Google Tasks
 * @param {string} taskId - ID of task to update
 * @param {Object} taskData - Updated task data
 * @returns {Promise<Object>} - Updated task
 */
async function updateTask(taskId, taskData) {
    console.log('Updating task:', taskId, taskData);
    
    const token = await getToken(true);
    if (!token) {
        throw new Error('Authentication required');
    }
    
    const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(taskData)
    });
    
    if (!response.ok) {
        throw new Error(`Tasks API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Task updated successfully:', data.id);
    return data;
}

/**
 * Delete a task from Google Tasks
 * @param {string} taskId - ID of task to delete
 */
async function deleteTask(taskId) {
    console.log('Deleting task:', taskId);
    
    const token = await getToken(true);
    if (!token) {
        throw new Error('Authentication required');
    }
    
    const response = await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Tasks API error: ${response.status} ${response.statusText}`);
    }
    
    console.log('Task deleted successfully');
}

// =============================================================================
// GOOGLE CALENDAR API FUNCTIONS - Interact with Google Calendar
// =============================================================================

/**
 * Get upcoming events from Google Calendar API
 * @param {number} maxResults - Maximum number of events to fetch
 * @returns {Promise<Array>} - Array of calendar events
 */
async function getCalendarEvents(maxResults = 10) {
    console.log('Fetching calendar events...');
    
    const token = await getToken(true);
    if (!token) {
        throw new Error('Authentication required');
    }
    
    const now = new Date().toISOString();
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', now);
    url.searchParams.set('maxResults', maxResults.toString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    
    const response = await fetch(url.toString(), {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Calendar API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Fetched ${data.items?.length || 0} calendar events`);
    return data.items || [];
}

/**
 * Create a new calendar event
 * @param {Object} eventData - Event data (summary, start, end, etc.)
 * @returns {Promise<Object>} - Created event
 */
async function createCalendarEvent(eventData) {
    console.log('Creating calendar event:', eventData.summary);
    
    const token = await getToken(true);
    if (!token) {
        throw new Error('Authentication required');
    }
    
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventData)
    });
    
    if (!response.ok) {
        throw new Error(`Calendar API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Calendar event created successfully:', data.id);
    return data;
}

// =============================================================================
// MESSAGE HANDLING - Communication with popup
// =============================================================================

/**
 * Handle messages from popup and other extension parts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message.action);
    
    // Handle different message types
    switch (message.action) {
        case 'checkAuth':
            handleCheckAuth(sendResponse);
            break;
            
        case 'authenticate':
            handleAuthenticate(sendResponse);
            break;
            
        case 'logout':
            handleLogout(sendResponse);
            break;
            
        case 'getTasks':
            handleGetTasks(sendResponse);
            break;
            
        case 'createTask':
            handleCreateTask(message.data, sendResponse);
            break;
            
        case 'updateTask':
            handleUpdateTask(message.data, sendResponse);
            break;
            
        case 'deleteTask':
            handleDeleteTask(message.data, sendResponse);
            break;
            
        case 'getEvents':
            handleGetEvents(sendResponse);
            break;
            
        case 'createEvent':
            handleCreateEvent(message.data, sendResponse);
            break;
            
        default:
            console.warn('Unknown message action:', message.action);
            sendResponse({ success: false, error: 'Unknown action' });
    }
    
    // Return true to indicate we'll send a response asynchronously
    return true;
});

// =============================================================================
// MESSAGE HANDLERS - Handle specific message types
// =============================================================================

async function handleCheckAuth(sendResponse) {
    try {
        console.log('[Background] Checking authentication status...');
        const authenticated = await isAuthenticated();
        console.log(`[Background] Auth status: ${authenticated ? 'authenticated' : 'not authenticated'}`);
        sendResponse({ success: true, authenticated });
    } catch (error) {
        console.error('[Background] Error checking auth:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleAuthenticate(sendResponse) {
    try {
        console.log('[Background] === Starting Interactive Authentication ===');
        const token = await getToken(true); // Interactive authentication
        
        if (token) {
            console.log('[Background] ✓ Authentication successful - token acquired');
            sendResponse({ success: true, authenticated: true });
        } else {
            console.warn('[Background] ✗ Authentication failed - no token received');
            sendResponse({ success: false, error: 'Authentication cancelled or failed' });
        }
    } catch (error) {
        console.error('[Background] ✗ Authentication error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleLogout(sendResponse) {
    try {
        console.log('[Background] === Starting Logout ===');
        await signOut();
        console.log('[Background] ✓ Logout successful');
        sendResponse({ success: true });
    } catch (error) {
        console.error('[Background] ✗ Logout error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleGetTasks(sendResponse) {
    try {
        console.log('[Background] Fetching tasks...');
        const tasks = await getTasks();
        console.log(`[Background] ✓ Fetched ${tasks.length} tasks`);
        sendResponse({ success: true, tasks });
    } catch (error) {
        console.error('[Background] ✗ Error fetching tasks:', error.message);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleCreateTask(data, sendResponse) {
    try {
        const task = await createTask(data);
        sendResponse({ success: true, task });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleUpdateTask(data, sendResponse) {
    try {
        const task = await updateTask(data.taskId, data.taskData);
        sendResponse({ success: true, task });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleDeleteTask(data, sendResponse) {
    try {
        await deleteTask(data.taskId);
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleGetEvents(sendResponse) {
    try {
        console.log('[Background] Fetching calendar events...');
        const events = await getCalendarEvents(50);
        console.log(`[Background] ✓ Fetched ${events.length} events`);
        sendResponse({ success: true, events });
    } catch (error) {
        console.error('[Background] ✗ Error fetching events:', error.message);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleCreateEvent(data, sendResponse) {
    try {
        const event = await createCalendarEvent(data);
        sendResponse({ success: true, event });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

// =============================================================================
// EXTENSION LIFECYCLE - Handle extension installation and startup
// =============================================================================

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener((details) => {
    console.log('TaskEx extension installed:', details.reason);
    
    if (details.reason === 'install') {
        console.log('Welcome to TaskEx! Ready for Google authentication.');
    }
    
    // Configure side panel behavior
    if (chrome.sidePanel) {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
        console.log('Side panel behavior configured');
    } else {
        console.log('Side panel API not available in this browser');
    }
    
    // Create context menu for Save Tab feature
    if (chrome.contextMenus) {
        chrome.contextMenus.create({
            id: 'saveTabToTaskEx',
            title: 'Save Tab to TaskEx',
            contexts: ['page']
        });
        console.log('Context menu created for Save Tab feature');
    } else {
        console.log('Context menu API not available in this browser');
    }
});

/**
 * Handle extension startup
 */
chrome.runtime.onStartup.addListener(() => {
    console.log('TaskEx extension started');
});

// =============================================================================
// CONTEXT MENU HANDLING - Save Tab feature
// =============================================================================

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'saveTabToTaskEx') {
        console.log('Save Tab context menu clicked for:', tab.title, tab.url);
        
        try {
            // Get existing groups to show in a simple prompt
            // For now, we'll use a simple prompt - in a full implementation,
            // this could open the side panel with the Save Tab form pre-filled
            
            const groups = await getTabGroupsFromStorage();
            let groupOptions = '';
            if (groups.length > 0) {
                groupOptions = '\n\nExisting groups:\n' + groups.map((group, index) => `${index + 1}. ${group}`).join('\n');
            }
            
            const groupName = prompt(
                `Save "${tab.title}" to TaskEx\n\nEnter group name:${groupOptions}\n\n(Leave empty to cancel)`,
                'General'
            );
            
            if (groupName && groupName.trim()) {
                // Save the tab
                const tabData = {
                    title: tab.title,
                    url: tab.url,
                    note: 'Saved via context menu',
                    group: groupName.trim()
                };
                
                await saveTabToStorage(tabData);
                console.log('Tab saved via context menu:', tabData);
                
                // Show notification
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'Icon/Icon32.png',
                    title: 'TaskEx',
                    message: `Tab saved to "${groupName}" group`
                });
            }
            
        } catch (error) {
            console.error('Error saving tab via context menu:', error);
        }
    }
});

/**
 * Get tab groups from storage (helper function for context menu)
 */
async function getTabGroupsFromStorage() {
    try {
        const result = await chrome.storage.local.get(['savedTabs']);
        const savedTabs = result.savedTabs || {};
        return Object.keys(savedTabs).sort();
    } catch (error) {
        console.error('Error getting tab groups:', error);
        return [];
    }
}

/**
 * Save tab to storage (helper function for context menu)
 */
async function saveTabToStorage(tabData) {
    try {
        const result = await chrome.storage.local.get(['savedTabs']);
        const savedTabs = result.savedTabs || {};
        const { title, url, note, group } = tabData;
        
        // Create group if it doesn't exist
        if (!savedTabs[group]) {
            savedTabs[group] = [];
        }
        
        // Add tab to group
        const tabEntry = {
            id: Date.now().toString(),
            title: title.trim(),
            url: url.trim(),
            note: note ? note.trim() : '',
            savedAt: new Date().toISOString()
        };
        
        savedTabs[group].push(tabEntry);
        
        // Save back to storage
        await chrome.storage.local.set({ savedTabs });
        
        return tabEntry;
    } catch (error) {
        console.error('Error saving tab to storage:', error);
        throw error;
    }
}

console.log('TaskEx background service worker loaded successfully!');
console.log('Using proper Chrome Identity API - no custom redirect URIs needed!');