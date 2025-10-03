/*
   POPUP.JS - TaskEx Chrome Extension Frontend
   This file handles the popup interface and communicates with Google Tasks and Calendar APIs
   through the background service worker. Each function is explained in simple terms.
*/

// =============================================================================
// GLOBAL VARIABLES - Store important data used throughout the popup
// =============================================================================

let isAuthenticated = false;      // Whether user is logged in to Google
let currentTasks = [];           // Array to store tasks from Google Tasks
let currentEvents = [];          // Array to store events from Google Calendar
let currentPageTitle = '';       // Title of the current webpage
let currentPageUrl = '';         // URL of the current webpage
let currentCalendarView = 'day'; // Current calendar view: 'day', 'week', or 'month'
let currentContentType = 'events'; // Current content type: 'events' or 'both'
let starredTasks = new Set();    // Set of starred task IDs (stored locally)

// Settings variables
let currentTheme = 'light';      // Current theme: 'light' or 'dark'
let timeFormat = '12h';          // Time format: '12h' or '24h'
// Interface mode removed - always using side panel

// =============================================================================
// INITIALIZATION - Code that runs when popup opens
// =============================================================================

/**
 * Main initialization function - runs when popup HTML is loaded
 * Sets up all the interactive elements and checks authentication
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('TaskEx popup loaded!');
    
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
    
    // Ensure To-Do tab is active by default and load tasks
    // Note: showTab is defined in setupTabSwitching, so we'll call it after setup
    getCurrentPageInfo();
});

// =============================================================================
// AUTHENTICATION FUNCTIONS - Handle Google login/logout
// =============================================================================

/**
 * Check if user is authenticated with Google
 * Updates the UI to show login/logout buttons accordingly
 */
function checkAuthenticationStatus() {
    console.log('Checking authentication status...');
    
    // Ask background script if user is authenticated
    chrome.runtime.sendMessage({action: 'checkAuth'}, (response) => {
        if (response && response.success) {
            isAuthenticated = response.authenticated;
            updateAuthUI();
            
            if (isAuthenticated) {
                // User is logged in - load their data
                console.log('User is authenticated, loading data...');
                getTasks();
                getEvents();
                
                // Ensure To-Do tab is visible and tasks are loaded
                showTab('todo');
            } else {
                // User is not logged in - show login prompt
                console.log('User is not authenticated');
                showLoginPrompt();
            }
        } else {
            console.error('Failed to check authentication:', response?.error);
            showError('Failed to check login status');
        }
    });
}

/**
 * Update the authentication UI based on login status
 * Shows/hides login and logout buttons in the top bar
 */
function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const authLoading = document.getElementById('auth-loading');
    const connectBtn = document.getElementById('connect-calendar-btn');
    
    // Hide loading state
    if (authLoading) {
        authLoading.style.display = 'none';
    }
    
    if (isAuthenticated) {
        // User is logged in - show logout button
        if (loginBtn) loginBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        
        // Update connect calendar button
        if (connectBtn) {
            connectBtn.textContent = '✅ Connected to Google';
            connectBtn.disabled = true;
            connectBtn.style.opacity = '0.7';
        }
    } else {
        // User is not logged in - show login button
        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        
        // Update connect calendar button
        if (connectBtn) {
            connectBtn.textContent = '🔗 Connect Google Calendar';
            connectBtn.disabled = false;
            connectBtn.style.opacity = '1';
        }
    }
}

/**
 * Show a message prompting user to log in
 */
function showLoginPrompt() {
    const tasksList = document.getElementById('tasks-list');
    const eventsList = document.getElementById('calendar-events');
    
    tasksList.innerHTML = '<li class="login-prompt">Please log in to Google to see your tasks</li>';
    eventsList.innerHTML = '<li class="login-prompt">Please log in to Google to see your events</li>';
}

/**
 * Handle login button click - start Google authentication
 */
function handleLogin() {
    console.log('Starting login process...');
    showStatus('Logging in to Google...', 'info');
    
    // Ask background script to start authentication
    chrome.runtime.sendMessage({action: 'authenticate'}, (response) => {
        if (response && response.success) {
            // Authentication started - check status after a delay
            setTimeout(() => {
                checkAuthenticationStatus();
            }, 2000);
        } else {
            console.error('Failed to start authentication:', response?.error);
            showError('Failed to start login process');
        }
    });
}

/**
 * Handle logout button click - remove Google authentication
 */
function handleLogout() {
    console.log('Logging out...');
    showStatus('Logging out...', 'info');
    
    // Ask background script to logout
    chrome.runtime.sendMessage({action: 'logout'}, (response) => {
        if (response && response.success) {
            isAuthenticated = false;
            updateAuthUI();
            showLoginPrompt();
            showStatus('Logged out successfully', 'success');
        } else {
            console.error('Failed to logout:', response?.error);
            showError('Failed to logout');
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
    
    // Update theme toggle UI
    updateThemeToggleUI();
    
    // Save theme preference
    chrome.storage.local.set({ theme: theme }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving theme:', chrome.runtime.lastError);
        } else {
            console.log('Theme saved:', theme);
        }
    });
}

// Interface toggle UI function removed - always using side panel

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
    
    // Save time format preference
    chrome.storage.local.set({ timeFormat: format }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving time format:', chrome.runtime.lastError);
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
 * Set up event handlers for settings toggles and buttons
 */
function setupSettingsHandlers() {
    console.log('Setting up settings handlers...');
    
    // Interface mode toggle removed - always using side panel
    
    // Theme toggle handlers
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', (e) => {
            if (e.target.classList.contains('toggle-option') || e.target.closest('.toggle-option')) {
                const option = e.target.closest('.toggle-option');
                const theme = option.getAttribute('data-theme');
                if (theme && theme !== currentTheme) {
                    applyTheme(theme);
                    showStatus(`Switched to ${theme} theme`, 'success');
                }
            }
        });
    }
    
    // Time format toggle handlers
    const timeFormatToggle = document.getElementById('time-format-toggle');
    if (timeFormatToggle) {
        timeFormatToggle.addEventListener('click', (e) => {
            if (e.target.classList.contains('toggle-option') || e.target.closest('.toggle-option')) {
                const option = e.target.closest('.toggle-option');
                const format = option.getAttribute('data-format');
                if (format && format !== timeFormat) {
                    setTimeFormat(format);
                    showStatus(`Time format set to ${format.toUpperCase()}`, 'success');
                }
            }
        });
    }
    
    // Connect calendar button handler
    const connectBtn = document.getElementById('connect-calendar-btn');
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            if (!isAuthenticated) {
                handleLogin();
            }
        });
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
    chrome.storage.local.get(['starredTasks'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Error loading starred tasks:', chrome.runtime.lastError);
            return;
        }
        
        const starred = result.starredTasks || [];
        starredTasks = new Set(starred);
        console.log('Loaded starred tasks:', starred.length);
    });
}

/**
 * Save starred tasks to Chrome storage
 * EXPLANATION: Persists the starred tasks set to local storage
 */
function saveStarredTasks() {
    const starredArray = Array.from(starredTasks);
    chrome.storage.local.set({ starredTasks: starredArray }, () => {
        if (chrome.runtime.lastError) {
            console.error('Error saving starred tasks:', chrome.runtime.lastError);
        } else {
            console.log('Starred tasks saved:', starredArray.length);
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
    console.log('Fetching tasks from Google Tasks...');
    
    // Show loading message
    const tasksList = document.getElementById('tasks-list');
    if (tasksList) {
        tasksList.innerHTML = '<div class="loading-message">Loading tasks...</div>';
    }
    
    // Request tasks from background script
    chrome.runtime.sendMessage({action: 'getTasks'}, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Chrome runtime error:', chrome.runtime.lastError);
            showError('Extension error. Please reload the extension.');
            return;
        }
        
        if (response && response.success) {
            console.log('Tasks fetched successfully:', response.tasks?.length || 0);
            currentTasks = response.tasks || [];
            renderTasks();
        } else {
            console.error('Error fetching tasks - full response:', response);
            console.error('Chrome runtime error:', chrome.runtime.lastError);
            
            // Show user-friendly error message
            const errorMsg = response?.error || 'Unknown error';
            if (errorMsg.includes('Authentication required') || errorMsg.includes('401')) {
                showError('Your Google login has expired. Please log out and log back in.');
                showLoginPrompt();
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
            
            // Clear the form
            clearTaskForm();
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
    
    // Clear existing content
    tasksList.innerHTML = '';
    
    if (currentTasks.length === 0) {
        tasksList.innerHTML = '<div class="no-items">No tasks found. Add your first task above!</div>';
        return;
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
    console.log('Starting task edit:', taskId);
    
    const task = currentTasks.find(t => t.id === taskId);
    if (!task) return;
    
    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskItem) return;
    
    // Add editing class
    taskItem.classList.add('editing');
    
    const taskContent = taskItem.querySelector('.task-content');
    const titleDiv = taskContent.querySelector('.task-title');
    const detailsDiv = taskContent.querySelector('.task-details');
    
    // Replace title with input
    const titleInput = document.createElement('input');
    titleInput.className = 'task-edit-input';
    titleInput.value = task.title;
    titleDiv.replaceWith(titleInput);
    
    // Replace details with textarea (if exists)
    let detailsTextarea = null;
    if (detailsDiv) {
        detailsTextarea = document.createElement('textarea');
        detailsTextarea.className = 'task-edit-textarea';
        detailsTextarea.value = task.notes || '';
        detailsDiv.replaceWith(detailsTextarea);
    } else if (task.notes) {
        // Create textarea for notes if none existed
        detailsTextarea = document.createElement('textarea');
        detailsTextarea.className = 'task-edit-textarea';
        detailsTextarea.value = task.notes;
        taskContent.appendChild(detailsTextarea);
    }
    
    // Add edit actions
    const editActions = document.createElement('div');
    editActions.className = 'task-edit-actions';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-edit-btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => saveTaskEdit(taskId, titleInput.value, detailsTextarea?.value || ''));
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cancel-edit-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => cancelTaskEdit(taskId));
    
    editActions.appendChild(saveBtn);
    editActions.appendChild(cancelBtn);
    taskContent.appendChild(editActions);
    
    // Focus on title input
    titleInput.focus();
    titleInput.select();
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
function getEvents() {
    console.log('Fetching upcoming calendar events...');
    
    // Show loading message
    const eventsList = document.getElementById('calendar-events');
    eventsList.innerHTML = '<li class="loading-message">Loading events...</li>';
    
    // Get authentication token using Chrome Identity API
    chrome.identity.getAuthToken({interactive: false}, (token) => {
        if (chrome.runtime.lastError || !token) {
            console.error('No auth token available:', chrome.runtime.lastError?.message);
            showError('Please log in to Google first');
            showLoginPrompt();
            return;
        }
        
        // Set up API request to get upcoming events
        // Only get events from now onwards (no past events)
        const now = new Date();
        
        // Build Google Calendar API URL with parameters
        const apiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
        apiUrl.searchParams.set('timeMin', now.toISOString());        // Only future events
        apiUrl.searchParams.set('singleEvents', 'true');             // Expand recurring events
        apiUrl.searchParams.set('orderBy', 'startTime');             // Order by start time
        apiUrl.searchParams.set('maxResults', '10');                 // Limit to 10 events
        
        // Make the API request to Google Calendar
        fetch(apiUrl.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Events fetched successfully:', data.items?.length || 0);
            currentEvents = data.items || [];
            renderEvents();
        })
        .catch(error => {
            console.error('Error fetching events:', error);
            showError('Failed to load events: ' + error.message);
            eventsList.innerHTML = '<li class="error-message">Failed to load events</li>';
        });
    });
}

/**
 * Add a new event to Google Calendar
 * @param {string} title - The event title (required)
 * @param {string} datetime - Start date and time (ISO string or datetime-local format)
 */
function addEvent(title, datetime) {
    console.log('Adding new calendar event:', title);
    
    // Validate required parameters
    if (!title.trim() || !datetime) {
        showError('Event title and date/time are required');
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
    const refreshTasksManualBtn = document.getElementById('refresh-tasks-manual-btn');
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
    
    // Expand form button
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
        cancelTaskBtn.addEventListener('click', closeExpandedForm);
    }
}

/**
 * Set up tab switching functionality for all three tabs
 */
function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = {
        'todo': document.getElementById('todo-content'),
        'calendar': document.getElementById('calendar-content'),
        'settings': document.getElementById('settings-content')
    };
    
    // Add click handler to each tab button
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            switchToTab(tabName);
        });
    });
    
    /**
     * Switch to a specific tab (global function)
     * @param {string} tabName - Name of tab to switch to ('todo', 'calendar', 'settings')
     */
    window.showTab = function(tabName) {
        console.log('Switching to tab:', tabName);
        
        // Remove active class from all tab buttons
        tabButtons.forEach(btn => btn.classList.remove('active'));
        
        // Hide all tab content
        Object.values(tabContents).forEach(content => {
            if (content) content.style.display = 'none';
        });
        
        // Activate the selected tab button
        const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
        
        // Show the selected tab content
        const activeContent = tabContents[tabName];
        if (activeContent) {
            activeContent.style.display = 'block';
        }
        
        // Load data for the active tab if needed
        if (tabName === 'todo') {
            // Always try to load tasks for todo tab, regardless of auth state
            // getTasks() will handle authentication errors gracefully
            getTasks();
        } else if (tabName === 'calendar' && isAuthenticated && currentEvents.length === 0) {
            // Load events when switching to calendar tab
            getEvents();
        }
    };
    
    // Also create a local reference for internal use
    function switchToTab(tabName) {
        return window.showTab(tabName);
    }
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
function toggleExpandedForm() {
    const expandedForm = document.getElementById('expanded-task-form');
    const expandBtn = document.getElementById('expand-form-btn');
    
    if (expandedForm.style.display === 'none' || !expandedForm.style.display) {
        // Show the form
        expandedForm.style.display = 'block';
        expandBtn.innerHTML = '<span class="btn-icon">−</span>';
        expandBtn.title = 'Close form';
        
        // Focus on title input
        const titleInput = document.getElementById('task-title-detailed');
        if (titleInput) {
            setTimeout(() => titleInput.focus(), 100);
        }
    } else {
        // Hide the form
        closeExpandedForm();
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
}

/**
 * Handle detailed task form submission
 * Maps form fields to Google Tasks API fields
 */
function handleDetailedTaskSubmit(event) {
    event.preventDefault();
    
    if (!isAuthenticated) {
        showError('Please log in to Google first');
        return;
    }
    
    // Get form values
    const title = document.getElementById('task-title-detailed').value.trim();
    const details = document.getElementById('task-details').value.trim();
    const url = document.getElementById('task-url').value.trim();
    const customDueDate = document.getElementById('custom-due-date').value;
    // Auto-sync to calendar if task has a due date (no checkbox needed)
    let syncToCalendar = false;
    
    if (!title) {
        showError('Task title is required');
        return;
    }
    
    // Build task data for Google Tasks API
    const taskData = {
        title: title  // Maps to Google Tasks 'title' field
    };
    
    // Build notes field combining details and URL
    let notes = '';
    if (details) {
        notes += details;
    }
    if (url) {
        notes += (notes ? '\n\n' : '') + `URL: ${url}`;
    }
    if (notes) {
        taskData.notes = notes;  // Maps to Google Tasks 'notes' field
    }
    
    // Handle due date - maps to Google Tasks 'due' field
    const activeDueBtn = document.querySelector('.due-btn.active');
    if (activeDueBtn) {
        const dueType = activeDueBtn.getAttribute('data-due');
        if (dueType === 'today') {
            taskData.due = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';
            syncToCalendar = true; // Auto-sync tasks with due dates
        } else if (dueType === 'tomorrow') {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            taskData.due = tomorrow.toISOString().split('T')[0] + 'T00:00:00.000Z';
            syncToCalendar = true; // Auto-sync tasks with due dates
        }
    } else if (customDueDate) {
        taskData.due = new Date(customDueDate).toISOString();
        syncToCalendar = true; // Auto-sync tasks with due dates
    }
    
    console.log('Creating detailed task:', taskData);
    
    // Call Google Tasks API through background script
    chrome.runtime.sendMessage({
        action: 'createTask',
        data: taskData
    }, (response) => {
        if (response && response.success) {
            showStatus('Task created successfully!', 'success');
            getTasks(); // Refresh task list
            
            // If sync to calendar is checked, create a corresponding calendar event
            if (syncToCalendar && taskData.due) {
                createCalendarEventFromTask(title, details, taskData.due, url);
            }
            
            closeExpandedForm(); // Close and reset form
        } else {
            console.error('Error creating task - full response:', response);
            console.error('Chrome runtime error:', chrome.runtime.lastError);
            // Show user-friendly error message
            const errorMsg = response?.error || 'Unknown error';
            if (errorMsg.includes('401') || errorMsg.includes('unauthorized')) {
                showError('Your Google login has expired. Please log out and log back in.');
            } else if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
                showError('Permission denied. Please check your Google Tasks permissions.');
            } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
                showError('Could not connect to Google Tasks. Please check your internet connection.');
            } else {
                showError(`Could not save task: ${errorMsg}`);
            }
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
    // View toggle buttons
    const viewToggleBtns = document.querySelectorAll('.view-toggle-btn');
    viewToggleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.target.getAttribute('data-view');
            switchCalendarView(view);
        });
    });
    
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
        addEventBtn.addEventListener('click', showEventForm);
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
function getEvents() {
    console.log('Fetching events from Google Calendar API...');
    
    if (!isAuthenticated) {
        showEventsError('Please log in to Google to view your calendar events.');
        return;
    }
    
    // Show loading state
    showEventsLoading();
    
    // Get authentication token
    chrome.identity.getAuthToken({interactive: false}, (token) => {
        if (chrome.runtime.lastError || !token) {
            console.error('No auth token available:', chrome.runtime.lastError?.message);
            showEventsError('Authentication required. Please log in to Google.');
            return;
        }
        
        // Set up API request parameters
        const now = new Date();
        const maxTime = new Date();
        maxTime.setMonth(maxTime.getMonth() + 3); // Get events for next 3 months
        
        const apiUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
        apiUrl.searchParams.set('timeMin', now.toISOString());
        apiUrl.searchParams.set('timeMax', maxTime.toISOString());
        apiUrl.searchParams.set('singleEvents', 'true');
        apiUrl.searchParams.set('orderBy', 'startTime');
        apiUrl.searchParams.set('maxResults', '50');
        
        // Make API request
        fetch(apiUrl.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                // Handle specific HTTP error codes with user-friendly messages
                if (response.status === 401) {
                    throw new Error('Your Google login has expired. Please log out and log back in.');
                } else if (response.status === 403) {
                    throw new Error('Permission denied. Please check your Google Calendar permissions.');
                } else if (response.status === 429) {
                    throw new Error('Too many requests. Please wait a moment and try again.');
                } else if (response.status >= 500) {
                    throw new Error('Google Calendar is temporarily unavailable. Please try again later.');
                } else {
                    throw new Error('Could not load events. Please check your internet connection and try again.');
                }
            }
            return response.json();
        })
        .then(data => {
            console.log('Events fetched successfully:', data.items?.length || 0);
            currentEvents = data.items || [];
            renderEvents();
        })
        .catch(error => {
            console.error('Error fetching events:', error);
            // Show user-friendly error message
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                showEventsError('Could not connect to Google Calendar. Please check your internet connection.');
            } else {
                showEventsError(error.message);
            }
        });
    });
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
function createEvent(eventData) {
    console.log('Creating new calendar event:', eventData);
    
    if (!isAuthenticated) {
        showError('Please log in to Google first');
        return;
    }
    
    // Validate required fields - only summary and start are required
    if (!eventData.summary || !eventData.start?.dateTime) {
        console.error('Event validation failed:', eventData);
        showError('Event title and start date are required');
        return;
    }
    
    // Ensure end is set (should be set by handleEventFormSubmit)
    if (!eventData.end?.dateTime) {
        // Default to 1 hour after start time
        const startTime = new Date(eventData.start.dateTime);
        startTime.setHours(startTime.getHours() + 1);
        eventData.end = {
            dateTime: startTime.toISOString(),
            timeZone: eventData.start.timeZone
        };
    }
    
    // Get authentication token
    chrome.identity.getAuthToken({interactive: false}, (token) => {
        if (chrome.runtime.lastError || !token) {
            console.error('No auth token available:', chrome.runtime.lastError?.message);
            showError('Authentication required. Please log in to Google.');
            return;
        }
        
        // Use the event data directly (already in correct Google Calendar API format)
        const googleEventData = eventData;
        
        // Add URL to description if provided
        if (eventData.url) {
            googleEventData.description += (googleEventData.description ? '\n\n' : '') + `URL: ${eventData.url}`;
        }
        
        // Make API request to create event
        const apiUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
        
        fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(googleEventData)
        })
        .then(response => {
            if (!response.ok) {
                // Handle specific HTTP error codes with user-friendly messages
                if (response.status === 401) {
                    throw new Error('Your Google login has expired. Please log out and log back in.');
                } else if (response.status === 403) {
                    throw new Error('Permission denied. Please check your Google Calendar permissions.');
                } else if (response.status === 429) {
                    throw new Error('Too many requests. Please wait a moment and try again.');
                } else if (response.status >= 500) {
                    throw new Error('Google Calendar is temporarily unavailable. Please try again later.');
                } else {
                    throw new Error('Could not save event. Please check your internet connection and try again.');
                }
            }
            return response.json();
        })
        .then(data => {
            console.log('Event created successfully:', data.id);
            showStatus('Event created successfully!', 'success');
            
            // Refresh events list and hide form
            syncEvents();
            hideEventForm();
        })
        .catch(error => {
            console.error('Error creating event - full error object:', error);
            console.error('Error stack:', error.stack);
            // Show user-friendly error message
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                showError('Could not connect to Google Calendar. Please check your internet connection.');
            } else {
                showError(`Event creation failed: ${error.message}`);
            }
        });
    });
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
    
    if (!isAuthenticated) {
        showError('Please log in to Google first');
        return;
    }
    
    if (!eventId) {
        showError('Event ID is required for update');
        return;
    }
    
    // Get authentication token
    chrome.identity.getAuthToken({interactive: false}, (token) => {
        if (chrome.runtime.lastError || !token) {
            console.error('No auth token available:', chrome.runtime.lastError?.message);
            showError('Authentication required. Please log in to Google.');
            return;
        }
        
        // Prepare update data for Google Calendar API
        const updateData = {};
        
        if (eventData.title) updateData.summary = eventData.title;
        if (eventData.description !== undefined) updateData.description = eventData.description;
        
        if (eventData.startDateTime) {
            updateData.start = {
                dateTime: eventData.startDateTime,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            };
        }
        
        if (eventData.endDateTime) {
            updateData.end = {
                dateTime: eventData.endDateTime,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            };
        }
        
        // Add URL to description if provided
        if (eventData.url) {
            updateData.description = (updateData.description || '') + 
                (updateData.description ? '\n\n' : '') + `URL: ${eventData.url}`;
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
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
function showEventForm(eventData = null) {
    console.log('Showing event form:', eventData ? 'edit mode' : 'add mode');
    
    const eventForm = document.getElementById('event-form');
    const formTitle = document.getElementById('event-form-title');
    const saveBtn = document.getElementById('save-event-btn');
    
    if (!eventForm) return;
    
    // Show the form
    eventForm.style.display = 'block';
    
    if (eventData) {
        // Edit mode - pre-fill form with existing data
        formTitle.textContent = 'Edit Event';
        saveBtn.textContent = 'Update Event';
        
        document.getElementById('event-title').value = eventData.title || '';
        document.getElementById('event-description').value = eventData.description || '';
        
        // Handle date/time formatting for inputs
        if (eventData.startDateTime) {
            const startDate = new Date(eventData.startDateTime);
            document.getElementById('event-start-date').value = startDate.toISOString().split('T')[0];
            document.getElementById('event-start-time').value = startDate.toTimeString().slice(0, 5);
        }
        
        if (eventData.endDateTime) {
            const endDate = new Date(eventData.endDateTime);
            document.getElementById('event-end-date').value = endDate.toISOString().split('T')[0];
            document.getElementById('event-end-time').value = endDate.toTimeString().slice(0, 5);
        }
        
        // Extract URL from description if present
        if (eventData.description) {
            const urlMatch = eventData.description.match(/URL: (https?:\/\/[^\s\n]+)/);
            if (urlMatch) {
                document.getElementById('event-url').value = urlMatch[1];
                // Remove URL from description display
                const cleanDescription = eventData.description.replace(/\n*URL: https?:\/\/[^\s\n]+\n*/, '').trim();
                document.getElementById('event-description').value = cleanDescription;
            }
        }
        
        // Store event ID for update
        eventForm.setAttribute('data-event-id', eventData.id);
        
    } else {
        // Add mode - clear form
        formTitle.textContent = 'Add New Event';
        saveBtn.textContent = 'Save Event';
        
        // Clear all form fields
        document.getElementById('calendar-event-form').reset();
        
        // Set default times (current time + 1 hour)
        const now = new Date();
        const startTime = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 hour from start
        
        document.getElementById('event-start-date').value = startTime.toISOString().split('T')[0];
        document.getElementById('event-start-time').value = startTime.toTimeString().slice(0, 5);
        document.getElementById('event-end-date').value = endTime.toISOString().split('T')[0];
        document.getElementById('event-end-time').value = endTime.toTimeString().slice(0, 5);
        
        // Remove event ID
        eventForm.removeAttribute('data-event-id');
    }
    
    // Focus on title input
    setTimeout(() => {
        const titleInput = document.getElementById('event-title');
        if (titleInput) titleInput.focus();
    }, 100);
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

/**
 * Switch calendar view between day, week, and month
 * EXPLANATION: Changes how events are grouped and displayed
 * - Day view: Groups events by individual days (current behavior)
 * - Week view: Groups events by weeks
 * - Month view: Groups events by months
 * 
 * @param {string} view - The view to switch to ('day', 'week', or 'month')
 */
function switchCalendarView(view) {
    console.log('Switching calendar view to:', view);
    
    // Update current view
    currentCalendarView = view;
    
    // Update active button styling
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`).classList.add('active');
    
    // Re-render calendar content with new view
    renderCalendarContent();
}

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
    
    // Convert start date/time to ISO format
    // If no start time provided, default to 9 AM for timed events or all-day
    const defaultStartTime = startTime || '09:00';
    const startDateTime = new Date(`${startDate}T${defaultStartTime}`).toISOString();
    
    // Handle end date/time - if not provided, default to 1 hour after start time
    let endDateTime;
    if (endDate && endTime) {
        // User provided end date/time
        endDateTime = new Date(`${endDate}T${endTime}`).toISOString();
        
        // Validate that end time is after start time
        if (new Date(endDateTime) <= new Date(startDateTime)) {
            showError('End time must be after start time');
            return;
        }
    } else {
        // Default to 1 hour after start time
        const endTimeCalc = new Date(startDateTime);
        endTimeCalc.setHours(endTimeCalc.getHours() + 1);
        endDateTime = endTimeCalc.toISOString();
    }
    
    // Prepare event data for Google Calendar API
    const eventData = {
        summary: title,                    // Maps to Google Calendar 'summary' field
        description: description || '',     // Maps to Google Calendar 'description' field
        start: {
            dateTime: startDateTime,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
            dateTime: endDateTime,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
    };
    
    // Add URL to description if provided
    if (url) {
        eventData.description += (eventData.description ? '\n\n' : '') + `URL: ${url}`;
    }
    
    console.log('Prepared event data for Google Calendar API:', eventData);
    
    // Check if this is an update (form has event ID) or create
    const eventForm = document.getElementById('event-form');
    const eventId = eventForm.getAttribute('data-event-id');
    
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
    document.getElementById('task-title').value = '';
    document.getElementById('task-description').value = '';
}

/**
 * Clear the event form
 */
function clearEventForm() {
    document.getElementById('event-title').value = '';
    document.getElementById('event-datetime').value = '';
    document.getElementById('event-duration').value = '1';
}

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
