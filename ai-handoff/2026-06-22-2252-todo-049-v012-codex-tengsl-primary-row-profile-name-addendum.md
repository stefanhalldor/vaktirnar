# Addendum fyrir Claude Code: Primary tengiliður þarf að tengjast `counterpart_user_id` svo Nafn í Teskeið birtist

**TODO:** #49 Tengsl þvert á Teskeiðar  
**Tengist:**
- `2026-06-22-2245-todo-049-v011-codex-tengsl-uuid-duplicate-addendum.md`
- `2026-06-22-2242-todo-043-049-v005-codex-gmail-canonical-tengsl-handoff.md`
- `2026-06-22-2157-todo-049-v009-codex-tengsl-activity-picker-handoff.md`

**Dagsetning:** 2026-06-22 22:52  
**Frá:** Codex  
**Til:** Claude Code  
**Staða:** Ný skjámynd frá Stebba sýnir hina hliðina á duplicate/identity vandamálinu.

## Samhengi frá Stebba

Stebbi opnaði tengilið sem hann hefur raunverulega flokkað sem vin og gefið sitt eigið heiti, t.d. "Stebbishj meil". Detail-síðan sýnir:

- private display name í fyrirsögn
- email fyrir neðan
- flokk `Vinir`
- private display name í "Mitt heiti á þessum aðila"
- lánavirkni

En hún sýnir ekki `Nafn í Teskeið: ...`. Í fyrri skjámynd frá Stebba sýndi duplicate UUID-row hins vegar `Nafn í Teskeið: ...` fyrir sama raunverulega aðila.

Þetta þýðir líklega:

- primary/customized row hefur `email_canonical` og private fields, en vantar `counterpart_user_id`
- duplicate/inferred row hefur `counterpart_user_id`, en vantar private fields/tags
- detail-síðan sækir `counterpart_display_name` aðeins þegar row hefur `counterpart_user_id`

## Product-regla

Ef Stebbi hefur eitt primary tengsl við private heiti/tagg/note og kerfið veit úr shared activity að þessi aðili er skráður Teskeið-notandi, þá á primary row/detail-view að geta sýnt:

- private display name sem Stebbi gaf aðilanum
- netfangið ef það er til og viðeigandi
- `Nafn í Teskeið: <display_name>` frá mótaðilanum
- sama activity og duplicate/inferred row

Það á ekki að vera þannig að aðeins óflokkaður duplicate UUID-row sýni `Nafn í Teskeið`.

## Tæknileg túlkun

Þetta er ekki bara display bug. Þetta er primary identity merge bug.

Við þurfum að sameina eða tengja:

- email-only/customized relationship row
- user-id/direct inferred relationship row

sem sama identity þegar það er sannað með sýnilegri shared activity.

## Mælt v1 lausn

### 1. Primary row selection

Þegar `getRelationshipDirectory()` eða tengd merge-lógík finnur bæði:

- row A: `email_canonical`, private display name/tagg/note
- row B: `counterpart_user_id`, profile display name, unclassified/no customization

og activity lookup sannar að þetta er sami aðili, þá á row A að verða primary.

Primary row priority:

1. row með private display name
2. row með note
3. row með non-`unclassified` tagg
4. row með email_canonical
5. row með nýlegustu/sterkustu activity

Í dæmi Stebba á customized `Vinir` row að vinna yfir UUID/inferred row.

### 2. Sýna counterpart display name á primary row

Detail view má ekki vera bundið við að primary row hafi physical `counterpart_user_id` ef merge-lagið veit counterpart user ID.

Tvær leiðir:

#### Valkostur A: Merged view model án DB update

- `getRelationship()` eða nýr helper skilar `counterpart_display_name` út frá merged identity.
- Hann getur notað dynamic activity/merge lookup til að finna counterpart user ID þó primary row sjálft sé email-only.
- Engin data cleanup í DB í fyrsta áfanga.

Kostur: minna data-risk.

Galli: meiri runtime-lógík og þarf að passa að tag/action updates fari alltaf á primary row.

#### Valkostur B: Safe owner-scoped enrichment

- Þegar shared activity sannar að email row og user row eru sami aðili, uppfæra primary row:
  - setja `counterpart_user_id`
  - halda `email_canonical`, private display name, note og tags
- Ekki eyða duplicate row í fyrsta skrefi nema sér cleanup sé samþykkt.
- Directory getur síðan falið duplicate row.

Kostur: einfaldari detail/list display til framtíðar.

Galli: schema/data update á production rows og þarf meiri varúð.

Codex mælir með A eða mjög varfærnu B. Ef B er valið þarf skýra reglu: aðeins owner-scoped row, aðeins þegar identity er sönnuð úr lánum/pending boðum sem owner má sjá, aldrei frá blindri email lookup.

### 3. Ekki sýna account existence frá handsláðu email-only contact

Ef notandi hefur bara handskráð email sem tengilið og engin shared activity sannar að þetta sé skráður notandi, þá má ekki lookup-a profile og sýna `Nafn í Teskeið`.

`Nafn í Teskeið` má birtast þegar:

- relationship hefur `counterpart_user_id`, eða
- merged/inferred identity hefur counterpart user ID frá shared activity sem owner má sjá

Ekki þegar:

- það er bara email-only row án shared activity
- eina "sönnunin" er að auth admin lookup fann user með sama email

## Prófanir sem þarf

Unit/component tests:

- Customized email row + duplicate user row mergeast í eina listafærslu.
- Primary row heldur `friends` taggi.
- Primary row heldur private display name.
- Detail fyrir primary row sýnir bæði private display name og `Nafn í Teskeið`.
- Detail fyrir primary row sýnir activity sem áður var undir duplicate user row.
- Duplicate user row birtist ekki sem sér unclassified entry.
- Email-only row án shared activity sýnir ekki `Nafn í Teskeið` þótt email gæti tilheyrt user.

Regression:

- Tag update skrifar á primary row, ekki duplicate row.
- Note/private display name update skrifar á primary row.
- Non-Gmail dotted netföng sameinast ekki.
- Gmail dotted/punktalaus merge samkvæmt #43 heldur áfram að virka.

## Localhost checks for Stebbi

### Flokkaði tengiliðurinn á að sýna Nafn í Teskeið

1. Opna `/stillingar/tengsl`.
2. Opna tengilið sem Stebbi hefur flokkað sem `Vinir` og gefið sitt eigið heiti.
3. Vænt niðurstaða:
   - fyrirsögn sýnir `Mitt heiti` ef það er sett
   - flokkinn `Vinir`
   - netfang ef það er til
   - `Nafn í Teskeið: ...` ef þessi aðili er skráður Teskeið-notandi og shared activity sannar tenginguna
4. Sama aðili á ekki að birtast sem önnur UUID-færsla í listanum.

### Private fields eiga ekki að tapast

1. Breyta `Mitt heiti á þessum aðila`.
2. Breyta `Mín skýring`.
3. Vista.
4. Fara til baka á listann og inn aftur.
5. Vænt niðurstaða: private fields halda sér og `Nafn í Teskeið` birtist áfram ef það á við.

### Privacy check

1. Búa til eða nota email-only tengilið án shared activity.
2. Opna detail.
3. Vænt niðurstaða: ekki sýna `Nafn í Teskeið` bara vegna þess að email gæti verið skráður notandi.

Ekki prófa kæruleysislega:

- Ekki keyra production merge/cleanup án preflight.
- Ekki skrifa raunnetföng eða private notes í tests eða handoff.

## Supabase og data-varúð

Ef Claude Code velur að uppfæra primary row með `counterpart_user_id`, þarf að skrá:

- hvaða aðstæður sanna identity
- hvort update gerist lazy í appkóða eða með migration
- hvernig duplicates eru faldar eða meðhöndlaðar
- hvernig rollback væri gert ef rangt counterpart_user_id tengdist row

Ekki gera bulk cleanup í production án samþykkis Stebba.

## Spurningar fyrir Claude Code í handoff til baka

1. Af hverju sýndi customized row ekki `Nafn í Teskeið`?
2. Var valin merged view model eða owner-scoped enrichment á primary row?
3. Hvernig er tryggt að primary row sé row með tagg/private fields?
4. Hvernig er komið í veg fyrir account-enumeration?
5. Hvaða próf voru keyrð og hver voru exit codes?
