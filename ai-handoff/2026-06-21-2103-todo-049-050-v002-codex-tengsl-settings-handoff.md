# Handoff til Claude Code: #49 og #50 sem `/stillingar/tengsl`

**Viðeigandi TODO:** #49 `Tengsl þvert á Teskeiðar` og #50
`Fjölskyldumeðlimir sem tengsl`

**Staða:** Ný stefna frá Stebba. Þetta v002 handoff leysir af hólmi v001 sem
nýjasta product direction, en v001 er ekki yfirskrifað.

## Ný stefna frá Stebba

Stebbi vill ekki flækja þetta með aðskildum `/vinir` og `/fjolskyldan`.

Ný stefna:

- Nota einn stað: `/stillingar/tengsl`.
- Allt fólk sem notandi tengist safnast þar.
- Tags sjá um röðun og flokkun, t.d. `Óflokkaður`, `Fjölskylda`, `Vinir`,
  `Kunningjar`, `Viðtakendur`.
- Þegar önnur Teskeið, t.d. `Lánað og skilað`, notar eða býr til tengingu við
  annan einstakling, vistast viðkomandi í `/stillingar/tengsl`.
- Sjálfgefin flokkun fyrir auto-vistuð tengsl er `Óflokkaður`.
- Á tengslafærslu þarf að sjást af hverju tengslin urðu til, t.d. vegna
  `Lánað og skilað`.
- Notandi á að geta opnað einstakling í `Tengsl` og séð alla gagnkvæma virkni
  þvert á Teskeiðar, með deep-linkum aftur í uppruna-Teskeið.

## Product dæmi

Stebbi lánar einstaklingi hlut í `Lánað og skilað`. Síðar spjalla þeir saman um
hvað þeir eigi sameiginlegt í Teskeið.

Í stað þess að Stebbi fari fyrst í `Lánað og skilað` og svo sér í lagi í
`Útlagt og endurgreitt`, opnar Stebbi:

`/stillingar/tengsl`

Þar finnur Stebbi einstaklinginn, sér sameiginlega sögu úr mörgum Teskeiðum og
getur smellt á:

- lánaðan hlut, sem opnar rétta færslu í `Lánað og skilað`
- útlagða/endurgreidda færslu, sem opnar rétta færslu í `Útlagt og endurgreitt`

## Mikilvægt: þetta er ekki bara tengiliðalisti

`Tengsl` er ekki bara address book. Þetta er sameiginlegur inngangur að sögu og
virkni milli innskráða notandans og annars einstaklings.

Fyrsta útgáfa má samt vera lítil:

- vista tengsl
- sýna tags
- sýna uppruna
- leyfa einkanafn/einkalýsingu
- mögulega sýna bara `Lánað og skilað` virkni fyrst

En arkitektúrinn þarf að gera ráð fyrir cross-Teskeið virkni síðar.

## Afmörkun og orðalag

Codex mælir með:

- Route: `/stillingar/tengsl`
- Aðalheiti í UI: `Tengsl`
- Sjálfgefinn tag: `Óflokkaður`
- Family tag eða tegund: `Fjölskylda`

Ekki nota `Tengdir` sem UI-heiti. Það hljómar eins og lýsingarorð eða tæknilegt
connected-state. `Tengsl` er betra yfirheiti.

## Gagnamódel: ekki stökkva of hratt

Claude Code á fyrst að gera tæknilegt plan, ekki stóra migration strax.

Það þarf að hanna:

- per-user tengsl
- tags/flokkun
- uppruna tengsla
- tengsl milli tengsla og auth-notanda, ef til staðar
- tengsl við óinnskráða aðila, t.d. börn/fjölskyldumeðlimi
- cross-Teskeið activity feed eða index
- deep-links úr tengslasögu inn í uppruna-Teskeiðar

Líkleg hugmynd:

- `relationships` eða `user_relationships` fyrir tengsl eiganda við manneskju
- `relationship_tags` eða enum/tag listi
- `relationship_sources` fyrir hvaðan tengslin komu, t.d. `loans`
- síðar `relationship_activity` eða samræmd query/view yfir virkni úr Teskeiðum

Þetta eru aðeins vinnunöfn. Claude Code á að velja heiti eftir repo-mynstri.

## Gagnrýnin spurning um activity

Ekki er víst að fyrsta útgáfa eigi að skrifa allt í nýja activity-töflu.

Mögulegar leiðir:

1. **Read-through view:** Tengslasíðan sækir virkni úr núverandi Teskeiðatöflum
   eftir þörfum.
2. **Event/index tafla:** Teskeiðar skrifa sameiginleg activity events tengd
   tengslum.
3. **Hybrid:** byrja með read-through fyrir `Lánað og skilað`, bæta síðar event
   indexi þegar fleiri Teskeiðar þurfa þetta.

Codex hallar að hybrid eða litlum read-through fyrsta skrefi, því activity-index
þvert á allar Teskeiðar gæti orðið of stór fyrsta breyting.

## Öryggi og privacy

Þetta snertir persónugögn og mögulega barnaupplýsingar.

Kröfur:

- Óinnskráður notandi má ekki sjá `/stillingar/tengsl`.
- Notandi má aðeins sjá eigin tengsl.
- Einkanafn, einkalýsing og tags eru private hjá eigandanum.
- Mótaðili má ekki sjá hvernig Stebbi hefur flokkað eða lýst honum.
- Tengslasaga má aðeins sýna virkni sem innskráður notandi hefur heimild til að
  sjá í uppruna-Teskeið.
- Deep-link má ekki opna færslu ef uppruna-Teskeið myndi sjálf hafna aðgangi.
- Börn/fjölskyldumeðlimir mega ekki vera meðhöndluð eins og auth-notendur nema
  sérstaklega sé hannað fyrir það.
- Ekki logga nöfn barna, netföng, tengslalýsingar eða einkatags.

## Fjölskylda innan tengsla

#50 er ekki lengur sérstök `/stillingar/fjolskyldan` route í þessari stefnu.

Fjölskyldumeðlimir eru hluti af `/stillingar/tengsl`, með taggi/tegund eins og
`Fjölskylda`. Það þarf samt sér varúð:

- fjölskyldumeðlimur getur verið barn
- fjölskyldumeðlimur getur verið óinnskráður
- lágmarksgögn eiga að duga
- `Fyrsta vakt krakkanna` á að nota þessi sömu tengsl, ekki búa til sér lista

## Fyrsta notkun úr `Lánað og skilað`

Þegar notandi skráir lán með viðtakanda eða þegar lánatengsl verða skýr:

- mótaðili vistast í `/stillingar/tengsl`
- tag verður `Óflokkaður`
- source/uppruni verður `Lánað og skilað`
- tengslasíða sýnir að tengslin komu þaðan
- lánaform getur síðar valið viðkomandi úr tengslum

Það þarf að skilgreina nákvæmlega hvenær auto-vistun gerist:

- þegar netfang er slegið inn?
- þegar boð er sent?
- þegar mótaðili velur `Þekki málið`?
- þegar lán er samþykkt eða skilað?

Stebbi hallast að „vistum alltaf viðtakanda úr hinum og þessum lausnum“, en
Claude Code þarf að benda á edge cases, t.d. typo, rangt netfang, spam/abuse og
Gmail-punktamálið í #43.

## Tengslasíða einstaklings

Hugmynd að síðu:

`/stillingar/tengsl/[id]`

Sýnir:

- birtingarnafn/einkanafn
- tags
- einkalýsingu
- uppruna tengsla
- sameiginlega virkni eftir Teskeið
- deep-links inn í uppruna-Teskeiðar

Mikilvægt:

- Ekki sýna full email nema notandi hefur réttmæta ástæðu til að sjá það.
- Ekki sýna gögn sem uppruna-Teskeið myndi ekki sýna.
- Ef færslu hefur verið eytt eða aðgangur fallið niður þarf linkurinn að sýna
  örugga `fannst ekki` hegðun.

## Supabase / SQL

Ef SQL þarf:

- Ný migration í `sql/` með næsta rétta númeri.
- RLS frá byrjun.
- Policies prófaðar með tveimur notendum.
- Grants þröng.
- Engin broad `authenticated` read án owner-síu.
- Rollback/recovery plan.
- Sérstakt samþykki Stebba áður en SQL er keyrt.

Ekki blanda þessu saman við `sql/48_update_loan_with_diff.sql`. Það er annað
mál og snertir lánavistun/RPC.

## Tillaga að næsta skrefi Claude Code

Claude Code á að skila plani með:

1. route-uppbyggingu fyrir `/stillingar/tengsl`
2. gagnamódelstillu, án þess að keyra SQL
3. RLS/policy drögum
4. hvernig `Lánað og skilað` skapar tengsl
5. hvernig tags virka
6. hvernig uppruni er sýndur
7. hvernig tengslasíða getur síðar sýnt activity úr mörgum Teskeiðum
8. hvernig þetta forðast sérlausnir fyrir lán og fjölskyldu
9. hvað á að vera í fyrstu litlu útgáfu

## Localhost checks for Stebbi

Þessi checks eiga við eftir implementation.

### `/stillingar/tengsl`

1. Skrá inn sem notandi A.
2. Opna `/stillingar/tengsl`.
3. Staðfesta að síða birtist og sé tóm eða sýni núverandi tengsl.
4. Skrá út og reyna að opna sömu síðu.

Vænt:

- Innskráður notandi kemst inn.
- Óinnskráður notandi kemst ekki inn.
- Engin gögn leka milli sessions.

### Auto-vistun úr Lánað og skilað

1. Notandi A stofnar lán með viðtakanda B.
2. Opna `/stillingar/tengsl`.
3. Finna B í lista.

Vænt:

- B birtist sem tengsl.
- Tag er `Óflokkaður`.
- Uppruni sýnir `Lánað og skilað`.
- B birtist ekki sem „vinur“ nema notandi hafi sjálfur flokkað hann þannig.

### Tengslasíða

1. Opna tengsl B.
2. Skoða sameiginlega virkni.
3. Smella á lánaðan hlut.

Vænt:

- Virkni úr `Lánað og skilað` birtist ef hún er til og notandi hefur aðgang.
- Smellur opnar rétta færslu eða rétt samhengi í `Lánað og skilað`.
- Ef færsla er ekki lengur aðgengileg fæst örugg og skiljanleg villa.

### Fjölskyldu-tag

1. Bæta við tengslum sem fjölskyldumeðlimi eða tagga núverandi tengsl sem
   `Fjölskylda`.
2. Opna `Fyrsta vakt krakkanna`, þegar sú Teskeið er tengd.

Vænt:

- Sama tengslafærsla nýtist þar.
- Ekki verður til sér fjölskyldulisti sem tvítekur gögn.
- Barnaupplýsingar leka ekki í logs eða til annarra notenda.

### Tveir notendur

1. Notandi A býr til tengsl.
2. Notandi B skráir sig inn í sér session.
3. Notandi B opnar `/stillingar/tengsl`.

Vænt:

- Notandi B sér ekki tengsl A.
- Ef B hefur eigin tengsl við sömu manneskju eru einkanafn, tags og lýsing óháð
  því sem A setti.

