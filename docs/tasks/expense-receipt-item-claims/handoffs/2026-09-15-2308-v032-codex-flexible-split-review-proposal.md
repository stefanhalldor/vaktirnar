# v032 — Tillaga til rýni: brotaval, opinn mismunur og breytanlegir liðir

**Staða: TILLAGA TIL RÝNI. Engin framkvæmdarheimild fyrir þennan áfanga.**
Stebbi segir fyrri virkni functional og virkandi. Þetta er notendastaðfesting
á prófuðu flæði, ekki sönnun um öll concurrency/security/mobile-próf.
Hann biður um einn rýnihring áður en snögg localhost-breyting er prófuð.
NEI — EKKI KEYRA SQL NÚNA.

## Túlkun á ósk Stebba

1. Ég get tekið heila einingu eða brot, t.d. hálfa rauðvínsflösku, á einfaldan
   sjónrænan hátt. Ekki fela brot í sérstöku tæknilegu innsláttarsvæði.
2. Ég get vistað yfirferð og hafið skiptingu þótt línusumma stemmi ekki við
   kvittunarheild. Mismunurinn sést áfram og hverfur þegar leiðrétt hefur verið.
3. Eigandi getur breytt magni og línufjárhæð meðan fólk er þegar að skipta.
   Viðbótarliðir nota sama flæði. Fyrri val tapast ekki í endurvistun.
4. Appið sýnir aðskilið hvað stendur á kvittun, hvað skráðir liðir samtals
   kosta og hvað þátttakendur hafa tekið til sín.
5. Flokka jafnóðum í það sem er eftir og það sem fólk hefur tekið; fullskiptir
   liðir fara í samanbrotna skúffu. Stebbi bætti þessari ósk við meðan v032
   var í vinnslu, áður en það var afhent.
6. Skýra ókunn heiti beint í viðmótinu. Dæmi Stebba: ChatGPT sagði honum
   að Menabrea væri bjór; tillagan sýnir upprunalega heitið og „Bjór“ við það.
   Þessi ósk barst líka áður en v032 var afhent.

Eigandastýring breytinga er ráðlögð áframhaldandi forsenda, ekki ný ákvörðun
um að allir þátttakendur fái ritheimild. Teskeiðarinnskráning án ÚL, JSON án
myndar, núllkrónuskref og canonical participant-pillur haldast.

## Tillaga að framsetningu

### A. Liður með magnvali

Rauðvín                       1 flaska · 48 EUR
Anna ½ · 24 EUR                Eftir ½

Mitt magn
[ − ]              ½              [ + ]
[ ¼ ]       [ ⅓ ]       [ ½ ]       [ 1 ]
[ Annað magn ]                 [ Vista mitt magn ]

Stutt lárétt stöðustika ofan við valið sýnir hluta þátttakenda og lausa
hlutann, með nafni/texta auk litar. Hún er myndræn samantekt, ekki eini
stýrihnappurinn. Ekki gera ráð fyrir að hver lína sé flaska; almennir
textar eru „eining“ nema eining sé raunverulega þekkt.

Ráðlegging: stepper með mínus/plús og brotaflýtivali, ekki samfelldur slider.
Ójöfn skref eins og ¼ → ⅓ → ½ eru illa útskýrð með línulegri vegalengd.
Ef slider er valinn eftir rýni skal hann hafa afmörkuð merkt stopp og sömu
keyboard/ARIA-hegðun; hann bætist ekki ofan á mörg önnur controls.

- Þrep: 0 ↔ ¼ ↔ ⅓ ↔ ½ ↔ 1 ↔ 2 ↔ 3 … upp að leyfilegu magni.
  Frá 1 gefur mínus því ½, síðan ⅓, síðan ¼ og loks 0.
- Flýtihnappar SETJA mitt heildarmagn, þeir bæta ekki broti ofan á fyrra val.
  „Mitt magn ½“ merkir hálfa einingu, ekki helming allra eininga línunnar.
- „Annað magn“ tekur við gildum brotum/aukastöfum, t.d. 1,5 eða 1/2.
  Blandað magn má birtast sem 1½. Hafna óstuddum brotum skýrt; aldrei námunda
  þriðjung þegjandi og merkja síðan sem nákvæman ⅓.
- Fyrir gildi utan þrepa fer mínus/plús í næsta lægra/hærra leyfilega þrep.
  Tiltækt hámark er ótekið magn + mitt vistaða magn.
  Bjóða „Allt sem er laust“ þegar hámarkið er t.d. ⅔.
- Hnappar breyta staðbundnu vali; Vista mitt magn sendir eina aðgerð.
  Áður vistuð nöfn/hlutar eru ekki sýnd eins og nýja valið sé komið í gegn.
  Óvistað val fær merkingu, upphæðarforskoðun og hægt er að hætta við.
- Vista núll skilar mínu magni aftur. Pending/error er við valið; villa
  heldur óvistuðu vali, ekki þögul leiðrétting á hlut annars þátttakanda.
- Þátttakendapillur efst halda núverandi generic filter-hegðun. Brotaflýtival
  er single-choice segmented control, ekki sama multi-select filter.

### B. Samantekt yfir reikningi

Á kvittun                  100 EUR
Skráðir liðir               96 EUR
Vantar í liðina              4 EUR
Tekið til sín               60 EUR
Óskipt af skráðum liðum     36 EUR

Mismunurinn er 4, ekki 40. Óúthlutað magn og vantar í innlestur eru
aðskilin hugtök. Þegar línusumma er 104 sést „Liðir umfram kvittun: 4 EUR“.
Þegar jafnt er má sýna „Línusumma stemmir“.

- Kvittunarheild er sjálfstætt viðmið. Viðbót/breyting línu breytir EKKI
  þeirri tölu sjálfkrafa. Eigandi getur leiðrétt kvittunarheild sérstaklega.
- Þetta breytir núverandi SQL183-hegðun sem hækkar total við append.
- Þátttakendafjárhæðir reiknast af raunverulegum skráðum liðum og gildandi
  afsláttar/skatts/þjórfjárreglum; óskráðum mismun er aldrei dreift sjálfkrafa.
- Jafnan sem þarf að halda er: tekið til sín + óskipt = skráðir liðir.
  Kvittunarheild - skráðir liðir = sýnilegur mismunur.
- Heildarsamantekt er alltaf fyrir allan reikninginn þótt pillusía sé virk.
  Síaðir hlutir fá sér merkingu, ekki nýja villandi kvittunarheild.
- Mismunur er sýnileg ábending, ekki villustaða sem gerir Hefja skiptingu
  óvirkt. Ekki bæta við þvingaðri samþykkisglugga í hvert sinn.
- Vistun/hefjun krefst áfram gildra talna, aðgangs, vistaðrar útgáfu og
  að einhver jákvæður liður sé til að skipta. Allir núll-liðir varðveitast.
  Tillaga: engin ný skipting ef netto línusumma er <= 0 eða afsláttur
  gerir fjárhagsúthlutun ógilda. Þetta er gagnagildisvörn, ekki jöfnunarkrafa.

### C. Breyta lið eftir að skipting hefst

Eigandi velur Breyta á línu; sama heiti/magn/upphæð form opnast.
Sýna forskoðun á nýjum línukostnaði, línusummu og kvittunarmismun.
Línufjárhæð er alltaf verð ALLRAR línunnar; ekki rugla saman við einingarverð.

- Halda sama item-ID og öllum claim-ID/tengslum; ekki skipta út item-lista.
- Við verðbreytingu helst valið magn. Verð á valda hlutanum endurreiknast.
- Við magnbreytingu helst valið einingamagn. Dæmi: 4 kaffibollar verða 5,
  Anna heldur 1 kaffibolla; hún heldur ekki sjálfkrafa 25% nýja magnsins.
- Ekki leyfa magn undir samanlögðu völdu magni. Sýna: „Það er þegar búið
  að velja X einingar. Minnka þarf valið áður en magnið er lækkað.“
- Verð niður í núll: varðveita fyrri magnval á línunni, sýna 0 kostnað og
  merkja núllkrónulínu. Ný magnval á núll-línu eru í bið þar til verð verður
  jákvætt; hægt er að skila eigin magni. Þetta þarf sérstaka server-rýni,
  núverandi claim-RPC hafnar núllverði líka fyrir release.
- Óvistaðar breytingar haldast við poll/focus. Ef server-útgáfa hefur breyst
  skal stöðva vistun með skýrri ástæðu og bjóða endurlestri án blindrar yfirskriftar.
- Verð/magn/claim breytingar nota sama parent-row lock og request-idempotency.
  Gamalt magnval úr öðru tæki má ekki samþykkjast á breyttum verðforsendum;
  claim þarf að sannreyna line-revision/expected-price-and-quantity.
- Sýna á breyttri línu „Breytt“ og nýja upphæð hjá þátttakendum. Lágmarks
  actor/time/version á server nægir; ekki bæta við nýju fjárhagskerfi eða
  tölvupóstsendingum. Rýna hvort before/after þurfi í einföldum breytingasporum.

### D. Lifandi flokkun og samanbrotin skúffa

Ósíuð sýn hefur „Eftir að skipta“ efst og „Búið að skipta (N)“ neðar.
Síðari hlutinn er accordion/details, lokaður sjálfgefið, með fjölda fullskiptra
lína og samtals fjárhæð þessara lína í haus. Skúffusumma er ekki sjálfkrafa
sama tala og „Tekið til sín“, því fólk getur líka átt hluta af ófullskiptum línum.

- Fullskipt = allt úthlutanlegt magn línunnar er valið. Hún færist í skúffu.
- Hluti tekinn = lína helst í „Eftir að skipta“ með lausu magni áberandi,
  t.d. „3 af 4 eftir“. Nöfn og valdir hlutar sjást á sömu línu.
  Ekki tvítelja sömu línufjárhæð í báðum hópum eða fela lausa hlutann.
- Magn skilað eða eigandi hækkar magn = línan færist aftur í opna hlutann.
  Röð innan hóps fylgir upprunalegri línuröð; engin handahófskennd röðun.
- Staða uppfærist eftir staðfesta vistun og núverandi poll/focus. Ekki
  lofa realtime push sem núverandi 8 sekúndna polling veitir ekki.
- Opnuð skúffa helst opin við uppfærslu, val og poll. Ekki loka henni sjálfkrafa.
- Ekki færa/fjarlægja control sem er með focus eða óvistað val vegna
  breytingar annars þátttakanda. Merkja að staða hafi breyst; færa þegar
  viðkomandi lýkur eða hættir við. Eftir eigin vistun er sýnilegt feedback
  um að línan hafi færst og keyboard-focus fær rökréttan stað, t.d. skúffuhaus.
- Valin participant-pilla breytir sýn í „Hlutir valinna aðila“; þeir eru
  sýnilegir óháð því hvort lína er fullskipt. Skúffa má ekki fela niðurstöðu
  síunnar. Þegar sía er hreinsuð kemur ósíuð hópaskipting aftur með fyrra
  open/closed-state. Generic pill-component breytist ekki.
- Núllkrónulínur og sérstakir tax/tip/discount-liðir teljast ekki sjálfkrafa
  „búið að taka“. Varðveita í sérmerktum upplýsingahluta, ekki úthlutunarskúffu.
  Núllverðslína með varðveittu magnvali sýnir það skýrt eftir reglu C.
- Þegar ekkert er eftir sést „Allir liðir hafa verið valdir“ og skúffuhaus.
  Mismunur við kvittun getur samt verið til staðar og samantektin sýnir hann.
- Nota canonical disclosure/accordion-pattern; minnst 40px snertiflöt,
  aria-expanded, keyboard Enter/Space og engin merking eingöngu með lit.

### E. Mannamálsskýring við hvern lið

Menabrea
Bjór
4 einingar · 28 EUR

- Upprunalegt heiti úr kvittun helst sýnilegt og varðveitt. Ekki skipta
  Menabrea út fyrir almenna heitið Bjór þannig að samanburður við kvittun tapist.
- Stutt skýring er sýnileg strax undir heitinu, líka í síuðum hlutum og
  opnaðri Búið að skipta skúffu. Ekki tooltip sem krefst hover eða aukasmells.
- Aðeins lengri gagnleg skýring fer undir „Nánar“, ef til staðar. Ekki búa
  til tóma aukahnappa eða endurtaka heitið sem gerviskýringu.
- Móttaka JSON/myndlestur getur skilað valfrjálsri skýringu með línu.
  Ef ChatGPT er notað utan appsins skal JSON-leiðbeining/prompt segja að
  skila stuttri skýringu líka þegar heitið er þekkt. Engin myndakrafa.
- Við óskaðan myndlestur má fá skýringuna í sama útdráttarkalli.
  Ekki senda ný provider-köll sjálfkrafa fyrir hverja línu eða við opnun/poll.
  Engin bakgrunnsfylling eldri reikninga eða ný billing/provider-heimild í rýni.
- Óþekkt eða tvíræð merking: skýring má vanta. Ekki sýna ágiskun sem
  staðreynd; vafasöm vélatillaga er merkt til yfirferðar hjá eiganda.
  Eldri JSON án skýringa er áfram gilt og eldri kvittanir áfram læsilegar.
- Eigandi getur bætt við eða leiðrétt skýringu í sama Breyta-lið formi,
  fyrir og eftir deilingu. Þátttakendur sjá vistaða skýringu.
  Breyting á skýringu breytir ekki magni, verði eða úthlutun.
- Öll UI-labels í messages/is.json og en.json; heiti/skýringu reiknings má
  ekki meðhöndla sem HTML. Taka fram hvaða tungumál skýring notar; ekki lofa
  sjálfvirkri þýðingu við hvert locale-skipti eða búa til nýtt vörugagnasafn.

## Tæknileg atriði sem rýnir þarf að staðfesta

1. **Nákvæm ⅓:** núverandi quantity_milli=1000 á einingu getur ekki geymt
   nákvæman þriðjung. 333+333+333 skilur eftir 1. Ekki falsa UI-sniðið.
   Afmörkuð leið til rýni er standalone scale=3000: ½=1500, ⅓=1000,
   ¼=750; öll eldri .001 gildi umbreytast nákvæmlega með margföldun með 3.
   Þetta styður umbeðin brot og eldri innslátt, ekki öll möguleg brot.
   Rýnir ber saman við numerator/denominator líkan og velur minnsta örugga
   kostinn áður en implementation hefst. Ekki víkka sameiginlegt Expense-líkan.
2. **Samningur magnsvæða:** aldrei endurtúlka quantity_milli sem 1/3000.
   Nýtt skýrt units/scale wire-version, örugg umbreyting gagna og JSON-import
   boundary þarf ef scale-leið er valin. Eldri JSON er áfram milli=1000.
   Gömul browser-session/RPC verður að hafna eða vera með explicit adapter;
   aldri má tvöfalda/þrefalda magn vegna misræmdra útgáfa.
3. **Tvær heildir:** skýr receipt-reference vs computed line-total á read/write.
   Rýna söguleg SQL183 append: total kann þegar að hafa verið hækkað og
   upprunaleg kvittunarheild er ekki endurheimtanleg með ágiskun.
   Varðveita núverandi total sem upphafsviðmið; eigandi getur leiðrétt.
4. **Allocation:** lib/expenses/receipt-split.ts allocateReceiptClaims
   krefst jafnrar heildar. Nýr standalone adapter þarf að nota línusummu,
   ekki kvittunarviðmið. Ekki veikja Expense-samninginn.
   Gæta línufjárhæða vs adjustments, null/zero, neikvæðra discounts,
   sum-overflow og deterministic minor-unit afrúnunar. Þrír nákvæmir
   þriðjungar EUR 10 verða t.d. 3,34 + 3,33 + 3,33 með stöðugri röð.
5. **SQL/UI:** SQL182 confirm og SQL183 append hafa jafnheildarvörn;
   UI-disable og server-check þurfa samhæfða breytingu. Nýtt edit-RPC
   má ekki endurnýta private review sem DELETE/INSERT-ar item-lista.
6. **Zero claims:** splitSummary og SQL halda núll-línum utan claimable-setts.
   Varðveisla magns eftir verðlækkun í núll þarf sérstaka útfærslu/próf.
7. **Leyfi:** aðeins eigandi breytir línu/viðmiði, þátttakandi eigin magni,
   no ÚL, enginn data leak, óbreytt session-binding/service-only grants/RLS.
8. **Skýringar:** optional reitir í extraction/JSON-prompt, strict parsers,
   geymslu, read-view og owner-edit þurfa samhæfðan samning. Núverandi
   description geymir kvittunarheiti og á ekki að taka báðar merkingar
   án aðgreiningar. Takmarka lengd skýringa, varðveita eldri JSON og fylgja
   sömu membership-vörn. Rýna uppruna/yfirferð vélaskýringa án UI-flækju.

Lykilskrár til rýni: components/receipt-split/{SplitBoard,AddSplitItem}.tsx,
lib/receipt-split/{contracts,actions,format}.ts, lib/expenses/receipt-split.ts,
sql/182_standalone_receipt_splits.sql og sql/183_receipt_split_add_item.sql.
Uppsett SQL182/183 eru óbreytanleg artifact; nýr áfangi þarf nýja migration,
preflight/postflight og handvirka SQL-keyrslu Stebba, ef samþykktur.

## Tillaga að litlum áföngum eftir rýni

A. Samþykkt framsetning í afmörkuðu localhost UI-prófi með synthetic data.
   Halda þessu read-only ef SQL-samningur er ekki tilbúinn; ekki sýna þriðjunga
   sem virka í raun gegn milliscale. Stebbi ræsi localhost sjálfur.
B. Samþykktur standalone gagnasamningur og örugg SQL-viðbót, próf og handoff.
   Stebbi keyrir SQL-gáttir; engin blind breyting á uppsettum skrám.
C. Tengja alvöru vistun, rýna exact lokakóða og prófa tveggja notenda flæði.
   Sérstakt samþykki fyrir commit/push/deploy. Engin framkvæmd í þessum rýnihring.

## Beiðni til rýnis

Skila findings fyrst, raðað eftir alvarleika og með skrár/línur þar sem við á.
Staðfesta eða leiðrétta: magnvalið, aðskilnað heilda, varðveislu einingamagns,
exact ⅓ strategy, söguleg gögn, zero-price edits, concurrency og rollout.
Rýna einnig full/partial flokkun, skúffusummu, pillusíur og focus/óvistað
val þegar server-uppfærsla færir línur milli hópa.
Rýna valfrjálsar liðaskýringar, backward-compatible JSON, varðveislu heita,
vafasamar vélatillögur og engin sjálfvirk viðbótarköll/billing.
Leggja til eina afmarkaða lokaútfærslu, ekki margar óútkljáðar valleiðir.
Ekki breyta kóða, skrifa/keyra SQL, commit-a eða deploya.
Við engin findings: nefna áframhaldandi runtime/mobile prófunargöt.

## Localhost checks for Stebbi

Þetta er checklist EFTIR samþykkta framkvæmd; ný hegðun er ekki komin.
Nota synthetic gögn, eigin staðfesta notendur, annað session og 360/390/460px.
Localhost getur tengst raunverulegum Supabase; engin migration eða raunveruleg
kvittun breytt í núverandi rýni. Ekki ræsa/endurræsa server fyrir þennan áfanga.

1. Ein flaska: velja ½, sjá eigin nafn/magn/upphæð og ½ eftir.
2. Þrír taka ⅓: nákvæmlega ekkert eftir og heildarfjárhæð varðveitt.
3. 1 → ½ → ⅓ → ¼ → 0 með mínus, öfugt með plús; flýtival setur eigin magn.
4. Kvittun 100, línur 96: vista og hefja skiptingu; vantar 4 sést áfram.
   Tekið 60 gefur óskipt 36, ekki 40.
5. Bæta 4 við: línur verða 100, kvittun helst 100. Bæta 5 við í staðinn:
   línur 101 og umfram 1. Engin sjálfvirk jöfnun eða skuldafærsla.
6. Breyta verði flösku með ½ þegar valið: magn helst, fjárhæð uppfærist.
   Breyta 4 kaffibollum í 5: fyrra magn 1 helst 1.
7. Lækka heildarmagn undir valið: hafnað án að claims tapist.
   Verð niður í 0 og aftur upp: magnval varðveitt; nýjar claims fara eftir reglu.
8. Samhliða claim/edit og síðasti hluti: engin yfirúthlutun/þögul yfirskrift.
   Retry og gamalt tæki varðveita einingar og upphæðir rétt.
9. Poll/focus missir ekki óvistað val. Pending/villa eru við control;
   screen reader/keyboard, minnst 40px touch og 16px input skv. Design.md.
10. Pillusíun heldur fullri heildarsamantekt aðgreindri frá síuðum hlutum.
11. Taka 1 af 4: línan helst í Eftir með 3 lausum. Taka síðustu 3:
    línan fer í Búið að skipta; nafngreindir hlutar sjást þegar opnað er.
    Skila 1: línan kemur aftur með 1 lausa einingu. Engin tvítalning.
12. Opna skúffu, bíða eftir poll og sía á aðila: hans hluti sést strax,
    án þess að opna skúffu aftur. Hreinsa síu og endurheimta fyrra opið ástand.
13. Annar notandi fullskipti línu meðan control hefur focus/óvistað val:
    enginn input/focus missir. Allar línur fullskiptar en kvittunarmismunur
    enn til staðar: sýna báðar upplýsingar rétt.
14. JSON með Menabrea og skýringu Bjór: bæði sjást beint við liðinn.
    JSON án skýringa virkar óbreytt. Óþekkt heiti fær ekki tilbúna merkingu.
    Eigandi leiðréttir skýringu eftir deilingu; magn/verð/claims haldast.
    Skýring sést líka við pillusíu og þegar fullskipta skúffan er opnuð.
    HTML-líkur texti birtist sem texti og löng skýring veldur ekki overflow.

## Breytingar á verkefnalýsingu

Skráði notendastaðfestingu fyrri virkni og nýjan óskaðan áfanga. Núverandi
implementation er áfram lýst sem slík; v032 tillaga hefur forgang sem nýtt
markmið en er ekki merkt innleidd. Breytir fyrirhugaðri hegðun: jafnheild er
ekki hefjunarskilyrði, append breytir ekki receipt-reference sjálfkrafa,
liðir mega breytast eftir deilingu og brotaval þarf exact ⅓.
Eigandastýring og sértæk tæknileg útfærsla eru rýnitillögur.
Skráði einnig nýjustu ósk Stebba um lifandi Eftir/Búið flokkun og collapsed
skúffu, með skýrri partial-line/pillusíu/focus-hegðun.
Skráði ósk um skýringar beint við liði, t.d. Menabrea/Bjór, varðveislu
kvittunarheitis, optional extraction og eigandaleiðréttingar. Engin ný
provider-keyrsla eða raunveruleg gögn eru hluti þessarar rýni.
GoLive current gate er einn rýnihringur samkvæmt nýjustu beiðni Stebba.

## Raunverulega gert og ekki gert

Aðeins canonical task, þetta handoff og GoLive-description uppfærð.
Lesið Design.md controls/mobile-viðmið, shared WORKFLOW, allocation/SQL
vörður og fyrri task-stöðu. Read-only Get-Content/rg/GoLive get.
Ekkert app/SQL breytt, engin migration skrifuð eða keyrð, engin ný próf
keyrð á óbreyttum kóða, ekkert commit/push/deploy. Fyrra 244/244 evidence
tilheyrir v028, ekki nýrri hegðun. Engin skill eða subagent notuð.
