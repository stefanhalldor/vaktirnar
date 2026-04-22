# PlaydateSync - Fresh Setup Guide

## 🎉 Welcome to PlaydateSync!

This is a complete, fresh installation with the new playful color scheme!

---

## 📋 Prerequisites

- Node.js 18+ installed
- GitHub account
- Vercel account (free)
- Supabase account (free)

---

## 🚀 Step-by-Step Setup

### 1. Extract Files

Extract this folder to: `C:\Users\Lenovo\Documents\playdatesync`

### 2. Install Dependencies

Open the folder in VS Code, then open Terminal and run:

```bash
npm install
```

### 3. Configure Environment Variables

1. Copy `.env.local.template` to `.env.local`
2. Get your Supabase anon key:
   - Go to: https://supabase.com/dashboard/project/hqlhoccemcnfuosmdqjs
   - Settings → API → Legacy anon, service_role API keys
   - Copy the "anon public" key
3. Update `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://hqlhoccemcnfuosmdqjs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-key-here
```

### 4. Test Locally

```bash
npm run dev
```

Open http://localhost:3000 - everything should work with the new playful colors!

---

## 📤 Deploy to Production

### Initialize Git

1. Open GitHub Desktop
2. File → Add Local Repository
3. Browse to: `C:\Users\Lenovo\Documents\playdatesync`
4. Click "Create Repository"
5. Git ignore: **Node**
6. Create Repository

### Push to GitHub

1. Summary: "Initial commit"
2. Commit to main
3. Publish repository
4. Name: `PlaydateSync`
5. Private ✓
6. Publish

### Deploy to Vercel

1. https://vercel.com/dashboard
2. Add New → Project
3. Import `PlaydateSync`
4. Add Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy
6. Done! 🎉

---

## 🔄 Normal Workflow

1. Edit in VS Code → Save
2. GitHub Desktop → Commit → Push
3. Vercel auto-deploys (~2 min)
4. Live!

---

## 🎨 New Colors Included!

- 🌈 Gradient background
- 💜 Bright purple/pink
- All activities color-coded
- Much more visible and playful!

---

## ✅ Quick Checklist

- [ ] Extract to Documents/playdate-sync
- [ ] npm install
- [ ] Create .env.local
- [ ] npm run dev (test locally)
- [ ] GitHub Desktop setup
- [ ] Push to GitHub  
- [ ] Deploy to Vercel
- [ ] Test live site
- [ ] 🎉 Done!
