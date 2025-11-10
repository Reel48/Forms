# Admin Access Debugging Guide

## ✅ Database Status
The database shows that **admin@reel48.com** has admin role:
- User ID: `10139aba-744b-4089-890b-59d0c8b10e62`
- Email: `admin@reel48.com`
- Role: `admin` ✅
- Last Updated: `2025-11-10 05:43:05`

## 🔍 Troubleshooting Steps

### 1. Check Browser Console
Open browser DevTools (F12) and check:
- **Console tab**: Look for any errors related to authentication
- **Network tab**: Check if `/api/auth/me` is being called and what it returns

### 2. Test the Auth Endpoint
Open browser console and run:
```javascript
// Get your current token
const token = localStorage.getItem('sb-boisewltuwcjfrdjnfwd-auth-token');
// Or check Supabase session
const session = await window.supabase.auth.getSession();

// Test the endpoint
fetch('https://uvpc5mx3se.us-east-1.awsapprunner.com/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${session.data.session.access_token}`
  }
})
.then(r => r.json())
.then(console.log);
```

### 3. Check Frontend Auth State
In browser console:
```javascript
// Check if Supabase session exists
const { data } = await window.supabase.auth.getSession();
console.log('Session:', data.session);
console.log('User:', data.session?.user);

// Check AuthContext role
// Open React DevTools and check AuthContext state
```

### 4. Common Issues & Fixes

#### Issue: Role shows as "customer" instead of "admin"
**Fix:**
1. **Log out and log back in** - The role is fetched on login
2. **Clear browser cache** - Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
3. **Check token** - Make sure the JWT token is being sent with requests

#### Issue: `/api/auth/me` returns 401
**Fix:**
- Token might be expired
- Log out and log back in
- Check if `SUPABASE_JWT_SECRET` is set in backend environment

#### Issue: Role is null
**Fix:**
- Check browser console for errors
- Verify `/api/auth/me` endpoint is working
- Check network tab to see if the request is being made

### 5. Manual Verification

#### Check Backend Logs
```bash
# Check if backend is receiving requests
# Look at AWS App Runner logs or local backend logs
```

#### Test Backend Directly
```bash
# Get your token first (from browser localStorage or Supabase)
TOKEN="your-jwt-token-here"

# Test the endpoint
curl -H "Authorization: Bearer $TOKEN" \
  https://uvpc5mx3se.us-east-1.awsapprunner.com/api/auth/me
```

Expected response:
```json
{
  "id": "10139aba-744b-4089-890b-59d0c8b10e62",
  "email": "admin@reel48.com",
  "role": "admin"
}
```

### 6. Force Refresh Role
If role is stuck, try:
1. **Log out completely**
2. **Clear browser storage**:
   ```javascript
   // In browser console
   localStorage.clear();
   sessionStorage.clear();
   ```
3. **Log back in**
4. **Check role again**

### 7. Verify Database (Already Done ✅)
The database is correctly configured:
```sql
-- This query confirms admin role exists
SELECT 
  u.id,
  u.email,
  ur.role
FROM auth.users u
JOIN user_roles ur ON u.id = ur.user_id
WHERE u.email = 'admin@reel48.com';
-- Returns: role = 'admin' ✅
```

## 🐛 Debug Checklist

- [ ] User is logged in as admin@reel48.com
- [ ] Browser console shows no errors
- [ ] `/api/auth/me` endpoint returns `{"role": "admin"}`
- [ ] AuthContext shows `role: "admin"` in React DevTools
- [ ] Tried logging out and back in
- [ ] Cleared browser cache
- [ ] Checked network tab for failed requests

## 📝 Quick Fix Script

If the role is still not working, you can manually refresh it:

1. **Log out** from the app
2. **Clear browser storage** (localStorage, sessionStorage)
3. **Log back in** as admin@reel48.com
4. **Check browser console** for the role

If it still doesn't work, check:
- Backend environment variables (SUPABASE_JWT_SECRET)
- Frontend environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- Network connectivity to backend

## 🔧 Next Steps

1. **Test in browser** - Log in and check console
2. **Check `/api/auth/me`** - Verify it returns admin role
3. **Check React DevTools** - Verify AuthContext has correct role
4. **Report findings** - Let me know what you see!

