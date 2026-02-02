# ⚡ Quick Setup (5 Minutes)

## 1️⃣ Supabase Setup (2 min)
```
1. Go to supabase.com → New Project
2. SQL Editor → Run supabase-schema.sql
3. Settings → API → Copy URL & anon key
```

## 2️⃣ Configure App (1 min)
```bash
cp .env.local.template .env.local
# Edit .env.local with your Supabase credentials
npm install
```

## 3️⃣ Test Locally (1 min)
```bash
npm run dev
# Visit http://localhost:3000
```

## 4️⃣ Deploy to Vercel (1 min)
```
1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy!
```

---

## 📋 Environment Variables Needed

**Local (.env.local):**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

**Vercel:**
Same two variables PLUS:
```
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
```

---

## 🎯 Key Files

- `supabase-schema.sql` - Run this in Supabase SQL Editor
- `.env.local.template` - Copy to `.env.local` and fill in
- `SUPABASE_SETUP.md` - Detailed step-by-step guide
- `SETUP_GUIDE.md` - Original in-memory version guide

---

## ✅ Success Checklist

- [ ] Supabase project created
- [ ] SQL schema executed successfully
- [ ] `.env.local` created with credentials
- [ ] `npm install` completed
- [ ] App runs locally (`npm run dev`)
- [ ] Data persists after page refresh
- [ ] Pushed to GitHub
- [ ] Deployed to Vercel with env vars
- [ ] Live app tested and working

---

## 🆘 Quick Troubleshooting

**"Missing environment variables"**
→ Check `.env.local` exists and has correct format

**"Session not found" after creating**
→ Check Supabase Table Editor shows data in `sessions` table

**Can't connect to Supabase**
→ Verify URL and key are correct (no extra spaces)

**Deploy failing on Vercel**
→ Make sure environment variables are set in Vercel dashboard

---

## 📞 Need Help?

See `SUPABASE_SETUP.md` for detailed instructions and troubleshooting.

---

**Time to MVP: 5 minutes** ⚡
**Total Cost: $0** 💰
**Scalability: Thousands of sessions** 📈
