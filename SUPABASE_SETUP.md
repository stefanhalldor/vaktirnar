# 🚀 Supabase Setup & Deployment Guide

## Step 1: Set Up Supabase Database

### 1.1 Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click **"New Project"**
3. Fill in:
   - **Name**: `playdate-sync`
   - **Database Password**: (create a strong password and save it!)
   - **Region**: Choose closest to your users
4. Click **"Create new project"** (takes ~2 minutes)

### 1.2 Run Database Schema
1. Once project is ready, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Copy the entire contents of `supabase-schema.sql`
4. Paste into the query editor
5. Click **"Run"** (bottom right)
6. You should see: "Success. No rows returned"

### 1.3 Get Your API Credentials
1. Go to **Settings** → **API** (gear icon in sidebar)
2. Copy these two values:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **anon public** key (the long string under "Project API keys")

---

## Step 2: Configure Your App

### 2.1 Set Environment Variables

Create `.env.local` file in the root of your project:

```bash
cp .env.local.template .env.local
```

Then edit `.env.local` and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-long-anon-key-here
```

⚠️ **Important**: Never commit `.env.local` to git!

### 2.2 Install Dependencies

```bash
npm install
```

This will install the new `@supabase/supabase-js` dependency.

---

## Step 3: Test Locally

```bash
npm run dev
```

Visit `http://localhost:3000` and test:

1. ✅ Create a new session
2. ✅ Add kids
3. ✅ Log activities
4. ✅ Refresh page - data persists!
5. ✅ Open in new tab with view link

If everything works, your data is now stored in Supabase! 🎉

---

## Step 4: Deploy to Vercel

### 4.1 Push to GitHub

```bash
git init
git add .
git commit -m "PlaydateSync with Supabase"
git branch -M main
gh repo create playdate-sync --public --source=. --remote=origin --push
```

Or manually:
1. Create new repo on GitHub
2. Push your code

### 4.2 Deploy on Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **"Import Project"**
3. Select your GitHub repo
4. **Configure Environment Variables:**
   - Add `NEXT_PUBLIC_SUPABASE_URL`
   - Add `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Add `NEXT_PUBLIC_BASE_URL` (your Vercel URL, e.g., `https://playdate-sync.vercel.app`)
5. Click **"Deploy"**

Wait 2-3 minutes, then your app is live! 🚀

---

## Step 5: Test Your Live App

1. Visit your Vercel URL (e.g., `playdate-sync.vercel.app`)
2. Create a session
3. Share the link with another device/browser
4. Both should see live updates!

---

## Troubleshooting

### "Missing Supabase environment variables"
- Check `.env.local` exists and has correct values
- Restart dev server: `npm run dev`
- On Vercel: double-check environment variables are set

### "Failed to fetch session" errors
- Check Supabase project is active
- Verify API URL and key are correct
- Check browser console for specific errors
- Confirm RLS policies are set correctly (the SQL script handles this)

### Data not persisting
- Verify SQL schema was run successfully
- Check Supabase **Table Editor** - you should see `sessions`, `kids`, `logs` tables
- Look at **Database** → **Tables** to confirm

### CORS errors
- Supabase should handle CORS automatically
- If issues persist, check Supabase **Authentication** → **URL Configuration**

---

## Verify Supabase Setup

### Check Tables Exist

Go to **Table Editor** in Supabase. You should see 3 tables:
- ✅ `sessions` 
- ✅ `kids`
- ✅ `logs`

### View Your Data

After creating a session, go to **Table Editor** and click on `sessions`. You should see your session row with:
- `id` (short ID like "abc123")
- `edit_key` (long key)
- `created_at` (timestamp)
- `status` ("open")

---

## Migration Notes

### What Changed?

**Before (In-Memory):**
- Data stored in JavaScript Maps
- Lost on server restart
- No persistence

**After (Supabase):**
- Data in PostgreSQL database
- Persists forever
- Accessible from anywhere
- Scalable

**Files Updated:**
- ✅ `lib/store.ts` - Now uses Supabase
- ✅ `lib/supabase.ts` - New Supabase client
- ✅ All API routes - Now async
- ✅ `package.json` - Added `@supabase/supabase-js`

**Frontend:** No changes needed! The UI works exactly the same.

---

## Database Schema Overview

### `sessions` table
- Stores session metadata
- Includes edit key for access control

### `kids` table
- One-to-many relationship with sessions
- Auto-deleted when session is deleted (CASCADE)

### `logs` table
- Activity logs with kid associations
- `kid_ids` is an array (supports multiple kids per activity)
- Status tracks active vs completed

### Indexes
- Optimized queries on `session_id`
- Fast timeline sorting with `created_at` index

---

## Next Steps

### Optional Enhancements:

1. **Real-time Updates** (instead of polling):
   ```typescript
   // Subscribe to changes
   supabase
     .channel('logs')
     .on('postgres_changes', { 
       event: '*', 
       schema: 'public', 
       table: 'logs' 
     }, handleChange)
     .subscribe();
   ```

2. **Session Expiry**:
   - Add cron job to close old sessions
   - Set `status = 'closed'` after 7 days

3. **Analytics**:
   - Track total screen time across all sessions
   - Popular activities report
   - Usage statistics

4. **User Accounts** (later):
   - Add Supabase Auth
   - Link sessions to user IDs
   - Session history

---

## Costs

**Supabase Free Tier:**
- ✅ 500 MB database
- ✅ 2 GB bandwidth
- ✅ 50,000 monthly active users
- ✅ Unlimited API requests

This is **more than enough** for an MVP! You can have thousands of playdates before needing to upgrade.

**Vercel Free Tier:**
- ✅ 100 GB bandwidth
- ✅ Unlimited deployments
- ✅ Automatic HTTPS

Both platforms offer generous free tiers perfect for MVPs and small apps.

---

## 🎉 You're Done!

Your PlaydateSync app now has:
- ✅ Persistent database storage
- ✅ Production-ready deployment
- ✅ Scalable infrastructure
- ✅ Real parent testing ready

Share your Vercel URL with parents and start collecting feedback! 🚀

---

## Support

**Supabase Issues:**
- Docs: [supabase.com/docs](https://supabase.com/docs)
- Community: [supabase.com/discord](https://supabase.com/discord)

**Vercel Issues:**
- Docs: [vercel.com/docs](https://vercel.com/docs)
- Support: Built-in chat in dashboard

**App Issues:**
- Check browser console for errors
- Check Supabase logs: **Logs Explorer** in dashboard
- Verify environment variables are set correctly
