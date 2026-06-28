# TODO #49 v017 - Tengsl v1 closeout

**Fra:** Claude Code
**Til:** Stebbi / Codex
**Dagsetning:** 2026-06-23 08:45
**Commit:** fa86e4c
**Stada:** Audit lokid. Ein smavaegileg lagfaering. #49 tilbuid til DONE.

---

## Nidurstada: #49 er tilbuid til ad loka

Oell v1 viðmid eru uppfyllt. Eina lagfaering: iOS zoom a inputs.

---

## 1. V1 criteria audit

### 1. /stillingar/tengsl listi, mobile layout

- `max-w-lg mx-auto px-4 pt-8 pb-10` layout. Card-style `<Link>` items.
- `loading.tsx` til ad syna loader vid navigation.
- Engin native select eða lista sem gaefi "veflegt" mobile feel.
- **PASS**

### 2. Gmail canonical dedup

- `getRelationshipDirectory` step 5.6: groupar eftir `normalizeEmailForAccess(email_canonical)`, veldur rikasta row, felur afrit.
- `getRelationshipRecipientOptions`: sama canonical grouping + richest-row val.
- Non-Gmail punktar helst aðskildir (canonical == literal fyrir non-Gmail).
- **PASS**

### 3. Tengsl detail: display name priority

```tsx
const displayName =
  relationship.private_display_name ??
  relationship.counterpart_display_name ??
  relationship.email_canonical ??
  id
```

- `getRelationship()` resolves `counterpart_display_name` via profile lookup (confirmed user ID) or accepted invitation chain (email-only row). Ekki naefst fra lausu email-i.
- **PASS**

### 4. Min skyring birtist sem ser svidi

- `RelationshipDetailsForm` synir `privateDisplayName` og `note` sem ser labeled fields a forminu.
- `note` er `<textarea rows={3}>` -- wrap innifyllt, fyllir ekki ut af skja.
- Ekkert bandstrik. Label er "Min skyring" (fra `t('note')`).
- **PASS**

### 5. Recipient picker

- Custom `role="listbox"` div med `<button role="option">` per tengilid.
- `break-words` / `break-all` a naefum spans. `min-w-0` i flestum containers. `max-h-56 overflow-y-auto`.
- Deduped via `getRelationshipRecipientOptions`.
- Val setur `recipientEmail` i form state.
- **PASS**

### 6. Navigation / loader / pending state

- `app/stillingar/tengsl/loading.tsx` til.
- `app/stillingar/tengsl/[id]/loading.tsx` til.
- Baedir nota `TeskeidLoader` med `role="status"`, full-screen centering.
- **PASS**

### 7. Feature flag: fail-closed

```ts
if (featureKey === 'tengsl') {
  if (process.env.TENGSL_ENABLED !== 'true') return false
  if (process.env.TENGSL_FLAG !== 'true') return true
  return checkPerUserAccess(email, 'tengsl')
}
return false // unknown keys
```

- Ukunnur featureKey skilar false. TENGSL_ENABLED = 'false' eða vantar = block. Per-user gating via `feature_access` table.
- `guardFeatureAccess` kalla `redirect('/')` ef blocked.
- **PASS**

### 8. Utanumhald v1 vs framtid

- #50 family members: not touched.
- #52/#37 event-feed: not touched.
- #22 route cleanup: not touched.
- **PASS**

---

## 2. Lagfaering gerð

### iOS zoom a inputs (fa86e4c)

`RelationshipDetailsForm` og `TagSelectForm` notudu `text-sm` (14px CSS) a inputs/select/textarea. iOS/Safari zoomar sjalf. vid focus-a a form-element ef font-size < 16px. Breytt i `text-base` (16px) i badum skram.

**Skrar breyttar:**
- `components/tengsl/RelationshipDetailsForm.tsx` -- inputClass og textarea: `text-sm` -> `text-base`
- `components/tengsl/TagSelectForm.tsx` -- select: `text-sm` -> `text-base`

Engin test brotnudu. 1266/1266 pass eftir breytinguna.

---

## 3. Skrar skoðadar

- `app/stillingar/tengsl/page.tsx`
- `app/stillingar/tengsl/[id]/page.tsx`
- `app/stillingar/tengsl/loading.tsx`
- `app/stillingar/tengsl/[id]/loading.tsx`
- `lib/relationships/actions.ts`
- `components/loans/LoanForm.tsx`
- `components/tengsl/RelationshipDetailsForm.tsx`
- `components/tengsl/TagSelectForm.tsx`
- `lib/loans/guard.ts`
- `messages/is.json` (tengsl-hlutinn)
- `lib/__tests__/tengsl-pages.test.tsx`

---

## 4. Tests keyrðir

```
npx vitest run lib/__tests__/tengsl-actions.test.ts lib/__tests__/tengsl-pages.test.tsx lib/__tests__/loan-form.test.tsx
  → 44/44 pass

npx vitest run   → 1266/1266 pass | 22 skipped | 8 todo
npm run type-check → 0 errors
git push → fa86e4c
```

---

## 5. SQL var ekki keyrt

Engar SQL functions, schema eða data breytingar.

---

## 6. Design.md compliance

- Mobile layout: `max-w-lg`, `px-4`, full-width cards -- passar vid app-like feel.
- No horizontal overflow: `break-words`/`break-all` a text, `min-w-0` containers.
- No unwanted input zoom: lagfaert i fa86e4c (text-base a ollum inputs/select/textarea i tengsl-skjaum).
- Loader/pending: loading.tsx badum routes.
- Navigation feedback: Link-based navigation, loading.tsx handles pending state.

---

## 7. Localhost checks sem Stebbi ætti ad gera

### A. Tengsl listi og Gmail dedup

1. Opna `/stillingar/tengsl`.
2. Notandi med tengsl fyrir `dotted.user@gmail.com` og `dotteduser@gmail.com` (sama canonical).
   - Vaent: birtist sem ein rad, ekki tvaer.
3. Non-Gmail par (`fyrri.seinni@example.com` vs `fyrriseinni@example.com`) -- vaent: tvaer radir.

### B. Detail display name

1. Smella a tengilid sem hefur `Mitt heiti`.
   - Vaent: innra heiti i h1.
2. Tengilid an innra heitis, en med Teskeið profile-nafn.
   - Vaent: profile-nafn i h1, "Nafn i Teskeið" label e/v.
3. Email-only tengilid.
   - Vaent: email i h1.

### C. Min skyring

1. Slipptu inn texta i "Min skyring" reitinn a detail-sidu.
2. Lengur texti (+ 200 stafir) vid 360px viewport.
   - Vaent: tekstur wrappast, ekkert fer ur sja, ekkert horizontal scroll.

### D. Mobile / iOS zoom

Viewport: 360px eða raunverulegur simi.

1. Opna `/stillingar/tengsl/[id]`.
2. Smella i "Mitt heiti a thessum adila" reitinn.
   - Vaent: ekkert zoom (text-base = 16px).
3. Smella i "Min skyring" textarea.
   - Vaent: ekkert zoom.
4. Smella i "Flokkur" select.
   - Vaent: ekkert zoom.

### E. Recipient picker i lanaformi

1. Opna `/auth-mvp/lanad-og-skilad/ny`.
2. Sja tengslapicker (ef TENGSL_ENABLED=true).
   - Vaent: Gmail dedup-par birtist einu sinni.
3. Velja tengilid og stofna lan.
   - Vaent: email fyllir reglulega i recipient field.

### F. Navigation loader

1. Opna `/stillingar/tengsl`.
2. Smella a tengilid.
   - Vaent: loader sest strax, ekkert "dautt" tap-feeling.
3. Smella "Til baka".
   - Vaent: loader sest vid siðuna a leididinni til baka.

---

## 8. Framhald-TODO (utan v1)

- **#50** Fjolskyldumedlimir sem tengsl.
- **#52/#37** Olesid event-feed og full tengsl-activity timeline.
- **#22** /auth-mvp route cleanup og canonical routes.
- **SQL merge/backfill** fyrir literal duplicate Gmail rows i DB (v1 gerir aðeins in-memory dedup; DB cleanup er sjalfstaeð migration).

---

## Tillaga: #49 er tilbuid til DONE

Oell v1 viðmid eru uppfyllt i koda. Eina breyting eftir #43 closeout var iOS zoom fix (fa86e4c).

Ef Stebbi staðfestir localhost checks A-F hér ad ofan og sér ekki blocking bilanir, maeli eg med ad faera #49 i DONE.
