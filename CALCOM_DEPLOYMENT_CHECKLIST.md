# Cal.com Integration - Pre-Deployment Checklist

## ✅ Before Pushing to Main

### 1. Database Migration (REQUIRED)
**Action:** Run the database migration in Supabase

1. Go to your Supabase Dashboard → SQL Editor
2. Copy the contents of `database/calcom_meetings_migration.sql`
3. Paste and execute in the SQL Editor
4. Verify the `calcom_bookings` table was created successfully

**File:** `database/calcom_meetings_migration.sql`

---

### 2. Backend Environment Variables (REQUIRED)

Add these to your backend `.env` file (local) and AWS App Runner environment variables:

```env
# Cal.com Configuration
CALCOM_API_KEY=cal_live_afb832004f6982cecda0c9431ef2d212
CALCOM_USERNAME=reel48

# Google Calendar Configuration
GOOGLE_CALENDAR_API_KEY=AIzaSyCGD10G-NQN4LPAavmQmCqi1dGMpzuNKOE
GOOGLE_CALENDAR_CLIENT_ID=700929359242-8fjq635755j1qc5p8v1j9vhstp8i69c0.apps.googleusercontent.com
```

**Where to set:**
- **Local:** `backend/.env`
- **AWS App Runner:** AWS Console → App Runner → Your Service → Configuration → Environment Variables

---

### 3. Frontend Environment Variables (OPTIONAL - for Cal.com widget)

Add these to your frontend `.env` file (local) and Vercel environment variables:

```env
VITE_CALCOM_USERNAME=reel48
VITE_CALCOM_EMBED_URL=https://cal.com/reel48
```

**Where to set:**
- **Local:** `frontend/.env`
- **Vercel:** Vercel Dashboard → Settings → Environment Variables

**Note:** These are optional - the Cal.com widget will work with just the iframe URL, but these can be used for dynamic configuration if needed.

---

### 4. Dependencies Check

✅ **No new dependencies needed!**
- Backend: Uses `requests` (already in `requirements.txt`)
- Frontend: No new npm packages required

---

### 5. Code Review Checklist

- [x] Database migration file created
- [x] Backend service layer (`calcom_service.py`, `google_calendar_service.py`)
- [x] Backend router (`routers/calcom.py`)
- [x] Router registered in `main.py`
- [x] Frontend API methods added to `api.ts`
- [x] Customer scheduling page created
- [x] Admin calendar view created
- [x] AI integration functions added
- [x] Navigation routes added
- [x] No linting errors

---

### 6. Testing Checklist (After Deployment)

Once deployed, test these features:

**Customer Features:**
- [ ] Navigate to `/scheduling` page
- [ ] View upcoming meetings
- [ ] View meeting history
- [ ] Cancel a meeting
- [ ] Reschedule a meeting
- [ ] Book a new meeting via Cal.com widget
- [ ] AI chatbot can suggest available times
- [ ] AI chatbot can book a meeting directly

**Admin Features:**
- [ ] Navigate to `/admin/calendar` page
- [ ] View calendar in month/week/day views
- [ ] See Cal.com bookings in calendar
- [ ] See Google Calendar events in calendar
- [ ] View meeting details modal
- [ ] Cancel meetings from admin view
- [ ] See source badges (Cal.com vs Google Calendar)

---

### 7. Deployment Steps

1. **Commit and push to main:**
   ```bash
   git add .
   git commit -m "Add Cal.com integration with scheduling and calendar views"
   git push origin main
   ```

2. **Run database migration:**
   - Go to Supabase SQL Editor
   - Execute `database/calcom_meetings_migration.sql`

3. **Set environment variables:**
   - **AWS App Runner:** Add Cal.com and Google Calendar API keys
   - **Vercel:** Add optional frontend variables (if using)

4. **Wait for deployments:**
   - AWS App Runner will auto-deploy backend
   - Vercel will auto-deploy frontend

5. **Test the integration:**
   - Follow the testing checklist above

---

### 8. Troubleshooting

**If Cal.com API calls fail:**
- Verify `CALCOM_API_KEY` is set correctly
- Check API key has proper permissions in Cal.com dashboard
- Verify `CALCOM_USERNAME` matches your Cal.com username

**If Google Calendar events don't show:**
- Verify `GOOGLE_CALENDAR_API_KEY` is set correctly
- Check Google Cloud Console that Calendar API is enabled
- Verify API key has Calendar API access

**If database errors occur:**
- Ensure migration was run successfully
- Check RLS policies are in place
- Verify table exists: `SELECT * FROM calcom_bookings LIMIT 1;`

**If AI scheduling doesn't work:**
- Check backend logs for AI function execution errors
- Verify Cal.com service is initialized correctly
- Test Cal.com API directly via backend endpoints

---

### 9. Files Changed/Created

**New Files:**
- `database/calcom_meetings_migration.sql`
- `backend/calcom_service.py`
- `backend/google_calendar_service.py`
- `backend/routers/calcom.py`
- `frontend/src/pages/CustomerSchedulingPage.tsx`
- `frontend/src/pages/CustomerSchedulingPage.css`
- `frontend/src/pages/AdminCalendarView.tsx`
- `frontend/src/pages/AdminCalendarView.css`

**Modified Files:**
- `backend/main.py` (added calcom router)
- `backend/ai_service.py` (added scheduling functions)
- `backend/ai_action_executor.py` (added scheduling execution)
- `frontend/src/api.ts` (added calcomAPI)
- `frontend/src/App.tsx` (added routes and navigation)

---

## 🚀 Ready to Deploy!

Once you've completed steps 1-3 (database migration and environment variables), you're ready to push to main and test!

