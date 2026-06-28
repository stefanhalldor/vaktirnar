# Handoff: Tengsl-detail þarf betri Lánað og skilað upplýsingar og flokkabreytingu

**Handoff:** Codex → Stebbi og Claude Code  
**Dagsetning:** 2026-06-22 07:17  
**Tengist TODO:** #49 Tengsl þvert á Teskeiðar, #50 Fjölskyldumeðlimir sem tengsl  
**Samhengi:** Stebbi prófaði `/stillingar/tengsl/[id]` á localhost og sá að undir `Lánað og skilað` birtist aðeins `Opna lán`. Stebbi vill sjá hvað hluturinn heitir, hvenær lánið var stofnað, og geta raunverulega breytt flokknum/tagginu úr detail-síðunni.

## Markmið

Gera Tengsl-detail gagnlegt í v1:

- Undir `Lánað og skilað` á hver færsla að sýna heiti hlutarins.
- Færslan á líka að sýna hvenær lánið var stofnað eða skráð.
- Linkur á færslu á áfram að opna rétt samhengi í `Lánað og skilað`.
- Notandi á að geta breytt flokki/taggi tengslsins, t.d. úr `Óflokkaður` í annan leyfðan flokk.

## Núverandi staða út frá kóðaskoðun Codex

`app/stillingar/tengsl/[id]/page.tsx`:

- Sækir relationship með `getRelationship(user.id, id)`.
- Fær aðeins `loan_source_ids`.
- Kallar `get_my_loans` til að sannreyna að notandi hafi aðgang að lánunum.
- Birtir síðan bara lista af linkum með textanum `Opna lán`.

`lib/relationships/actions.ts`:

- `RelationshipDetail` hefur `loan_source_ids: string[]`.
- `getRelationship` skilar ekki loan title, dagsetningu eða öðrum loan metadata.
- Engin action er til til að breyta `relationship_tags`.

`sql/54_relationships.sql`:

- `relationship_tags` styður nú tag values:
  - `unclassified`
  - `family`
  - `friends`
  - `recipients`
- Ef Claude Code vill bæta við nýjum flokki eins og `acquaintances` eða `known`, þarf migration sem breytir CHECK constraint. Codex mælir ekki með því í þessum litla follow-up nema Stebbi biðji sérstaklega um fleiri flokka strax.

## Tillaga að einfaldri útfærslu

### 1. Bæta view model fyrir lánasources

Í stað þess að detail-síðan vinni með `Set<string>` af loan IDs, búi Claude Code til typed view model, t.d.:

```ts
type RelationshipLoanSourceView = {
  id: string
  item_name: string
  created_at: string | null
  loaned_at: string | null
  href: string
}
```

Nota `get_my_loans` áfram sem access boundary. Það er mikilvægt að Tengsl-detail birti aðeins lán sem viðkomandi notandi má sjá. Ekki sækja beint úr `loan_items` án þess að endurtaka sömu authorization-reglu.

Röðun: byrja einfalt með nýjasta fyrst eftir `created_at` ef það er til, annars `loaned_at`. Ef `get_my_loans` skilar ekki `created_at`, þarf annaðhvort að:

- nota `loaned_at` og merkja textann sem `Lánað ...`, eða
- bæta örugglega `created_at` í viðeigandi RPC/view model með sér rýni.

Codex vill forðast nýja SQL-breytingu fyrir þetta ef `get_my_loans` skilar nægum upplýsingum nú þegar.

### 2. Bæta texta undir `Lánað og skilað`

Fyrir hverja lánsfærslu:

- Sýna `item_name` sem aðaltexta.
- Sýna dagsetningu sem secondary texta, t.d.:
  - `Stofnað 22. júní 2026` ef `created_at` er til.
  - Annars `Lánað 22. júní 2026` ef aðeins `loaned_at` er til.
- Link texti má vera `Opna í Lánað og skilað` eða gera alla færsluna clickable.

Passa mobile layout: ekkert horizontal overflow, enginn risastór texti, og smellt svæði nógu stórt.

### 3. Bæta server action til að breyta flokki/taggi

Setja í `lib/relationships/actions.ts` action sem:

- Krefst `guardTeskeidSession`.
- Krefst `guardFeatureAccess(user.email!, 'tengsl')`.
- Tekur `relationshipId` og nýtt tag.
- Leyfir aðeins tag values sem schema leyfir núna:
  - `unclassified`
  - `family`
  - `friends`
  - `recipients`
- Staðfestir að relationship row sé `owner_id = user.id`.
- Breytir ekki tengslum annarra notenda.
- Fyrir v1 má meðhöndla "flokkur" sem einn aðalflokkur:
  - eyða núverandi category taggum fyrir relationship,
  - setja nýja taggið inn.

Ef við viljum síðar multi-tag UI má byggja ofan á sömu töflu. En v1 sem singular `Flokkur` er einfaldara og passar við orðalag Stebba.

### 4. UI til að breyta flokki

Á detail-síðunni:

- Sýna núverandi flokk sem select/dropdown eða segmented control.
- Nota íslensk labels úr `messages/is.json`.
- Sýna enska þýðingu í `messages/en.json`.
- Vista með server action.
- Eftir vistun má nota `revalidatePath('/stillingar/tengsl')` og `revalidatePath('/stillingar/tengsl/[id]')` eða redirect/refresh pattern sem passar við repo.
- Birta stutt villuskilaboð ef vistun mistekst.

Mikilvægt: Ekki hardcode-a notendatexta í component ef hægt er að nota messages.

## Öryggisatriði

- Ekki veikja RLS eða bæta `authenticated` grants á relationship-töflurnar.
- Allt relationship edit á að fara server-side með service_role eftir að session og owner-scope hafa verið staðfest.
- Ekki treysta client-sent `owner_id`.
- Ekki leyfa arbitrary tag string úr formi; nota allowlist í TypeScript sem passar við SQL CHECK constraint.
- Ekki sýna lán sem `get_my_loans` skilar ekki fyrir viðkomandi notanda.
- Ekki leka einkanafni, note eða flokkum til mótaðila. Þetta er private per-owner metadata.

## Edge cases

- Relationship hefur engan loan source: sýna ekki tóma `Lánað og skilað` fyrirsögn eða sýna rólegt empty-state.
- `relationship_sources` vísar í loan sem notandi sér ekki lengur: ekki sýna link.
- Loan item hefur vantað/óvænt dagsetningargildi: sýna bara heiti og link, ekki brjóta síðuna.
- Relationship hefur fleiri en einn tagg vegna framtíðar eða migration: v1 flokkabreyting þarf að ákveða hvort hún varðveitir non-category tagga eða setur allt í einn flokk. Codex mælir með að skilgreina category tags sem sömu fjögur gildi og skipta þeim út sem mengi.
- Ef `recipients` er hugsað sem uppruna-tag frekar en flokkur, þarf ekki endilega að bjóða það í select. Þá má samt ekki senda það sem óleyfilegt ef það er þegar til.

## Prófanir fyrir Claude Code

Bæta eða uppfæra próf þar sem það passar við núverandi test setup:

- `getRelationship` eða page-helper skilar loan source view með `item_name`.
- Detail-síða birtir heiti láns undir `Lánað og skilað`.
- Detail-síða birtir dagsetningu ef hún er til.
- Detail-síða birtir ekki inaccessible loan source.
- Flokkabreyting action hafnar óþekktu taggi.
- Flokkabreyting action hafnar relationship sem tilheyrir öðrum notanda.
- Flokkabreyting action uppfærir eigið relationship.
- Middleware/feature gating helst óbreytt: `TENGSL_ENABLED` og `TENGSL_FLAG` ráða aðgangi.

## Localhost checks for Stebbi

Forsenda: `TENGSL_ENABLED=true`, `TENGSL_FLAG=true`, Stebbi er með Tengsl-aðgang í admin, og SQL 53/54 hafa verið keyrð í localhost/local Supabase.

### Lánað og skilað upplýsingar

1. Búa til eða nota tengsl sem varð til úr `Lánað og skilað`.
2. Opna `/stillingar/tengsl`.
3. Velja tengda manneskju.
4. Skoða kaflann `Lánað og skilað`.

Vænt niðurstaða:

- Þar sést heiti hlutar, ekki bara `Opna lán`.
- Þar sést dagsetning, helst stofndagur láns ef til staðar, annars lánadagur.
- Smellur opnar Lánað og skilað án villu og helst með rétta lánasamhengi.

### Flokkabreyting

1. Opna sama tengsl-detail.
2. Breyta flokki úr `Óflokkaður` í annan flokk sem UI býður upp á.
3. Vista.
4. Refresha síðuna.
5. Fara til baka á `/stillingar/tengsl`.

Vænt niðurstaða:

- Nýr flokkur sést eftir vistun og eftir refresh.
- Listasíðan sýnir sama flokk.
- Aðrir notendur sjá ekki þessa flokkun.

### Regression

1. Prófa notanda sem er ekki með Tengsl-aðgang.
2. Prófa `/stillingar/tengsl` þegar `TENGSL_ENABLED` er ekki `true`.
3. Prófa relationship án loan sources ef slíkt er til.

Vænt niðurstaða:

- Feature gating heldur.
- Engin tóm eða brotin síða.
- Engin gögn leka milli notenda.
