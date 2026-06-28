# Handoff til Claude Code: #49 og #50 fólk, tengsl og fjölskylda í stillingum

**Viðeigandi TODO:** #49 `Vinir og þekktir viðtakendur þvert á Teskeiðar` og #50
`Fjölskyldan í stillingum`

**Staða:** Handoff frá Codex til Claude Code. Þetta er ekki beiðni um tafarlausa
framkvæmd nema Stebbi gefi grænt ljós. Claude Code á fyrst að rýna, einfalda og
skila tæknilegu plani.

## Kjarni

Stebbi er að móta sameiginlegan grunn fyrir fólk og tengsl í Teskeið:

- `/stillingar/minn-profill`
- `/stillingar/vinir`
- `/stillingar/fjolskyldan`

Þetta á ekki að verða safn af sérlausnum fyrir einstakar Teskeiðar. Ein af
snilldunum við Teskeið er að samnýta íhluti milli mismunandi Teskeiða. Þess vegna
á `Lánað og skilað` bara að vera fyrsta notkunin á vinum/tengiliðum, og
`Fyrsta vakt krakkanna` bara fyrsta notkunin á fjölskyldugrunni.

## Eru vinir, kunningjar og fjölskylda tengd?

Já, þau eru tengd sem product- og stillingasvæði, en þau eru ekki endilega sama
database entity.

Codex mælir með einu sameiginlegu hugmyndalíkani:

- **Minn prófíll:** innskráði notandinn sjálfur.
- **Vinir/tengiliðir/kunningjar:** annað fólk sem notandi tengist, oft með netfang
  og mögulega auth-notanda síðar.
- **Fjölskyldumeðlimir:** fólk í heimili/fjölskyldu notanda, oft börn eða
  óinnskráðir aðilar, og því viðkvæmari gögn.

Þetta getur deilt:

- stillinga-layouti
- navigation undir `/stillingar`
- listum, edit formum og tómu ástandi
- vali á einstaklingi í annarri Teskeið
- RLS-mynstri og server-side data access mynstri

En þetta ætti líklega ekki allt að vera ein og sama taflan án mjög skýrs plans,
því fjölskyldumeðlimur getur verið barn án auth-aðgangs en vinur/tengiliður getur
verið fullorðinn auth-notandi með netfang.

## Product-markmið

1. Búa til fyrsta alvöru stillingasvæðið í Teskeið.
2. Láta margar Teskeiðar geta valið fólk úr sameiginlegum grunni.
3. Forðast `LoanKnownRecipient`-sérlausn sem síðar þarf að rífa upp.
4. Halda fjölskyldu- og barnaupplýsingum private og öruggum.
5. Safna lágmarksgögnum, sérstaklega um börn.

## Tillaga að áföngum

### Áfangi 0: Rýni og kortlagning

Claude Code á að skoða:

- núverandi auth/profile flæði
- `app/auth-mvp/minn-profill`
- `components/teskeid/TeskeidMenu.tsx`
- `messages/is.json` og `messages/en.json`
- núverandi Supabase töflur fyrir profiles/auth
- TODO #49 og #50

Markmið: finna einföldustu leiðina sem býr til góðan grunn án þess að taka of
stóran bita.

### Áfangi 1: Stillinga-rammi án gagnamigration

Byrja má með routes og layout áður en gagnamódel er endanlegt:

- `/stillingar/minn-profill`
- `/stillingar/vinir`
- `/stillingar/fjolskyldan`

Ef route-aliasar tengjast #22 þarf að gæta þess að búa ekki til redirect-lykkjur
eða tvær ósamræmdar prófílsíður.

Þessi áfangi gæti verið UI/skel + navigation, með skýru tómu ástandi, en án þess
að geyma viðkvæm gögn strax.

### Áfangi 2: Vinir/tengiliðir

Fyrsta notkun: `Lánað og skilað`.

Möguleg hegðun:

- Þegar notandi sendir lánaboð eða lán er samþykkt verður mótaðili að tillögu að
  tengilið.
- Notandi getur staðfest, nefnt og lýst tengilið í `/stillingar/vinir`.
- Lánaform getur síðar valið úr þessum tengiliðum.

Mikilvæg ákvörðun: ekki auto-vista alla sem endanlega vini án þess að Stebbi
samþykki product-regluna. „Tillaga að tengilið“ getur verið mýkri og öruggari
fyrsta útgáfa.

### Áfangi 3: Fjölskyldan

Fyrsta notkun: `Fyrsta vakt krakkanna`.

Möguleg lágmarksgögn:

- birtingarnafn
- tengsl/hlutverk, t.d. barn, foreldri, maki eða annað
- aldurshópur eða fæðingarár ef fyrsta vakt þarf aldurstengt samhengi

Forðast skal fulla fæðingardagsetningu nema hún sé nauðsynleg. Börn og
fjölskyldugögn þurfa hærra varúðarstig.

## Gagnamódel: gagnrýnin atriði

Claude Code á ekki að stökkva beint í SQL án rýni.

Spurningar sem þarf að svara fyrst:

- Er einn almennur `people` grunnur með sér relationship-töflum einfaldari, eða
  eru aðskildar `contacts` og `family_members` töflur öruggari?
- Þarf fjölskyldumeðlimur að geta tengst auth-notanda síðar, eða er hann alltaf
  private record hjá eiganda?
- Hvernig á að canonicalize-a netföng þannig að #43 Gmail-punktamálið mengi ekki
  tengiliðagögn?
- Hvernig á að eyða eða archive-a tengiliðum án þess að brjóta audit/history í
  öðrum Teskeiðum?
- Hvað á að gerast ef auth-notandi eyðir aðgangi sínum eða breytir netfangi?

Codex hallast að því að byrja ekki með of almennri „person“ töflu sem reynir að
leysa allt. Betra getur verið að hafa sameiginlegt UI og service-mynstur, en
aðskilin gögn fyrir:

- user contacts / friends
- family members

Síðan má tengja þau saman síðar ef raunveruleg þörf kemur í ljós.

## Öryggi og RLS

Þetta verkefni snertir persónugögn og mögulega barnaupplýsingar. Það þarf
production-gleraugu frá upphafi.

Kröfur:

- Óinnskráður notandi má ekki sjá neitt í `/stillingar/*`.
- Notandi má aðeins sjá eigin tengiliði og eigin fjölskyldumeðlimi.
- Einkanafn og einkalýsing tengiliðs mega ekki leka til mótaðila.
- Fjölskyldumeðlimir mega ekki leka til annarra notenda eða annarra Teskeiða nema
  innskráður eigandi velji þá þar.
- Ekki logga nöfn barna, aldur, fæðingardagsetningar, netföng eða lýsingar.
- Ekki setja `anon` eða breið `authenticated` grants á töflur án nákvæmra RLS
  policies og prófana.
- Ef notuð eru service-role RPC/server actions þarf að passa að actor-id sé alltaf
  úr session, ekki client-sent user id.

## Supabase / SQL

Ef SQL þarf:

- Búa til nýja migration í `sql/` í réttri númeraröð.
- Skýra hvort migration býr til töflur, indexes, RLS, policies, functions eða
  grants.
- Hafa rollback/recovery plan.
- Hafa read-only preflight ef verið er að tengjast núverandi `profiles`, auth eða
  loan data.
- Ekki keyra SQL án sérstakrar Stebba-samþykktar.

Möguleg töflunöfn eru ekki ákvörðun enn, en Claude Code má meta:

- `user_contacts`
- `user_contact_notes`
- `family_members`

Ekki festa þessi nöfn án þess að rýna núverandi naming pattern í repo.

## UI og íhlutir

Endurnýting er lykilatriði.

Claude Code ætti að hanna fyrir:

- `SettingsShell` eða sambærilegt stillinga-layout ef ekkert slíkt er til.
- sameiginlega stillinga-navigation fyrir `Minn prófíll`, `Vinir`, `Fjölskyldan`.
- endurnýtanlegt person/contact select sem `Lánað og skilað` getur notað.
- endurnýtanlegt person/family picker sem `Fyrsta vakt krakkanna` getur notað.

Passa:

- Allur notendatexti fer í `messages/is.json` og `messages/en.json`.
- Ekki hardcode-a íslenskan texta í component.
- Mobile-first, 360-460 px, án horizontal scroll.
- Ekki nota marketing-hero eða stórar skýringar inni í appinu. Þetta eru
  stillingar, þær eiga að vera rólegar og skannanlegar.

## Afmörkun fyrir fyrsta plan

Codex mælir með að Claude Code geri fyrst plan, ekki implementation, fyrir:

1. route- og settings-architecture
2. gagnamódel fyrir vini/tengiliði
3. gagnamódel fyrir fjölskyldu
4. RLS/policy plan
5. hvaða lágmarks UI er fyrsta útgáfa
6. hvernig `Lánað og skilað` tengist vinum
7. hvernig `Fyrsta vakt krakkanna` tengist fjölskyldu

Ekki taka allt í einni risabreytingu. Þetta er grunnkerfi sem mun lifa lengi.

## Localhost checks for Stebbi

Þessi listi á við eftir að Claude Code hefur útfært fyrsta áfanga.

### Stillingar

1. Skrá inn sem venjulegur notandi.
2. Opna `/stillingar/minn-profill`.
3. Opna `/stillingar/vinir`.
4. Opna `/stillingar/fjolskyldan`.

Vænt:

- Allar stillingasíður eru varðar fyrir innskráðan notanda.
- Navigation milli síðna er skýr.
- Óinnskráður notandi kemst ekki inn.
- Engin redirect-lykkja verður milli `/auth-mvp/*`, `/stillingar/*` og login.

### Vinir / tengiliðir

1. Búa til eða nota lánasamhengi þar sem mótaðili er þekktur.
2. Staðfesta að mótaðili birtist sem tengiliður eða tillaga að tengilið samkvæmt
   product-reglu.
3. Setja einkanafn og einkalýsingu.
4. Opna lánaform og velja tengilið.

Vænt:

- Netfang eða tengiliður fyllist rétt út í lánaformi.
- Einkanafn/lýsing sést bara hjá eigandanum.
- Mótaðili sér ekki einkaupplýsingarnar.

### Fjölskyldan

1. Opna `/stillingar/fjolskyldan`.
2. Bæta við fjölskyldumeðlimi með lágmarksgögnum.
3. Breyta og fjarlægja fjölskyldumeðlim.
4. Prófa á mobile viewport 360-460 px.

Vænt:

- Fjölskyldumeðlimir vistast aðeins fyrir innskráðan eiganda.
- Annar notandi sér þá ekki.
- UI er læsilegt á mobile og án overlap.

### Fyrsta vakt krakkanna

Þegar sú Teskeið er tengd:

1. Opna `Fyrsta vakt krakkanna`.
2. Velja fjölskyldumeðlim úr sameiginlega fjölskyldugrunninum.

Vænt:

- Teskeiðin notar sömu gögn og `/stillingar/fjolskyldan`.
- Hún býr ekki til sér lista sem tvítekur fjölskyldumeðlimi.

### Varúð

- Ekki nota raunveruleg barnanöfn eða viðkvæmar fjölskylduupplýsingar í prófum sem
  gætu farið í logs, screenshots eða handoff.
- Ekki keyra SQL á production án sérstakrar samþykktar.
- Ef RLS eða policies eru hluti af breytingunni þarf að prófa með minnst tveimur
  aðskildum notendum.

