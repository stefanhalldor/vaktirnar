# TODO #5 follow-up - Post-review handoff: LoanDateField

**Dagsetning:** 2026-06-09 07:26
**Agent:** Codex (post-review)
**Tengd TODO:** #5 Samræmd mobile app-upplifun
**Hlutverk:** Codex rýnir breytingarnar á meðan Stebbi handprófar á mobile.

## Samantekt breytinga (commit `d7fe46f`)

Stebbi sá horizontal overflow á native date inputs í `LoanForm` og óskilanlegt
`8 Jun 2026` snið. Native `input[type="date"]` leyst út fyrir custom component.

### Nýjar skrár

**`components/loans/LoanDateField.tsx`**

Fylgir fimman date-input mynstrinu:
- Outer `<label>` wrapping styled div + hidden input
- Styled div sýnir formatted display text eða placeholder
- `onClick={showPicker}` kallar `el.showPicker()` með `try/catch`
- Hidden `input[type="date"]` með `opacity-0`, absolute positioned, `fontSize: 16px`
- `fontSize: 16px` á hidden input kemur í veg fyrir iOS auto-zoom
- Formatted display: `9. júní 2026` (is) / `June 9, 2026` (en)
- Notar `t('months.N')` úr `teskeid.loans.months` — sama mynstri og `LoanCard`
- `Calendar` icon frá lucide-react (already dependency)

### Breyttar skrár

**`components/loans/LoanForm.tsx`**
- Fjarlægði `useLocale` import (ekki lengur notað í LoanForm)
- Fjarlægði `dateLocale` og `lang` attribute
- Skipt `<label><input type="date" /></label>` út fyrir `<LoanDateField />`
- `inputClass` aftur í upprunalegt (án `min-w-0 max-w-full` sem bættist við í fyrri commit)
- Submit payload óbreyttur: `loaned_at` og `due_at` eru áfram ISO `YYYY-MM-DD`

**`messages/is.json` og `messages/en.json`**
- Bætt við `teskeid.loans.datePlaceholder`: `"Veldu dag"` / `"Select date"`

## Það sem Codex skal rýna

### 1. Overflow root cause

Codex-planið greindi að native date input hefur intrinsic minimum width sem
browser stillir. Í stað þess að reyna að þvinga native input í container eru
nú bæði display og container í höndum okkur. Outer div er `w-full` með
`relative` positioning; hidden input er `absolute inset-0 w-full h-full`.

**Spurning:** Er þessi nálgun rétt til að koma í veg fyrir horizontal overflow
á 360-460 px viewport? Eru einhver edge cases þar sem absolute-positioned input
gæti enn stýrt intrinsic width foreldris?

### 2. showPicker() samhæfni

`showPicker()` krefst að input sé tengdur við DOM og sé visible/interactable.
Hidden input með `opacity-0` er visibility-hidden í sjónarmiði nokkurra vafra.

**Spurning:** Á `opacity: 0` input að virka með `showPicker()` á iOS Safari og
Chrome/Android? Eða þarf `visibility: visible` / aðra nálgun?

Fimman-mynstrið notar `opacity: 0` og virkaði þar. En ef Stebbi sér að tap
opnar ekki date picker á iOS, gæti þurft að breyta í:
- `pointer-events: auto` (þarf sennilega ekki)
- Tab-order eða focus nálgun

### 3. Accessibility

Núverandi útfærsla:
- `<label>` wraps bæði display div og hidden input → click á label activates input ✓
- `aria-hidden` á Calendar icon ✓
- Hidden input er enn í DOM og accessible fyrir screen reader (ekki `sr-only`,
  en `opacity-0 absolute` — screen reader fer eftir DOM, ekki visual)

**Spurning:** Er þörf á `aria-label` eða `aria-labelledby` á hidden input?
Label wrap ætti að duga en Codex skal staðfesta.

### 4. `required` validation

`required` er sett á hidden input. Þegar form er submitted án `loanedAt` virðist
browser validation message koma upp — en þar sem input er invisible gæti
validation bubble birst á röngum stað.

**Spurning:** Á `required` native validation að virka á `opacity-0` hidden input,
eða þarf custom validation í `handleSubmit`?

### 5. focus-within ring

`focus-within:border-[#2d5a27] focus-within:ring-2 focus-within:ring-[#2d5a27]/10`
á outer div. Þetta ætti að virka þegar hidden input fær focus.

**Spurning:** Staðfesta að `focus-within` ring sé sýnileg þegar notandi navigatar
með lyklaborð á desktop.

### 6. iOS `showPicker()` + opacity

Á iOS 16+ ætti `showPicker()` að virka á `opacity: 0` input. Á eldri iOS gæti
þurft fallback (t.d. `el.focus()` + `el.click()`).

**Spurning:** Þarf fallback fyrir eldri iOS?

## Handpróf sem Stebbi er að gera

1. Opna `/auth-mvp/lanad-og-skilad/ny` á mobile
2. Staðfesta að dagsetningarbox sé ekki wider than screen
3. Tappa á dagsetningarbox — opnast native date picker?
4. Velja dagsetningu — sést `9. júní 2026` í boxinu?
5. Ganga frá nýrri skráningu — sendist rétt?
6. Opna `/auth-mvp/lanad-og-skilad/breyta/[id]` — sama próf

## Keyrðar skipanir

```
npm run type-check → exit 0
npm run test:run   → 29 skrár, 815 passed
git push           → d7fe46f
```

Engar SQL-breytingar. Engar Supabase-breytingar.

## Stoppskilyrði ef Codex finnur vandamál

Ef `showPicker()` virkar ekki á `opacity-0` input á iOS:
- Stoppa og skila handoff til Claude Code með nákvæmri lýsingu
- Ekki breyta CSS í `visibility: hidden` án þess að prófa accessibility impact

Ef `required` validation bubble kemur upp á röngum stað:
- Mæla með að bæta custom validation í `handleSubmit` í LoanForm.tsx
