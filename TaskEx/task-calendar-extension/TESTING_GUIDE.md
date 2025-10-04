# Testing Guide for New Footer Settings

## How to Test the Implementation

### Step 1: Load the Extension
1. Open Chrome/Edge
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `TaskEx/task-calendar-extension` folder
6. Open the extension side panel

### Step 2: Verify Footer Appearance
✅ **Expected Result**: You should see a footer bar at the bottom with:
- Left: A sun/moon emoji button (☀️ or 🌙)
- Center: A time format button showing "12h" or "24h"
- Right: A colored dot and "Login" or "Logout" button

✅ **Verify**: The footer appears on ALL tabs (To-Do, Calendar, LinkHive)

### Step 3: Test Theme Toggle
1. Click the sun/moon button in the footer (left side)
2. **Expected**: 
   - Theme instantly switches between light and dark
   - Icon changes from ☀️ to 🌙 (or vice versa)
   - All colors throughout the extension update
3. Reload the extension
4. **Expected**: Your theme preference is remembered

### Step 4: Test Time Format Toggle
1. Click the time format button in the footer (center)
2. **Expected**:
   - Label changes from "12h" to "24h" (or vice versa)
   - A success message appears
3. Go to Calendar tab and check any event times
4. **Expected**: Times display in the selected format
5. Reload the extension
6. **Expected**: Your time format preference is remembered

### Step 5: Test Google Authentication
1. Look at the dot on the right side of the footer
2. If **red and pulsing**: You are logged out
3. If **green and solid**: You are logged in

#### Testing Login:
1. Click the "Login" button in the footer
2. **Expected**: Google authentication flow starts
3. After successful login:
   - Dot turns green (solid)
   - Button label changes to "Logout"
   - Tasks and events load

#### Testing Logout:
1. Click the "Logout" button in the footer
2. **Expected**:
   - Dot turns red (pulsing)
   - Button label changes to "Login"
   - Tasks and events cleared
3. Reload the extension
4. **Expected**: You remain logged out (dot is red)

### Step 6: Test Persistence
1. Change all three settings (theme, time format, login state)
2. Close and reopen the extension
3. **Expected**: All your settings are remembered

### Step 7: Verify Old Settings Page is Gone
1. Look at the tab buttons at the top
2. **Expected**: Only three tabs visible: "To-Do", "Calendar", "LinkHive"
3. **Verify**: No "Settings" tab button exists

## Common Issues and Solutions

### Issue: Footer overlaps with content
**Solution**: Each tab has automatic bottom padding (50px). If you see overlap, check that `.tab-content` CSS is applied.

### Issue: Settings don't persist
**Solution**: Check browser console for `chrome.storage.local` errors. Ensure extension has storage permissions.

### Issue: Theme toggle doesn't work
**Solution**: Check that `theme-light` and `theme-dark` CSS classes are properly defined in `sidepanel.css`.

### Issue: Login button doesn't trigger authentication
**Solution**: Verify that `handleLogin()` and `handleLogout()` functions exist in `sidepanel.js` and that manifest.json includes proper Google OAuth permissions.

## Console Logs to Monitor
Open Developer Tools (F12) and check for these logs:
- `"TaskEx side panel loaded!"`
- `"Setting up footer settings handlers..."`
- `"Applying theme: [light/dark]"`
- `"Setting time format: [12h/24h]"`
- `"Starting login process..."` or `"Logging out..."`

## Success Criteria
✅ All three footer controls visible and functional
✅ Theme toggle works instantly and persists
✅ Time format toggle works instantly and persists
✅ Google auth status shows correct state
✅ Login/Logout button triggers authentication
✅ Footer appears on all tabs
✅ Old Settings tab completely removed
✅ No console errors
✅ No linting errors

## Next Steps After Testing
If all tests pass:
1. The implementation is complete and ready to use
2. You can commit the changes
3. Consider adding more themes or settings in the future

If issues are found:
1. Note the specific issue and steps to reproduce
2. Check the browser console for error messages
3. Verify the file changes were applied correctly
4. Report issues with console logs and screenshots

---

**Happy Testing! 🚀**

