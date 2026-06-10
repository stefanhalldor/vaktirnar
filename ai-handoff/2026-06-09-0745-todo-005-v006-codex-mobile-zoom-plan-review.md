# TODO #5 - Codex review of Claude Code mobile zoom plan

**Dagsetning:** 2026-06-09 07:45
**Agent:** Codex
**Rýnt skjal:** `2026-06-09-0748-todo-005-v005-codex-mobile-zoom-fix-plan.md`
**Tengt TODO:** #5 Samræmd mobile app-upplifun

## Findings

### Medium - `text-base sm:text-sm` er ekki nógu öruggt sem almennt mobile zoom fix

Claude Code plan notar víða:

```txt
text-base sm:text-sm
```

Það lagar 360-460 px portrait mobile, en `sm:` byrjar við 640 px. Sum iOS/Safari mobile tilvik geta verið yfir 640 CSS px, sérstaklega landscape og stærri tæki. Þá getur `sm:text-sm` orðið 14px aftur og auto-zoom vandinn getur komið til baka.

Codex mælir með:

```txt
text-base
```

fyrir public/user-facing editable controls, nema það sé mjög skýr ástæða til að þétta á desktop. Ef desktop þétting er nauðsynleg, nota frekar:

```txt
text-base lg:text-sm
```

Ekki nota `sm:text-sm` sem default fyrir editable controls þegar markmiðið er að tryggja mobile upplifun allsstaðar.

### Medium - Admin deferred þarf samþykki Stebba ef markmiðið er „allsstaðar“

Claude Code leggur til að `app/(admin)/admin/page.tsx` verði deferred vegna dense desktop UI.

Það er tæknilega skiljanlegt, en Stebbi bað sérstaklega um að tryggja mobile upplifun „allsstaðar“. Ef admin er reachable á mobile, þá er þetta ekki full lokun á #5 nema Stebbi samþykki að admin mobile sé undanskilið.

Codex mælir með annað hvort:

1. laga admin editable controls líka með `text-base lg:text-xs`, eða
2. fá skýrt samþykki frá Stebba um að admin dense UI sé sér deferred atriði.

Ekki kalla #5 fullklárað ef admin editable controls eru meðvitað skilin eftir með `text-xs` án skýrs fráviks.

### Low - `app/(app)/settings/page.tsx` select vantar í plan

Shared `Input.tsx` lagar display name og phone í settings, en language `<select>` í `app/(app)/settings/page.tsx` er sér control og var ekki skráð í Claude-planinu.

Það þarf að laga með sama mynstri og önnur editable/select controls.

### Low - `Input.tsx` ætti helst að nota `text-base`, ekki `text-base sm:text-sm`

Þar sem `Input.tsx` er shared component fyrir auth, settings, children, contacts og admin-auth, er öruggasta valið:

```txt
text-base
```

Ef Claude Code vill varðveita desktop density:

```txt
text-base lg:text-sm
```

Codex myndi ekki velja `sm:text-sm` fyrir shared editable input.

## Svör við spurningum Claude Code

### 1. Er `text-base sm:text-sm` rétt pattern alls staðar?

Nei, ekki sem almennt mobile-safe pattern. Nota `text-base` fyrir public/user-facing editable controls. Ef desktop þarf þéttingu, nota `lg:text-sm`, ekki `sm:text-sm`.

### 2. Á `Input.tsx` að vera `text-base sm:text-sm` eða `text-base`?

Codex mælir með `text-base`. Annar kostur er `text-base lg:text-sm` ef desktop density skiptir miklu. Ekki `sm:text-sm`.

### 3. Á að laga read-only email í `minn-profill/page.tsx`?

Já, fyrir samræmi. Það er lág áhætta og kemur í veg fyrir edge cases þar sem read-only input fær focus eða browser hegðar sér öðruvísi.

### 4. Á að hunsa `MessageInput.tsx`?

Nei, ekki ef markmiðið er kerfisbundið #5 fix. Breytingin er lítil og óskaðleg. Ef legacy er óvirkt breytir hún litlu, en ef það verður virkt síðar er fixið til staðar.

### 5. Vantar einhverja skrá?

Já, að minnsta kosti:

```txt
app/(app)/settings/page.tsx
```

vegna language select. Claude Code skal líka keyra lokaaudit eftir breytingu á öllum `<input`, `<textarea`, `<select` til að finna editable controls sem enn eru með mobile `text-sm` eða `text-xs`.

## Uppfært framkvæmda-plan

Claude Code skal:

1. Breyta public/user-facing editable controls í `text-base`.
2. Nota `text-base lg:text-sm` aðeins þar sem desktop density þarf virkilega að haldast.
3. Laga `components/ui/Input.tsx`.
4. Laga sér controls í `LoanForm`, `AddPartyForm`, `minn-profill`, `SubmissionForm`, `FollowForm`, landing forms, `MessageInput`, og settings select.
5. Taka afstöðu til admin: laga admin eða fá skýrt deferred samþykki frá Stebba.
6. Keyra lokaaudit:

```powershell
Get-ChildItem -Path app,components -Recurse -Include *.tsx |
  Select-String -Pattern '<input|<textarea|<select' -Context 0,6
```

7. Staðfesta handvirkt að enginn editable public/mobile control sem á að vera lagaður sé enn með `text-sm` eða `text-xs` á mobile.

## Prófanir

Claude Code skal keyra:

```powershell
npm run type-check
npm run test:run
npm run build
```

`build` er rétt hér vegna shared `Input.tsx` og margra touched UI paths.

## Handpróf fyrir Stebba

Stebbi prófar helst á iPhone/Safari:

1. `/auth-mvp/lanad-og-skilad/ny`
   - `Hvað var lánað?`
   - `Netfang viðtakanda`
   - `Athugasemd`
   - `Skila fyrir`
2. `/auth-mvp/lanad-og-skilad/breyta/[id]`
3. `/innskraning`
4. `/auth-mvp/minn-profill`
5. `/senda-hugmynd`

Við focus/tap:

```js
window.visualViewport?.scale === 1
```

og enginn horizontal scroll:

```js
document.documentElement.scrollWidth === document.documentElement.clientWidth
```

## Codex niðurstaða

Claude Code plan er á réttri leið, en Codex myndi ekki samþykkja það óbreytt vegna `sm:text-sm` og admin/deferred óskýrleika. Breyta planinu samkvæmt findings áður en framkvæmd hefst.

