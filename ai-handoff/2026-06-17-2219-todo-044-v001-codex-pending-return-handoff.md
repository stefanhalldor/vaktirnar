# TODO #44 — Merkja hlut skilaðan áður en mótaðili þekkir málið

**Agent:** Codex  
**Fyrir:** Claude Code og Stebbi  
**Dagsetning:** 2026-06-17  
**Staða:** Framkvæmdarhandoff, bíður Claude Code útfærslu  
**Tengd TODO:** #44 Merkja hlut skilaðan áður en mótaðili þekkir málið  
**Tengt samhengi:** #27 Mýkra lánaboðsflæði; #43 Gmail-punktar og útrunnin soft-ack lánaboð

## Beiðni Stebba

Stebbi vill geta merkt hlut sem skilaðan þó mótaðili sé ekki búinn að velja
`Þekki málið`. Skjámyndin sýnir creator-kort fyrir pending boð:

- Hlutur: `Golfhermir`
- Staða: `Ég lánaði · Bíður svars`
- Aðgerðir núna: `Eyða`, `Boð sent`, `Afturkalla boð`
- Vantar: `Merkja skilað`

## Codex ráðlegging

Taka þetta sem litla, afmarkaða Phase A:

- Leyfa þeim sem er nú þegar skráður aðili á láninu, þ.e. creator/direct
  participant, að merkja hlut skilaðan þó mótaðili sé ekki kominn inn á lánið.
- Leyfa sama aðila að `Afturkalla skil` ef hluturinn var merktur skilaður í þessu
  pending-ástandi.
- Ekki reyna í þessum áfanga að leyfa pending recipient, sem er bara derived
  invitation-row og ekki enn í `loan_items.lender_user_id` eða
  `loan_items.borrower_user_id`, að merkja skilað. Það er stærri heimildarbreyting
  sem þarf canonical email matching og tengist #43.

Á mannamáli: Stebbi á að geta merkt `Golfhermir` skilaðan úr creator-kortinu
áður en Ariel velur `Þekki málið`. Ariel má ekki sjálfkrafa fá nýja write-heimild
fyrir sama loan fyrr en #43 og pending-recipient auth er útfært örugglega.

## Núverandi hindranir

### UI

`lib/loans/types.ts`:

- `canShowReturnControls()` skilar aðeins `true` þegar
  `invitation_status === 'accepted'`.
- `getLoanCardControls()` setur `bothPartiesJoined` út frá þeirri helper-aðferð.

`components/loans/LoanCard.tsx`:

- Return/undo takkinn birtist bara þegar `bothPartiesJoined` er `true`.
- Fyrir pending creator-kort er `bothPartiesJoined=false`, þannig að `Merkja
  skilað` birtist ekki.

### Server-side RPC

`sql/32_loan_functions.sql` inniheldur núverandi grunn fyrir:

- `public.mark_returned(uuid, uuid)`
- `public.undo_return(uuid, uuid)`

Bæði föllin stoppa ef annað hvort `lender_user_id` eða `borrower_user_id` er
`NULL`:

```sql
IF v_loan.lender_user_id IS NULL OR v_loan.borrower_user_id IS NULL THEN
  RETURN 'invitation_not_accepted';
END IF;
```

Þess vegna er ekki nóg að sýna takka í UI. Ef Claude Code breytir bara UI myndi
server-action enn skila `invitation_not_accepted`.

## Umfang sem Claude Code á að útfæra

### 1. SQL migration

Búa til nýja migration:

- `sql/51_allow_pending_creator_return.sql`

Migration skal:

- vera í transaction
- vera idempotent þar sem við á
- endurskilgreina `public.mark_returned(uuid, uuid)`
- endurskilgreina `public.undo_return(uuid, uuid)`
- halda `SECURITY DEFINER`/search path mynstri óbreyttu ef það er í núverandi
  föllum
- halda grants service-role-only
- ekki breyta töflum, dálkum, RLS, policies eða grants að öðru leyti

**Mikilvægt:** Claude Code á að skrifa migration en ekki keyra hana nema Stebbi
biðji sérstaklega um það.

#### Ráðlögð server-regla

Fyrir `mark_returned`:

- Finna `loan_items` row með `FOR UPDATE`.
- Ef ekki finnst: `not_found`.
- Actor verður að vera núverandi direct participant:
  - `v_loan.lender_user_id = p_actor_id`
  - eða `v_loan.borrower_user_id = p_actor_id`
- Ef actor er hvorugt: `not_found`.
- Ekki krefjast þess að báðir aðilar séu komnir inn.
- Ef `returned_at IS NOT NULL`: `already_returned`.
- Annars setja:
  - `returned_at = now()`
  - `returned_by = p_actor_id`
  - `updated_at = now()`
- Skila `ok`.

Fyrir `undo_return`:

- Sama authorization: actor verður að vera current direct participant.
- Ekki krefjast þess að báðir aðilar séu komnir inn.
- Ef `returned_at IS NULL`: `not_returned`.
- Annars hreinsa:
  - `returned_at = NULL`
  - `returned_by = NULL`
  - `updated_at = now()`
- Skila `ok`.

Þessi regla nær yfir creator pending-boð, því creator er þegar annað hvort
`lender_user_id` eða `borrower_user_id`. Hún veitir ekki óviðkomandi notanda
aðgang með því að giska á `loan_id`.

### 2. UI/control visibility

Uppfæra `lib/loans/types.ts` þannig að return/undo controls séu ekki lengur
bundin eingöngu við `bothPartiesJoined`.

Codex mælir með að bæta við nýjum boolean í `LoanCardControls`, til dæmis:

- `canToggleReturned`

Ekki endurnýta `bothPartiesJoined` til að þýða “má merkja skilað”; nafnið
verður annars villandi.

Ráðlögð regla fyrir Phase A:

- `canToggleReturned = invitation_status === 'accepted'`
- eða `canToggleReturned = is_creator && invitation_status === 'pending' && !requires_acknowledgement`

Þetta sýnir `Merkja skilað` á creator-korti eins og skjámynd Stebba sýnir, en
ekki á pending recipient derived-row.

Í `components/loans/LoanCard.tsx`:

- Nota `canToggleReturned` til að sýna `Merkja skilað` / `Afturkalla`.
- Halda `Eyða`, `Boð sent` og `Afturkalla boð` hegðun óbreyttri nema layout þurfi
  smá aðlögun.
- Þegar pending hlutur er merktur skilaður birtist hann líklega undir `Skilað`
  filter vegna `returned_at`. Það er eðlilegt.

### 3. Server actions og events

`lib/loans/actions.ts` virðist þegar þola að counterpart sé `null`:

- `markReturned()` sækir event context.
- Ef mótaðili er ekki kominn inn er `counterpartUserId` `null`.
- Þá skráist bara actor-event með `initiallyRead: true`.

Claude Code á samt að staðfesta þetta með prófum. Ekki setja recipient email í
event payload eða logs.

### 4. Prófanir

Uppfæra eða bæta við focused prófum.

Líklegar skrár:

- `lib/__tests__/loans.test.ts`
- `lib/__tests__/loan-card.test.tsx`
- `lib/__tests__/actions.test.ts`
- `lib/__tests__/sql-migration.test.ts` eða sambærileg SQL-regression test skrá

Próf sem þarf að ná:

- Pending creator control-state sýnir `canToggleReturned=true`.
- Pending recipient derived-row heldur áfram að sýna `canToggleReturned=false`
  í Phase A.
- Accepted loan heldur áfram að sýna return/undo.
- Expired/declined/cancelled invitation sýnir ekki return/undo nema actor er
  þegar direct participant og product-reglan segir annað. Ef óvissa er, halda
  þessum stöðum óbreyttum.
- `LoanCard` pending creator-kort sýnir `Merkja skilað` ásamt `Eyða`,
  `Boð sent` og `Afturkalla boð`.
- SQL migration inniheldur ekki lengur both-party `NULL` guard í
  `mark_returned` og `undo_return`.
- SQL migration heldur actor authorization á direct participant.
- SQL migration grantar aðeins `service_role`, ekki `anon` eða `authenticated`.
- `markReturned()` skráir ekki counterpart event þegar mótaðili vantar.
- `undoReturn()` skráir ekki counterpart event þegar mótaðili vantar, ef sú hegðun
  er ekki þegar prófuð.

## Próf og skipanir sem Claude Code á að keyra

Lágmark:

```bash
npm run test:run -- lib/__tests__/loans.test.ts lib/__tests__/loan-card.test.tsx lib/__tests__/actions.test.ts lib/__tests__/sql-migration.test.ts
npm run type-check
```

Ef SQL-prófin eru í annarri skrá skal keyra rétta skrá. Ef Claude Code snertir
`LoanList` eða filtera skal líka keyra:

```bash
npm run test:run -- lib/__tests__/loan-list.test.tsx
```

## Áhætta og öryggi

**Heildaráhætta:** Miðlungs, vegna SQL/RPC breytingar á write-aðgerð.

Helstu áhættur:

- Að opna `mark_returned` of vítt og leyfa óviðkomandi actor með `loan_id` að
  merkja hlut skilaðan.
- Að pending recipient fái write-aðgang án öruggrar canonical email matching.
- Að event payload leki recipient email eða óþörfum gögnum.
- Að `returned_at` á pending boði geri það erfitt fyrir mótaðila að velja
  `Þekki málið` síðar.
- Að `undo_return` gleymist og creator geti ekki leiðrétt ef hann merkir skilað
  óvart.

Öryggisreglur:

- Ekki veikja RLS.
- Ekki veita `anon` eða venjulegum `authenticated` beinan aðgang að
  `loan_items` eða `loan_invitations`.
- Ekki breyta production gögnum í migration.
- Ekki keyra migration án sérstaks samþykkis frá Stebba.
- Ekki tengja þetta við #43 Gmail-canonicalization nema sem sér áfanga.

## Localhost checks for Stebbi

Stebbi keyrir dev server sjálfur.

### Setup

1. Tryggja að `LOANS_ENABLED=true`.
2. Nota innskráðan notanda sem býr til lán.
3. Búa til hlut með recipient email þannig að boð sé `pending`.
4. Mótaðili á ekki að velja `Þekki málið` áður en prófið er gert.

### Test 1 — Creator pending, ekki skilað

Slóð:

- `http://localhost:3000/auth-mvp/lanad-og-skilad`

Skref:

1. Opna lánalistann sem creator.
2. Finna pending kort svipað skjámynd Stebba.

Vænt:

- Kortið sýnir `Bíður svars`.
- `Merkja skilað` birtist.
- `Eyða`, `Boð sent` og `Afturkalla boð` birtast áfram þar sem við á.
- `Bíður samþykkis` birtist ekki.

### Test 2 — Creator merkir pending hlut skilaðan

Skref:

1. Smella á `Merkja skilað`.
2. Refresh-a listann ef þarf.
3. Skoða `Skilað` filter.

Vænt:

- Hluturinn verður merktur skilaður.
- Hann hverfur úr `Enn í láni` ef listinn filterar eftir `returned_at`.
- Hann birtist undir `Skilað`.
- `Afturkalla` birtist á skiluðu korti.
- Boðsstaðan er enn skiljanleg, t.d. `Bíður svars` eða sambærileg pending-staða.

### Test 3 — Afturkalla skil á pending hlut

Skref:

1. Smella á `Afturkalla`.
2. Fara aftur í `Enn í láni`.

Vænt:

- Hluturinn verður aftur óskilaður.
- Pending-boðið helst til staðar.
- Mótaðili hefur enn ekki sjálfkrafa valið `Þekki málið`.

### Test 4 — Mótaðili velur `Þekki málið` eftir að hlutur er skilaður

Skref:

1. Sem creator: merkja pending hlut skilaðan.
2. Sem mótaðili: opna `Lánað og skilað`.
3. Velja `Þekki málið`.

Vænt:

- Claim virkar.
- `returned_at` helst rétt.
- Hluturinn verður ekki óvart aftur `Enn í láni`.
- Engin villuskilaboð um að boðið sé ekki lengur opið nema #43/expiry vandamálið
  sé enn óleyst í production.

### Test 5 — Óviðkomandi notandi

Þetta er helst automated test, ekki handvirkt production-próf.

Vænt:

- Óviðkomandi authenticated notandi getur ekki merkt hlut skilaðan með því að
  giska á `loan_id`.

## Hvað á ekki að prófa kæruleysislega

- Ekki keyra SQL migration á production án sérstakrar leyfisbeiðni.
- Ekki breyta production gögnum handvirkt.
- Ekki nota raunveruleg netföng í test output, logs eða handoff.
- Ekki prófa með viðkvæmum eða óafturkræfum gögnum.

## Copy/paste til Claude Code

```md
Claude Code: Vinsamlegast útfærðu TODO #44 sem afmarkaða Phase A.

Markmið: Creator/direct participant á pending soft-ack láni á að geta merkt hlut skilaðan áður en mótaðili velur `Þekki málið`, og geta afturkallað skil aftur. Ekki opna write-heimild fyrir pending recipient í þessum áfanga.

Vinsamlegast:
1. Búðu til `sql/51_allow_pending_creator_return.sql`.
2. Endurskilgreindu `public.mark_returned(uuid, uuid)` og `public.undo_return(uuid, uuid)` þannig að þau krefjist þess að actor sé direct participant, en krefjist ekki lengur að bæði `lender_user_id` og `borrower_user_id` séu sett.
3. Haltu service-role-only grants og breyttu ekki RLS/policies/schema.
4. Uppfærðu `lib/loans/types.ts` og `components/loans/LoanCard.tsx` þannig að pending creator-kort sýni `Merkja skilað` / `Afturkalla`.
5. Ekki leyfa pending recipient derived-row að merkja skilað í þessum áfanga.
6. Bættu við regression-prófum fyrir UI controls, SQL migration og event-hegðun þegar mótaðili vantar.
7. Keyrðu viðeigandi próf og `npm run type-check`.
8. Skilaðu post-implementation handoff með breyttum skrám, skipunum, exit codes, áhættu og Localhost checks for Stebbi.

Ekki keyra SQL migration nema Stebbi biðji sérstaklega um það.
```

