# TODO #47 + #49 v018 - Add-party picker closeout

**Fra:** Claude Code
**Til:** Codex
**Dagsetning:** 2026-06-23 09:15
**Commits:** fa86e4c (iOS zoom fix), 5e46db7 (add-party picker)
**Stada:** Lokid. #47 og #49 tillbuid til DONE ad mati Claude og Stebbi.

---

## Samhengi

Stebbi stadfesti adur en Claude hof vinnu ad #47 add-party pickernum:

- Vistunarvillan ("Ekki tokst ad vista") er leyst -- Stebbi gat breytt
  `Gitarstandur?` i `Gitarstandur` annar villur.
- Add-party flaeðid og CTA a edit-sidu virka sem skyldi.
- Tengsl v1 (stadfest i #49 closeout) virka, thelum GMail dedup, display
  name priority, Min skyring, loader/pending state og feature flag gating.

---

## Hvad var gert i thessum lotum

### fa86e4c -- iOS zoom fix (#49)

`RelationshipDetailsForm` og `TagSelectForm` notudu `text-sm` (14px) a
inputs/select/textarea. iOS/Safari zoomar vid focus a form element med
font-size < 16px. Breytt i `text-base` (16px) i badum skram.

Skrar:
- `components/tengsl/RelationshipDetailsForm.tsx`
- `components/tengsl/TagSelectForm.tsx`

### 5e46db7 -- Add-party Tengsl picker (#47 #49)

`AddPartyPage` saekir nu `getRelationshipRecipientOptions` a sama hatt og
`ny/page.tsx`. `AddPartyForm` saekir `relationshipOptions` og synir sama
custom listbox picker og `LoanForm` -- einungis ef notandinn a tengsl og
listinn er ekki tomur. Handvirkt email-reit er alltaf til stadar.

Skrar:
- `app/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]/page.tsx`
- `components/loans/AddPartyForm.tsx`
- `lib/__tests__/loan-pages.test.tsx` -- 7 nyir tests

---

## Tests

```
npm run test:run   --> 1273/1273 pass | 22 skipped | 8 todo
npm run type-check --> 0 errors
```

7 nyir tests i `loan-pages.test.tsx`:

- AddPartyPage: notFound thegar item vantar
- AddPartyPage: notFound thegar notandi er ekki creator
- AddPartyPage: redirect thegar invitation er pending
- AddPartyPage: renders AddPartyForm thegar creator, engin invitation
- AddPartyPage: sendir options thegar tengsl eru til og options eru til
- AddPartyPage: sendir ekki options thegar tengsl eru disabled
- AddPartyPage: sendir ekki options thegar options-listi er tomur

---

## Engin SQL keyrd

Engar SQL functions, schema edda data breytingar.

---

## Spurningar sem Codex a ad ryna

### 1. Er #47 tilbuid til DONE?

Stebbi stadfesti:
- Vistunarvillan leyst.
- Add-party CTA birtist a edit-sidu.
- Tengsl picker birtist i add-party flaeðinu (ef TENGSL_ENABLED=true og tengsl eru til).

Ef Codex ser ekki neinar blocking findings i fa86e4c eða 5e46db7 ma faera
#47 i DONE.

### 2. Er #49 tilbuid til DONE?

Tengsl v1 closeout var stadfest i fyrri handoff
(2026-06-23-0845-todo-049-v017-claude-tengsl-v1-closeout-done.md).
fa86e4c lokar einasta opnu gapinu (iOS zoom). Ef Codex stadfestir, ma faera
#49 i DONE.

---

## Localhost checks sem Stebbi a eftir ad gera (ef hann hefur ekki gert)

### A. Add-party picker

1. Opna lan an motadila.
2. Velja `Baeta vid vidtakanda`.
3. Athuga hvort tengsl-picker birtist efst (ef TENGSL_ENABLED=true og tengsl eru til).
   - Vaent: listi med tengdra adila, einkanafn/nafn/email/skyring synleg.
   - Vaent: Gmail dotted/undotted par birtist einu sinni.
4. Velja tengilid -- athuga hvort email fyllir i reitinn nedan.
5. Vista -- athuga hvort lan faer pending stodu.

### B. iOS zoom a tengsl-detail sidu

1. Opna `/stillingar/tengsl/[id]` a i>Phone eða emuluted 390px viewport.
2. Smella i "Mitt heiti a thessum adila" reit.
   - Vaent: ekkert zoom.
3. Smella i "Min skyring" textarea.
   - Vaent: ekkert zoom.
4. Smella i "Flokkur" select.
   - Vaent: ekkert zoom.

---

## Naesta skref

Ef Codex stadfestir og Stebbi hefur gert localhost checks:

- Faera #47 i DONE.
- Faera #49 i DONE.
- Halda afram med naesta TODO a listanum.
