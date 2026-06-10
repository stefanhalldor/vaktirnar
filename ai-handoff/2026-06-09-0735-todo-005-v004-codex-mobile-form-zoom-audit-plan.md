# TODO #5 - Codex handoff plan for mobile form auto-zoom audit

**Dagsetning:** 2026-06-09 07:35
**Agent:** Codex
**Tengt TODO:** #5 Samræmd mobile app-upplifun
**Hlutverk:** Claude Code er framkvæmdaaðilinn. Codex er að skila nákvæmu plani og áhætturýni.

## Stutt niðurstaða

Stebbi staðfesti að date-field breytingin var ekki full lagfæring: á `/auth-mvp/lanad-og-skilad/ny` þysjar skjárinn enn inn þegar notandi focusar `Hvað var lánað?`.

Þetta er ekki date-specific vandamál. Þetta er iOS Safari mobile auto-zoom á editable form controls með textastærð undir 16px. `Hvað var lánað?` er venjulegt text input í `LoanForm` og notar `text-sm` sem er 14px.

Claude Code skal gera kerfisbundna mobile form audit/fix:

- öll `input`
- öll `textarea`
- öll `select`
- öll shared input components
- öll hardcoded Teskeið/Lánað og skilað form controls

Markmið: editable form controls skulu vera **minnst 16px á mobile**. Ef desktop þarf þéttari texta má nota:

```txt
text-base sm:text-sm
```

Ekki laga þetta með `maximum-scale=1`, `user-scalable=no` eða viewport-hakki. Það myndi veikja accessibility.

## Af hverju þetta gerist

iOS Safari zoomar viewport þegar editable form control fær focus og computed font-size er undir 16px.

Tailwind:

- `text-sm` = 14px
- `text-xs` = 12px
- `text-base` = 16px

Því er `text-sm` á input/textarea/select ekki mobile-safe.

Labels, helper text, buttons og static text mega áfram vera `text-sm` eða `text-xs`. Þetta fix á við um **focusable editable controls**, ekki allan texta.

## Það sem Codex skoðaði

Codex keyrði read-only leit að editable controls. Helstu hits:

```txt
components/ui/Input.tsx
components/loans/LoanForm.tsx
components/loans/AddPartyForm.tsx
components/loans/LoanDateField.tsx
components/teskeid/TeskeidLoginForm.tsx
components/teskeid/SubmissionForm.tsx
components/teskeid/FollowForm.tsx
app/auth-mvp/minn-profill/page.tsx
app/(app)/settings/page.tsx
components/chat/MessageInput.tsx
components/landing/WaitlistForm.tsx
components/landing/VaktSuggestionForm.tsx
app/(admin)/admin/page.tsx
```

Codex gerði engar kóðabreytingar.

## Fyrsta skref Claude Code

Áður en breytt er:

```powershell
git status --short
```

Ef Stebbi eða annar agent er með breytingar í form components skal lesa diff og forðast að yfirskrifa.

## Mælt meginregla

Fyrir editable controls:

```txt
text-base sm:text-sm
```

eða ef component á alltaf að vera 16px:

```txt
text-base
```

Ekki nota `text-[16px]` nema local pattern krefjist þess. `text-base` er skýrara og passar Tailwind.

Fyrir height/spacing:

- Ekki minnka font aftur með nested class.
- Halda `h-10`, `py-2`, `px-3` eða núverandi spacing ef það virkar.
- Ef texti verður þröngur á mobile, hækka field hæð í `min-h-10` eða `min-h-11`, ekki lækka font.

## Scope A - must fix núna

Þetta eru þau controls sem tengjast Teskeið beta og `Lánað og skilað` beint.

### `components/loans/LoanForm.tsx`

Núverandi `inputClass` notar `text-sm`.

Laga:

```txt
text-base sm:text-sm
```

Á við:

- `Hvað var lánað?`
- `Netfang viðtakanda`

Textarea fyrir `Athugasemd` notar líka `text-sm`. Laga í:

```txt
text-base sm:text-sm
```

### `components/loans/AddPartyForm.tsx`

Email input notar `text-sm`. Laga í `text-base sm:text-sm`.

### `components/loans/LoanDateField.tsx`

Hidden native date input er þegar með `fontSize: '16px'`, gott.

En visible display span notar `text-sm`. Það er ekki editable control og veldur ekki iOS zoom, en Stebbi vill mobile app samræmi. Það má halda því ef útlitið er gott. Ekki breyta ef það skemmir layout.

### `app/auth-mvp/minn-profill/page.tsx`

Display name input og read-only email input nota `text-sm`. Laga editable display name í `text-base sm:text-sm`.

Read-only email input focusar líklega ekki til text editing, en má samt setja í `text-base sm:text-sm` fyrir samræmi.

### `components/teskeid/TeskeidLoginForm.tsx`

Staðfesta hvort email og code inputs séu þegar 16px. Ef þau eru `text-sm`, laga í `text-base sm:text-sm`.

Innskráning er critical mobile flow. Þetta þarf að vera með í handprófi.

### `components/teskeid/SubmissionForm.tsx`

Hugmyndabanki/senda hugmynd inniheldur textarea, select, name og email. Laga editable controls í `text-base sm:text-sm`.

### `components/teskeid/FollowForm.tsx`

Email input notar `text-sm`. Laga.

## Scope B - shared component fix

### `components/ui/Input.tsx`

Þetta er shared input sem er notað í eldri app/auth/settings/children flows. Núverandi class notar `text-sm`.

Laga í:

```txt
h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-base sm:text-sm ...
```

Þetta mun laga:

- gamla auth login/signup/reset/forgot pages
- child forms
- contacts invite code
- settings display name/phone
- admin-auth login code/email

Áhætta: UI verður aðeins stærra á mobile. Það er markmiðið. Desktop má halda `sm:text-sm`.

## Scope C - other visible editable controls

Claude Code skal skoða og laga eftir sama mynstri:

```txt
components/chat/MessageInput.tsx
components/landing/WaitlistForm.tsx
components/landing/VaktSuggestionForm.tsx
app/(app)/settings/page.tsx select
```

`app/s/[sessionId]/page.tsx` er legacy/playdate svæði. Ef það er enn reachable á mobile, laga þar líka. Ef það er ekki hluti af Teskeið public beta, má skrá sem deferred en ekki hunsa án skýringar.

`app/(admin)/admin/page.tsx` notar mörg `text-xs` inputs/selects/textareas. Admin mobile er ekki endilega public user flow, en TODO #5 segir allt `teskeid.is`. Claude Code skal annað hvort:

1. laga admin controls líka með `text-base sm:text-xs` eða `text-base md:text-xs`, eða
2. skrá skýrt í handoff að admin mobile zoom sé deferred vegna admin dense UI.

Codex mælir með að minnsta kosti laga public/admin-auth login og public/user-facing flows núna.

## Controls sem þarf ekki að laga

Ekki breyta eingöngu vegna auto-zoom:

- `input type="checkbox"`
- `input type="radio"`
- `input type="range"`
- buttons
- labels
- badges
- static `text-sm`/`text-xs`

Þau valda ekki text-entry auto-zoom á sama hátt.

## Ekki gera

- Ekki breyta `app/layout.tsx` viewport í `user-scalable=no`.
- Ekki setja `maximum-scale=1`.
- Ekki nota global CSS sem neyðir allt í 16px.
- Ekki setja `overflow-x-hidden` sem lausn á zoom.
- Ekki minnka font-size á focus.
- Ekki breyta validation, submit payload, SQL, RLS, Supabase eða auth rules.

## Suggested implementation pattern

Ef class strings eru duplicated, má gera litla local helper:

```ts
const editableInputClass =
  'h-10 w-full rounded-xl border border-gray-200 px-3 text-base sm:text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10'
```

Fyrir textarea:

```txt
text-base sm:text-sm
```

Fyrir select:

```txt
text-base sm:text-sm
```

Ef `text-xs` admin controls þurfa að vera dense á desktop:

```txt
text-base md:text-xs
```

## Acceptance criteria

### Functional

Á iPhone/Safari eða iOS emulation ef raunverulegt tæki er ekki tiltækt:

1. `/auth-mvp/lanad-og-skilad/ny`
   - focus `Hvað var lánað?` → viewport zoomar ekki
   - focus `Netfang viðtakanda` → viewport zoomar ekki
   - focus `Athugasemd` → viewport zoomar ekki
   - date picker heldur áfram að virka
   - enginn horizontal scroll

2. `/auth-mvp/lanad-og-skilad/breyta/[id]`
   - sömu checks og ný færsla

3. `/innskraning`
   - email/code input focusar án zoom

4. `/auth-mvp/minn-profill`
   - name input focusar án zoom

5. `/senda-hugmynd`
   - textarea/select/name/email focusa án zoom

### Browser metric

Á hverri tested route eftir focus:

```js
window.visualViewport?.scale === 1
```

og:

```js
document.documentElement.scrollWidth === document.documentElement.clientWidth
```

Athugið: `visualViewport.scale` er best í Safari/real mobile. Chromium desktop emulation er ekki full sönnun.

### Code review

Leit eftir breytingu má ekki sýna editable controls með mobile `text-sm` eða `text-xs` nema skýrt sé að þeir séu checkbox/radio/range/hidden eða deferred admin dense UI.

Mælt verification command:

```powershell
Get-ChildItem -Path app,components -Recurse -Include *.tsx |
  Select-String -Pattern '<input|<textarea|<select' -Context 0,6
```

Claude Code skal skoða niðurstöðuna handvirkt.

## Tests

Sjálfvirk tests geta ekki fullsannað iOS viewport zoom, en þau eiga að verja gegn regression í rendering/payload.

Lágmark:

```powershell
npm run type-check
npm run test:run
```

Ef shared `Input` eða mörg routes/components breytast:

```powershell
npm run build
```

Ef til eru LoanForm tests, bæta við eða uppfæra til að tryggja:

- `loaned_at`, `due_at`, `item_name`, `note` payload óbreytt
- date field virkar áfram
- optional due date clear ef sú lagfæring er tekin með

## Manual handoff til Stebba

Claude Code skal skila nákvæmum lista:

1. Hvaða files voru lagfærð.
2. Hvaða editable controls eru nú `text-base sm:text-sm`.
3. Hvaða controls voru ekki lagfærð og af hverju.
4. Hvort admin mobile controls voru tekin eða deferred.
5. Keyrðar skipanir og exit codes.
6. Stutt handprófschecklist fyrir Stebba á iPhone/mobile.

## Stoppskilyrði

Claude Code skal stoppa og skila handoff ef:

1. Lausnin virðist þurfa global viewport hack.
2. Að laga shared `Input` veldur stórum layout regressions.
3. Admin dense UI verður of stórt og þarf product ákvörðun.
4. Date field tap/showPicker hættir að virka eftir font/layout breytingar.
5. Form submit payload breytist óvart.

## Codex mat

Þetta er ekki “nice-to-have”; þetta er mobile-first blocker. Stebbi upplifir zoom í aðalflæði `Lánað og skilað`, og því þarf #5 ekki að lokast fyrr en editable controls á mobile eru kerfisbundið yfirfarin.

