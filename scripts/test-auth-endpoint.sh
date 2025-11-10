#!/bin/bash
# Test Auth Endpoint Script
# This helps test if the /api/auth/me endpoint works correctly

echo "🔍 Testing Admin Access"
echo "======================"
echo ""
echo "This script will help you test if admin@reel48.com has admin access."
echo ""
echo "Steps:"
echo "1. Log in to the app as admin@reel48.com"
echo "2. Open browser DevTools (F12)"
echo "3. Go to Console tab"
echo "4. Run this code:"
echo ""
cat << 'EOF'
// Get your session token
const { data } = await window.supabase.auth.getSession();
const token = data.session?.access_token;

if (!token) {
  console.error('❌ No token found. Please log in first.');
} else {
  console.log('✅ Token found');
  
  // Test the endpoint
  fetch('https://uvpc5mx3se.us-east-1.awsapprunner.com/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(r => r.json())
  .then(data => {
    console.log('Response:', data);
    if (data.role === 'admin') {
      console.log('✅ Admin role confirmed!');
    } else {
      console.error('❌ Role is:', data.role, '(expected: admin)');
    }
  })
  .catch(err => {
    console.error('❌ Error:', err);
  });
}
EOF

echo ""
echo "5. Check the console output"
echo ""
echo "Expected response:"
echo '  { "id": "...", "email": "admin@reel48.com", "role": "admin" }'
echo ""
echo "If role is not 'admin', try:"
echo "  1. Log out and log back in"
echo "  2. Clear browser cache"
echo "  3. Check browser console for errors"

