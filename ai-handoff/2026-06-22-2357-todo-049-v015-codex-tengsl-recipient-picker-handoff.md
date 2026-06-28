# TODO #49 - Tengslaval í nýju láni: dedupe, skýring og birtingarnafn

**Frá:** Codex  
**Til:** Claude Code  
**Dagsetning:** 2026-06-22 23:57  
**Staða:** Beiðni um rýni, lagfæringu og handoff til baka til Codex  

## Samhengi

Stebbi prófaði að skrá nýjan hlut í `Lánað og skilað` og velja viðtakanda úr
`Tengsl`. Í valmyndinni komu fram þrjú vandamál:

1. Dotted og canonical Gmail form sama aðila birtast sem tvær línur.
2. `Mín skýring` er falin aftan við langt bandstrik í sömu línu og fer illa á
   mobile.
3. Ef Stebbi hefur ekki sett innra heiti á tengilið á að nota nafnið sem
   viðkomandi hefur sjálfur sett í Teskeið, ef það er til staðar.

Ekki nota raunveruleg netföng úr skjámyndum í tests, comments eða logs. Nota
placeholder eins og `dotted.user@gmail.com` og `dotteduser@gmail.com`.

## Núverandi staðir

Líklegir staðir sem þarf að breyta:

- `components/loans/LoanForm.tsx`
  - Núverandi native `<select>` renderar eina langa option-línu:
    `selfDisplayName`, `privateDisplayName`, email og note allt saman.
- `lib/relationships/actions.ts`
  - `getRelationshipRecipientOptions()` sækir raw persisted relationship rows,
    ekki endilega dedupe-aða canonical identity sýn.
- `app/auth-mvp/lanad-og-skilad/ny/page.tsx`
  - Sækir `getRelationshipRecipientOptions(user.id)` og sendir í `LoanForm`.
- `messages/is.json` og `messages/en.json`
  - Ef nýr helper texti, empty texti eða picker label þarf translation.

## Root cause sem þarf að staðfesta

`getRelationshipRecipientOptions()` notar núna eigin query á `relationships` og
skilar beint `rows.map(...)`. Það virðist ekki nota sömu canonical/dedupe-reglur
og `/stillingar/tengsl` er nú að fá í `getRelationshipDirectory()`.

Þess vegna geta `dotted.user@gmail.com` og `dotteduser@gmail.com` enn birst sem
tveir valmöguleikar í lánaformi, jafnvel ef `/stillingar/tengsl` er búið að
fela eða sameina þá.

## Verkefni fyrir Claude Code

1. Laga `getRelationshipRecipientOptions()` þannig að það skili dedupe-aðri
   tengslasýn fyrir pickerinn.
2. Nota sömu identity-reglur og `/stillingar/tengsl`:
   - Gmail/googlemail canonicalization
   - sama auth-notandi má ekki birtast tvisvar
   - preserve-a ríkari row: `private_display_name`, note, tags og email sem má
     nota í lánaforminu
3. Laga birtingarreglu:
   - aðalheiti = `privateDisplayName ?? selfDisplayName ?? email`
   - email birtist sem secondary texti þegar aðalheiti er ekki bara email
   - note/skýring birtist fyrir neðan, inndregin eða á annan mobile-vænan hátt
4. Ekki fela note/skýringu aftan við langt bandstrik í sömu línu.
5. Passa að texti fari ekki út fyrir mobile skjástærð.
6. Skila handoff til baka til Codex með hvað var gert og hvað Stebbi á að prófa.

## UI ákvörðun: native select eða custom picker

Native `<select><option>` styður ekki áreiðanlega multi-line option layout, indent,
wrapping eða rich secondary texta, sérstaklega ekki á mobile þar sem OS sér oft
um rendering.

Claude Code þarf því að velja eina af þessum leiðum:

### Valkostur A: Custom picker/listbox

Skipta native select út fyrir einfaldan, accessible custom picker í `LoanForm`:

- listi af smellanlegum valmöguleikum eða popover/listbox
- hver option sýnir:
  - aðalheiti
  - email í minni texta
  - `Mín skýring` fyrir neðan, smá inndregið, með `break-words`
- við val setur component `recipientEmail` eins og núverandi select gerir
- keyboard/focus þarf að vera í lagi

Þetta er líklega betra ef Stebbi vill sjá skýringuna inni í valinu sjálfu.

### Valkostur B: Native select + selected preview

Halda native select, en:

- option texti er stuttur og dedupe-aður
- undir select birtist preview fyrir valinn tengilið:
  - email
  - `Mín skýring`
  - hugsanlega self display name

Þetta er einfaldara en uppfyllir ekki alveg óskina um að skýringin sé sýnileg í
sjálfum listanum.

Codex hallast að Valkosti A ef það er lítið og vel afmarkað, annars Valkosti B
sem örugg millileið.

## Acceptance criteria

- Í lánaforminu birtist sami Gmail-aðili aðeins einu sinni þó gögn innihaldi
  bæði dotted og canonical form.
- Ef Stebbi hefur sett `Mitt heiti á þessum aðila`, birtist það sem aðalheiti.
- Ef ekkert innra heiti er til en `Nafn í Teskeið` er til, birtist það sem
  aðalheiti.
- Ef hvorugt er til, birtist email.
- Email er enn sýnilegt einhvers staðar í valinu svo Stebbi viti hvert boðið fer.
- `Mín skýring` birtist undir heiti/email, ekki sem löng lína með bandstriki.
- Á 360-460 px mobile viewport fer texti ekki út fyrir skjá, veldur ekki
  horizontal scroll og þrengir ekki formið.
- Val á tengilið fyllir `recipientEmail` rétt og stofnun láns notar rétta
  canonical email.
- TENGSL feature flag/per-user gating hegðun helst óbreytt.

## Prófanir sem Claude Code ætti að bæta við

### Unit/action tests

Í `lib/__tests__/tengsl-actions.test.ts` eða sambærilegri skrá:

- `getRelationshipRecipientOptions()` skilar einni option þegar til eru
  `dotted.user@gmail.com` og `dotteduser@gmail.com`.
- Ef ríkari row hefur `private_display_name`, note eða tag, tapast það ekki.
- Ef row hefur `counterpart_user_id`, `selfDisplayName` kemur frá profile.
- Non-Gmail dot-tilfelli sameinast ekki.

### Component tests

Í LoanForm testum eða nýrri test skrá:

- Aðalheiti notar `privateDisplayName` áður en `selfDisplayName`.
- Ef `privateDisplayName` er null notar UI `selfDisplayName`.
- Note/skýring birtist sem sér texti fyrir neðan, ekki concatenated með `—`.
- Val á option setur email í form state.

Ef native select er áfram notað, testið ekki að multi-line option virki, því það
er browser/OS háð. Þá þarf frekar að testa selected preview.

## Sérstök varúð

- Picker má birta einkaskýringu Stebba fyrir Stebba, en hún má aldrei fara í
  server action payload nema sem UI state sem er ekki submit-að.
- Loan action á áfram bara að fá email sem viðtakanda.
- Ekki logga netföng eða private notes.
- Ekki gera blind auth/profile lookup út frá email nema tengingin sé þegar
  staðfest með owner-visible sameiginlegri virkni eða `counterpart_user_id`.
- Ekki breyta SQL eða keyra SQL fyrir þetta atriði nema Claude Code finni
  nauðsyn og Stebbi samþykki sérstaklega.

## Localhost checks for Stebbi

Prófa á localhost með `TENGSL_ENABLED=true` og user sem hefur `tengsl` aðgang.

1. Opna `/auth-mvp/lanad-og-skilad/ny`.
2. Skoða `Veldu úr tengslum`.
   - Vænt: dotted/canonical Gmail sami aðili birtist bara einu sinni.
3. Finna tengilið sem hefur bæði:
   - email
   - `Mitt heiti á þessum aðila`
   - `Mín skýring`
   - Vænt: innra heiti er aðalheiti, email sést sem secondary, skýring sést
     undir og fer ekki út fyrir skjá.
4. Finna tengilið sem hefur ekkert innra heiti en hefur `Nafn í Teskeið`.
   - Vænt: `Nafn í Teskeið` er notað sem aðalheiti.
5. Velja tengilið og stofna lán.
   - Vænt: netfang viðtakanda fyllist/fer í request rétt og lán stofnast með
     réttum viðtakanda.
6. Prófa mobile viewport 360-460 px.
   - Vænt: enginn horizontal scroll, note/skýring wrappar fallega, select/picker
     er nothæfur með fingri.
7. Prófa að slökkva á `TENGSL_ENABLED`.
   - Vænt: tengslaval birtist ekki, en handvirkt netfang í lánaformi virkar enn.
