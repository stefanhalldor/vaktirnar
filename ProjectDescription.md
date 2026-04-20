# Vaktirnar.is — Project Description

## Hugmyndin

**Vaktirnar** er umbrella/móðurmerki yfir mismunandi "vaktir" — einföld og kraftmikil verkfæri sem hjálpa fjölskyldum og einstaklingum að skipuleggja líf sitt betur. Hugmyndin er að hvert "vakt"-verkefni sé sjálfstæð vara undir sama þaki.

**Lénið:** www.vaktirnar.is (í eigu stefanhalldor)

---

## Vaktirnar í vinnslu

| Vakt | Staða | Lén | Repo |
|------|-------|-----|------|
| **Krakkavaktin** | 🟡 Í þróun | krakkavaktin.is | stefanhalldor/playdatesync |
| **Þriðja vaktin** | 🔒 Hugmynd | — | — |
| **Sjoppuvaktin** | 🔒 Hugmynd | — | — |

---

## Þetta repo: vaktirnar.is landing page

**Repo:** https://github.com/stefanhalldor/vaktirnar
**Local path:** `C:\Users\Lenovo\Documents\vaktirnar`

### Stack
- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Framer Motion** — animations
- **next-intl** — i18n (IS + EN)
- **Lucide React** — icons

### Engin backend
Þetta er hrein frontend/static síða. Engin Supabase, engin auth, engar env vars.

---

## Skráarskipulag

```
vaktirnar/
├── app/
│   ├── layout.tsx          — Root layout, Inter font, dynamic metadata
│   ├── page.tsx            — Forsíða: Hero + VaktCard grid
│   ├── globals.css         — Pastel gradient bakgrunnur, CSS variables
│   └── krakkavaktin/
│       └── page.tsx        — Undirísðua um Krakkavaktina
├── components/
│   ├── Hero.tsx            — Hero section með Framer Motion fade-in
│   ├── VaktCard.tsx        — Kort fyrir hverja vakt, stagger animation
│   ├── Footer.tsx          — Einfaldur footer
│   └── LanguageSwitcher.tsx — Cookie-based IS ↔ EN skipti
├── i18n/
│   └── request.ts          — next-intl config, cookie-based locale
├── messages/
│   ├── is.json             — Íslenskar þýðingar (default)
│   └── en.json             — Enskur þýðingar
└── .github/
    └── workflows/
        └── ci.yml          — Lint + typecheck á PR to main
```

---

## i18n uppsetning

- **Default locale:** Íslenska (`is`)
- **Secondary locale:** Enska (`en`)
- **Aðferð:** Cookie-based (`locale` cookie), sama mynstur og Krakkavaktin
- `LanguageSwitcher` component setur cookie og reload-ar síðuna
- Engin path-based routing (`/is/`, `/en/`) — allt á sömu slóð

---

## VaktCard — stöður

`VaktCard` component styður þrjár stöður:

| Status | Badge | Stíll |
|--------|-------|-------|
| `available` | Grænn ✓ | Hvítur bakgrunnur, violet border |
| `in-development` | Amber pulsing dot | Hvítur bakgrunnur, amber border |
| `coming-soon` | Grátt lock icon | Grátt, 70% opacity |

`statusLabel` prop kemur úr þýðingum (`vaktir.inDevelopment`, `vaktir.comingSoon` o.s.frv.) þannig að badge texti er alltaf á réttu tungumáli.

Bæði `available` og `in-development` kort geta haft `href` + `cta` link.

---

## Krakkavaktin undirísðua — hugmyndafræði

Síðan (`/krakkavaktin`) er ekki tæknileg feature-listi heldur **hugmyndafræðileg kynning**:

- **Titill:** "Getur Siggi leikið?" — einfalt, persónulegt
- **Meginboðskapur:** Foreldrar nota Messenger til að samræma leiktíma barna, en Messenger er fullt af sögu og tilfinningum sem eiga ekki heima þar. Krakkavaktin er bara spjall þar sem barnið er alltaf í miðjunni.
- **Features eru gildi, ekki tækni:**
  - Bara spjall, ekkert annað
  - Barnið í fókus (samtalið snýst um Sigga/Önnu, aldrei foreldrana)
  - Enginn kvíði (engar "séð" merkingar, engir innsláttarvísar)
  - Fljótt svar — já/nei, hvenær, hvar
- **Icons:** `MessageCircle`, `Heart`, `Bell`, `Smile`
- **Status badge:** Amber "Í þróun" (ekki "Tilbúin")

---

## Design

- **Litapallettu:** Sama og Krakkavaktin — `#7c3aed` (violet), `#e11d6e` (rose)
- **Bakgrunnur:** `bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50`
- **Font:** Inter (Google Fonts)
- **Kortastíll:** `rounded-2xl`, `shadow-sm`, hvítur bakgrunnur
- **Animations:** Framer Motion — fade-in á Hero, stagger á VaktCard grid

---

## Deploy (Vercel)

- Tengja `stefanhalldor/vaktirnar` repo við Vercel
- Custom domains: `vaktirnar.is` og `www.vaktirnar.is`
- **Engar env vars** þarf — hrein static síða

---

## CI/CD

GitHub Actions keyrir á öllum PR to `main`:
1. `npm run lint` — ESLint
2. `npm run type-check` — TypeScript

---

## Framhald / TODO

- [ ] Vercel deploy + custom domain
- [ ] OG image (`/public/og-image.png`) fyrir social sharing
- [ ] Bæta við fleiri vöktum þegar þær eru tilbúnar
- [ ] Uppfæra `/krakkavaktin` með skjámyndum af appinu
- [ ] Tengja CTA hnapp á `/krakkavaktin` við raunverulegt app/app store
