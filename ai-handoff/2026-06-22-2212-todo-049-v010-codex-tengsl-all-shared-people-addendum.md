# Addendum fyrir Claude Code: `/stillingar/tengsl` sýni alla sem notandi á sameiginlega virkni með

**TODO:** #49 Tengsl þvert á Teskeiðar  
**Tengist:** `2026-06-22-2157-todo-049-v009-codex-tengsl-activity-picker-handoff.md`  
**Dagsetning:** 2026-06-22 22:12  
**Frá:** Codex  
**Til:** Claude Code  
**Staða:** Product-ákvörðun frá Stebba eftir v009 handoff.

## Ný ákvörðun frá Stebba

Stebbi vill að `/stillingar/tengsl` sýni alla tengda aðila sem notandi hefur átt eitthvað sameiginlegt með í einhverri Teskeið. Þetta á ekki að takmarkast við að tengiliður stofnist aðeins hjá þeim sem stofnar til `Lánað og skilað`.

Orðalag Stebba:

> Best væri bara að allir tengdir aðilar séu sýnilegir í stillingar/tengsl... þ.e. allir sem maður hefur átt eitthvað sameiginlegt með í einhverri teskeið... ekki bara að tengiliðurinn stofnist hjá þeim sem er að stofna til "Lánað og skilað"... Ég sé ekki downside'ið við það amk

## Codex-rýni á ákvörðunina

Codex er sammála product-stefnunni, með einni mikilvægri tæknilegri skilyrðingu:

- Það sem birtist í `/stillingar/tengsl` má vera afleitt úr virkni sem notandinn má nú þegar sjá.
- Ekki á að birta fólk sem notandinn tengist aðeins í gegnum leynda lookup-leið, t.d. bara vegna þess að netfang er til í `auth.users`.
- Tengslalistinn má því vera samruni af:
  - persisted `relationships` sem notandi hefur vistað/taggað/skrifað note á
  - inferred tengslum úr `get_my_loans` eða öruggum server-side activity lookup, þar sem innskráður notandi er raunverulegur þátttakandi eða pending recipient samkvæmt soft-ack reglum

Þetta leysir vandamálið betur en að reyna að upserta báðar áttir í hvert skipti. Ef listinn er dynamic/inferred, þá fær notandi B tengslin sín þegar feature flag opnast fyrir B, jafnvel þótt relationship row hafi aldrei verið búin til fyrir B meðan Tengsl voru lokuð hjá honum.

## Mælt módel fyrir v1

Claude Code ætti að forðast að gera `relationships` töfluna að einu sannleikslagi fyrir alla tengda aðila.

Mælt er með:

1. `relationships` geymir per-owner customization:
   - tag/flokk
   - private display name
   - private note/skýringu
   - mögulega provenance/source

2. `/stillingar/tengsl` sýnir samræmda view model:
   - persisted relationships úr `relationships`
   - inferred relationships úr sýnilegri virkni notandans, t.d. lánum og pending boðum
   - sameinað eftir canonical identity: helst `counterpart_user_id`, annars `email_canonical`

3. Ef notandi breytir taggi/note á inferred tengilið:
   - þá má stofna `relationships` row fyrir eigandann
   - það row verður customization layer, ekki eina ástæðan fyrir að tengiliður birtist

4. Þegar nýtt lán er stofnað:
   - pickerinn notar sama sameinaða listann
   - valkostir geta komið úr inferred tengslum líka, ekki bara persisted `relationships`

## Downside / áhættur sem þarf að passa

Codex sér ekki product-downside ef þetta er takmarkað við virkni sem notandinn má þegar sjá. Tæknilegu áhætturnar eru hins vegar:

- Listinn gæti sýnt gamla/óvart aðila sem notandi vill ekki hafa sýnilega. Lausn: síðar bæta við "fela" eða archive, en ekki nauðsynlegt í þessum áfanga.
- Ef matching byggir á display name getur það tengt ranga aðila. Ekki gera það.
- Ef matching byggir á email þarf að passa Gmail/punktamál #43 og email canonical reglu.
- Ef self-name birtist fyrir pending-only email getur það orðið account-enumeration. Sýna aðeins self-name þegar það er komið öruggt shared/direct context.
- Ef dynamic lookup er dýr þarf að halda query afmarkaðri. Byrja með lán sem v1, ekki allar framtíðar Teskeiðar í einni of almennri lausn.

## Breyting á v009 plani

Í v009 var lagt til að detail-síða sækti activity dynamískt, en listinn sjálfur var ekki nógu skýrt skilgreindur sem dynamic/inferred.

Uppfærsla:

- `getRelationships(ownerUserId)` ætti annaðhvort að:
  - skila merged persisted + inferred list, eða
  - fá nýtt nafn, t.d. `getRelationshipDirectory(ownerUserId)`, svo það sé skýrt að þetta er view yfir tengda aðila, ekki bara rows úr `relationships`.
- Ekki láta `/stillingar/tengsl` sýna bara rows sem hafa verið upsertaðar.
- Ekki reyna að backfilla allt í SQL sem fyrsta lausn ef dynamic view leysir þetta öruggar.
- Ef inferred tengiliður vantar `relationship.id`, þarf UI að geta opnað detail route. Tvær öruggar leiðir:
  - stofna persisted relationship row lazy þegar listinn opnast eða þegar notandi smellir á inferred tengilið
  - nota route með stable encoded identity, t.d. `/stillingar/tengsl/email/<encoded>` eða `/stillingar/tengsl/user/<id>`

Codex mælir með einfaldari v1: lazy-stofna relationship row fyrir owner þegar notandi opnar eða breytir inferred tengilið, en aðeins úr activity sem owner má sjá. Þá helst núverandi `/stillingar/tengsl/[id]` route og private note/tag action einföld.

## Localhost checks for Stebbi

Prófa að tengslalistinn sýni báðar áttir og gamla virkni:

1. Skrá Stebba inn sem notanda A með Tengsl-aðgang.
2. Hafa nokkur lán milli A og B:
   - A lánaði B hlut.
   - A fékk lánað frá B.
   - að minnsta kosti eitt lán sem var til áður en `relationships` row/source varð til.
3. Opna `/stillingar/tengsl`.
4. Vænt niðurstaða: B sést í listanum þó B hafi ekki endilega verið stofnaður sem persisted relationship row af nýjustu flæði.
5. Opna B.
6. Vænt niðurstaða: detail-síðan sýnir öll lán milli A og B sem A má sjá.
7. Skrá sig inn sem B ef hægt er og B hefur Tengsl-aðgang.
8. Vænt niðurstaða: A sést líka hjá B út frá sameiginlegri virkni, ekki bara ef B hefur sjálfur stofnað lán.

Prófa private customization:

1. Setja tagg og private note á inferred tengilið.
2. Refresh-a `/stillingar/tengsl`.
3. Vænt niðurstaða: tagg/note helst.
4. Staðfesta að þetta stofnaði ekki duplicate tengilið fyrir sama email/notanda.

Prófa feature flag:

1. Taka B úr `feature_access` ef `TENGSL_FLAG=true`.
2. B á ekki að komast inn á `/stillingar/tengsl`.
3. Bæta B aftur inn.
4. Vænt niðurstaða: B sér inferred tengsl sín afturvirkt út frá virkni, án backfill handvirkrar aðgerðar.

Ekki prófa kæruleysislega:

- Ekki keyra production backfill.
- Ekki nota raunveruleg private notes í screenshot eða test fixtures.
- Ekki bæta account lookup sem sýnir að email sé til í Teskeið nema það sé þegar sýnilegt út frá sameiginlegri virkni.

## Spurningar fyrir Claude Code í næsta handoff

1. Ætlar Claude Code að leysa listann sem merged dynamic view eða lazy-persisted rows?
2. Hvernig tryggir lausnin að allir sem notandi hefur shared activity með birtist, líka afturvirkt?
3. Hvernig er dedupe gert milli `counterpart_user_id` og `email_canonical`?
4. Hvernig er tryggt að self-name valdi ekki account-enumeration?
5. Hvernig virkar þetta þegar `TENGSL_FLAG=true` og notandi fær aðgang síðar?
