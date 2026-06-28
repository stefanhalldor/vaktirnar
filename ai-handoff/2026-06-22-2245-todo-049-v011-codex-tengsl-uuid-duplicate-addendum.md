# Addendum fyrir Claude Code: UUID-færslur í Tengslum eru duplicate identity vandamál

**TODO:** #49 Tengsl þvert á Teskeiðar  
**Tengist:**  
- `2026-06-22-2157-todo-049-v009-codex-tengsl-activity-picker-handoff.md`
- `2026-06-22-2212-todo-049-v010-codex-tengsl-all-shared-people-addendum.md`
- `2026-06-22-2242-todo-043-049-v005-codex-gmail-canonical-tengsl-handoff.md`

**Dagsetning:** 2026-06-22 22:45  
**Frá:** Codex  
**Til:** Claude Code  
**Staða:** Ný skjámynd frá Stebba sýnir að listinn birtir UUID-færslur sem reynast vera sami aðili og þegar flokkaður vinur.

## Samhengi frá Stebba

Stebbi sér nokkrar færslur í `/stillingar/tengsl` þar sem titillinn er raw UUID. Þegar Stebbi smellir á eina slíka UUID-færslu kemur detail-síðan í ljós með nafni í Teskeið, og þetta reynist vera sami aðili og önnur færsla neðar í listanum sem Stebbi hafði þegar flokkað sem `Vinir`.

Ekki nota raunnetföng eða raun-UUID úr skjámynd í testum eða handoffi. Nota synthetic dæmi:

- persisted relationship: `Sami Aðili` með tagg `Vinir`
- inferred/direct relationship row: raw UUID í lista en detail sýnir `Nafn í Teskeið: Sami Aðili`

## Líkleg orsök út frá read-only kóðaskoðun Codex

Codex skoðaði núverandi kóða eftir fyrri handoff:

- `app/stillingar/tengsl/page.tsx` notar `getRelationshipDirectory(user.id, user.email!)`
- `getRelationshipDirectory()` í `lib/relationships/actions.ts`:
  - sækir persisted rows
  - infer-ar `counterpart_user_id` úr `loan_items`
  - lazy-upsertar missing user IDs með `{ owner_id, counterpart_user_id }`
  - skilar síðan `private_display_name`, `email_canonical`, `created_at`, tags
- listinn birtir:
  - `item.private_display_name ?? item.email_canonical ?? item.id`
- detail-síðan `app/stillingar/tengsl/[id]/page.tsx` sækir hins vegar `counterpart_display_name` úr `profiles` þegar `counterpart_user_id` er til og sýnir því raunverulegt Teskeið-nafn.

Þetta skýrir UUID-færslurnar:

- lazy-upsert row með aðeins `counterpart_user_id` hefur hvorki `private_display_name` né `email_canonical`
- listinn hefur ekki `counterpart_display_name`
- fallback verður `relationship.id`

Þetta skýrir líka duplicate vandamálið:

- þegar til er eldri/persisted row með private name/tagg, en inferred direct activity finnur sama `counterpart_user_id`, getur kóðinn stofnað eða sýnt aðra row fyrir sama aðila ef identity merge er ekki nógu sterk
- tagginn `Vinir` situr þá á annarri row en dynamic activity/detail kann að opnast á UUID-row

## Product-regla

`/stillingar/tengsl` má aldrei sýna raw UUID sem notandanafn/tengiliðanafn nema sem algjört internal fallback í error-state sem ætti ekki að sjást í venjulegri notkun.

Ef detail-síðan getur sýnt `Nafn í Teskeið`, á listinn líka að geta sýnt sama nafn eða betra private display name.

Ef tvær relationship rows reynast vera sami aðili:

- listinn á að sýna eina færslu
- flokk/tags eiga að varðveitast
- private name/note eiga að varðveitast
- detail-síðan á að opna primary row sem geymir customization, ekki unclassified duplicate row

## Mælt framkvæmd

### 1. Stækka list view model

`RelationshipListItem` þarf líklega að fá:

- `counterpart_user_id: string | null`
- `counterpart_display_name: string | null`
- mögulega `identity_key: string`

`getRelationshipDirectory()` ætti að sækja `profiles.display_name` fyrir persisted/inferred rows með `counterpart_user_id`, með sömu privacy-reglu og detail-síðan:

- bara þegar `counterpart_user_id` er komið úr shared activity/direct relationship
- ekki lookup-a random email-only relationship til að finna hvort notandi sé til

List display order:

1. `private_display_name`
2. `counterpart_display_name`
3. `email_canonical`
4. mjög síðasta fallback: stuttur "Óþekktur tengiliður" texti, ekki raw UUID

Notendatexti á að vera í `messages/is.json` og `messages/en.json`.

### 2. Ekki lazy-upserta duplicate user row ef til er row sem má sameina

Áður en `missingUserIds` eru lazy-upsertaðir þarf að kanna hvort persisted row sé í raun sama manneskja gegnum:

- `counterpart_user_id`
- canonical email ef vitað er um email
- loan activity sem tengir persisted email row við sama direct user

Ef til er persisted row með tagg/private note fyrir sama aðila:

- nota þá row sem primary
- ekki stofna nýja unclassified row
- ef þarf, uppfæra primary row með `counterpart_user_id` ef það er öruggt og var áður `NULL`

Varúð: að setja `counterpart_user_id` á email-only row er schema/data update. Það er líklega í lagi ef row er eiganda-scoped og identity er sannað úr shared activity, en Claude Code þarf að skrá nákvæmlega hvenær það er gert og prófa að það leki ekki account existence fyrir handsláið email-only samband án shared activity.

Öruggari v1 ef Claude Code vill forðast update:

- merged directory view velur persisted email/private row sem primary fyrir display/link
- lætur physical duplicate row vera til í DB tímabundið
- detail activity notar merged identity til að sýna activity úr báðum

### 3. Merge-reglur fyrir tags og notes

Ef tvær rows sameinast í view:

- ef ein row hefur private display name, velja hana sem primary
- ef ein row hefur note, velja hana sem primary
- ef ein row hefur non-`unclassified` tagg, velja hana sem primary
- ef báðar hafa mismunandi non-empty customization, ekki henda neinu sjálfvirkt; skrá í handoff sem cleanup edge case og sýna primary með varfærinni reglu

Í screenshot-dæminu á row sem er þegar `Vinir` að vinna yfir unclassified UUID-row.

### 4. Detail route má ekki lenda á duplicate row

Ef notandi smellir á inferred/duplicate row:

- helst á listinn ekki að sýna hana
- ef hún birtist samt vegna eldri link eða cache, má redirecta eða sýna primary merged row

Ekki nauðsynlegt í fyrsta fix ef listinn er lagaður, en Claude Code þarf að hugsa um það svo gömul `/stillingar/tengsl/[id]` link opni ekki ruglingslega duplicate customization.

## Prófanir sem þarf

Unit/component tests:

- `getRelationshipDirectory()` skilar ekki raw UUID sem display þegar `counterpart_user_id` er til og profile display name finnst.
- Directory merge-ar persisted customized row og inferred direct user row fyrir sama aðila í eina færslu.
- Non-`unclassified` tagg eins og `friends` vinnur yfir unclassified duplicate.
- Private display name/note tapast ekki þegar duplicate inferred row er til.
- Listinn notar display order: private display name -> counterpart display name -> email -> fallback text.
- Detail activity sýnir öll lán fyrir merged aðila.
- Annar owner sér ekki tags/private notes hins owner.

Regression tests:

- Email-only relationship án confirmed shared user ID veldur ekki profile lookup/account enumeration.
- Non-Gmail dotted/punktalaus netföng eru ekki sameinuð.
- Gmail dotted/punktalaus netföng sameinast samkvæmt #43 handoff.

## Localhost checks for Stebbi

### UUID-færsla á ekki að birtast

1. Opna `/stillingar/tengsl`.
2. Finna áður sýnilegar UUID-færslur.
3. Vænt niðurstaða: raw UUID-færslur eru horfnar eða sýna manneskjulegt nafn.
4. Ef UUID-row var sami aðili og þegar flokkaður vinur, á bara ein færsla að sjást.
5. Sú færsla á að halda tagginu `Vinir`, ekki detta aftur í `Óflokkaður`.

### Detail-síða primary tengiliðs

1. Smella á sameinaða færslu.
2. Vænt niðurstaða: detail-síðan sýnir rétta nafnið, `Nafn í Teskeið` ef við á, og private notes/form.
3. Vænt niðurstaða: `Lánað og skilað` sýnir öll lán sem tilheyra þessum aðila, líka þau sem áður birtust undir UUID-row.

### Private customization

1. Setja eða breyta flokki í `Vinir`.
2. Setja private note.
3. Fara til baka á listann og opna aftur.
4. Vænt niðurstaða: flokkur og note halda sér, og duplicate unclassified færsla birtist ekki aftur.

### Feature flag og privacy

1. Staðfesta að `/stillingar/tengsl` er áfram bakvið `TENGSL_ENABLED` og `TENGSL_FLAG` ef það er virkt.
2. Skrá annan notanda inn ef hægt er.
3. Vænt niðurstaða: hinn notandinn sér ekki private note/tagg Stebba og sér ekki relationships sem hann hefur enga shared activity með.

Ekki prófa kæruleysislega:

- Ekki keyra production cleanup á duplicate rows án preflight.
- Ekki deila screenshotum með raunnetföngum/private notes.
- Ekki nota raun-UUID eða raunnetföng úr production í committed tests.

## Supabase og gagnavarúð

Þetta ætti helst að byrja sem merged view / TypeScript fix án production data cleanup.

Ef Claude Code vill hreinsa duplicate rows eða færa tags/notes milli rows:

- fyrst þarf read-only preflight sem telur duplicates per owner
- greina rows þar sem bæði duplicates hafa non-empty notes/private names/tags
- skrá rollback/recovery
- fá skýrt samþykki Stebba áður en data update er keyrt í Supabase

## Spurningar fyrir Claude Code í handoff til baka

1. Af hverju birtust raw UUID-færslurnar nákvæmlega?
2. Var þetta lagað með merged view, lazy update á primary row, eða data cleanup?
3. Hvernig er primary row valin þegar duplicate rows eru til?
4. Hvernig er tryggt að taggurinn `Vinir` tapist ekki?
5. Hvernig er tryggt að profile display name lookup valdi ekki account-enumeration?
6. Hvaða próf voru keyrð og hver voru exit codes?
