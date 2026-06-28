# TODO #49 - Tengsl: sameina sama aðila og birta „Nafn í Teskeið“

**Frá:** Codex  
**Til:** Claude Code  
**Dagsetning:** 2026-06-22 23:27  
**Staða:** Beiðni um rýni, lagfæringu og handoff til baka til Codex  

## Samhengi

Stebbi keyrði `sql/56_normalize_email_canonical.sql` og `NOTIFY pgrst, 'reload schema';`.
Það lagaði Gmail-aware canonical samanburð í lánaboðum, en `/stillingar/tengsl`
sýnir enn duplicate fyrir sama raunverulega aðila í sumum tilfellum:

- ein færsla er email-only row með dotted Gmail formi
- önnur færsla er staðfestur Teskeið-notandi með profile/display name
- detail-síðan sýnir ekki alltaf línuna `Nafn í Teskeið: ...`

Stebbi vill að þetta sé meðhöndlað sem sami aðili og að detail-síðan sýni
opinbert Teskeið-nafn þegar tengingin er staðfest.

Ekki nota raunveruleg netföng úr skjámyndum í tests, comments eða logs. Nota
placeholder netföng eins og `dotted.user@gmail.com` og `dotteduser@gmail.com`.

## Vörukrafa

Á `/stillingar/tengsl` á sami raunverulegi aðili ekki að birtast tvisvar bara
vegna þess að gömul gögn geyma Gmail netfang með punkti en nýrri gögn eða auth
nota punktalaust canonical form.

Á `/stillingar/tengsl/[id]` á að sjást skýr aðgreining milli:

- `Nafn í Teskeið`: nafnið sem viðkomandi hefur á eigin Teskeið-prófíl, ef
  notandi er staðfestur mótaðili í sameiginlegri virkni
- `Mitt heiti á þessum aðila`: einkanafn eiganda tengslanna, aðeins sýnilegt
  eigandanum

Ef tengslin eru aðeins óstaðfest email-only boð, má ekki fletta upp profile eða
birta `Nafn í Teskeið`, því það gæti orðið account-enumeration leki.

## Líkleg tæknileg rót

Skoðuð svæði:

- `lib/relationships/actions.ts`
  - `getRelationshipDirectory()`
  - `getRelationship()`
  - `getRelationshipLoanActivity()`
- `app/stillingar/tengsl/page.tsx`
- `app/stillingar/tengsl/[id]/page.tsx`
- `sql/54_relationships.sql`
- `sql/56_normalize_email_canonical.sql`

Athuganir Codex:

- `sql/56` canonical-ar `loan_invitations` read/write paths en gerir enga
  data-migration á `relationships`.
- `relationships_owner_email_canonical_idx` er unique á literal
  `email_canonical`, ekki á canonicalized expression. Þess vegna geta gömul
  dotted Gmail row og ný canonical row lifað hlið við hlið ef þau voru stofnuð
  áður en öll write-path voru canonical.
- `getRelationshipDirectory()` reynir að sameina „thin“ user-id row við „rich“
  email row, en production-hegðunin sýnir að það nær ekki öllum tilfellum.
- `getRelationshipLoanActivity()` notar exact
  `.eq('recipient_email_normalized', relationship.email_canonical)` fyrir
  email-only lookup. Það grípur ekki dotted/canonical mismatch í eldri gögnum.
- `getRelationship()` sækir `counterpart_display_name` aðeins ef
  `relationships.counterpart_user_id` er til. Ef row er email-only en sameiginleg
  lánavirkni staðfestir raunverulegan auth-notanda, vantar profile-nafnið.

## Verkefni fyrir Claude Code

1. Rýna núverandi Tengsl-lógík eftir `sql/56`.
2. Laga duplicate identity í `/stillingar/tengsl` fyrir Gmail dotted/undotted
   tilfelli.
3. Laga `Nafn í Teskeið` á `/stillingar/tengsl/[id]` þannig að það birtist þegar
   tengingin við auth-notanda er staðfest með sameiginlegri virkni.
4. Bæta við focused tests sem grípa þetta.
5. Skila handoff til Stebba/Codex áður en production rollout eða SQL cleanup er
   keyrt.

## Tillaga að öruggri nálgun

Halda þessu í tveimur lögum:

### A. App-lag: örugg birting og dedupe

Bæta við eða endurbæta helper í `lib/relationships/actions.ts` sem byggir
owner-scoped identity map út frá gögnum sem eigandinn má þegar sjá:

- sækja lán þar sem `ownerUserId` er `lender_user_id` eða `borrower_user_id`
- sækja invitation rows fyrir þessi lán
- canonical-a `recipient_email_normalized` með `normalizeEmailForAccess`
- ef lán er accepted eða mótaðili er orðinn `lender_user_id`/`borrower_user_id`,
  tengja canonical email við staðfestan `counterpart_user_id`
- nota þessa staðfestu tengingu til að:
  - merge-a email row og user-id row í listanum
  - velja „rich“ row sem primary: varðveita `private_display_name`, `note`, tags
    og sources
  - bæta `counterpart_user_id` á rich row best-effort ef öruggt er
  - fela thin duplicate row í response
  - sækja `profiles.display_name` bara fyrir staðfestan `counterpart_user_id`

Ekki gera blind lookup í `auth.users` út frá hvaða email sem er nema það email
sé þegar bundið við owner-visible sameiginlega virkni. Profile-nafn má aðeins
birtast þegar sameiginleg virkni staðfestir að þetta sé sá auth-notandi.

### B. SQL/data-lag: undirbúa cleanup eða migration ef þörf er á

Meta hvort þurfi `sql/57_...` sem:

- canonical-ar `relationships.email_canonical` fyrir Gmail/googlemail
- sameinar duplicate rows per `owner_id` þegar canonical email verður sama gildi
- flytur tags, `private_display_name`, `note` og sources yfir á primary row
- varðveitir ríkari row og eyðir aðeins duplicate þegar öruggt er

Ef migration er nauðsynleg má Claude Code skrifa hana, en ekki keyra hana nema
Stebbi samþykki sérstaklega. Ef app-lagið leysir þetta örugglega án migration
má SQL57 bíða, en þá þarf handoff að útskýra af hverju.

## Acceptance criteria

- `/stillingar/tengsl` sýnir eina færslu fyrir sama Gmail-aðila þó eldri gögn
  innihaldi bæði dotted og punktalaust form.
- Ef ein duplicate-row er flokkuð sem `Vinir` eða hefur einkanafn/note, tapast
  það ekki þegar duplicate er sameinað eða falið.
- Detail-síða sýnir `Nafn í Teskeið: <profile display name>` þegar mótaðili er
  staðfestur Teskeið-notandi í sameiginlegu láni.
- Detail-síða sýnir áfram `Mitt heiti á þessum aðila` sem editable private field.
- Óstaðfest email-only tengsl sýna ekki profile-nafn.
- `getRelationshipLoanActivity()` finnur lánavirkni þó gömul invitation row hafi
  dotted Gmail en relationship row eða auth-email sé canonical punktalaust.
- Enginn notandi sér tengsl, einkanafn, note eða virkni annars notanda.
- `TENGSL_ENABLED` og per-user `tengsl` feature access virka áfram.

## Prófanir sem Claude Code ætti að bæta við

Bæta við eða uppfæra tests í `lib/__tests__/tengsl-actions.test.ts` og
`lib/__tests__/tengsl-pages.test.tsx`.

Nauðsynleg test dæmi:

1. `getRelationshipDirectory()` fær persisted email row
   `dotted.user@gmail.com` og thin user-id row fyrir auth-notanda með email
   `dotteduser@gmail.com`; niðurstaðan er ein row.
2. Primary row varðveitir `private_display_name`, `note` og tag `friends` ef það
   var á rich email row.
3. `counterpart_display_name` kemur frá `profiles.display_name` eftir örugga
   identity staðfestingu.
4. `getRelationshipLoanActivity()` finnur activity þegar invitation geymir
   dotted Gmail en relationship eða auth notar canonical punktalaust Gmail.
5. Óstaðfest email-only row sýnir ekki `Nafn í Teskeið`.
6. Detail page birtir bæði:
   - fyrirsögn út frá einkanafni ef eigandi hefur sett það
   - `Nafn í Teskeið: ...` ef staðfest profile-nafn er annað en einkanafnið

## Sérstök áhætta

- Ekki má afhjúpa hvort netfang eigi auth-notanda nema eigandinn sé þegar með
  sameiginlega virkni eða accepted claim við þann notanda.
- Ekki má eyða duplicate relationship row í production án skýrrar migration og
  rollback-hugsunar.
- Ekki má missa private fields þegar row eru sameinuð.
- Gæta þarf að unique indexes:
  - `relationships_owner_counterpart_user_idx`
  - `relationships_owner_email_canonical_idx`
- Ef canonical backfill myndi valda unique conflict þarf migration að velja
  primary row fyrst og flytja börn/tags/sources áður en row er eytt eða uppfærð.

## Skrár sem líklega þarf að skoða eða breyta

- `lib/relationships/actions.ts`
- `lib/__tests__/tengsl-actions.test.ts`
- `lib/__tests__/tengsl-pages.test.tsx`
- `app/stillingar/tengsl/page.tsx`
- `app/stillingar/tengsl/[id]/page.tsx`
- `messages/is.json`
- `messages/en.json`
- mögulega ný `sql/57_*.sql` ef cleanup/backfill verður nauðsynleg

## Handoff sem Claude Code á að skila til baka

Claude Code á að skila einni handoff-skrá til Stebba/Codex sem inniheldur:

- hvaða leið var valin: app-only, SQL cleanup, eða bæði
- hvaða skrár voru skoðaðar
- hvaða skrár voru breyttar
- hvaða tests voru bætt við eða uppfærð
- hvaða skipanir voru keyrðar og niðurstöður
- hvort SQL var aðeins skrifað eða líka keyrt
- áhrif á auth, RLS, grants, functions, production gögn og notendagögn
- hvað Stebbi á að prófa á localhost

## Localhost checks for Stebbi

Prófa á localhost með `TENGSL_ENABLED=true` og Stebba með per-user aðgang að
`tengsl`.

1. Opna `/stillingar/tengsl`.
   - Gagna-state: til eru tvær eldri tengslaleiðir fyrir sama Gmail-aðila, ein
     dotted email row og ein staðfest user/profile row.
   - Vænt niðurstaða: aðeins ein færsla birtist fyrir sama aðila.

2. Opna sameinaða tengslafærslu.
   - Vænt niðurstaða: ef Stebbi hefur sett einkanafn birtist það sem aðalheiti.
   - Vænt niðurstaða: `Nafn í Teskeið: ...` birtist fyrir staðfestan
     Teskeið-notanda.
   - Vænt niðurstaða: `Mitt heiti á þessum aðila` heldur áfram að vera editable.

3. Breyta flokki, einkanafni og skýringu.
   - Vænt niðurstaða: breyting vistast, duplicate row birtist ekki aftur eftir
     refresh.

4. Skoða `Lánað og skilað` virkni á tengslasíðunni.
   - Vænt niðurstaða: öll sameiginleg lán við sama aðila sjást, líka lán sem
     komu inn gegnum dotted Gmail eldri gögn.
   - Vænt niðurstaða: `Opna lán` opnar rétta lánasíðu.

5. Prófa óstaðfest email-only samband.
   - Vænt niðurstaða: það sýnir ekki `Nafn í Teskeið`, nema boðið hafi verið
     claim-að eða sameiginleg virkni staðfesti auth-notandann.

6. Prófa privacy/regression með öðrum innskráðum notanda.
   - Vænt niðurstaða: annar notandi sér ekki tengsl Stebba, private display name,
     note eða sameiginlega virkni.

Ekki prófa production cleanup eða eyðingu duplicate rows handvirkt nema Claude
Code hafi skilað sérstakri SQL migration og Stebbi hafi samþykkt að keyra hana.
