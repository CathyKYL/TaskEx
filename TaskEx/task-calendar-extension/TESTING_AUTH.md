# 🧪 Quick Authentication Testing Guide

## 🚀 How to Test Right Now

### Step 1: Reload the Extension
1. Go to `chrome://extensions/`
2. Find **TaskEx** extension
3. Click the **reload** button (🔄)
4. Open the extension side panel

### Step 2: Check Console Logs
1. Right-click on the side panel → **Inspect**
2. Go to the **Console** tab
3. You should see:
   ```
   TaskEx side panel loaded!
   [Auth] === Checking Authentication Status ===
   ```

### Step 3: Test Login Flow

#### If You See Red Dot + "Login":
1. **Open Background Console**:
   - Go to `chrome://extensions/`
   - Find TaskEx
   - Click "service worker" link
   - This opens the background script console

2. **Click Login Button** in the footer (bottom of side panel)

3. **Watch Console Logs**:
   
   **Side Panel Console:**
   ```
   [Auth] === Starting Google Login Flow ===
   ```
   
   **Background Console:**
   ```
   [Background] === Starting Interactive Authentication ===
   [Background] Getting auth token (interactive: true)...
   ```

4. **Google OAuth Popup Should Appear**
   - If it doesn't appear, check background console for errors
   - Look for: `[Background] ✗ Authentication error:`

5. **Select Your Google Account**

6. **After Selecting Account**:
   
   **Background Console:**
   ```
   [Background] ✓ Token obtained successfully
   [Background] ✓ Authentication successful - token acquired
   ```
   
   **Side Panel Console:**
   ```
   [Auth] ✓ Login successful! Token acquired.
   [Auth] Loading user tasks and events...
   [Tasks] === Fetching Tasks from Google ===
   [Events] === Fetching Events from Google Calendar ===
   ```

7. **Verify UI Changes**:
   - ✅ Footer dot turns GREEN
   - ✅ Button changes to "Logout"
   - ✅ Tasks load in To-Do tab
   - ✅ Events load in Calendar tab

#### If You See Green Dot + "Logout":
You're already logged in! The authentication is working.

### Step 4: Test Logout
1. Click "Logout" button in footer
2. **Watch Console**:
   ```
   [Auth] === Starting Google Logout ===
   [Background] === Starting Logout ===
   [Background] ✓ Logout successful
   [Auth] ✓ Logout complete. Token revoked.
   ```
3. **Verify UI**:
   - ✅ Dot turns RED
   - ✅ Button changes to "Login"
   - ✅ Tasks/events cleared

## 🐛 Common Issues & Quick Fixes

### Issue 1: No OAuth Popup Appears

**Check Background Console:**
```
[Background] ✗ Authentication error: ...
```

**Possible Causes:**
1. **Invalid Client ID**
   - Check `manifest.json` → `oauth2.client_id`
   - Should be: `994610319815-ditlfkceb19313g35vvqppl8qr7sbuah.apps.googleusercontent.com`

2. **Missing Permissions**
   - Check `manifest.json` → `permissions`
   - Should include: `"identity"`

3. **Browser Issue**
   - Try in Incognito mode
   - Clear browser cache
   - Restart Chrome

**Quick Fix:**
```javascript
// Run in background console:
chrome.identity.getAuthToken({ interactive: true }, (token) => {
  console.log('Token:', token);
  console.log('Error:', chrome.runtime.lastError);
});
```

### Issue 2: "Cannot set properties of null" Error

**Check Side Panel Console:**
```
Cannot set properties of null (setting 'innerHTML')
```

**This should be FIXED now**, but if it still appears:

1. Check if element exists:
   ```javascript
   // Run in side panel console:
   console.log('tasks-list exists:', !!document.getElementById('tasks-list'));
   console.log('events-list exists:', !!document.getElementById('events-list'));
   ```

2. If missing, check HTML file for correct IDs

### Issue 3: Login Button Does Nothing

**Check Side Panel Console:**
- Should see: `[Auth] === Starting Google Login Flow ===`
- If nothing appears, the button isn't wired up

**Fix:**
1. Check if `setupSettingsHandlers()` is called on load
2. Verify footer HTML has correct IDs:
   - `auth-toggle-btn`
   - `auth-status-dot`
   - `auth-btn-label`

### Issue 4: Footer Doesn't Update After Login

**Check Side Panel Console:**
```
[Auth] ✓ Login successful! Token acquired.
```

**If this appears but footer doesn't update:**

1. Check `updateFooterAuthStatus()` is called:
   ```javascript
   // Run in side panel console:
   updateFooterAuthStatus();
   ```

2. Check elements exist:
   ```javascript
   console.log('Dot:', document.getElementById('auth-status-dot'));
   console.log('Label:', document.getElementById('auth-btn-label'));
   ```

3. Check CSS classes:
   ```javascript
   const dot = document.getElementById('auth-status-dot');
   console.log('Has connected class:', dot.classList.contains('connected'));
   ```

## 🎯 Quick Verification Commands

### Check Authentication State
```javascript
// Run in side panel console:
console.log('isAuthenticated:', isAuthenticated);
console.log('Footer dot element:', document.getElementById('auth-status-dot'));
console.log('Footer label:', document.getElementById('auth-btn-label')?.textContent);
```

### Force Update Footer
```javascript
// Run in side panel console:
updateFooterAuthStatus();
```

### Clear All Cached Tokens
```javascript
// Run in background console:
chrome.identity.clearAllCachedAuthTokens(() => {
  console.log('✓ All tokens cleared - try logging in again');
});
```

### Get Current Token
```javascript
// Run in background console:
chrome.identity.getAuthToken({ interactive: false }, (token) => {
  console.log('Current token:', token);
  console.log('Error:', chrome.runtime.lastError);
});
```

### Manual Login Test
```javascript
// Run in background console:
chrome.identity.getAuthToken({ interactive: true }, (token) => {
  if (token) {
    console.log('✓ Login successful! Token:', token.substring(0, 20) + '...');
  } else {
    console.log('✗ Login failed:', chrome.runtime.lastError);
  }
});
```

### Manual Logout Test
```javascript
// Run in background console:
chrome.identity.getAuthToken({ interactive: false }, (token) => {
  if (token) {
    fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
      .then(() => console.log('✓ Token revoked'));
    chrome.identity.removeCachedAuthToken({ token }, () => {
      console.log('✓ Token removed from cache');
    });
  }
});
```

## 📋 Complete Test Checklist

### Basic Flow
- [ ] Extension loads without errors
- [ ] Console shows: `[Auth] === Checking Authentication Status ===`
- [ ] Footer appears at bottom
- [ ] Footer shows correct auth state

### Login Flow
- [ ] Click "Login" button
- [ ] OAuth popup appears
- [ ] Select account successfully
- [ ] Footer dot turns green
- [ ] Button changes to "Logout"
- [ ] Tasks load automatically
- [ ] Events load automatically
- [ ] No console errors

### Logout Flow
- [ ] Click "Logout" button
- [ ] Footer dot turns red
- [ ] Button changes to "Login"
- [ ] Tasks/events cleared
- [ ] Login prompts shown
- [ ] No console errors

### Persistence
- [ ] Close extension
- [ ] Reopen extension
- [ ] Still logged in (green dot)
- [ ] Data loads automatically

### Error Handling
- [ ] Simulate token expiry (revoke externally)
- [ ] Click refresh
- [ ] See error message
- [ ] Footer auto-updates to red
- [ ] No crashes or undefined errors

## 🎉 Success Indicators

### You'll Know It's Working When:

1. **Console is Clean**:
   - No "Cannot set properties of null" errors
   - No "Chrome runtime error: undefined" messages
   - Only structured `[Auth]`, `[Tasks]`, `[Events]` logs

2. **Login Works Smoothly**:
   - Click Login → Popup appears within 1 second
   - Select account → Popup closes immediately
   - Footer updates instantly
   - Data loads within 2-3 seconds

3. **Footer is Always Correct**:
   - Red dot + "Login" when logged out
   - Green dot + "Logout" when logged in
   - Updates automatically on every auth change

4. **No Crashes**:
   - Can login/logout repeatedly
   - Can refresh multiple times
   - Works after closing and reopening
   - Handles errors gracefully

---

**Status**: Ready to test! 🚀
**Date**: October 4, 2025

**Need Help?**
Check `AUTH_FIX_SUMMARY.md` for detailed explanations of all fixes.

