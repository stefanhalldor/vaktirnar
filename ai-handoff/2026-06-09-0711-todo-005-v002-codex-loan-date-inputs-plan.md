# TODO #5 / #15 follow-up - Codex handoff plan for loan date inputs

**Dagsetning:** 2026-06-09 07:11
**Agent:** Codex
**Tengd TODO:** #5 Samræmd mobile app-upplifun, #15 dagsetningar follow-up
**Hlutverk:** Claude Code er framkvæmdaaðilinn. Codex er að skila plani og áhætturýni.

## Stutt niðurstaða

Stebbi sá að dagsetningarboxin í `Lánað og skilað` ná út fyrir skjáinn á mobile. Þetta gerist bæði í:

- nýrri færslu: `/auth-mvp/lanad-og-skilad/ny`
- breyttri færslu: `/auth-mvp/lanad-og-skilad/breyta/[id]`

Afleiðingin er horizontal scroll á mobile, sem má ekki gerast.

Codex skoðaði date inputs og fann aðeins tvö native `input type="date"` í app/components/lib, bæði í `components/loans/LoanForm.tsx`. Þar sem bæði ný færsla og breyta færsla nota sama `LoanForm`, á lagfæring að vera sameiginleg þar eða í litlum component sem `LoanForm` notar.

## Það sem Codex skoðaði

Codex skoðaði read-only:

- `TODO.md`
- `ai-handoff/README.md`
- `components/loans/LoanForm.tsx`
- `components/loans/LoanShell.tsx`
- `app/auth-mvp/lanad-og-skilad/ny/page.tsx`
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`
- `components/ui/Input.tsx`

Leit staðfesti:

```txt
components/loans/LoanForm.tsx:137 type="date"
components/loans/LoanForm.tsx:149 type="date"
```

Codex gerði engar kóðabreytingar.

## Mikilvæg greining

### Horizontal scroll

`LoanShell` notar eðlilegan mobile container:

```txt
max-w-lg mx-auto px-4
```

Það bendir til að overflow komi frekar frá native date input intrinsic/min-width hegðun en frá page shell.

`LoanForm` notar:

```txt
h-10 w-full rounded-xl border ...
```

`w-full` er ekki alltaf nóg fyrir native `input[type="date"]` á mobile. Sumir vafrar gefa date input lágmarksbreidd sem getur þrýst út fyrir foreldri nema wrapper/input fái `min-w-0`, `max-w-full`, `box-border` og stundum sértæka `appearance`/layout meðhöndlun.

### Íslensk dagsetning inni í boxi

Stebbi sá `8 Jun 2026` og vill sjá `8. júní 2026`.

Claude Code þarf að vita þetta: display texti inni í native `input type="date"` er stjórnað af browser/OS locale og er ekki áreiðanlega þvingaður með venjulegu JavaScript/CSS. `value` verður áfram `YYYY-MM-DD`.

Lágáhættu fyrsta skref er að setja rétt `lang`, t.d. `is-IS`, en það er ekki tryggt í öllum vöfrum. Ef Stebbi vill tryggt íslenskt textasnið inni í sjálfu sýnilega boxinu þarf líklega custom date field sem sýnir formattaðan texta og notar native date input undir húddinu eða opnar sér date picker. Það er aðeins stærra verk en einfalt CSS fix.

## Mælt framkvæmd

### Skref 1 - laga horizontal overflow fyrst

Claude Code skal laga native date inputs þannig að þau geti ekki búið til horizontal page scroll.

Mælt:

1. Búa til sameiginlega `inputClass` eða lítinn `LoanDateField`.
2. Tryggja á date input:
   - `w-full`
   - `max-w-full`
   - `min-w-0`
   - `box-border`
   - `block`
3. Tryggja á label/wrapper:
   - `min-w-0`
   - `w-full`
4. Meta hvort `appearance-none` hjálpi eða skaði native date picker í Safari/Chrome áður en það er sett inn.
5. Ekki nota `overflow-x-hidden` á body/page sem aðalfix; það felur vandann í stað þess að laga root cause.

Acceptance:

```js
document.documentElement.scrollWidth === document.documentElement.clientWidth
```

á mobile viewport eftir að ný færsla og breyta færsla eru opnaðar.

### Skref 2 - bæta locale merkingu á native date input

Sem lágáhættu skref:

1. Sækja locale með next-intl þar sem `LoanForm` er client component, líklega `useLocale()`.
2. Kortleggja `is -> is-IS`, `en -> en-GB`.
3. Setja `lang={dateLocale}` á bæði date inputs.

Þetta gæti lagað `8 Jun 2026` í sumum vöfrum en má ekki vera eina staðfesta leiðin ef Stebbi krefst nákvæmlega `8. júní 2026` inni í boxinu á öllum tækjum.

### Skref 3 - ef native `lang` dugar ekki, gera custom visible date field

Ef Claude Code getur staðfest að native input sýni enn ensku þrátt fyrir `lang`, skal stoppa eða fara í litla custom date field lausn eftir samþykki Stebba.

Mælt custom nálgun ef samþykkt:

- Halda internal value sem ISO `YYYY-MM-DD`.
- Sýna formatted display value:
  - `8. júní 2026` á íslensku.
  - eðlilegt enskt snið á ensku.
- Nota native date picker áfram ef hægt er, en ekki treysta native input textanum sem sýnilega textann.
- Ekki bæta við þungu calendar dependency fyrir þetta.
- Halda keyboard/focus/accessibility lagi.

Ekki nota frjálsan texta-input með íslensku parsing nema sérstaklega ákveðið; það getur búið til validation og accessibility flækju.

## Mæltar skrár

Claude Code mun líklega breyta:

```txt
components/loans/LoanForm.tsx
```

Mögulega bæta við:

```txt
components/loans/LoanDateField.tsx
lib/loans/date-format.ts
lib/__tests__/loan-date-field.test.tsx
```

Ef aðeins CSS/`lang` fix er gert, þarf líklega ekki nýjan helper.

Ef custom formatted visible date field er gert, þá er helper skynsamlegur svo íslenskt og enskt snið sé prófanlegt utan browser-native date input.

## Notendatextar

Ef nýir placeholder/help/error textar bætast við, setja þá í:

```txt
messages/is.json
messages/en.json
```

Ekki hardcode-a nýjan sýnilegan texta í component.

## Tests

Lágmarkspróf:

1. `LoanForm` í create mode renderar tvö date fields sem eru full-width/mobile-safe.
2. `LoanForm` í edit mode notar sömu date fields og initial values.
3. `dueAt` heldur áfram að fá `min={loanedAt}` eða sambærilega validation.
4. Submit payload heldur áfram að senda ISO `loaned_at` og `due_at`.
5. Ef date format helper er búinn til:
   - `2026-06-08` -> `8. júní 2026` á íslensku.
   - enskt locale skilar ekki íslenskum mánaðarnöfnum.

Athugið: jsdom getur ekki áreiðanlega prófað native browser textann inni í `input type="date"`. Ekki skrifa falskt test sem þykist staðfesta browser-renderað `8. júní 2026` í native input.

## Handpróf fyrir Stebba

Stebbi skal prófa á mobile viewport, helst 360-460 px:

1. Opna `/auth-mvp/lanad-og-skilad/ny`.
2. Staðfesta að ekki sé hægt að skrolla til hliðar.
3. Staðfesta að bæði dagsetningarbox séu jafn breið og `Hvað var lánað` og `Athugasemd`.
4. Opna `/auth-mvp/lanad-og-skilad/breyta/[id]`.
5. Endurtaka sömu athugun þar.
6. Staðfesta hvort date display er íslenskt eða hvort browser sýnir enn native enskt snið.

## Prófanir sem Claude Code skal keyra

```powershell
npm run type-check
npm run test:run
```

Ef nýr component eða date helper er bætt við og Next route rendering breytist:

```powershell
npm run build
```

Ekki ræsa dev server; Stebbi sér um localhost.

## Ekki gera í þessu verki

- Ekki breyta SQL, RLS, RPC eða Supabase.
- Ekki breyta date storage format; áfram skal senda ISO `YYYY-MM-DD`.
- Ekki laga þetta með global `overflow-x-hidden` á alla síðu nema sem síðasta varnarlína eftir root-cause fix.
- Ekki setja þungan datepicker dependency inn án samþykkis Stebba.
- Ekki enduropna allt #15 scope um lánaspjöld nema það tengist beint þessum form-date fields.

## Stoppskilyrði

Claude Code skal stoppa og skila handoff ef:

1. Native `input type="date"` er ekki hægt að íslenska áreiðanlega með `lang` og Stebbi þarf að samþykkja custom date field.
2. Fixið krefst global layout breytinga sem gætu haft áhrif á aðrar síður.
3. Date validation eða submit payload byrjar að breytast.
4. Lausnin myndi fela overflow í stað þess að laga date input.

## Handoff frá Claude Code eftir framkvæmd

Claude Code skal skila:

1. Hvort horizontal scroll lagaðist með date input fixi.
2. Hvort native `lang` dugði til að íslenska textann inni í boxinu.
3. Ef ekki, hvaða custom lausn Claude Code mælir með.
4. Breyttar skrár.
5. Keyrðar skipanir og exit codes.
6. Hvort SQL var skrifað eða keyrt. Vænt svar: nei.
7. Handpróf sem Stebbi þarf að gera.

