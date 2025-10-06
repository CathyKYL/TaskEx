/*
   SIDEPANEL.JS - TaskEx Chrome Extension Frontend
   This file handles the side panel interface and communicates with Google Tasks and Calendar APIs
   through the background service worker. Each function is explained in simple terms.
*/

// =============================================================================
// GLOBAL VARIABLES - Store important data used throughout the side panel
// =============================================================================

let isAuthenticated = false;      // Whether user is logged in to Google
let currentTasks = [];           // Array to store tasks from Google Tasks
let currentEvents = [];          // Array to store events from Google Calendar
let currentPageTitle = '';       // Title of the current webpage
let currentPageUrl = '';         // URL of the current webpage
let currentCalendarView = 'day'; // Current calendar view: 'day', 'week', or 'month'
let currentContentType = 'events'; // Current content type: 'events' or 'both'
let starredTasks = new Set();    // Set of starred task IDs (stored locally)
let starredSavedTabs = new Set(); // link IDs
const GROUPS_KEY = 'linkHiveGroups';

// Settings variables
let currentTheme = 'light';      // Current theme: 'light' or 'dark'
let timeFormat = '12h';          // Time format: '12h' or '24h'
// Interface mode removed - always using side panel

// =============================================================================
// INITIALIZATION - Code that runs when side panel opens
// =============================================================================

/**
 * Main initialization function - runs when side panel HTML is loaded
 * Sets up all the interactive elements and checks authentication
 */
document.addEventListener('DOMContentLoaded', function() {
    // Initialize LinkHive groups dropdown
    loadGroups();
    
    // Add URL button event listener
    document.getElementById('insert-current-tab-url')?.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const urlInput = document.getElementById('saved-tab-url');
        if (urlInput && tab?.url) {
            urlInput.value = tab.url;
            if (typeof showStatus === 'function') showStatus('Current page URL added', 'success');
        } else {
            if (typeof showError === 'function') showError('No current page URL available');
        }
    });

    // Wire up LinkHive Clear All button
    const clearAllBtn = document.getElementById('clear-all-btn');
    if (clearAllBtn && !clearAllBtn.__wired) {
        clearAllBtn.addEventListener('click', clearAllLinkHive);
        clearAllBtn.__wired = true;
    }
    console.log('TaskEx side panel loaded!');
    
    // Load user settings first (theme, time format)
    loadSettings();
    loadStarredTasks();
    
    // Set up all the interactive elements
    setupEventListeners();
    setupTabSwitching();
    setupSettingsHandlers();
    
    // Ensure To-Do tab is active by default after setup
    showTab('todo');
    
    // Check if user is logged in and load data
    checkAuthenticationStatus();
    
    // Get current page info for tab URL features
    getCurrentPageInfo();
});

// =============================================================================
// API HELPER FUNCTIONS - Centralized API request handling
// =============================================================================

/**
 * Centralized API request helper
 * Handles authentication, error handling, and response processing
 * @param {string} action - The action to perform ('getTasks', 'createTask', 'updateTask', 'deleteTask', 'getEvents', 'createEvent', 'updateEvent')
 * @param {Object} payload - The data to send with the request
 * @returns {Promise} - Promise that resolves with the response data
 */
async function apiRequest(action, payload = {}) {
    return new Promise((resolve, reject) => {
        // Get authentication token
        chrome.identity.getAuthToken({interactive: false}, (token) => {
            if (chrome.runtime.lastError || !token) {
                const error = new Error('Authentication required. Please log in to Google.');
                error.code = 'AUTH_REQUIRED';
                reject(error);
                return;
            }

            // Determine API endpoint and method based on action
            let url, method, body;
            
            switch (action) {
                case 'getTasks':
                    url = 'https://www.googleapis.com/tasks/v1/lists/@default/tasks';
                    method = 'GET';
                    break;
                    
                case 'createTask':
                    url = 'https://www.googleapis.com/tasks/v1/lists/@default/tasks';
                    method = 'POST';
                    body = JSON.stringify(payload);
                    break;
                    
                case 'updateTask':
                    url = `https://www.googleapis.com/tasks/v1/lists/@default/tasks/${payload.taskId}`;
                    method = 'PATCH';
                    body = JSON.stringify(payload.taskData);
                    break;
                    
                case 'deleteTask':
                    url = `https://www.googleapis.com/tasks/v1/lists/@default/tasks/${payload.taskId}`;
                    method = 'DELETE';
                    break;
                    
                case 'getEvents':
                    const now = new Date();
                    const maxTime = new Date();
                    maxTime.setMonth(maxTime.getMonth() + 3);
                    url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
                    url.searchParams.set('timeMin', now.toISOString());
                    url.searchParams.set('timeMax', maxTime.toISOString());
                    url.searchParams.set('singleEvents', 'true');
                    url.searchParams.set('orderBy', 'startTime');
                    url.searchParams.set('maxResults', '50');
                    method = 'GET';
                    break;
                    
                case 'createEvent':
                    url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
                    method = 'POST';
                    body = JSON.stringify(payload);
                    break;
                    
                case 'updateEvent':
                    url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${payload.eventId}`;
                    method = 'PATCH';
                    body = JSON.stringify(payload.eventData);
                    break;
                    
                default:
                    reject(new Error(`Unknown action: ${action}`));
                    return;
            }

            // Make the API request
            fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: body
            })
            .then(response => {
                if (!response.ok) {
                    let errorMessage;
                    if (response.status === 401) {
                        errorMessage = 'Your Google login has expired. Please log out and log back in.';
                    } else if (response.status === 403) {
                        errorMessage = 'Permission denied. Please check your Google permissions.';
                    } else if (response.status === 404) {
                        errorMessage = 'Resource not found. It may have been deleted.';
                    } else if (response.status === 429) {
                        errorMessage = 'Too many requests. Please wait a moment and try again.';
                    } else if (response.status >= 500) {
                        errorMessage = 'Google services are temporarily unavailable. Please try again later.';
                    } else {
                        errorMessage = `Request failed: ${response.status} ${response.statusText}`;
                    }
                    
                    const error = new Error(errorMessage);
                    error.status = response.status;
                    throw error;
                }
                
                // Handle DELETE requests (no content)
                if (method === 'DELETE') {
                    return { success: true };
                }
                
                return response.json();
            })
            .then(data => {
                resolve(data);
            })
            .catch(error => {
                reject(error);
            });
        });
    });
}

// =============================================================================
// AUTHENTICATION FUNCTIONS - Handle Google login/logout
// =============================================================================

/**
 * Check if user is authenticated with Google
 * Updates the UI to show login/logout buttons accordingly
 */
function checkAuthenticationStatus() {
    console.log('[Auth] === Checking Authentication Status ===');
    
    // Ask background script if user is authenticated
    chrome.runtime.sendMessage({action: 'checkAuth'}, (response) => {
        // Check for Chrome runtime errors first
        if (chrome.runtime.lastError) {
            console.error('[Auth] Chrome runtime error:', chrome.runtime.lastError);
            showError('Extension communication error. Please reload the extension.');
            return;
        }
        
        if (response && response.success) {
            isAuthenticated = response.authenticated;
            console.log(`[Auth] Authentication status: ${isAuthenticated ? '✓ Logged in' : '✗ Logged out'}`);
            
            updateAuthUI();
            
            if (isAuthenticated) {
                // User is logged in - load their data
                console.log('[Auth] Loading user data...');
                getTasks();
                getEvents();
                
                // Update footer authentication status
                updateFooterAuthStatus();
                
                // Ensure To-Do tab is visible and tasks are loaded
                showTab('todo');
            } else {
                // User is not logged in - show login prompt
                console.log('[Auth] User needs to log in');
                
                // Update footer authentication status
                updateFooterAuthStatus();
                
                showLoginPrompt();
            }
        } else {
            console.error('[Auth] Failed to check authentication:', response?.error);
            showError('Unable to verify login status. Please try again.');
            
            // Assume logged out on error
            isAuthenticated = false;
            updateFooterAuthStatus();
        }
    });
}

/**
 * Update the authentication UI based on login status
 * Shows/hides login and logout buttons in the footer
 */
function updateAuthUI() {
    // Update old Settings section (if exists)
    updateGoogleAccountUI(isAuthenticated);
    
    // Update footer authentication status
    updateFooterAuthStatus();
}

/**
 * Show a message prompting user to log in
 */
function showLoginPrompt() {
    console.log('[Auth] Showing login prompt...');
    
    const tasksList = document.getElementById('tasks-list');
    const eventsList = document.getElementById('events-list');
    
    // Check if elements exist before trying to modify them
    if (tasksList) {
        tasksList.innerHTML = '<div class="no-items"><p>Please log in to Google to see your tasks</p></div>';
        console.log('[Auth] Tasks list login prompt displayed');
    } else {
        console.warn('[Auth] tasks-list element not found');
    }
    
    if (eventsList) {
        eventsList.innerHTML = '<div class="no-items"><p>Please log in to Google to see your calendar events</p></div>';
        console.log('[Auth] Events list login prompt displayed');
    } else {
        console.warn('[Auth] events-list element not found');
    }
}

/**
 * Handle login button click - start Google authentication
 */
function handleLogin() {
    console.log('[Auth] === Starting Google Login Flow ===');
    showStatus('Logging in to Google...', 'info');
    
    // Ask background script to start authentication
    chrome.runtime.sendMessage({action: 'authenticate'}, (response) => {
        // Check for Chrome runtime errors first
        if (chrome.runtime.lastError) {
            console.error('[Auth] Chrome runtime error during login:', chrome.runtime.lastError);
            showError('Extension communication error. Please reload the extension and try again.');
            return;
        }
        
        if (response && response.success) {
            console.log('[Auth] ✓ Login successful! Token acquired.');
            showStatus('Login successful!', 'success');
            
            // Update authentication state
            isAuthenticated = true;
            
            // Update footer UI immediately
            updateFooterAuthStatus();
            
            // Load user data
            console.log('[Auth] Loading user tasks and events...');
            getTasks();
            getEvents();
            
            // Switch to todo tab to show tasks
            showTab('todo');
        } else {
            const errorMsg = response?.error || 'Unknown error';
            console.error('[Auth] ✗ Login failed:', errorMsg);
            
            // Show user-friendly error messages
            if (errorMsg.includes('User cancelled') || errorMsg.includes('canceled')) {
                showStatus('Login cancelled', 'warning');
            } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
                showError('Could not connect to Google. Please check your internet connection.');
            } else {
                showError('Unable to login to Google. Please try again.');
            }
            
            // Ensure footer shows logged out state
            isAuthenticated = false;
            updateFooterAuthStatus();
        }
    });
}

/**
 * Handle logout button click - remove Google authentication
 */
function handleLogout() {
    console.log('[Auth] === Starting Google Logout ===');
    showStatus('Logging out...', 'info');
    
    // Ask background script to logout
    chrome.runtime.sendMessage({action: 'logout'}, (response) => {
        // Check for Chrome runtime errors first
        if (chrome.runtime.lastError) {
            console.error('[Auth] Chrome runtime error during logout:', chrome.runtime.lastError);
            showError('Extension communication error. Please reload the extension and try again.');
            return;
        }
        
        if (response && response.success) {
            console.log('[Auth] ✓ Logout complete. Token revoked.');
            
            // Update authentication state
            isAuthenticated = false;
            
            // Update footer UI
            updateFooterAuthStatus();
            
            // Clear data
            currentTasks = [];
            currentEvents = [];
            
            // Show login prompts
            showLoginPrompt();
            
            // Clear the lists
            const tasksList = document.getElementById('tasks-list');
            const eventsList = document.getElementById('events-list');
            if (tasksList) tasksList.innerHTML = '';
            if (eventsList) eventsList.innerHTML = '';
            
            showStatus('Logged out successfully', 'success');
        } else {
            console.error('[Auth] ✗ Logout failed:', response?.error);
            showError('Unable to logout from Google. Please try again.');
        }
    });
}

// =============================================================================
// SETTINGS FUNCTIONS - Handle theme switching and user preferences
// =============================================================================

/**
 * Load user settings from Chrome storage
 * Applies saved theme and time format preferences
 */
function loadSettings() {
    console.log('Loading user settings...');
    
    // Load settings from Chrome storage
    chrome.storage.local.get(['theme', 'timeFormat'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Error loading settings:', chrome.runtime.lastError);
            showError('Unable to load settings. Some features may not work properly.');
            return;
        }
        
        // Apply theme (default to light)
        currentTheme = result.theme || 'light';
        applyTheme(currentTheme);
        
        // Apply time format (default to 12h)
        timeFormat = result.timeFormat || '12h';
        updateTimeFormatUI();
        
        console.log('Settings loaded:', { theme: currentTheme, timeFormat });
    });
}

// Interface mode functions removed - always using side panel

/**
 * Apply theme to the entire extension
 * Changes CSS classes and updates toggle UI
 * @param {string} theme - 'light' or 'dark'
 */
function applyTheme(theme) {
    console.log('Applying theme:', theme);
    
    // Update body class to trigger CSS theme variables
    document.body.className = `theme-${theme}`;
    currentTheme = theme;
    
    // Update theme toggle UI (old Settings tab - kept for backward compatibility)
    updateThemeToggleUI();
    
    // Update footer theme icon
    updateFooterThemeIcon();
    
    // Save theme preference
    chrome.storage.local.set({ theme: theme }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving theme:', chrome.runtime.lastError);
            showError('Unable to save theme preference. Please try again.');
        } else {
            console.log('Theme saved:', theme);
        }
    });
}

// Interface toggle UI function removed - always using side panel

/**
 * Update Google account UI (legacy function for old Settings tab)
 * @param {boolean} authenticated - Whether user is authenticated
 */
function updateGoogleAccountUI(authenticated) {
    // This function is kept for backward compatibility
    // The old Settings elements no longer exist, but we keep this to avoid breaking other code
    
    // Update footer authentication status instead
    updateFooterAuthStatus();
}

/**
 * Update the theme toggle buttons to show current selection
 */
function updateThemeToggleUI() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;
    
    // Remove active class from all theme options
    themeToggle.querySelectorAll('.toggle-option').forEach(option => {
        option.classList.remove('active');
    });
    
    // Add active class to current theme option
    const activeOption = themeToggle.querySelector(`[data-theme="${currentTheme}"]`);
    if (activeOption) {
        activeOption.classList.add('active');
    }
}

/**
 * Set time format preference
 * @param {string} format - '12h' or '24h'
 */
function setTimeFormat(format) {
    console.log('Setting time format:', format);
    
    timeFormat = format;
    updateTimeFormatUI();
    
    // Update footer time format label
    updateFooterTimeFormatLabel();
    
    // Save time format preference
    chrome.storage.local.set({ timeFormat: format }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving time format:', chrome.runtime.lastError);
            showError('Unable to save time format preference. Please try again.');
        } else {
            console.log('Time format saved:', format);
        }
    });
    
    // Refresh displayed events and tasks to use new time format
    if (currentEvents.length > 0) {
        renderEvents();
    }
}

/**
 * Update the time format toggle buttons to show current selection
 */
function updateTimeFormatUI() {
    const timeFormatToggle = document.getElementById('time-format-toggle');
    if (!timeFormatToggle) return;
    
    // Remove active class from all time format options
    timeFormatToggle.querySelectorAll('.toggle-option').forEach(option => {
        option.classList.remove('active');
    });
    
    // Add active class to current time format option
    const activeOption = timeFormatToggle.querySelector(`[data-format="${timeFormat}"]`);
    if (activeOption) {
        activeOption.classList.add('active');
    }
}


/**
 * Format time according to user's preference
 * @param {Date} date - Date object to format
 * @returns {string} - Formatted time string
 */
function formatTime(date) {
    if (!date || !(date instanceof Date)) {
        return 'Invalid date';
    }
    
    const options = {
        hour: '2-digit',
        minute: '2-digit'
    };
    
    // Add 12/24 hour format
    if (timeFormat === '12h') {
        options.hour12 = true;
    } else {
        options.hour12 = false;
    }
    
    return date.toLocaleTimeString('en-US', options);
}

/**
 * Format date and time according to user's preferences
 * @param {Date} date - Date object to format
 * @returns {string} - Formatted date and time string
 */
function formatDateTime(date) {
    if (!date || !(date instanceof Date)) {
        return 'Invalid date';
    }
    
    const dateStr = date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    
    const timeStr = formatTime(date);
    
    return `${dateStr} at ${timeStr}`;
}

/**
 * Set up event handlers for footer settings controls
 */
function setupSettingsHandlers() {
    console.log('Setting up footer settings handlers...');
    
    // Theme toggle button in footer
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            // Toggle between light and dark theme
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
            showStatus(`Switched to ${newTheme} theme`, 'success');
        });
    }
    
    // Time format toggle button in footer
    const timeFormatBtn = document.getElementById('time-format-btn');
    if (timeFormatBtn) {
        timeFormatBtn.addEventListener('click', () => {
            // Toggle between 12h and 24h format
            const newFormat = timeFormat === '12h' ? '24h' : '12h';
            setTimeFormat(newFormat);
            showStatus(`Time format set to ${newFormat.toUpperCase()}`, 'success');
        });
    }
    
    // Google auth toggle button in footer
    const authToggleBtn = document.getElementById('auth-toggle-btn');
    if (authToggleBtn) {
        authToggleBtn.addEventListener('click', () => {
            if (isAuthenticated) {
                // User is logged in - perform logout
                handleLogout();
            } else {
                // User is logged out - perform login
                handleLogin();
            }
        });
    }
    
    // Initialize footer UI based on current authentication status
    updateFooterAuthStatus();
    updateFooterThemeIcon();
    updateFooterTimeFormatLabel();
}

/**
 * Update footer authentication status indicator and button label
 */
function updateFooterAuthStatus() {
    const authDot = document.getElementById('auth-status-dot');
    const authBtnLabel = document.getElementById('auth-btn-label');
    
    if (authDot) {
        if (isAuthenticated) {
            authDot.classList.add('connected');
        } else {
            authDot.classList.remove('connected');
        }
    }
    
    if (authBtnLabel) {
        authBtnLabel.textContent = isAuthenticated ? 'Logout' : 'Login';
    }
}

/**
 * Update footer theme icon based on current theme
 */
function updateFooterThemeIcon() {
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
        themeIcon.textContent = currentTheme === 'light' ? '☀️' : '🌙';
    }
}

/**
 * Update footer time format label
 */
function updateFooterTimeFormatLabel() {
    const timeFormatLabel = document.getElementById('time-format-label');
    if (timeFormatLabel) {
        timeFormatLabel.textContent = timeFormat;
    }
}

// =============================================================================
// STARRED TASKS MANAGEMENT - Handle local starring/pinning of tasks
// =============================================================================

/**
 * Load starred tasks from Chrome storage
 * EXPLANATION: Starred tasks are stored locally since Google Tasks API doesn't support starring
 * - Uses Chrome storage to persist starred tasks across sessions
 * - Starred tasks will be pinned to the top of the task list
 */
function loadStarredTasks() {
    // Try sync storage first, fallback to local storage
    chrome.storage.sync.get(['starredTasks'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Error loading starred tasks from sync:', chrome.runtime.lastError);
            // Fallback to local storage
            chrome.storage.local.get(['starredTasks'], (localResult) => {
                if (chrome.runtime.lastError) {
                    console.error('Error loading starred tasks from local:', chrome.runtime.lastError);
                    showError('Unable to load starred tasks. Please refresh the page.');
                    return;
                }
                
                const starred = localResult.starredTasks || [];
                starredTasks = new Set(starred);
                console.log('Loaded starred tasks from local storage:', starred.length);
            });
            return;
        }
        
        const starred = result.starredTasks || [];
        starredTasks = new Set(starred);
        console.log('Loaded starred tasks from sync storage:', starred.length);
    });
}

/**
 * Save starred tasks to Chrome storage
 * EXPLANATION: Persists the starred tasks set to local storage
 */
function saveStarredTasks() {
    const starredArray = Array.from(starredTasks);
    
    // Save to sync storage for cross-device sync
    chrome.storage.sync.set({ starredTasks: starredArray }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving starred tasks to sync:', chrome.runtime.lastError);
            // Fallback to local storage
            chrome.storage.local.set({ starredTasks: starredArray }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error saving starred tasks to local:', chrome.runtime.lastError);
                    showError('Unable to save starred tasks. Please try again.');
                } else {
                    console.log('Starred tasks saved to local storage:', starredArray.length);
                }
            });
        } else {
            console.log('Starred tasks saved to sync storage:', starredArray.length);
        }
    });
}

/**
 * Toggle starred status of a task
 * EXPLANATION: Adds or removes a task from the starred set and re-renders the list
 * - Starred tasks are pinned to the top of the list
 * - Uses local storage to persist starred status
 * 
 * @param {string} taskId - ID of the task to toggle
 */
function toggleTaskStar(taskId) {
    console.log('Toggling star for task:', taskId);
    
    if (starredTasks.has(taskId)) {
        // Unstar the task
        starredTasks.delete(taskId);
        showStatus('Task unstarred', 'success');
    } else {
        // Star the task
        starredTasks.add(taskId);
        showStatus('Task starred and pinned to top!', 'success');
    }
    
    // Save to storage and re-render
    saveStarredTasks();
    renderTasks();
}

/**
 * Check if a task is starred
 * @param {string} taskId - ID of the task to check
 * @returns {boolean} - Whether the task is starred
 */
function isTaskStarred(taskId) {
    return starredTasks.has(taskId);
}

// =============================================================================
// GOOGLE TASKS API FUNCTIONS - Manage tasks with Google Tasks
// =============================================================================

/**
 * Get all tasks from Google Tasks API
 * EXPLANATION: Fetches tasks from user's default task list using background script
 * - Uses background script for consistent authentication handling
 * - Shows loading state while fetching
 * - Handles errors with user-friendly messages
 * - Updates currentTasks array and renders the task list
 */
function getTasks() {
    console.log('[Tasks] === Fetching Tasks from Google ===');
    
    if (!isAuthenticated) {
        console.warn('[Tasks] Not authenticated - showing login prompt');
        showLoginPrompt();
        return;
    }
    
    // Show loading message
    const tasksList = document.getElementById('tasks-list');
    if (tasksList) {
        tasksList.innerHTML = '<div class="loading-message">Loading tasks...</div>';
        console.log('[Tasks] Loading indicator displayed');
    } else {
        console.warn('[Tasks] tasks-list element not found');
    }
    
    // Request tasks from background script
    chrome.runtime.sendMessage({action: 'getTasks'}, (response) => {
        // Check for Chrome runtime errors first
        if (chrome.runtime.lastError) {
            console.error('[Tasks] Chrome runtime error:', chrome.runtime.lastError);
            showError('Extension communication error. Please reload the extension.');
            if (tasksList) {
                tasksList.innerHTML = '<div class="error-message">Extension error</div>';
            }
            return;
        }
        
        if (response && response.success) {
            console.log(`[Tasks] ✓ Fetched ${response.tasks?.length || 0} tasks successfully`);
            currentTasks = response.tasks || [];
            renderTasks();
        } else {
            const errorMsg = response?.error || 'Unknown error';
            console.error('[Tasks] ✗ Failed to fetch tasks:', errorMsg);
            
            // Handle token expiry - automatically log out
            if (errorMsg.includes('Authentication required') || errorMsg.includes('401') || errorMsg.includes('expired')) {
                console.warn('[Tasks] Token expired - clearing session');
                isAuthenticated = false;
                updateFooterAuthStatus();
                showLoginPrompt();
                showError('Your Google login has expired. Please log in again.');
            } else if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
                showError('Permission denied. Please check your Google Tasks permissions.');
            } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
                showError('Could not connect to Google Tasks. Please check your internet connection.');
            } else {
                showError(`Could not load tasks: ${errorMsg}`);
            }
            
            if (tasksList) {
                tasksList.innerHTML = '<div class="error-message">Failed to load tasks</div>';
            }
        }
    });
}

/**
 * Add a new task to Google Tasks
 * @param {string} title - The task title (required)
 * @param {string} notes - Optional task description/notes
 * @param {string} link - Optional link to associate with task
 */
function addTask(title, notes = '', link = '') {
    console.log('Adding new task:', title);
    
    if (!title.trim()) {
        showError('Task title is required');
        return;
    }
    
    // Get authentication token
    chrome.identity.getAuthToken({interactive: false}, (token) => {
        if (chrome.runtime.lastError || !token) {
            console.error('No auth token available:', chrome.runtime.lastError?.message);
            showError('Please log in to Google first');
            return;
        }
        
        // Prepare task data
        const taskData = {
            title: title.trim()
        };
        
        // Add notes and link if provided
        if (notes.trim() || link.trim()) {
            let notesText = notes.trim();
            if (link.trim()) {
                notesText += (notesText ? '\n\n' : '') + 'Link: ' + link.trim();
            }
            taskData.notes = notesText;
        }
        
        // Make request to Google Tasks API to create task
        const apiUrl = 'https://www.googleapis.com/tasks/v1/lists/@default/tasks';
        
        fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(taskData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Task added successfully:', data.id);
            showStatus('Task added successfully!', 'success');
            
            // Refresh the tasks list to show the new task
            getTasks();
            
            // Clear the form and close it
            clearTaskForm();
            if (typeof toggleExpandedForm === 'function') {
                toggleExpandedForm(false);
            } else {
                document.getElementById('expanded-task-form').style.display = 'none';
            }
        })
        .catch(error => {
            console.error('Error adding task:', error);
            showError('Failed to add task: ' + error.message);
        });
    });
}

/**
 * Delete a task from Google Tasks
 * @param {string} taskId - The ID of the task to delete
 */
function deleteTask(taskId) {
    console.log('Deleting task:', taskId);
    
    if (!confirm('Are you sure you want to delete this task?')) {
        return;
    }
    
    // Get authentication token
    chrome.identity.getAuthToken({interactive: false}, (token) => {
        if (chrome.runtime.lastError || !token) {
            console.error('No auth token available:', chrome.runtime.lastError?.message);
            showError('Please log in to Google first');
            return;
        }
        
        // Make request to Google Tasks API to delete task
        const apiUrl = `https://www.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`;
        
        fetch(apiUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            console.log('Task deleted successfully');
            showStatus('Task deleted successfully!', 'success');
            
            // Refresh the tasks list to remove the deleted task
            getTasks();
        })
        .catch(error => {
            console.error('Error deleting task:', error);
            showError('Failed to delete task: ' + error.message);
        });
    });
}

/**
 * Display tasks in Google Tasks style with checkboxes, edit, and delete
 * Creates interactive task items with completion tracking and inline editing
 */
function renderTasks() {
    const tasksList = document.getElementById('tasks-list');
    if (!tasksList) { 
        console.error('[renderTasks] #tasks-list not found'); 
        return; 
    }
    
    // Clear existing content
    tasksList.innerHTML = '';
    
    if (currentTasks.length === 0) {
        const noTasksMsg = document.getElementById('no-tasks-message');
        if (noTasksMsg) {
            noTasksMsg.style.display = 'block';
        } else {
            tasksList.innerHTML = '<div class="no-items">No tasks found. Add your first task above!</div>';
        }
        return;
    }
    
    // Hide no tasks message if tasks exist
    const noTasksMsg = document.getElementById('no-tasks-message');
    if (noTasksMsg) {
        noTasksMsg.style.display = 'none';
    }
    
    // Sort tasks: starred tasks first, then regular tasks
    const sortedTasks = [...currentTasks].sort((a, b) => {
        const aStarred = isTaskStarred(a.id);
        const bStarred = isTaskStarred(b.id);
        
        // Starred tasks come first
        if (aStarred && !bStarred) return -1;
        if (!aStarred && bStarred) return 1;
        
        // Within same star status, maintain original order
        return 0;
    });
    
    // Create HTML for each task in Google Tasks style
    sortedTasks.forEach(task => {
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        if (isTaskStarred(task.id)) {
            taskItem.classList.add('starred');
        }
        taskItem.setAttribute('data-task-id', task.id);
        
        // Task completion checkbox
        const checkbox = document.createElement('div');
        checkbox.className = 'task-checkbox';
        
        // Check if task is completed (Google Tasks uses 'status' field)
        const isCompleted = task.status === 'completed';
        if (isCompleted) {
            checkbox.classList.add('completed');
        }
        
        // Checkbox click handler - toggles completion status
        checkbox.addEventListener('click', () => toggleTaskCompletion(task.id, !isCompleted));
        
        taskItem.appendChild(checkbox);
        
        // Task content container
        const taskContent = document.createElement('div');
        taskContent.className = 'task-content';
        
        // Task title
        const titleDiv = document.createElement('div');
        titleDiv.className = 'task-title';
        if (isCompleted) {
            titleDiv.classList.add('completed');
        }
        titleDiv.textContent = task.title;
        taskContent.appendChild(titleDiv);
        
        // Task details/notes (if exists)
        if (task.notes) {
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'task-details';
            if (isCompleted) {
                detailsDiv.classList.add('completed');
            }
            
            // Parse notes to separate details and URL
            const notes = task.notes;
            const urlMatch = notes.match(/URL: (https?:\/\/[^\s\n]+)/);
            
            if (urlMatch) {
                // Show details without URL
                const detailsText = notes.replace(/\n*URL: https?:\/\/[^\s\n]+\n*/, '').trim();
                if (detailsText) {
                    detailsDiv.textContent = detailsText;
                    taskContent.appendChild(detailsDiv);
                }
                
                // Add clickable URL link
                const urlLink = document.createElement('a');
                urlLink.className = 'task-url';
                urlLink.href = urlMatch[1];
                urlLink.target = '_blank';
                urlLink.textContent = '🔗 ' + urlMatch[1];
                taskContent.appendChild(urlLink);
            } else {
                // Show all notes as details
                detailsDiv.textContent = notes;
                taskContent.appendChild(detailsDiv);
            }
        }
        
        // Due date (if exists)
        if (task.due) {
            const dueDateDiv = document.createElement('div');
            dueDateDiv.className = 'task-due-date';
            const dueDate = new Date(task.due);
            dueDateDiv.textContent = '📅 Due: ' + dueDate.toLocaleDateString();
            taskContent.appendChild(dueDateDiv);
        }
        
        taskItem.appendChild(taskContent);
        
        // Task actions (Edit and Delete buttons)
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'task-actions';
        
        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn edit-btn';
        editBtn.innerHTML = '✏️';
        editBtn.title = 'Edit task';
        editBtn.addEventListener('click', () => startTaskEdit(task.id));
        actionsDiv.appendChild(editBtn);
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn delete-btn';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'Delete task';
        deleteBtn.addEventListener('click', () => confirmDeleteTask(task.id));
        actionsDiv.appendChild(deleteBtn);
        
        // Star button for pinning tasks (positioned under delete button)
        const starButton = document.createElement('button');
        starButton.className = 'action-btn star-btn';
        const starred = isTaskStarred(task.id);
        starButton.innerHTML = starred ? '⭐' : '☆';
        starButton.title = starred ? 'Unstar task' : 'Star task to pin to top';
        
        // Star click handler - toggles starred status
        starButton.addEventListener('click', () => toggleTaskStar(task.id));
        actionsDiv.appendChild(starButton);
        
        taskItem.appendChild(actionsDiv);
        tasksList.appendChild(taskItem);
    });
    
    console.log(`Rendered ${currentTasks.length} tasks in Google Tasks style`);
}

/**
 * Toggle task completion status
 * @param {string} taskId - ID of the task to toggle
 * @param {boolean} completed - New completion status
 */
function toggleTaskCompletion(taskId, completed) {
    console.log('Toggling task completion:', taskId, completed);
    
    if (!isAuthenticated) {
        showError('Please log in to Google first');
        return;
    }
    
    // Update task status in Google Tasks
    const taskData = {
        status: completed ? 'completed' : 'needsAction'
    };
    
    chrome.runtime.sendMessage({
        action: 'updateTask',
        data: { taskId, taskData }
    }, (response) => {
        if (response && response.success) {
            // Update local task data
            const task = currentTasks.find(t => t.id === taskId);
            if (task) {
                task.status = taskData.status;
            }
            
            // Re-render tasks to show updated state
            renderTasks();
            
            showStatus(completed ? 'Task completed!' : 'Task reopened!', 'success');
        } else {
            console.error('Error updating task:', response?.error);
            // Show user-friendly error message
            const errorMsg = response?.error || 'Unknown error';
            if (errorMsg.includes('Authentication required') || errorMsg.includes('401')) {
                showError('Your Google login has expired. Please log out and log back in.');
            } else if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
                showError('Permission denied. Please check your Google Tasks permissions.');
            } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
                showError('Could not connect to Google Tasks. Please check your internet connection.');
            } else {
                showError('Could not update task. Please try again.');
            }
        }
    });
}

/**
 * Start editing a task inline
 * @param {string} taskId - ID of the task to edit
 */
function startTaskEdit(taskId) {
    console.log('Editing task via detailed form:', taskId);
    const task = currentTasks.find(t => t.id === taskId);
    if (!task) { showError('Task not found'); return; }

    // Open the detailed form
    toggleExpandedForm(true);

    // Prefill fields
    const titleInput   = document.getElementById('task-title-detailed');
    const detailsInput = document.getElementById('task-details');
    const urlInput     = document.getElementById('task-url');
    const editingId    = document.getElementById('editing-task-id');
    const submitBtn    = document.getElementById('detailed-task-submit');

    if (titleInput)   titleInput.value = task.title || '';

    // Parse notes -> details + URL (URL line starts with "URL: ")
    let details = '';
    let url = '';
    if (task.notes) {
        const m = task.notes.match(/URL:\s*(https?:\/\/[^\s\n]+)/i);
        if (m) url = m[1];
        details = task.notes.replace(/\n*URL:\s*https?:\/\/[^\s\n]+/i, '').trim();
    }
    if (detailsInput) detailsInput.value = details || '';
    if (urlInput)     urlInput.value     = url || '';

    if (editingId)  editingId.value = taskId;
    if (submitBtn)  submitBtn.textContent = 'Update Task';
}

/**
 * Save task edit changes
 * @param {string} taskId - ID of the task to save
 * @param {string} newTitle - New task title
 * @param {string} newNotes - New task notes
 */
function saveTaskEdit(taskId, newTitle, newNotes) {
    console.log('Saving task edit:', taskId);
    
    if (!newTitle.trim()) {
        showError('Task title cannot be empty');
        return;
    }
    
    const taskData = {
        title: newTitle.trim(),
        notes: newNotes.trim() || undefined
    };
    
    chrome.runtime.sendMessage({
        action: 'updateTask',
        data: { taskId, taskData }
    }, (response) => {
        if (response && response.success) {
            // Update local task data
            const task = currentTasks.find(t => t.id === taskId);
            if (task) {
                task.title = taskData.title;
                task.notes = taskData.notes;
            }
            
            // Re-render tasks
            renderTasks();
            showStatus('Task updated successfully!', 'success');
        } else {
            console.error('Error updating task:', response?.error);
            showError('Failed to update task: ' + (response?.error || 'Unknown error'));
        }
    });
}

/**
 * Cancel task edit and restore original view
 * @param {string} taskId - ID of the task to cancel editing
 */
function cancelTaskEdit(taskId) {
    console.log('Cancelling task edit:', taskId);
    
    // Simply re-render tasks to restore original state
    renderTasks();
}

/**
 * Confirm and delete a task
 * @param {string} taskId - ID of the task to delete
 */
function confirmDeleteTask(taskId) {
    const task = currentTasks.find(t => t.id === taskId);
    const taskTitle = task ? task.title : 'this task';
    
    if (confirm(`Are you sure you want to delete "${taskTitle}"?`)) {
        deleteTaskById(taskId);
    }
}

/**
 * Delete a task by ID
 * @param {string} taskId - ID of the task to delete
 */
function deleteTaskById(taskId) {
    console.log('Deleting task:', taskId);
    
    chrome.runtime.sendMessage({
        action: 'deleteTask',
        data: { taskId }
    }, (response) => {
        if (response && response.success) {
            // Remove from local array
            currentTasks = currentTasks.filter(t => t.id !== taskId);
            
            // Re-render tasks
            renderTasks();
            showStatus('Task deleted successfully!', 'success');
        } else {
            console.error('Error deleting task:', response?.error);
            showError('Failed to delete task: ' + (response?.error || 'Unknown error'));
        }
    });
}

// =============================================================================
// GOOGLE CALENDAR API FUNCTIONS - Manage events with Google Calendar
// =============================================================================

/**
 * Get upcoming events from Google Calendar API
 * Fetches max 10 upcoming events from user's primary calendar
 */
// First getEvents function removed - using the more complete version below

/**
 * Add a new event to Google Calendar
 * @param {string} title - The event title (required)
 * @param {string} datetime - Start date and time (ISO string or datetime-local format)
 */
function addEvent(title, datetime) {
    console.log('Adding new calendar event:', title);
    
    // Validate required parameters
    if (!title.trim() || !datetime) {
        showError('Event title and start date are required');
        return;
    }
    
    // Get authentication token using Chrome Identity API
    chrome.identity.getAuthToken({interactive: false}, (token) => {
        if (chrome.runtime.lastError || !token) {
            console.error('No auth token available:', chrome.runtime.lastError?.message);
            showError('Please log in to Google first');
            return;
        }
        
        // Convert datetime to proper Date object
        const startDate = new Date(datetime);
        
        // Set end time to 1 hour after start time (default duration)
        const endDate = new Date(startDate.getTime() + (60 * 60 * 1000)); // Add 1 hour
        
        // Prepare event data for Google Calendar API
        const eventData = {
            summary: title.trim(),                    // Event title
            start: {
                dateTime: startDate.toISOString(),    // Start time in ISO format
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone  // User's timezone
            },
            end: {
                dateTime: endDate.toISOString(),      // End time in ISO format
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone  // User's timezone
            }
        };
        
        // Make POST request to Google Calendar API to create event
        const apiUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
        
        fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Event added successfully:', data.id);
            showStatus('Event added successfully!', 'success');
            
            // Refresh the events list to show the new event
            getEvents();
            
            // Clear the form
            clearEventForm();
        })
        .catch(error => {
            console.error('Error adding event:', error);
            showError('Failed to add event: ' + error.message);
        });
    });
}

/**
 * Display calendar events in a simple list format
 * EXPLANATION: Renders events from Google Calendar API in an organized list
 * - Groups events by date for better organization
 * - Shows title, time, description, and action buttons for each event
 * - Handles both all-day and timed events appropriately
 * - Uses user's time format preference
 */
function renderEvents() {
    const eventsList = document.getElementById('events-list');
    const noEventsMsg = document.getElementById('no-events-message');
    if (!eventsList || !noEventsMsg) { 
        console.error('[renderEvents] container not found'); 
        return; 
    }
    
    // Clear existing content
    eventsList.innerHTML = '';
    
    // Check if there are any events to display
    if (currentEvents.length === 0) {
        noEventsMsg.style.display = 'block';
        return;
    }
    
    // Hide no events message
    noEventsMsg.style.display = 'none';
    
    // Group events based on current view mode
    let eventsGrouped = {};
    
    if (currentCalendarView === 'day') {
        // Group by individual days
        currentEvents.forEach(event => {
            const startDate = event.start?.dateTime || event.start?.date;
            if (startDate) {
                const dateKey = new Date(startDate).toDateString();
                if (!eventsGrouped[dateKey]) {
                    eventsGrouped[dateKey] = [];
                }
                eventsGrouped[dateKey].push(event);
            }
        });
    } else if (currentCalendarView === 'week') {
        // Group by weeks
        currentEvents.forEach(event => {
            const startDate = event.start?.dateTime || event.start?.date;
            if (startDate) {
                const date = new Date(startDate);
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6); // End of week (Saturday)
                
                const weekKey = `${weekStart.toDateString()} - ${weekEnd.toDateString()}`;
                if (!eventsGrouped[weekKey]) {
                    eventsGrouped[weekKey] = [];
                }
                eventsGrouped[weekKey].push(event);
            }
        });
    } else if (currentCalendarView === 'month') {
        // Group by months
        currentEvents.forEach(event => {
            const startDate = event.start?.dateTime || event.start?.date;
            if (startDate) {
                const date = new Date(startDate);
                const monthKey = date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long'
                });
                if (!eventsGrouped[monthKey]) {
                    eventsGrouped[monthKey] = [];
                }
                eventsGrouped[monthKey].push(event);
            }
        });
    }
    
    // Render events grouped by the selected view
    Object.keys(eventsGrouped).sort((a, b) => {
        // Sort by the first event's date in each group
        const firstEventA = eventsGrouped[a][0];
        const firstEventB = eventsGrouped[b][0];
        const dateA = new Date(firstEventA.start?.dateTime || firstEventA.start?.date);
        const dateB = new Date(firstEventB.start?.dateTime || firstEventB.start?.date);
        return dateA - dateB;
    }).forEach(groupKey => {
        // Create group header
        const groupHeader = document.createElement('div');
        groupHeader.className = 'events-date-header';
        
        if (currentCalendarView === 'day') {
            // For day view, show full date
            const date = new Date(groupKey);
            groupHeader.textContent = date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } else {
            // For week and month views, use the group key directly
            groupHeader.textContent = groupKey;
        }
        
        eventsList.appendChild(groupHeader);
        
        // Create events container for this group
        const groupEventsContainer = document.createElement('div');
        groupEventsContainer.className = 'events-date-group';
        
        // Sort events within the group by start time
        const sortedEvents = eventsGrouped[groupKey].sort((a, b) => {
            const dateA = new Date(a.start?.dateTime || a.start?.date);
            const dateB = new Date(b.start?.dateTime || b.start?.date);
            return dateA - dateB;
        });
        
        // Render each event in this group
        sortedEvents.forEach(event => {
            const eventItem = document.createElement('div');
            eventItem.className = 'event-item';
            eventItem.setAttribute('data-event-id', event.id);
            
            // Event content container
            const eventContent = document.createElement('div');
            eventContent.className = 'event-content';
            
            // Event title
            const titleDiv = document.createElement('div');
            titleDiv.className = 'event-title';
            titleDiv.textContent = event.summary || 'Untitled Event';
            eventContent.appendChild(titleDiv);
            
            // Event time
            if (event.start) {
                const timeDiv = document.createElement('div');
                timeDiv.className = 'event-time';
                
                if (event.start.dateTime) {
                    // Timed event
                    const startTime = new Date(event.start.dateTime);
                    const endTime = event.end?.dateTime ? new Date(event.end.dateTime) : null;
                    
                    timeDiv.textContent = formatTime(startTime);
                    if (endTime) {
                        timeDiv.textContent += ` - ${formatTime(endTime)}`;
                    }
                } else {
                    // All-day event
                    timeDiv.textContent = 'All day';
                }
                
                eventContent.appendChild(timeDiv);
            }
            
            // Event description (if exists)
            if (event.description) {
                const descDiv = document.createElement('div');
                descDiv.className = 'event-description';
                
                // Parse description to separate text and URL
                const description = event.description;
                const urlMatch = description.match(/URL: (https?:\/\/[^\s\n]+)/);
                
                if (urlMatch) {
                    // Show description without URL
                    const descText = description.replace(/\n*URL: https?:\/\/[^\s\n]+\n*/, '').trim();
                    if (descText) {
                        descDiv.textContent = descText.length > 100 ? descText.substring(0, 100) + '...' : descText;
                        eventContent.appendChild(descDiv);
                    }
                    
                    // Add clickable URL link
                    const urlLink = document.createElement('a');
                    urlLink.className = 'event-url';
                    urlLink.href = urlMatch[1];
                    urlLink.target = '_blank';
                    urlLink.textContent = '🔗 ' + urlMatch[1];
                    eventContent.appendChild(urlLink);
                } else {
                    // Show description as is (truncated)
                    const truncatedDesc = description.length > 100 ? description.substring(0, 100) + '...' : description;
                    descDiv.textContent = truncatedDesc;
                    eventContent.appendChild(descDiv);
                }
            }
            
            // Event location (if exists)
            if (event.location) {
                const locationDiv = document.createElement('div');
                locationDiv.className = 'event-location';
                locationDiv.textContent = '📍 ' + event.location;
                eventContent.appendChild(locationDiv);
            }
            
            eventItem.appendChild(eventContent);
            
            // Event actions (Edit and Delete buttons)
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'event-actions';
            
            // Edit button
            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn edit-btn';
            editBtn.innerHTML = '✏️';
            editBtn.title = 'Edit event';
            editBtn.addEventListener('click', () => startEventEdit(event));
            actionsDiv.appendChild(editBtn);
            
            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn delete-btn';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Delete event';
            deleteBtn.addEventListener('click', () => deleteEvent(event.id));
            actionsDiv.appendChild(deleteBtn);
            
            eventItem.appendChild(actionsDiv);
            groupEventsContainer.appendChild(eventItem);
        });
        
        eventsList.appendChild(groupEventsContainer);
    });
    
    console.log(`Rendered ${currentEvents.length} events grouped by date`);
}

/**
 * Open Google Calendar in a new browser tab
 * Allows users to view their full calendar
 */
function openGoogleCalendar() {
    console.log('Opening Google Calendar in new tab...');
    
    // Create a new tab with Google Calendar
    chrome.tabs.create({ 
        url: 'https://calendar.google.com/',
        active: true  // Make the new tab active (focused)
    });
}

// =============================================================================
// UI HELPER FUNCTIONS - Handle forms, tabs, and user interactions
// =============================================================================

/**
 * Set up all event listeners for buttons and forms
 */
function setupEventListeners() {
    // Authentication buttons (with null checks for safety)
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // New task management event listeners
    setupTaskManagementListeners();
    
    // Calendar management event listeners
    setupCalendarListeners();
    
    // Refresh buttons (with null checks for safety)
    const refreshTasksBtn = document.getElementById('refresh-tasks-btn');
    if (refreshTasksBtn) {
        refreshTasksBtn.addEventListener('click', getTasks);
    }
    
    // Manual refresh button
    const refreshTasksManualBtn = document.getElementById('refresh-tasks-btn');
    if (refreshTasksManualBtn) {
        refreshTasksManualBtn.addEventListener('click', getTasks);
    }
    
    // Open Google Calendar button (if it exists in HTML)
    const openCalendarBtn = document.getElementById('open-calendar-btn');
    if (openCalendarBtn) {
        openCalendarBtn.addEventListener('click', openGoogleCalendar);
    }
}

/**
 * Set up event listeners for the new task management interface
 */
function setupTaskManagementListeners() {
    // Quick add input - Enter key to add task
    const quickAddInput = document.getElementById('quick-add-input');
    if (quickAddInput) {
        quickAddInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && quickAddInput.value.trim()) {
                addQuickTask(quickAddInput.value.trim());
                quickAddInput.value = '';
            }
        });
    }
    
    // Add Task button opens detailed form
    const addTaskBtn = document.getElementById('add-task-btn');
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', () => {
            clearTaskForm();
            // make sure we're not in edit mode
            const editingId = document.getElementById('editing-task-id');
            if (editingId) editingId.value = '';
            // show the expanded form
            if (typeof toggleExpandedForm === 'function') {
                toggleExpandedForm(true);
            } else {
                document.getElementById('expanded-task-form').style.display = 'block';
            }
        });
    }
    
    // Expand form button (legacy)
    const expandFormBtn = document.getElementById('expand-form-btn');
    if (expandFormBtn) {
        expandFormBtn.addEventListener('click', toggleExpandedForm);
    }
    
    // Task search input
    const taskSearch = document.getElementById('task-search');
    if (taskSearch) {
        taskSearch.addEventListener('input', filterTasks);
    }
    
    // Task filter dropdown
    const taskFilter = document.getElementById('task-filter');
    if (taskFilter) {
        taskFilter.addEventListener('change', filterTasks);
    }
    
    // Detailed task form submission
    const detailedTaskForm = document.getElementById('detailed-task-form');
    if (detailedTaskForm) {
        detailedTaskForm.addEventListener('submit', handleDetailedTaskSubmit);
    }
    
    // Use current URL button
    const useCurrentUrlBtn = document.getElementById('use-current-url-btn');
    if (useCurrentUrlBtn) {
        useCurrentUrlBtn.addEventListener('click', useCurrentPageUrl);
    }
    
    // Due date buttons
    const dueBtns = document.querySelectorAll('.due-btn');
    dueBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active class from all due buttons
            dueBtns.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            e.target.classList.add('active');
            
            // Clear custom date if preset is selected
            const customDate = document.getElementById('custom-due-date');
            if (customDate) customDate.value = '';
        });
    });
    
    // Custom date picker
    const customDueDate = document.getElementById('custom-due-date');
    if (customDueDate) {
        customDueDate.addEventListener('change', () => {
            // Remove active class from due buttons when custom date is selected
            dueBtns.forEach(btn => btn.classList.remove('active'));
        });
    }
    
    // Cancel task button
    const cancelTaskBtn = document.getElementById('cancel-task-btn');
    if (cancelTaskBtn) {
        cancelTaskBtn.addEventListener('click', () => {
            clearTaskForm();
            if (typeof toggleExpandedForm === 'function') {
                toggleExpandedForm(false);
            } else {
                document.getElementById('expanded-task-form').style.display = 'none';
            }
        });
    }
}

function setupTabSwitching() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = {
    'todo': document.getElementById('todo-content'),
    'calendar': document.getElementById('calendar-content'),
    'savetab': document.getElementById('savetab-content')
  };

  function applyTabVisibility(activeKey) {
    // Hide all
    Object.values(tabContents).forEach(el => {
      if (!el) return;
      el.classList.remove('active');
      el.style.display = 'none'; // hard guard against CSS overrides
    });
    // De-activate buttons
    tabButtons.forEach(btn => btn.classList.remove('active'));

    // Show active
    const activeContent = tabContents[activeKey];
    if (!activeContent) {
      console.error('[showTab] Missing content element for tab:', activeKey);
      return;
    }
    activeContent.classList.add('active');
    activeContent.style.display = 'block';

    const activeButton = document.querySelector(`[data-tab="${activeKey}"]`);
    if (activeButton) activeButton.classList.add('active');

    // Lazy loads
    if (activeKey === 'todo') {
      getTasks();
    } else if (activeKey === 'calendar' && isAuthenticated && currentEvents.length === 0) {
      getEvents();
    } else if (activeKey === 'savetab') {
      if (typeof initSaveTab === 'function') initSaveTab();
    }
  }

  // Click handlers
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      applyTabVisibility(tabName);
    });
  });

  // Make globally callable
  window.showTab = function(tabName) {
    console.log('[showTab] switching to', tabName);
    applyTabVisibility(tabName);
  };

  // Initial tab
  window.requestAnimationFrame(() => window.showTab('todo'));
}

// =============================================================================
// TASK MANAGEMENT FUNCTIONS - Handle new task interface
// =============================================================================

/**
 * Add a quick task with just a title
 * EXPLANATION: Creates a simple task from the quick-add input
 * - Only requires a title
 * - Automatically adds current page URL to notes
 * - Does not sync to calendar (use detailed form for calendar sync)
 * 
 * @param {string} title - Task title
 */
function addQuickTask(title) {
    console.log('Adding quick task:', title);
    
    if (!isAuthenticated) {
        showError('Please log in to Google first');
        return;
    }
    
    // Create simple task data for Google Tasks API
    const taskData = {
        title: title.trim()
    };
    
    // Add current page URL to notes if available
    if (currentPageUrl) {
        taskData.notes = `Added from: ${currentPageUrl}`;
    }
    
    // Call Google Tasks API through background script
    chrome.runtime.sendMessage({
        action: 'createTask',
        data: taskData
    }, (response) => {
        if (response && response.success) {
            showStatus('Task added successfully!', 'success');
            getTasks(); // Refresh task list
        } else {
            console.error('Error adding task:', response?.error);
            // Show user-friendly error message
            const errorMsg = response?.error || 'Unknown error';
            if (errorMsg.includes('401') || errorMsg.includes('unauthorized')) {
                showError('Your Google login has expired. Please log out and log back in.');
            } else if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
                showError('Permission denied. Please check your Google Tasks permissions.');
            } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
                showError('Could not connect to Google Tasks. Please check your internet connection.');
            } else {
                showError('Could not save task. Please try again.');
            }
        }
    });
}

/**
 * Toggle the expanded task form visibility
 */
// Make toggleExpandedForm null-safe and accept optional desired state
function toggleExpandedForm(forceOpen = null) {
    const expandedForm = document.getElementById('expanded-task-form');
    const expandBtn = document.getElementById('expand-form-btn'); // may be null
    const isOpen = expandedForm && expandedForm.style.display === 'block';
    const nextState = forceOpen !== null ? forceOpen : !isOpen;
    if (expandedForm) expandedForm.style.display = nextState ? 'block' : 'none';
    if (expandBtn) {
        expandBtn.innerHTML = nextState ? '<span class="btn-icon">−</span>' : '<span class="btn-icon">+</span>';
        expandBtn.title = nextState ? 'Close form' : 'Add detailed task';
    }
    if (nextState) {
        const titleInput = document.getElementById('task-title-detailed');
        if (titleInput) setTimeout(() => titleInput.focus(), 100);
    }
}

/**
 * Close the expanded task form and reset it
 */
function closeExpandedForm() {
    const expandedForm = document.getElementById('expanded-task-form');
    const expandBtn = document.getElementById('expand-form-btn');
    
    expandedForm.style.display = 'none';
    expandBtn.innerHTML = '<span class="btn-icon">+</span>';
    expandBtn.title = 'Add detailed task';
    
    // Reset form
    const form = document.getElementById('detailed-task-form');
    if (form) form.reset();
    
    // Reset due date buttons
    document.querySelectorAll('.due-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Clear editing state
    const editingId = document.getElementById('editing-task-id');
    if (editingId) editingId.value = '';
    const submitBtn = document.getElementById('detailed-task-submit');
    if (submitBtn) submitBtn.textContent = 'Save Task';
}

/**
 * Handle detailed task form submission
 * Maps form fields to Google Tasks API fields
 */
function handleDetailedTaskSubmit(event) {
    event.preventDefault();
    if (!isAuthenticated) { showError('Please log in to Google first'); return; }

    const title   = document.getElementById('task-title-detailed').value.trim();
    const details = document.getElementById('task-details').value.trim();
    const url     = document.getElementById('task-url').value.trim();
    const customDueDate = document.getElementById('custom-due-date')?.value || '';

    if (!title) { showError('Task title is required'); return; }

    const editingId = document.getElementById('editing-task-id')?.value || '';

    // Build notes (details + optional URL)
    let notes = details || '';
    if (url) notes += (notes ? '\n\n' : '') + `URL: ${url}`;

    // Build task data; keep due behavior the same as before
    const taskData = { title };
    if (notes) taskData.notes = notes;

    let syncToCalendar = false;
    const activeDueBtn = document.querySelector('.due-btn.active');
    if (activeDueBtn) {
        const dueType = activeDueBtn.getAttribute('data-due');
        if (dueType === 'today') {
            taskData.due = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';
            syncToCalendar = true;
        } else if (dueType === 'tomorrow') {
            const t = new Date(); t.setDate(t.getDate() + 1);
            taskData.due = t.toISOString().split('T')[0] + 'T00:00:00.000Z';
            syncToCalendar = true;
        }
    } else if (customDueDate) {
        taskData.due = new Date(customDueDate).toISOString();
        syncToCalendar = true;
    }

    // EDIT mode -> update existing task
    if (editingId) {
        chrome.runtime.sendMessage({
            action: 'updateTask',
            data: { taskId: editingId, taskData }
        }, (response) => {
            if (response && response.success) {
                // Update local model
                const t = currentTasks.find(x => x.id === editingId);
                if (t) { t.title = taskData.title; t.notes = taskData.notes; t.due = taskData.due || t.due; }
                renderTasks();
                showStatus('Task updated successfully!', 'success');
                // Clear editing state
                document.getElementById('editing-task-id').value = '';
                const submitBtn = document.getElementById('detailed-task-submit');
                if (submitBtn) submitBtn.textContent = 'Save Task';
                closeExpandedForm();
            } else {
                showError('Failed to update task: ' + (response?.error || 'Unknown error'));
            }
        });
        return;
    }

    // ADD mode -> create task (existing behavior)
    chrome.runtime.sendMessage({ action: 'createTask', data: taskData }, (response) => {
        if (response && response.success) {
            showStatus('Task created successfully!', 'success');
            getTasks();
            if (syncToCalendar && taskData.due) {
                createCalendarEventFromTask(title, details, taskData.due, url);
            }
            closeExpandedForm();
        } else {
            const errorMsg = response?.error || 'Unknown error';
            showError(`Could not save task: ${errorMsg}`);
        }
    });
}

/**
 * Create a calendar event from a task
 * EXPLANATION: When user checks "Add to Calendar", creates a corresponding calendar event
 * - Uses task title as event title
 * - Sets event date to task due date
 * - Marks event as "task" in description
 * - Creates a 1-hour event starting at 9 AM on the due date
 * 
 * @param {string} title - Task title
 * @param {string} details - Task details
 * @param {string} dueDate - Task due date (ISO string)
 * @param {string} url - Task URL (optional)
 */
function createCalendarEventFromTask(title, details, dueDate, url = '') {
    console.log('Creating calendar event from task:', title);
    
    try {
        // Parse the due date and set default time to 9 AM
        const taskDueDate = new Date(dueDate);
        taskDueDate.setHours(9, 0, 0, 0); // Set to 9:00 AM
        
        // Create end time (1 hour later)
        const endTime = new Date(taskDueDate);
        endTime.setHours(10, 0, 0, 0); // Set to 10:00 AM
        
        // Prepare event description
        let eventDescription = 'Task: ' + (details || 'No additional details');
        if (url) {
            eventDescription += `\n\nURL: ${url}`;
        }
        eventDescription += '\n\n(Created from TaskEx To-Do)';
        
        // Prepare event data
        const eventData = {
            title: `📋 ${title}`, // Add task emoji to distinguish from regular events
            description: eventDescription,
            startDateTime: taskDueDate.toISOString(),
            endDateTime: endTime.toISOString(),
            url: url
        };
        
        // Create the calendar event
        createEvent(eventData);
        
        showStatus('Task added to both To-Do list and Calendar!', 'success');
        
    } catch (error) {
        console.error('Error creating calendar event from task:', error);
        showError('Task created but failed to add to calendar');
    }
}

/**
 * Use current page URL in the task form
 */
function useCurrentPageUrl() {
    const urlInput = document.getElementById('task-url');
    if (urlInput && currentPageUrl) {
        urlInput.value = currentPageUrl;
        showStatus('Current page URL added', 'success');
    } else {
        showError('No current page URL available');
    }
}

/**
 * Filter and sort tasks based on search and filter criteria
 * EXPLANATION: Handles both filtering by search/tags and sorting by different criteria
 * - Search: Matches task title and details
 * - Filter: Matches tags in title/details
 * - Sort: Reorders tasks by due date, creation date, or title
 * - Re-renders the entire task list when sorting is applied
 */
function filterTasks() {
    const searchTerm = document.getElementById('task-search').value.toLowerCase();
    const filterValue = document.getElementById('task-filter').value;
    
    // Check if this is a sort operation
    if (filterValue.startsWith('sort-')) {
        // Handle sorting by re-rendering tasks with new order
        applySortingToTasks(filterValue);
        return;
    }
    
    // Handle regular filtering (show/hide existing rendered tasks)
    const taskItems = document.querySelectorAll('.task-item');
    
    taskItems.forEach(item => {
        const title = item.querySelector('.task-title')?.textContent.toLowerCase() || '';
        const details = item.querySelector('.task-details')?.textContent.toLowerCase() || '';
        
        // Check search term
        const matchesSearch = !searchTerm || 
            title.includes(searchTerm) || 
            details.includes(searchTerm);
        
        // Check filter (simple tag matching in title/details)
        const matchesFilter = filterValue === 'all' || 
            title.includes(filterValue.toLowerCase()) || 
            details.includes(filterValue.toLowerCase());
        
        // Show/hide based on criteria
        if (matchesSearch && matchesFilter) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

/**
 * Apply sorting to tasks and re-render the list
 * EXPLANATION: Sorts the currentTasks array and re-renders the task list
 * - sort-due-asc: Sort by due date (earliest first)
 * - sort-created-desc: Sort by creation date (newest first) 
 * - sort-title-asc: Sort by title alphabetically
 * 
 * @param {string} sortType - The type of sorting to apply
 */
function applySortingToTasks(sortType) {
    console.log('Applying sorting:', sortType);
    
    if (!currentTasks || currentTasks.length === 0) {
        return;
    }
    
    // Create a copy of tasks to sort
    let sortedTasks = [...currentTasks];
    
    switch (sortType) {
        case 'sort-due-asc':
            // Sort by due date (earliest first), tasks without due date go to end
            sortedTasks.sort((a, b) => {
                if (!a.due && !b.due) return 0;
                if (!a.due) return 1;
                if (!b.due) return -1;
                return new Date(a.due) - new Date(b.due);
            });
            break;
            
        case 'sort-created-desc':
            // Sort by creation date (newest first)
            sortedTasks.sort((a, b) => {
                const dateA = new Date(a.updated || a.created || 0);
                const dateB = new Date(b.updated || b.created || 0);
                return dateB - dateA;
            });
            break;
            
        case 'sort-title-asc':
            // Sort by title alphabetically (A-Z)
            sortedTasks.sort((a, b) => {
                return (a.title || '').localeCompare(b.title || '');
            });
            break;
            
        default:
            console.warn('Unknown sort type:', sortType);
            return;
    }
    
    // Update the current tasks array with sorted order
    currentTasks = sortedTasks;
    
    // Re-render the tasks with new order
    renderTasks();
    
    showStatus(`Tasks sorted by ${getSortDisplayName(sortType)}`, 'success');
}

/**
 * Get display name for sort type
 * @param {string} sortType - The sort type
 * @returns {string} - Human readable sort name
 */
function getSortDisplayName(sortType) {
    switch (sortType) {
        case 'sort-due-asc': return 'due date';
        case 'sort-created-desc': return 'creation date';
        case 'sort-title-asc': return 'title';
        default: return 'unknown';
    }
}

// =============================================================================
// CALENDAR MANAGEMENT FUNCTIONS - Direct Google Calendar API integration
// =============================================================================

/**
 * Set up event listeners for calendar interface
 */
function setupCalendarListeners() {
    // View toggle buttons removed - only using Day view
    
    // Content type toggle buttons
    const contentToggleBtns = document.querySelectorAll('.content-toggle-btn');
    contentToggleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const content = e.target.getAttribute('data-content');
            switchContentType(content);
        });
    });
    
    // Add event button
    const addEventBtn = document.getElementById('add-event-btn');
    if (addEventBtn) {
        addEventBtn.addEventListener('click', () => {
            console.log('[AddBtn] opening add form');
            showEventForm(null);
        });
    }
    
    // Refresh events button
    const refreshBtn = document.getElementById('refresh-events-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', syncEvents);
    }
    
    // Open Google Calendar button
    const openCalendarBtn = document.getElementById('open-calendar-btn');
    if (openCalendarBtn) {
        openCalendarBtn.addEventListener('click', openGoogleCalendar);
    }
    
    // Event form handlers
    const eventForm = document.getElementById('calendar-event-form');
    if (eventForm) {
        eventForm.addEventListener('submit', handleEventFormSubmit);
    }
    
    const cancelEventBtn = document.getElementById('cancel-event-btn');
    if (cancelEventBtn) {
        cancelEventBtn.addEventListener('click', hideEventForm);
    }
}

/**
 * Get upcoming events from Google Calendar API
 * EXPLANATION: Fetches events directly from Google Calendar API and displays them in a simple list
 * - Uses chrome.identity.getAuthToken to get OAuth token
 * - Makes direct API call to Google Calendar events endpoint
 * - Groups events by date for better organization
 * - Handles all error cases with user-friendly messages
 */
async function getEvents() {
    console.log('[Events] === Fetching Events from Google Calendar ===');
    
    if (!isAuthenticated) {
        console.warn('[Events] Not authenticated - showing login prompt');
        showEventsError('Please log in to Google to view your calendar events.');
        return;
    }
    
    // Show loading state
    showEventsLoading();
    console.log('[Events] Loading indicator displayed');
    
    try {
        const data = await apiRequest('getEvents');
        console.log(`[Events] ✓ Fetched ${data.items?.length || 0} events successfully`);
        currentEvents = data.items || [];
        renderEvents();
    } catch (error) {
        const errorMsg = error.message || 'Unknown error';
        console.error('[Events] ✗ Failed to fetch events:', errorMsg);
        
        // Handle token expiry - automatically log out
        if (errorMsg.includes('Authentication required') || errorMsg.includes('401') || errorMsg.includes('expired')) {
            console.warn('[Events] Token expired - clearing session');
            isAuthenticated = false;
            updateFooterAuthStatus();
            showLoginPrompt();
            showEventsError('Your Google login has expired. Please log in again.');
        } else if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
            showEventsError('Permission denied. Please check your Google Calendar permissions.');
        } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
            showEventsError('Could not connect to Google Calendar. Please check your internet connection.');
        } else {
            showEventsError(errorMsg);
        }
    }
}

/**
 * Show loading state in events list
 * EXPLANATION: Displays loading message while fetching events from Google Calendar
 */
function showEventsLoading() {
    const eventsList = document.getElementById('events-list');
    const noEventsMsg = document.getElementById('no-events-message');
    
    if (eventsList) {
        eventsList.innerHTML = '<div class="loading-message">📅 Loading events...</div>';
    }
    if (noEventsMsg) {
        noEventsMsg.style.display = 'none';
    }
}

/**
 * Show error message in events list
 * EXPLANATION: Displays user-friendly error messages when event loading fails
 * @param {string} message - Error message to display
 */
function showEventsError(message) {
    const eventsList = document.getElementById('events-list');
    const noEventsMsg = document.getElementById('no-events-message');
    
    if (eventsList) {
        eventsList.innerHTML = `
            <div class="error-message">
                <div class="error-icon">❌</div>
                <div class="error-text">${message}</div>
                <button onclick="syncEvents()" class="retry-btn">Retry</button>
            </div>
        `;
    }
    if (noEventsMsg) {
        noEventsMsg.style.display = 'none';
    }
}

/**
 * Create a new event in Google Calendar
 * EXPLANATION: Creates a new event using Google Calendar API
 * - Validates event data before sending to API
 * - Uses proper timezone handling
 * - Provides user feedback on success/failure
 * - Refreshes event list after successful creation
 * 
 * @param {Object} eventData - Event data with title, description, start/end times, URL
 */
async function createEvent(eventData) {
    console.log('Creating new calendar event:', eventData);
    
    if (!isAuthenticated) {
        showError('Please log in to Google first');
        return;
    }
    
    // Validate required fields - accept all-day OR timed events
    const hasStart = !!(eventData.start?.dateTime || eventData.start?.date);
    const hasEnd = !!(eventData.end?.dateTime || eventData.end?.date);
    if (!eventData.summary || !hasStart) {
        console.error('Event validation failed:', JSON.stringify(eventData, null, 2));
        showError('Event title and start date are required');
        return;
    }
    
    // If end is still missing, set a safe default
    if (!hasEnd) {
        if (eventData.start?.dateTime) {
            const s = new Date(eventData.start.dateTime);
            s.setHours(s.getHours() + 1);
            eventData.end = { dateTime: s.toISOString(), timeZone: eventData.start.timeZone };
        } else if (eventData.start?.date) {
            const [y,m,d] = eventData.start.date.split('-').map(Number);
            const e = new Date(y, m-1, d + 1);
            eventData.end = { date: e.toISOString().split('T')[0] };
        }
    }
    
    try {
        const data = await apiRequest('createEvent', eventData);
        console.log('Event created successfully:', data.id);
        showStatus('Event created successfully!', 'success');
        
        // Refresh events list and hide form
        syncEvents();
        hideEventForm();
    } catch (error) {
        console.error('Error creating event:', error);
        showError(`Failed to create event: ${error.message}`);
    }
}

/**
 * Update an existing event in Google Calendar
 * EXPLANATION: Updates an event using Google Calendar API PATCH request
 * - Validates event data and ID
 * - Uses partial update (only sends changed fields)
 * - Provides user feedback and refreshes list on success
 * 
 * @param {string} eventId - Google Calendar event ID
 * @param {Object} eventData - Updated event data
 */
function updateEvent(eventId, eventData) {
    console.log('Updating calendar event:', eventId, eventData);
    
    if (!eventId || eventId === 'undefined' || eventId === 'null') {
        showError('Invalid event ID. Please try creating the event again.');
        console.error('Blocked update with invalid eventId:', eventId);
        return;
    }
    
    if (!isAuthenticated) {
        showError('Please log in to Google first');
        return;
    }
    
    // Get authentication token
    chrome.identity.getAuthToken({interactive: false}, (token) => {
        if (chrome.runtime.lastError || !token) {
            console.error('No auth token available:', chrome.runtime.lastError?.message);
            showError('Authentication required. Please log in to Google.');
            return;
        }
        
        // Use the event data directly (already in correct Google Calendar API format)
        const updateData = { ...eventData };
        
        // Remove URL from description if it was added there, as we'll handle it separately
        if (updateData.description && updateData.description.includes('URL: ')) {
            updateData.description = updateData.description.replace(/\n*URL: https?:\/\/[^\s\n]+\n*/, '').trim();
        }
        
        // Make PATCH request to update event
        const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;
        
        fetch(apiUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        })
        .then(response => {
            if (!response.ok) {
                console.error('Update event failed:', response.status, response.statusText);
                console.error('Event ID:', eventId);
                console.error('Update data:', updateData);
                
                if (response.status === 404) {
                    throw new Error('Event not found. It may have been deleted or the ID is invalid.');
                } else if (response.status === 401) {
                    throw new Error('Your Google login has expired. Please log out and log back in.');
                } else if (response.status === 403) {
                    throw new Error('Permission denied. Please check your Google Calendar permissions.');
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }
            return response.json();
        })
        .then(data => {
            console.log('Event updated successfully:', data.id);
            showStatus('Event updated successfully!', 'success');
            
            // Refresh events list and hide form
            syncEvents();
            hideEventForm();
        })
        .catch(error => {
            console.error('Error updating event:', error);
            showError('Failed to update event: ' + error.message);
        });
    });
}

// Updated version using apiRequest helper
async function updateEventNew(eventId, eventData) {
    console.log('Updating calendar event:', eventId, eventData);
    
    if (!isAuthenticated) {
        showError('Please log in to Google first');
        return;
    }
    
    if (!eventId) {
        showError('Event ID is required for update');
        return;
    }
    
    try {
        const data = await apiRequest('updateEvent', { eventId, eventData });
        console.log('Event updated successfully:', data.id);
        showStatus('Event updated successfully!', 'success');
        
        // Refresh events list and hide form
        syncEvents();
        hideEventForm();
    } catch (error) {
        console.error('Error updating event:', error);
        showError(`Failed to update event: ${error.message}`);
    }
}

/**
 * Delete an event from Google Calendar
 * EXPLANATION: Deletes an event using Google Calendar API DELETE request
 * - Confirms deletion with user
 * - Uses event ID to delete specific event
 * - Provides feedback and refreshes list on success
 * 
 * @param {string} eventId - Google Calendar event ID to delete
 */
function deleteEvent(eventId) {
    console.log('Deleting calendar event:', eventId);
    
    if (!isAuthenticated) {
        showError('Please log in to Google first');
        return;
    }
    
    if (!eventId) {
        showError('Event ID is required for deletion');
        return;
    }
    
    // Confirm deletion
    if (!confirm('Are you sure you want to delete this event?')) {
        return;
    }
    
    // Get authentication token
    chrome.identity.getAuthToken({interactive: false}, (token) => {
        if (chrome.runtime.lastError || !token) {
            console.error('No auth token available:', chrome.runtime.lastError?.message);
            showError('Authentication required. Please log in to Google.');
            return;
        }
        
        // Make DELETE request to remove event
        const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;
        
        fetch(apiUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            console.log('Event deleted successfully');
            showStatus('Event deleted successfully!', 'success');
            
            // Refresh events list
            syncEvents();
        })
        .catch(error => {
            console.error('Error deleting event:', error);
            showError('Failed to delete event: ' + error.message);
        });
    });
}

/**
 * Sync events - refresh the event list from Google Calendar
 * EXPLANATION: Wrapper function to refresh events, used by refresh button and after CRUD operations
 * - Provides consistent way to reload events
 * - Updates UI state appropriately
 * - Handles authentication check
 */
function syncEvents() {
    console.log('Syncing events from Google Calendar...');
    
    if (!isAuthenticated) {
        showEventsError('Please log in to Google to sync your calendar events.');
        return;
    }
    
    // Call the main getEvents function
    getEvents();
}

/**
 * Show the event form for adding or editing events
 * EXPLANATION: Displays the event form and sets up for add or edit mode
 * - Clears form for new events or pre-fills for editing
 * - Updates form title and button text appropriately
 * - Focuses on first input for better UX
 * 
 * @param {Object} eventData - Optional event data for editing (null for new event)
 */
function showEventForm(eventOrData = null) {
    console.log('Showing event form:', eventOrData);

    const eventForm = document.getElementById('event-form');
    const formTitle = document.getElementById('event-form-title');
    const saveBtn = document.getElementById('save-event-btn');
    const form = document.getElementById('calendar-event-form');
    
    if (!eventForm || !formTitle || !saveBtn || !form) return;

    // Determine if this is EDIT mode only when we have a real event object with a non-empty id
    const isEdit = !!(eventOrData && typeof eventOrData === 'object' && eventOrData.id);
    
    console.log('[FormMode]', isEdit ? 'EDIT' : 'ADD');

    eventForm.style.display = 'block';

    if (isEdit) {
        const eventData = eventOrData;
        formTitle.textContent = 'Edit Event';
        saveBtn.textContent = 'Update Event';

        document.getElementById('event-title').value = eventData.title || '';
        document.getElementById('event-description').value = (eventData.description || '').replace(/\n*URL:\s+https?:\/\/[^\s\n]+/,'').trim();

        if (eventData.startDateTime) {
            const s = new Date(eventData.startDateTime);
            document.getElementById('event-start-date').value = s.toISOString().split('T')[0];
            document.getElementById('event-start-time').value = s.toTimeString().slice(0,5);
        }
        if (eventData.endDateTime) {
            const e = new Date(eventData.endDateTime);
            document.getElementById('event-end-date').value = e.toISOString().split('T')[0];
            document.getElementById('event-end-time').value = e.toTimeString().slice(0,5);
        }

        // Extract URL if present
        const urlMatch = (eventData.description || '').match(/URL:\s+(https?:\/\/[^\s\n]+)/);
        document.getElementById('event-url').value = urlMatch ? urlMatch[1] : '';

        // Store the ID only when it truly exists
        eventForm.setAttribute('data-event-id', eventData.id);
    } else {
        // ADD mode
        formTitle.textContent = 'Add Event';
        saveBtn.textContent = 'Create Event';

        form.reset();

        const now = new Date();
        const start = new Date(now.getTime() + 60 * 60 * 1000);
        const end = new Date(start.getTime() + 60 * 60 * 1000);

        document.getElementById('event-start-date').value = start.toISOString().split('T')[0];
        document.getElementById('event-start-time').value = start.toTimeString().slice(0,5);
        document.getElementById('event-end-date').value = end.toISOString().split('T')[0];
        document.getElementById('event-end-time').value = end.toTimeString().slice(0,5);
        document.getElementById('event-title').value = '';
        document.getElementById('event-description').value = '';
        document.getElementById('event-url').value = '';

        // Ensure no stale ID remains
        eventForm.removeAttribute('data-event-id');
    }

    setTimeout(() => document.getElementById('event-title')?.focus(), 50);
}

/**
 * Hide the event form
 * EXPLANATION: Hides the event form and resets it
 * - Clears all form data
 * - Removes any stored event IDs
 * - Provides clean state for next use
 */
function hideEventForm() {
    console.log('Hiding event form');
    
    const eventForm = document.getElementById('event-form');
    if (eventForm) {
        eventForm.style.display = 'none';
        
        // Reset form
        document.getElementById('calendar-event-form').reset();
        
        // Remove any stored event ID
        eventForm.removeAttribute('data-event-id');
    }
}

// Calendar view switching removed - only using Day view

/**
 * Switch content type between events only and tasks & events
 * EXPLANATION: Changes what content is displayed in the calendar view
 * - events: Shows only calendar events
 * - both: Shows both tasks (with due dates) and calendar events
 * 
 * @param {string} contentType - The content type to switch to ('events' or 'both')
 */
function switchContentType(contentType) {
    console.log('Switching content type to:', contentType);
    
    // Update current content type
    currentContentType = contentType;
    
    // Update active button styling
    document.querySelectorAll('.content-toggle-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-content="${contentType}"]`).classList.add('active');
    
    // Re-render calendar content with new type
    renderCalendarContent();
}

/**
 * Render calendar content based on current content type
 * EXPLANATION: Combines events and optionally tasks for calendar display
 * - Fetches both events and tasks if needed
 * - Combines them into a unified display
 * - Maintains the current view grouping (day/week/month)
 */
function renderCalendarContent() {
    console.log('Rendering calendar content:', currentContentType);
    
    if (currentContentType === 'events') {
        // Show only events (existing behavior)
        renderEvents();
    } else if (currentContentType === 'both') {
        // Show both tasks and events
        renderTasksAndEvents();
    }
}

/**
 * Render both tasks and events in the calendar view
 * EXPLANATION: Combines tasks with due dates and calendar events into one list
 * - Tasks with due dates are converted to event-like objects
 * - Both are sorted by date and displayed together
 * - Tasks are visually distinguished with different styling
 */
function renderTasksAndEvents() {
    console.log('Rendering tasks and events together');
    
    const eventsList = document.getElementById('events-list');
    const noEventsMsg = document.getElementById('no-events-message');
    
    if (!eventsList) {
        console.error('Events list element not found');
        return;
    }
    
    // Combine events and tasks with due dates
    const combinedItems = [];
    
    // Add calendar events
    currentEvents.forEach(event => {
        combinedItems.push({
            type: 'event',
            data: event,
            date: new Date(event.start?.dateTime || event.start?.date)
        });
    });
    
    // Add tasks with due dates
    currentTasks.forEach(task => {
        if (task.due) {
            combinedItems.push({
                type: 'task',
                data: task,
                date: new Date(task.due)
            });
        }
    });
    
    // Sort by date
    combinedItems.sort((a, b) => a.date - b.date);
    
    if (combinedItems.length === 0) {
        eventsList.innerHTML = '';
        noEventsMsg.style.display = 'block';
        return;
    }
    
    // Hide no events message
    noEventsMsg.style.display = 'none';
    
    // Group items based on current view mode (reuse existing logic)
    let itemsGrouped = {};
    
    if (currentCalendarView === 'day') {
        // Group by individual days
        combinedItems.forEach(item => {
            const dateKey = item.date.toDateString();
            if (!itemsGrouped[dateKey]) {
                itemsGrouped[dateKey] = [];
            }
            itemsGrouped[dateKey].push(item);
        });
    } else if (currentCalendarView === 'week') {
        // Group by weeks
        combinedItems.forEach(item => {
            const date = item.date;
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            
            const weekKey = `${weekStart.toDateString()} - ${weekEnd.toDateString()}`;
            if (!itemsGrouped[weekKey]) {
                itemsGrouped[weekKey] = [];
            }
            itemsGrouped[weekKey].push(item);
        });
    } else if (currentCalendarView === 'month') {
        // Group by months
        combinedItems.forEach(item => {
            const monthKey = item.date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long'
            });
            if (!itemsGrouped[monthKey]) {
                itemsGrouped[monthKey] = [];
            }
            itemsGrouped[monthKey].push(item);
        });
    }
    
    // Clear and render grouped items
    eventsList.innerHTML = '';
    
    Object.keys(itemsGrouped).sort((a, b) => {
        const firstItemA = itemsGrouped[a][0];
        const firstItemB = itemsGrouped[b][0];
        return firstItemA.date - firstItemB.date;
    }).forEach(groupKey => {
        // Create group header
        const groupHeader = document.createElement('div');
        groupHeader.className = 'events-date-header';
        
        if (currentCalendarView === 'day') {
            const date = new Date(groupKey);
            groupHeader.textContent = date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } else {
            groupHeader.textContent = groupKey;
        }
        
        eventsList.appendChild(groupHeader);
        
        // Create items container for this group
        const groupItemsContainer = document.createElement('div');
        groupItemsContainer.className = 'events-date-group';
        
        // Sort items within the group by time
        const sortedItems = itemsGrouped[groupKey].sort((a, b) => a.date - b.date);
        
        // Render each item in this group
        sortedItems.forEach(item => {
            if (item.type === 'event') {
                // Render as event (existing logic)
                renderEventItem(item.data, groupItemsContainer);
            } else if (item.type === 'task') {
                // Render as task-event
                renderTaskAsEvent(item.data, groupItemsContainer);
            }
        });
        
        eventsList.appendChild(groupItemsContainer);
    });
    
    console.log(`Rendered ${combinedItems.length} items (${currentEvents.length} events, ${currentTasks.filter(t => t.due).length} tasks with due dates)`);
}

/**
 * Render a single event item
 * @param {Object} event - The event object
 * @param {Element} container - The container to append to
 */
function renderEventItem(event, container) {
    // This is the existing event rendering logic, extracted for reuse
    const eventItem = document.createElement('div');
    eventItem.className = 'event-item';
    eventItem.setAttribute('data-event-id', event.id);
    
    // Event content container
    const eventContent = document.createElement('div');
    eventContent.className = 'event-content';
    
    // Event title
    const titleDiv = document.createElement('div');
    titleDiv.className = 'event-title';
    titleDiv.textContent = event.summary || 'Untitled Event';
    eventContent.appendChild(titleDiv);
    
    // Event time
    const timeDiv = document.createElement('div');
    timeDiv.className = 'event-time';
    
    const startDate = new Date(event.start?.dateTime || event.start?.date);
    const endDate = new Date(event.end?.dateTime || event.end?.date);
    
    if (event.start?.dateTime) {
        // Timed event
        const startTime = startDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: timeFormat === '12h'
        });
        const endTime = endDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: timeFormat === '12h'
        });
        timeDiv.textContent = `${startTime} - ${endTime}`;
    } else {
        // All-day event
        timeDiv.textContent = 'All day';
    }
    
    eventContent.appendChild(timeDiv);
    
    // Event description (if exists)
    if (event.description) {
        const descDiv = document.createElement('div');
        descDiv.className = 'event-description';
        descDiv.textContent = event.description.substring(0, 100) + (event.description.length > 100 ? '...' : '');
        eventContent.appendChild(descDiv);
    }
    
    eventItem.appendChild(eventContent);
    
    // Event actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'event-actions';
    
    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn edit-btn';
    editBtn.innerHTML = '✏️';
    editBtn.title = 'Edit event';
    editBtn.addEventListener('click', () => startEventEdit(event));
    actionsDiv.appendChild(editBtn);
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete-btn';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete event';
    deleteBtn.addEventListener('click', () => deleteEvent(event.id));
    actionsDiv.appendChild(deleteBtn);
    
    eventItem.appendChild(actionsDiv);
    container.appendChild(eventItem);
}

/**
 * Render a task as an event item
 * @param {Object} task - The task object
 * @param {Element} container - The container to append to
 */
function renderTaskAsEvent(task, container) {
    const taskItem = document.createElement('div');
    taskItem.className = 'event-item task-event';
    taskItem.setAttribute('data-task-id', task.id);
    
    // Task content container
    const taskContent = document.createElement('div');
    taskContent.className = 'event-content';
    
    // Task title with task icon
    const titleDiv = document.createElement('div');
    titleDiv.className = 'event-title';
    titleDiv.innerHTML = `📋 ${task.title}`;
    if (task.status === 'completed') {
        titleDiv.classList.add('completed');
    }
    taskContent.appendChild(titleDiv);
    
    // Task due time
    const timeDiv = document.createElement('div');
    timeDiv.className = 'event-time';
    const dueDate = new Date(task.due);
    timeDiv.textContent = `Due: ${dueDate.toLocaleDateString('en-US')}`;
    taskContent.appendChild(timeDiv);
    
    // Task notes (if exists)
    if (task.notes) {
        const notesDiv = document.createElement('div');
        notesDiv.className = 'event-description';
        notesDiv.textContent = task.notes.substring(0, 100) + (task.notes.length > 100 ? '...' : '');
        taskContent.appendChild(notesDiv);
    }
    
    taskItem.appendChild(taskContent);
    
    // Task actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'event-actions';
    
    // Complete/uncomplete button
    const completeBtn = document.createElement('button');
    completeBtn.className = 'action-btn complete-btn';
    completeBtn.innerHTML = task.status === 'completed' ? '✅' : '☐';
    completeBtn.title = task.status === 'completed' ? 'Mark as incomplete' : 'Mark as complete';
    completeBtn.addEventListener('click', () => {
        toggleTaskCompletion(task.id, task.status !== 'completed');
        // Re-render to update the display
        setTimeout(() => renderCalendarContent(), 500);
    });
    actionsDiv.appendChild(completeBtn);
    
    taskItem.appendChild(actionsDiv);
    container.appendChild(taskItem);
}

/**
 * Start editing an event
 * EXPLANATION: Prepares and shows the event form with existing event data for editing
 * - Extracts event data from Google Calendar format
 * - Calls showEventForm with event data to pre-fill form
 * - Handles date/time conversion for form inputs
 * 
 * @param {Object} event - Google Calendar event object
 */
function startEventEdit(event) {
    console.log('Starting event edit:', event.id);
    
    // Prepare event data for the form
    const eventData = {
        id: event.id,
        title: event.summary || '',
        description: event.description || '',
        startDateTime: event.start?.dateTime || event.start?.date,
        endDateTime: event.end?.dateTime || event.end?.date
    };
    
    // Show the form in edit mode
    showEventForm(eventData);
}

/**
 * Handle event form submission
 * EXPLANATION: Processes the event form when user submits it
 * - Validates form data
 * - Determines if this is create or update based on stored event ID
 * - Calls appropriate API function (createEvent or updateEvent)
 * - Handles date/time conversion from form inputs to ISO format
 */
function handleEventFormSubmit(event) {
    event.preventDefault();
    
    if (!isAuthenticated) {
        showError('Please log in to Google first');
        return;
    }
    
    // Get form values
    const title = document.getElementById('event-title').value.trim();
    const description = document.getElementById('event-description').value.trim();
    const startDate = document.getElementById('event-start-date').value;
    const startTime = document.getElementById('event-start-time').value;
    const endDate = document.getElementById('event-end-date').value;
    const endTime = document.getElementById('event-end-time').value;
    const url = document.getElementById('event-url').value.trim();
    
    // Debug logging to confirm values are being read
    console.log('Event form values:', {
        title,
        description,
        startDate,
        startTime,
        endDate,
        endTime,
        url
    });
    
    // Validate required fields - only title and start date are required
    if (!title || !startDate) {
        console.error('Validation failed: missing required fields', { title, startDate });
        showError('Event title and start date are required');
        return;
    }
    
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    function addDaysISO(yyyy_mm_dd, days) {
        const [y,m,d] = yyyy_mm_dd.split('-').map(Number);
        const dt = new Date(y, m-1, d + days);
        return dt.toISOString().split('T')[0];
    }

    let eventData;

    if (startDate && !startTime) {
        // ALL-DAY event (no times)
        const startDateISO = startDate;               // 'YYYY-MM-DD' from the date input
        const endDateISO = endDate ? endDate : addDaysISO(startDateISO, 1); // end is exclusive
        // Ensure end > start
        if (endDate && endDate <= startDate) {
            showError('End date must be after start date');
            return;
        }
        eventData = {
            summary: title,
            description: description || '',
            start: { date: startDateISO },
            end: { date: endDateISO }
        };
    } else {
        // TIMED event
        const startISO = new Date(`${startDate}T${(startTime || '09:00')}`).toISOString();
        let endISO;
        if (endDate || endTime) {
            const endDateUse = endDate || startDate;
            const endTimeUse = endTime || (startTime ? startTime : '10:00');
            endISO = new Date(`${endDateUse}T${endTimeUse}`).toISOString();
            if (new Date(endISO) <= new Date(startISO)) {
                showError('End time must be after start time');
                return;
            }
        } else {
            const tmp = new Date(startISO); tmp.setHours(tmp.getHours() + 1);
            endISO = tmp.toISOString();
        }
        eventData = {
            summary: title,
            description: description || '',
            start: { dateTime: startISO, timeZone: tz },
            end: { dateTime: endISO, timeZone: tz }
        };
    }
    
    // Add URL to description if provided
    if (url) {
        eventData.description += (eventData.description ? '\n\n' : '') + `URL: ${url}`;
    }
    
    console.log('Prepared event data for Google Calendar API:', eventData);
    
    // Check if this is an update (form has event ID) or create
    const eventForm = document.getElementById('event-form');
    const rawId = eventForm.getAttribute('data-event-id');
    const eventId = (rawId && rawId !== 'undefined' && rawId !== 'null') ? rawId : null;
    
    console.log('[Submit]', eventId ? 'PATCH' : 'POST', { eventId, eventData });
    
    if (eventId) {
        // Update existing event
        updateEvent(eventId, eventData);
    } else {
        // Create new event
        createEvent(eventData);
    }
}

/**
 * Handle task form submission (legacy - keeping for compatibility)
 */
function handleTaskFormSubmit(event) {
    event.preventDefault();
    
    const title = document.getElementById('task-title')?.value.trim();
    const description = document.getElementById('task-description')?.value.trim();
    
    if (!title) {
        showError('Task title is required');
        return;
    }
    
    // Add task with current page URL as link
    addTask(title, description, currentPageUrl);
}


// Duplicate function removed - using the first handleEventFormSubmit function above

/**
 * Fill task title with current page title
 */
function useCurrentPageTitle() {
    if (currentPageTitle) {
        document.getElementById('task-title').value = currentPageTitle;
        showStatus('Used current page title', 'success');
    } else {
        showError('No page title available');
    }
}

/**
 * Clear the task form
 */
function clearTaskForm() {
    const idEl = document.getElementById('editing-task-id');
    const titleEl = document.getElementById('task-title-detailed');
    const detailsEl = document.getElementById('task-details');
    const urlEl = document.getElementById('task-url');
    const dateEl = document.getElementById('custom-due-date');

    if (idEl) idEl.value = '';
    if (titleEl) titleEl.value = '';
    if (detailsEl) detailsEl.value = '';
    if (urlEl) urlEl.value = '';
    if (dateEl) dateEl.value = '';

    // reset any active quick due buttons
    document.querySelectorAll('.due-btn.active').forEach(btn => btn.classList.remove('active'));

    // reset the submit button text to "Save Task" (not "Update Task")
    const submitBtn = document.getElementById('detailed-task-submit');
    if (submitBtn) submitBtn.textContent = 'Save Task';
}

/**
 * Clear the Save Current Tab form
 */
function clearSaveTabForm() {
    const titleEl = document.getElementById('saved-tab-title');
    const noteEl  = document.getElementById('saved-tab-note');
    const urlEl   = document.getElementById('saved-tab-url');
    if (titleEl) titleEl.value = '';
    if (noteEl)  noteEl.value  = '';
    if (urlEl)   urlEl.value   = '';
}

/**
 * Create a new group in LinkHive
 * @param {string} name - The name of the group to create
 */
function createGroup(name) {
    if (!name || !name.trim()) {
        if (typeof showError === 'function') showError('Group name cannot be empty');
        return;
    }

    const savedTabsList = document.getElementById('saved-tabs-list');
    if (!savedTabsList) return;

    const groupEl = document.createElement('div');
    groupEl.className = 'saved-tab-group';
    groupEl.innerHTML = `
        <h4 class="group-title">${name}</h4>
        <div class="group-items" id="group-${name.replace(/\s+/g, '-').toLowerCase()}"></div>
    `;
    savedTabsList.appendChild(groupEl);

    if (typeof showStatus === 'function') showStatus(`Group "${name}" created`, 'success');
}

/**
 * Clear the event form
 */
function clearEventForm() {
    document.getElementById('event-title').value = '';
    document.getElementById('event-datetime').value = '';
    document.getElementById('event-duration').value = '1';
}

function loadStarredSavedTabs() {
    chrome.storage.sync.get(['starredSavedTabs'], (res) => {
        if (chrome.runtime.lastError) {
            chrome.storage.local.get(['starredSavedTabs'], (res2) => {
                const arr = Array.isArray(res2.starredSavedTabs) ? res2.starredSavedTabs : [];
                starredSavedTabs = new Set(arr);
            });
            return;
        }
        const arr = Array.isArray(res.starredSavedTabs) ? res.starredSavedTabs : [];
        starredSavedTabs = new Set(arr);
    });
}

function saveStarredSavedTabs() {
    const arr = Array.from(starredSavedTabs);
    chrome.storage.sync.set({ starredSavedTabs: arr }, () => {
        if (chrome.runtime.lastError) {
            chrome.storage.local.set({ starredSavedTabs: arr }, () => {});
        }
    });
}

function isLinkStarred(id) {
    return starredSavedTabs.has(id);
}

function toggleLinkStar(id) {
    if (starredSavedTabs.has(id)) starredSavedTabs.delete(id);
    else starredSavedTabs.add(id);
    saveStarredSavedTabs();
    renderSavedTabs(); // re-render to pin/unpin within group
}

// Helper function to get element by ID
function el(id) {
    return document.getElementById(id);
}

// Helper function to get active tab info
async function getActiveTabInfo() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return { title: tab?.title || '', url: tab?.url || '' };
    } catch (e) {
        console.error('Could not fetch current tab info:', e);
        return { title: '', url: '' };
    }
}

// Helper function to load groups into select
async function loadGroupsIntoSelect() {
    const select = el('saved-tab-group');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Group --</option>';

    try {
        const data = await chrome.storage.local.get(GROUPS_KEY);
        const groups = data[GROUPS_KEY] || [];

        groups.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    } catch (e) {
        console.warn('Failed to load groups from storage', e);
    }

    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '+ Create New Group…';
    select.appendChild(newOpt);
}

// Form handling functions
async function openSaveTabForm(prefill = null) {
    resetSaveTabForm();

    if (prefill && prefill.id) {
        // edit mode
        el('editing-savedtab-id').value = prefill.id;
        el('saved-tab-title').value = prefill.title || '';
        el('saved-tab-note').value  = prefill.note  || '';
        el('saved-tab-url').value   = prefill.url   || '';
        await loadGroupsIntoSelect();
        el('saved-tab-group').value = prefill.group || '';
        const submit = document.getElementById('save-link-btn') || document.getElementById('save-tab-submit');
        if (submit) submit.textContent = 'Update Link';
    } else {
        // NEW: always query the active tab now
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        el('saved-tab-title').value = tab?.title || '';
        el('saved-tab-url').value   = tab?.url   || '';
        await loadGroupsIntoSelect();
        const submit = document.getElementById('save-link-btn') || document.getElementById('save-tab-submit');
        if (submit) submit.textContent = 'Save Link';
    }

    // show the form
    el('save-tab-form').style.display = 'block';
    el('saved-tab-title').focus();
}

function resetSaveTabForm() {
    if (el('save-tab-form-element')) el('save-tab-form-element').reset();
    ['saved-tab-url','saved-tab-title','saved-tab-note','new-group-name'].forEach(id => { if (el(id)) el(id).value=''; });
    if (el('saved-tab-group')) el('saved-tab-group').value = '';
    if (el('inline-new-group')) el('inline-new-group').classList.add('hidden');
    if (el('editing-savedtab-id')) el('editing-savedtab-id').value = '';
    const submit = document.getElementById('save-link-btn') || document.getElementById('save-tab-submit');
    if (submit) submit.textContent = 'Save Link';
}

async function clearAllLinkHive() {
  if (!confirm('Clear ALL saved links and groups?')) return;

  // 1) wipe storage (items, groups, starred)
  await new Promise(res => chrome.storage.local.set({
    linkHiveItems: [],
    linkHiveGroups: []
  }, res));
  await new Promise(res => chrome.storage.sync.set({
    starredSavedTabs: []
  }, res));

  // 2) reset any in-memory caches if they exist
  try { if (typeof savedTabsCache !== 'undefined') savedTabsCache = []; } catch {}
  try { if (typeof starredSavedTabs !== 'undefined') starredSavedTabs = new Set(); } catch {}

  // 3) refresh UI lists safely
  const list = document.getElementById('saved-tabs-list');
  if (list) list.innerHTML = '';

  // 4) reset the Group dropdown INSIDE the Save Current Tab form
  const sel = document.getElementById('saved-tab-group');
  if (typeof loadGroupsIntoSelect === 'function') {
    // load from storage (now [])
    await loadGroupsIntoSelect();
    if (sel) sel.value = '';
  } else if (sel) {
    sel.innerHTML = '';
    sel.appendChild(new Option('-- Select Group --', ''));
    sel.appendChild(new Option('+ Create New Group…', '__new__'));
  }

  // hide inline new-group row if visible
  const inline = document.getElementById('inline-new-group');
  if (inline) inline.classList.add('hidden');

  // 5) re-render (if renderer exists) and toast
  if (typeof renderSavedTabs === 'function') await renderSavedTabs();
  if (typeof showStatus === 'function') showStatus('All tabs cleared successfully', 'success');
}

// =============================================================================
// LINKHIVE GROUPS - Dropdown loading, persistence, and creation
// =============================================================================

async function loadGroups() {
    const select = document.getElementById('saved-tab-group');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Group --</option>';

    try {
        const data = await chrome.storage.local.get(GROUPS_KEY);
        const groups = data[GROUPS_KEY] || [];

        groups.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    } catch (e) {
        console.warn('Failed to load groups from storage', e);
    }

    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '+ Create New Group…';
    select.appendChild(newOpt);
}

async function saveGroups(groups) {
    await chrome.storage.local.set({ [GROUPS_KEY]: groups });
}

document.addEventListener('change', async (e) => {
    if (e.target && e.target.id === 'saved-tab-group') {
        const value = e.target.value;
        const newGroupContainer = document.getElementById('inline-new-group');
        if (!newGroupContainer) return;
        if (value === '__new__') {
            newGroupContainer.classList.remove('hidden');
            const input = document.getElementById('new-group-name');
            if (input) input.focus();
        } else {
            newGroupContainer.classList.add('hidden');
        }
    }
});

document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'confirm-create-group') {
        const input = document.getElementById('new-group-name');
        const name = input ? input.value.trim() : '';
        if (!name) {
            if (typeof showError === 'function') showError('Group name cannot be empty');
            return;
        }

        const data = await chrome.storage.local.get(GROUPS_KEY);
        const groups = data[GROUPS_KEY] || [];
        if (groups.includes(name)) {
            if (typeof showError === 'function') showError('Group already exists');
            return;
        }
        groups.push(name);
        await saveGroups(groups);

        // Create visual group
        if (typeof createGroup === 'function') {
            createGroup(name);
        }

        // Refresh dropdown
        await loadGroups();

        // Reset input UI
        if (input) input.value = '';
        const newGroupContainer = document.getElementById('inline-new-group');
        if (newGroupContainer) newGroupContainer.classList.add('hidden');

        if (typeof showStatus === 'function') showStatus(`Group "${name}" created`, 'success');
    }
});

/**
 * Get information about the current webpage
 */
function getCurrentPageInfo() {
    // Get current tab information
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs && tabs.length > 0) {
            const tab = tabs[0];
            currentPageTitle = tab.title || '';
            currentPageUrl = tab.url || '';
            
            // Update UI (current page elements were removed, so just log the info)
            console.log('Current page info:', currentPageTitle, currentPageUrl);
        }
    });
}

/**
 * Show a status message to the user
 * @param {string} message - The message to show
 * @param {string} type - Type of message ('success', 'error', 'info')
 */
function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('status-messages');
    
    // Remove existing messages
    statusDiv.innerHTML = '';
    
    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.className = `status-message ${type}`;
    messageDiv.textContent = message;
    
    statusDiv.appendChild(messageDiv);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 3000);
}

/**
 * Show an error message
 * @param {string} message - The error message
 */
function showError(message) {
    showStatus(message, 'error');
    console.error('Error:', message);
}

console.log('TaskEx popup.js loaded successfully!');



