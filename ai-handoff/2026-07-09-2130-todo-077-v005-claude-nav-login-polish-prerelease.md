# Handoff: TODO #77 v005 - Nav og innskráning polish -- tilbúið til útgáfu

Created: 2026-07-09 21:30
Timezone: Atlantic/Reykjavik
Stada: Prófað á localhost, type-check hreinn, EKKI commitað

---

## Breytingar sem bíða útgáfu

### 1. `components/teskeid/PublicTopNav.tsx`

"Hugmyndir" texti og Lightbulb icon fjarlægð af heimsíðulinkinum.
Í staðinn: `TeskeidLogo` (size=64) sem einungis icon -- engin texti.
Restir navbarins ("Ný hugmynd", "Innskráning") óbreyttir.

### 2. `app/page.tsx`

`NavBar` renderar aðeins fyrir innskráða notendur (`{user && <NavBar variant="authenticated" />}`).
Óinnskráðir nota `PublicTopNav` eitt og sér -- stóra lógó-headerinn er horfinn.

### 3. `app/senda-hugmynd/page.tsx`

Sama breyting og á forsíðunni -- `NavBar` aðeins fyrir innskráða.

### 4. `app/innskraning/page.tsx`

`PublicTopNav` sett aftur inn (var fjarlægt í milli).
Síðan er nú `<div className="min-h-screen flex flex-col">` sem inniheldur PublicTopNav + TeskeidLoginForm.

### 5. `components/teskeid/TeskeidLoginForm.tsx`

Ytri `div` breytt úr `min-h-screen` í `grow py-8` svo formið fyllir pláss sem er eftir eftir nav án þess að búa til tómt bil ofan við.

---

## Localhost checks

Óinnskráður:

1. `http://localhost:3000/` -- lógó í nav, ekkert stórt lógó-header neðar
2. `http://localhost:3000/senda-hugmynd` -- sama, ekkert stórt lógó
3. `http://localhost:3000/innskraning` -- PublicTopNav sést, ekkert tómt bil á milli nav og forms, "Aðgangurinn er ókeypis" pill sést

Innskráður:

4. `http://localhost:3000/` -- NavBar með lógói og TeskeidMenu sést (óbreytt)

---

## Skrár sem breytast

```
M app/innskraning/page.tsx
M app/page.tsx
M app/senda-hugmynd/page.tsx
M components/teskeid/PublicTopNav.tsx
M components/teskeid/TeskeidLoginForm.tsx
```
