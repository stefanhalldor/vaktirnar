# Handoff: TODO #77 v001 - Free access CTA released

Created: 2026-07-09 20:20
Timezone: Atlantic/Reykjavik
Stada: Commitað og pushað -- commit 873c316

---

## Hvað var gert

"Fáðu þér ókeypis aðgang" takki bætt við á public hugmyndasíður fyrir óinnskráða notendur.

### Skilyrði fyrir birtingu

- `idea.status === 'launched'` -- only launched ideas
- `!user` -- only unauthenticated visitors

### Staðsetning

Rétt neðan við `short_description` og ofan við `Af hverju hún skiptir máli` / `Tilbúin lausn` hluta.

### Útlit

- `w-full sm:w-auto` -- full width á mobile, auto á desktop
- `min-h-[44px]` -- touch-friendly
- Dökk Teskeið-grænn bakgrunnur (`#154212`), hvítur texti
- Tengill á `/innskraning`

---

## Skrár breyttar

- `app/hugmyndir/[slug]/page.tsx`
  - `supabase.auth.getUser()` bætt við í Promise.all
  - `showFreeAccessCta` reiknað
  - CTA JSX bætt við
- `messages/is.json` -- `ideas.freeAccountCta`: "Fáðu þér ókeypis aðgang"
- `messages/en.json` -- `ideas.freeAccountCta`: "Get free access"

---

## Localhost/production checks

1. Opna `https://teskeid.is/hugmyndir/vedrid` í private glugga
2. Staðfesta: grænn "Fáðu þér ókeypis aðgang" takki sést rétt eftir lýsinguna
3. Smella á hann -- fer á `/innskraning`
4. Innskráður notandi: takkinn sést EKKI
5. Hugmynd sem er ekki launched: takkinn sést EKKI
