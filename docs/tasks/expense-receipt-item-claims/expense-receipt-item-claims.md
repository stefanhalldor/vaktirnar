# Splitta reikningnum: sjálfstætt, sameiginlegt splitt

- GoLive external ID: `expense-receipt-item-claims`
- GoLive issue: `516ec885-9521-4d84-8350-9219ac829695`
- Project: Vaktirnar, `1bb6e3fa-ab25-48c0-a806-342465ee5ded`
- Candidate: `C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913-v2`
- Base: `57a57d33c093a89ef38dd087acfa2b789897435d`
- Latest handoff: [SQL184 exact og live v2 localhost-candidate](handoffs/2026-09-16-0750-v037-codex-live-v2-localhost.md)
- GoLive er authoritative um status, priority og ownership. Þetta skjal geymir scope, ákvarðanir og evidence.

## Markmið og samþykkt kjarnaupplifun

**Samþykkt framkvæmd 2026-09-15:** Stebbi samþykkti v032 með skýrum
ákvörðunum og heimilaði Codex útfærslu. Fyrst SQL-frír localhost-prófskjár,
síðan eftir UI-sannprófun versioned samningur, adapters, application/server
scope, SQL-artifacts og focused próf/rýni. Þetta leyfi nær ekki til SQL-keyrslu,
commit/push/merge/deploy. Stebbi keyrir allt SQL.

Samþykktur samningur sem kemur í stað fyrri tillagna þar sem þær stangast á:

- Standalone scale=3000: ¼=750, ⅓=1000, ½=1500, heil=3000. Eldri milli ×3
  á versioned boundary. Engin breyting á sameiginlegum Expense-samningi.
  Stepper og flýtihnappar setja eigið heildarmagn; engin þögul afrúnun brota.
- Kvittunarviðmið og línusumma eru aðskilin. Mismunur stöðvar ekki vistun eða
  upphaf skiptingar. Viðbót/breyting línu breytir ekki viðmiðinu sjálfkrafa.
  Tekið + óskipt = línusumma. Ekki giska á upprunalega heild eldri reikninga.
- Aðeins eigandi breytir heiti/skýringu/magni/línufjárhæð/kvittunarheild.
  Þátttakandi breytir eigin magni. ID/claim tengsl og valið einingamagn haldast.
  Magn má ekki fara undir samtals valið. Sameiginlegt parent-lock, revision og
  idempotency verja edit/claim og gömul tæki gegn breyttu verði/magni.
- **Núllverð:** hafna verðbreytingu í núll meðan claims eru á línu; fyrst skila
  völdu magni. Án claims má núllkrónulína vera til samkvæmt fyrri reglum.
  Þetta yfirskrifar tillögu v032 um varðveislu claims á núllverðslínu.
- Fullskiptir liðir fara í samanbrotna „Búið að skipta“ skúffu. Hlutaskiptir
  haldast í „Eftir“; skil/hækkun magns flytja lið aftur. Röð helst. Pillusía
  sýnir hluti valinna aðila óháð skúffu. Focus/draft/open-state varðveitast við
  8 sekúndna poll og focus refresh; ekkert realtime-push loforð.
- Upprunalegt heiti alltaf sýnilegt, optional stutt skýring beint undir.
  Optional reitir úr JSON/myndlestri og owner-edit fyrir/eftir deilingu;
  eldri JSON gilt. Vafasöm vélaskýring merkt til yfirferðar, engin ágiskun,
  sjálfvirk provider-köll, bakgrunnsfylling eða ný billing-heimild. Texti, ekki HTML.
- Yfirferð fyrir deilingu er einfaldur línulisti: nákvæmt prentað heiti, íslensk
  mannamálsskýring þegar hún er tiltæk, magn með `stk.` og línuupphæð með mynt.
  Magn og upphæð eru beint breytanleg án „Breyta lið“. Claim-controls,
  þátttakendur og Eftir/Búið birtast fyrst eftir að skipting hefur hafist.

**Útfært nú:** SQL184 er exact uppsett og live standalone detail/create/image/
join flæði notar v2 boundary. SQL-frír sýnigagnaskjár er áfram tiltækur á
`/preview/splitt-v032`; innskráð localhost-prófun er núverandi gate.

Fólk á að geta splittað reikningi án þess að vita að Útlagt og endurgreitt
(ÚL) sé til. Splittið er sjálfstætt samstarfsflæði; það stofnar ekki sjálfkrafa
skuldir eða færir reikning í ÚL.

1. **Innlesa:** velja myndgreiningu eða líma JSON-svar úr öðru appi.
   **JSON eitt og sér nægir. Engin myndahleðsla er skilyrði í JSON-leiðinni.**
   Manual AI-leið sýnir aðeins stutta leiðbeiningu, `Afrita` og svarreit.
   Prompturinn er afritaður beint og er hvorki í sýnilegri skúffu né textarea.
   Svarreiturinn biður einfaldlega um svar gervigreindarinnar og skýrir undir
   reitnum að ekki þurfi að setja kvittunarmyndina aftur inn í Teskeið.
2. **Yfirfara:** leiðrétta heiti, magn og fjárhæðir. Núllkrónulínur varðveitast
   með heiti og magni í sér yfirferð þar sem eigandi getur fyllt inn fjárhæð.
   Þær hafa engin fjárhagsáhrif meðan fjárhæðin er núll. Eftir vistaða jákvæða
   fjárhæð taka þær þátt í venjulegri skiptingu. Neikvæð item-lína er ógild.
3. **Staðfesta innlestur:** eigandi staðfestir að kvittunin sé rétt innlesin.
   Þetta er ekki fjárhagsstaðfesting eða skuldastofnun.
   Yfirferð sýnir nákvæma fjárhæð sem vantar eða er umfram heild, uppfærða
   strax úr núverandi reitum áður en vistað er. Ógilt innsláttargildi sýnir
   ekki uppspunninn mismun. Vista þarf breytingar áður en staðfest er.
   Magn sýnir aðeins raunverulega aukastafi: 4, 10, 1.25; aldrei 4.000.
   Fjárhæðir sýna ekki óþarfa núll: 48, 4.5, 4.01. ISK notar 0 aukastafi,
   hinar studdu myntirnar allt að 2; minnstu einingar og gagnalíkan haldast.
   Fjárhæðatextar fylgja tungumáli og mynt reikningsins með sama sniði á server
   og client; stöðugt snið kemur í veg fyrir Intl/hydration ósamræmi.
   Innsláttur er án þúsundaskilja og samþykkir kommu eða punkt sem tugabrotsskil.
   Í yfirferð er `Á kvittun` alltaf opinn inline reitur. Sérstakur `Vista
   yfirferð` hnappur er ekki sýndur; `Staðfesta og fara í skiptingu` vistar
   review-stöðu og staðfestir í version-varinni, endurkeyranlegri server-röð.
   Eftir að sharing hefst heitir toggle-aðgerðin `Breyta heildarfjárhæð`.
4. **Deila:** eigandi fær afritanlegan hlekk og sendir hann sjálfur á þá sem
   eiga hlut í reikningnum.
5. **Taka til sín:** þátttakendur taka liði/magn með skýrum sjónrænum hætti.
   Dæmi Stebba: 4 espresso; einn tekur 1, nafn hans birtist við þann hluta og
   3 espresso standa eftir. Öll stöðubreyting fær sýnilegt pending/error feedback.
6. **Sía og sjá samantekt:** þátttakendapillur efst sýna hver á hvað og
   samantekt viðkomandi. Smellur síar reikninginn á hans liði/magn/upphæðir.
   Endurnýta `TeskeidMultiSelectPillFilter`; sama generic toggle/clear/fjölvalshegðun
   og annars staðar. Feature-adapter skilgreinir OR fyrir marga valda aðila.
   Engin valin pilla sýnir allan reikninginn; hreinsun síu endurheimtir það.
7. **Varðveita:** refresh má ekki tapa reikningi, aðild eða skiptingu.
   Samtímis úthlutun má aldrei fara yfir tiltækt magn.
8. **Bæta við lið:** sama form (heiti, magn, upphæð) í yfirferð og eftir
   að skipting hefst. Í yfirferð heldur heild sér; nýr liður fyllir í vöntun
   og er vistaður með yfirferðinni. Í skiptingu bætist nýr jákvæður liður
   óúthlutaður við reikninginn og hækkar línusummu um sína upphæð. Kvittunarviðmið
   helst óbreytt samkvæmt nýjum samningi. Eldra v1/SQL183 hækkar enn total_minor
   þar til v2 hefur verið tengt og sett upp.
   Fyrri liða-ID, línufjárhæðir og valið magn haldast. Samantektir,
   þ.m.t. úthlutun fyrirliggjandi afsláttar/skatts/þjórfjár, endurreiknast.
   Eigandi einn má bæta við í skiptingu. Hámark 100 liðir.

## ÚL er síðar og valkvætt

- ÚL-útfærsla er í bið samkvæmt Stebba. Ekki framkvæma hana í þessum áfanga.
- Engin ÚL-entitlement krafa, greiðandaskref, „Hver borgaði?“ eða sjálfvirk
  yfirfærsla í kjarnasplittinu.
- Síðar getur yfirfærsla átt við þegar einhver greiðir raunverulega fyrir annan.
  Hún verður aðeins sýnileg þeim sem hafa ÚL-flaggið.
- Núverandi `ExpenseReceipt*`, Expense-private-drafts og finalizer tengingar
  eru eldri candidate, ekki samþykkt architecture-forsenda sjálfstæða kjarnans.
- Ekki veikja núverandi Expense-grants/auth eða veita gesti ÚL-aðgang til að
  koma sjálfstæðu splitti í gegnum eldri kerfishluta.

## Aðgangur: ákvörðun Stebba 2026-09-15

Viðtakandi deilihlekks **verður að skrá sig inn með Teskeiðarnotanda**.
Engin ÚL-aðgangskrafa fylgir þátttöku. Gestaaðgangur með staðfestingarkóða
er ekki hluti þessa áfanga. Stebbi: „Þeir verða að skrá sig inn með
Teskeiðarnotanda... höfum það þannig“.

- Innskráning sannar auðkenni, en veitir ekki sjálfkrafa aðgang að öllum splittum.
- Gildur deilihlekkur veitir afmarkaða þátttöku í einu staðfestu splitti.
- Server bindur þátttakanda við staðfestan Teskeiðarnotanda. Browser má ekki
  velja annan notanda sem eiganda eigin úthlutunar.
- Eftir innskráningu skal viðtakandi komast aftur í rétta splittið.

Hlekkjaaðild og endurkomuaðgangur byggja á þeirri ákvörðun.
Nafn eða nafnval er aldrei sjálfstæð identity-sönnun og
hlekkur veitir ekki aðgang að óskyldum reikningum eða ÚL. Ekki búa til nýjan
guest/security contract með ágiskun. Fyrirliggjandi sameiginlegar vinnureglur
um scopes, secrets og Production gilda.

Aðgangsákvörðunin hefur verið tekin; hún er ekki lengur stopp eða opin spurning.
Útfærsla aðildar og sjálfstæðs gagnalíkans getur haldið áfram innan gildandi
framkvæmdarleyfis. Handvirk SQL-keyrsla Stebba er áfram sérstök gátt.

## Gildar varðveislur og endurnýting

- Nýr standalone-samningur notar exact scale=3000; v1/Expense heldur milli=1000.
  Yfirúthlutun og brot sem ekki er hægt að geyma nákvæmlega eru höfnuð.
- Upphæðir eru í minor units; deterministic largest-remainder útreikningur er
  endurnýtanlegur, en framsetning á eigin hlut er ekki sjálfkrafa skuld við greiðanda.
- Sameiginlegt nafn er framsetning, stable participant ID er identity.
- Myndgreining er server-only og gerir ekkert sjálfvirkt retry. JSON-leið gerir
  ekkert provider-kall, storage-upload eða gervimynd til að uppfylla eldri samning.
- Innbyggð Anthropic myndgreining hefur áður verið sérstaklega samþykkt;
  breytingin nú heimilar ekki nýjar provider-, billing- eða secret-aðgerðir.
- Mynd sem raunverulega er hlaðið upp er private og eyðist ekki sjálfkrafa.
  Eigandastýrð eyðing er afmörkuð aðgerð. JSON-only drög hafa enga mynd til að eyða.
- Strict JSON validation og varðveisla núllkrónulína halda gildi. Nýr samningur
  sýnir heildarmismun en notar hann ekki sem vistunar-/staðfestingarhindrun.
- `Design.md`: mobile-first 360/390/460px, 16px input, canonical loaders,
  minnst 40px touch targets, pending navigation, engin overflow/overlap/zoom regression.
- Canonical generic pilluhluti er nú notaður í heimilisverkum og skal endurnýttur.

## Current gate og candidate-staða

**Current gate: innskráð localhost-prófun á live v2 flæðinu.** UI-gátt er græn:
Stebbi sagði 2026-09-16 „Þetta er mun betra svona“. SQL-fríi skjárinn er áfram
á http://localhost:3004/preview/splitt-v032 með sýnigögnum í minni.

Versioned JSON/session/view contracts, BigInt summary, prepared service boundary,
application/server cutover scope og SQL184 migration/preflight/postflight eru nú
skrifuð og rýnd. SQL184 exact postflight stóðst og live routes hafa verið færðar
á v2; SQL uppsetning ein og sér uppfærði engar gagnaraðir. Gamalt split
uppfærist nákvæmlega við sína fyrstu v2 write og v1 writer hafnar því eftir það.

SQL184 preflight er exact READY samkvæmt röð Stebba 2026-09-16:
`operator_state=READY`, `predecessor_state=EXACT_INSTALLED`, `operator_ok=true`,
`targets_absent=true`. Migration/preflight/postflight hashes voru staðfest óbreytt.

SQL184 er exact installed samkvæmt actual postflight Stebba:
`operator_state=EXACT_INSTALLED`; `seal_ok`, `functions_ok`, `tables_ok`,
`no_client_policies`, `schema_private`, `tables_private`, `bucket_ok` öll true.
Ekki endurkeyra SQL184 preflight/migration/postflight.

Live detail-read, create/apply extraction, image flow, legacy copy, join og allar
deildar mutations nota nú v2 boundary. Accepted brotaval, aðskildar heildir,
owner edit/add, explanations, Eftir/Búið og participant pills eru á raunroute.
307/no-store/noindex auth-vörn er endurstaðfest. Agent hefur enga innskráða
browser-session; Stebbi þarf að gera þriggja skrefa localhost-próf áður en
candidate fer í release-rýni.

Meðan ný kvittun er undirbúin, hlaðin upp og myndgreind sýnir innlestrarskjárinn
canonical `TeskeidLoader`. Hann helst sýnilegur þar til vistaða splittið tekur
við; ef undirbúningur eða upphleðsla bregst kemur formið aftur með villu.

**NEI — EKKI KEYRA MEIRA SQL NÚNA.**

Final candidate evidence v034: 304 próf í 23 skrám PASS, type-check og afmarkað
lint PASS. Endanleg SQL/PLpgSQL parse: 50 migration statements/14 bodies og tvær
validation-skrár PASS án keyrslu. Generator er deterministic. SQL182/183 hashes
óbreytt. SQL184 hashes og rýni eru í README/v034 handoffi.

**NEI — EKKI KEYRA SQL NÚNA. SQL183 postflight er EXACT_INSTALLED,
öll níu boolean gates=true samkvæmt niðurstöðu Stebba.**
SQL182 postflight er áfram EXACT_INSTALLED, öll átta gates=true.
Stebbi sýndi SQL183 migration með Success. No rows returned.
Exact uppsetning og réttindi hafa staðist postflight; innskráð runtime er ekki staðfest.
Viðbót í yfirferð notar núverandi SQL182-vistun.
Stebbi skilaði actual SQL183 preflight READY og öllum 10 boolean gates=true.
Migration/preflight/postflight hashes eru óbreytt frá v028.
Fyrra next-step var innskráð synthetic prófun; Stebbi segir nú fyrra flæði virka.
v032-rýni er lokið með skýrum ákvörðunum og framkvæmdarleyfi Stebba.
HTTP endurpróf 22:14: /splitt er 200 með privacy-hausum og einkasíða
splitts er 307 á Teskeiðarinnskráningu með next. Engin endurræsing þarf.
Ekki endurkeyra migration.

Stebbi staðfesti með skjámynd að task-candidate er ræstur á localhost:3004.
Beint HTTP-próf fann middleware-áframsendingu /splitt á /login; eldri
Invoke-WebRequest fylgdi henni og 200/textaleit þess sannaði ekki lendingarsíðuna.
Það evidence er leiðrétt hér. /splitt er nú exact public lending; page-flags,
session-binding og membership-vörn gagnanna haldast. Beint curl án redirect-follow
skilar 200, no-referrer, noindex/nofollow/noarchive og no-store.
Einkasíða splitts skilar rétt 307 á Teskeiðarinnskráningu með next.
Innskráð tveggja notenda prófun er næsta skref fyrir
viðbætur í skiptingu; engin authenticated browser-session er aðgengileg
agent. Ekki þarf að endurræsa aftur.

- Stebbi sýndi SQL Editor fyrir SQL182 með „Success. No rows returned“.
  Þetta staðfestir árangur keyrslunnar samkvæmt skilaboðum Editor; exact
  body/catalog/access samanburður hefur nú staðist í afhentu postflight.

- Stebbi skilaði SQL182 preflight: operator_state=READY, öll sjö boolean gates=true,
  missing_columns=[]. Niðurstaðan opnar handvirkt apply; hún sannar ekki uppsetningu.
- SHA-256/bytes preflight, migration og postflight eru nákvæmlega óbreytt frá v022.

- Candidate inniheldur sjálfstætt JSON/mynd → yfirferð → staðfesting → deilihlekk
  → claims/pillusíun flæði. Enginn áfram-hlekkur fer úr því yfir í ÚL.
- Nýr kjarni: lib/receipt-split og components/receipt-split. SQL182 hefur eigið
  private schema; engin Expense-private-draft eða ledger-mutation.
- Innskráður Teskeiðarnotandi án ÚL má nota splittið. Session sannar actor;
  membership er afmarkað við split-ID. Profile-nafn er birting, ekki identity.
- Núverandi v1 krefst vistaðrar yfirferðar, réttrar heildarsummu og jákvæðrar
  claimable-línu. Nýr samþykktur v2-samningur fjarlægir heildarjöfnunarhindrun.
- 30 daga hlekkur fer í fragment á /splitt. Token hreinsast úr slóð og varðveitist
  í sessionStorage yfir innskráningu. Nýr hlekkur lokar þeim gamla; aðild helst.
- Claims sýna nafn, magn og eftirstöðvar. Samantekt felur óskiptan hluta í
  sömu nákvæmu afrúnun svo fyrsti þátttakandi beri ekki allan reikninginn.
- Generic pillur eru endurnýttar óbreyttar; síun sýnir valda liði og línufjárhæðir.
  Uppfærsla gerist við focus og á 8 sekúndna fresti meðan deilt splitt er opið.
- Óbirt eldri eigandakvittun getur afritað innlesnar línur inn í nýja kjarnann.
  Upprunamynd/eldri kvittun haldast óbreytt; published/finalized Expense er útilokað.
- Eyðing er tvíþætt með endurheimtanlegri stöðu ef Storage bregst. JSON skapar
  enga mynd. Upprunamynd nýs splitts er aðeins aðgengileg eiganda.
- SQL179/180 og postflight SQL180 hafa óbreytt SHA-256. SQL181 er enn
  **DRAFT HOLD / DO NOT RUN**; SQL182 byggir ekki á því.
- Staðfesting v028: 244 próf í 15 skrám PASS, type-check og afmarkað lint PASS.
  SQL183/preflight/postflight og PL/pgSQL parse PASS án SQL-keyrslu.
  SQL/PLpgSQL-parser samþykkti lokaskrár; ekkert SQL var keyrt. Eftir síðustu
  breytingu á migration-guard stóðust 6 SQL-contract próf aftur.
- Catalog/RLS-stillingar eru staðfestar með postflight Stebba. Full build,
  business-runtime/concurrency og authenticated browser bíða localhost-prófana.
  Dev server var ekki snertur; engin útgáfa fór fram.

## Framkvæmdarröð með ákveðinni Teskeiðarinnskráningu

1. SQL182 preflight er staðfest READY frá Stebba.
2. SQL182 migration skilaði Success hjá Stebba. Ekki endurkeyra hana.
3. Postflight Stebba er EXACT_INSTALLED og öll átta gates=true. Lokið.
4. Endurræsing og unauthenticated HTTP eru staðfest. Innskráð runtime-, auth-, concurrency- og mobile-próf fara fram
   á samræmdum candidate. Full build á sér stað án þess að trufla dev server.
5. Rýni og sérstakt release-samþykki fyrir commit/push/deploy. ÚL er áfram í bið.

Viðbót vegna nýrrar óskar 2026-09-15: SQL183 bætir eingöngu við
service-role RPC receipt_split_add_item_v1. Engin tafla/policy breytist;
SQL182 seal og lokabytes haldast. SQL183 preflight ber saman fyrri seal og
krefst þess að nýtt RPC-nafn sé ónotað; postflight bætir exact body/ACL-gate við.
Handvirk SQL183-gátt kemur á undan runtime-prófun viðbótar eftir staðfestingu.

## Shared paths og ownership

Einn writer á taskið. Núverandi sameiginleg yfirborð eru:

- `messages/is.json`, `messages/en.json`
- launcher/menu/access catalog og routes fyrir Splitta reikningnum
- `components/teskeid/TeskeidMultiSelectPillFilter.tsx` ef generic viðbót reynist nauðsynleg
- eldri receipt files undir `lib/expenses/`, `components/expenses/`
- task-owned canonical skjal og handoffs
- lib/auth/loginNext.ts, next.config.js og TeskeidAnalytics.tsx fyrir öruggan
  /splitt → innskráning → splitt hlekk

Weather-candidate má ekki afrita yfir messages eða aðrar sameiginlegar skrár.
Gamla aðalvinnumappan er varðveitt. Ekkert SQL181 er samþykkt til keyrslu.

## Localhost checks for Stebbi

**Nýja sýnigagnaviðmótið, án SQL:** http://localhost:3004/preview/splitt-v032

1. Veldu ½ eða ⅓ rauðvín og vistaðu. Prófaðu mínus/plús og sjáðu eigið magn.
2. Opnaðu „Búið að skipta“, veldu þátttakandapillu og sjáðu alla liði hans.
3. Breyttu magni/verði sem eigandi og sjáðu að kvittunarheild helst óbreytt.
   Prófaðu innsláttinn á síma. „Nýr sýnireikningur í yfirferð“ leyfir að hefja
   skiptingu þrátt fyrir mismun. Endurhleðsla endurstillir öll sýnigögn.

Eftirfarandi eldri checklist gildir raunverulegu v1-flæði, ekki nýja prófskjánum:

SQL182 gates og unauthenticated HTTP hafa staðist á staðfestu localhost-source.
Tilbúið JSON-prófgagn er í fixtures/espresso-zero-review.json.
Nákvæm checklist er í sql/validation/182-standalone-receipt-splits/README.md.
Eftir það skal á localhost:3004 með eigin synthetic gögnum prófa:

1. Gilt JSON án valinnar myndar stofnar varanlegt splitt; ógilt svar gefur
   sýnilega villu og tapar ekki textanum.
2. Núllkrónulína varðveitist og tekur við jákvæðri fjárhæð í sér yfirferð.
   Magn og upphæðir eru án óþarfa aukastafanúlla. Breytt fjárhæð uppfærir
   strax skilaboð um vöntun/umfram; prófa líka nákvæma jöfnun og tóman reit.
3. Staðfesting innlestrar sýnir deilihlekk, án greiðandaspurningar.
4. Viðurkenndur viðtakandi án ÚL-aðgangs getur tekið 1 af 4 espresso;
   nafn birtist og 3 eru eftir hjá öllum þátttakendum.
5. Tveir samtímis reyna að taka síðasta eintak; aðeins ein úthlutun tekst.
6. Pilla aðila sýnir hans liði/magn/upphæð; fjölval og hreinsun nota canonical hegðun.
7. Refresh, endurkoma og mobile keyboard varðveita rétta stöðu án overflow.
8. Óviðkomandi aðili sér ekki splittið; engin skuld/greiðsla eða ÚL-færsla verður til.

Prófa aðeins synthetic/eigin prófsgögn og samþykkjandi þátttakendur eftir
nákvæma afhendingu. Engin kærulaus Production-, boða-, eyðingar- eða fjárhagsprófun.

## Breytingaskrá og handoff-regla

Í hverju nýju handoffi skal vera **Breytingar á verkefnalýsingu**: hvað var
bætt við, leiðrétt eða tekið út og af hverju. Eldri afhent handoff eru óbreytt saga.
Þetta skjal heldur aðeins núverandi samningi, ekki mótsagnakenndum gömlum gates.
v020 skráir sérstaklega JSON án myndar, standalone/link/visual/pill scope,
frestun ÚL og HOLD á SQL181.
v021 skráir ákvörðun Stebba um Teskeiðarnotanda án ÚL-kröfu, lokun
aðgangsspurningarinnar og afmarkaða fjarlægingu rangs ÚL-hlekks. Tilheyrandi
navigation/server-próf voru þá 8/8 PASS og type-check PASS.
v022 skráir nýja standalone-útfærslu, session-bound hlekkjaaðild,
review/confirm-skil, sérskref núllkrónulína, canonical pillur, nákvæmar
samantektir, legacy-afritun, eyðingarendurheimt, nýjan SQL182-pakka og
raunverulegt stopp við handvirkan preflight.
v023 skráir actual READY-niðurstöðu Stebba, óbreytt SQL-bytes og framhald í
handvirka SQL182-uppsetningu. Product-samningur og app-kóði breyttust ekki.
v024 skráir Success-skjámynd Stebba, óbreytt SQL-hashes og næstu
catalog-only postflight-gátt. App/runtime eru ekki merkt staðfest.
v025 skráir actual EXACT_INSTALLED og átta true, lokar SQL-gáttinni,
leiðréttir röð privacy-hausareglna, bætir header-regressionprófi og synthetic
JSON-fixture við. Næsta gate er endurræsing Stebba á réttu localhost-source,
síðan HTTP og innskráð notendaprófun; product-kröfur eru óbreyttar.
v026 staðfestir endurræsingu Stebba, leiðréttir fyrra redirect-follow evidence,
lagar exact /splitt middleware-aðgang og staðfestir HTTP án áframsendingar.
227 próf, type-check og afmarkað lint standast. Næst eru innskráð notendapróf.
v027 bætir við kröfu Stebba um lifandi, nákvæman fjárhæðamismun og
tölusnið án óþarfa núlla. Innleiðir form- og samantektarsnið án breytinga á
geymslueiningum eða gjaldmiðlalista. 237 próf, type-check og lint PASS.
v028 bætir við ósk um nýja liði fyrir/eftir staðfestingu, sama formi,
óbreyttu fyrra magni og skýrri hegðun heildar. SQL183 er nýtt ókeyrt RPC,
eigandatakmörkun skráð sem útfærsluforsenda og preflight er núverandi gate.
244 próf PASS; SQL182 óbreytt.
v029 skráir actual SQL183 READY frá Stebba, óbreytt artifact-hashes og
afhendingu migration. App-kóði og product-samningur breyttust ekki.
v030 skráir SQL183 Success-skjámynd Stebba, óbreytt migration/postflight
hashes og næstu catalog-only postflight-gátt. Runtime bíður prófunar.
v031 skráir actual SQL183 EXACT_INSTALLED og níu true, lokar SQL-gátt og
staðfestir óinnskráð HTTP. Innskráð synthetic owner-add/claim/concurrency
og mobile-prófun er næst; ekkert app eða SQL breyttist.
v032 skráir að Stebbi segir fyrra flæði virka og biður um einn rýnihring
á næstu breytingum. Nýtt markmið og tillögur eru aðgreind frá núverandi kóða;
engin UI/SQL-breyting framkvæmd. Handoff inniheldur framsetningu, magn-/verð-
reglur, exact þriðjunga, tvær heildir, concurrency og localhost-checklist.
Sama v032 inniheldur viðbótarósk um lifandi flokkun/fullskipta skúffu sem
barst áður en handoffið var afhent. Engin app-breyting framkvæmd.
Skýringar við liði bættust einnig í v032 fyrir afhendingu, með optional
JSON-/gagnasamningi og skýrum mun á upprunalegu heiti og skýringu.
v033 skráir skýrt framkvæmdarleyfi Stebba, læsir scale=3000, tveimur heildum,
owner-edit og núllverðsreglu sem hafnar breytingu ef claims eru til. Skráir
SQL-frían dev-prófskjá, prepared JSON/session adapters og mobile/test evidence.
Leiðréttir eldri texta sem sagði v032 bíða leyfis. Raunverulegt v1-flæði er
aðgreint frá v2-markmiði; SQL182/183 eru óbreytt og nýtt SQL ekki tilbúið.
v034 skráir UI-sannprófun Stebba, fullan v2 undirbúning og rýni. Whole-split
revision var tekið af claim eftir rýni svo óskyldir þátttakendur rekist ekki á;
item revision, previous-own quantity, capacity og parent lock halda stale-vörn.
SQL184 er additive/lazy, Expense scale helst óbreytt og v1 writers fail-closed
eftir upgrade. 304 próf og parser/type/lint gates standast. Næsta eigendagátt er
catalog-only SQL184 preflight; migration er ekki enn afhent til keyrslu.
v035 skráir actual SQL184 preflight sem exact READY með öllum fjórum gildum,
staðfestir óbreytta artifact-hashes og afhendir migration sem næstu handvirku
SQL-gátt. Enginn kóði eða SQL bytes breyttust; ekkert SQL var keyrt af Codex.
v036 skráir actual migration Success úr skjámynd Stebba, staðfestir óbreytta
migration/postflight hashes og afhendir read-only postflight sem næstu SQL-gátt.
Success er ekki ranglega jafnað við exact install eða runtime; engin migration
endurkeyrsla, app cutover eða live v2 vistun er opnuð fyrr en postflight er grænt.
v037 skráir actual SQL184 `EXACT_INSTALLED` með öllum sjö gates true og lokar
SQL-gáttinni. Live standalone flæði er fært á v2 read/write/extraction/join;
Expense scale1000 er óbreytt. 307 auth/privacy headers, 307 tests í 24 skrám,
type-check og lint standast. Næsta raunverulega stopp er innskráð localhost-próf
Stebba á synthetic/eigin splitti; ekkert meira SQL eða release er heimilað.
v038 bætir canonical Teskeið-loader við virka myndinnlestraraðgerðina. Loaderinn
þekur undirbúning, private upload og myndgreiningu og helst sýnilegur fram að
navigation. Focused UI-próf (11/11) og type-check standast; localhost-gáttin er
óbreytt og ekkert SQL var snert.
v039 einfaldar aðeins yfirferðina fyrir deilingu: nákvæmt kvittunarheiti,
íslensk skýring og inline magn/upphæð; claim-controls og Eftir/Búið haldast
eingöngu á sharing-skjánum. Innbyggði extractor biður nú um nákvæmt prentað
heiti og stutta íslenska skýringu. 26 focused próf, type-check og lint standast;
ekkert SQL eða gagnalíkan breyttist.
v040 fjarlægir sýnilega prompt-skúffu úr manual AI-leiðinni. Ein leiðbeining,
`Afrita`/`Afritað` og JSON-svarreitur eru sýnileg; fullur prompt er aðeins settur
á clipboard. 12/12 focused UI-próf, type-check og lint standast.
v041 gerir kvittunarheild inline í review, endurnefnir sharing-toggle og
sameinar save-review + confirm í retry-safe server action. 19/19 focused próf,
type-check og lint standast. Full suite: 8017 pass en 4 óskyld booking-próf falla
og curated route release artifact vantar; því er production-release ekki merkt
grænt fyrr en þessi repo-wide gates og localhost-próf hafa verið afgreidd.
v042 skráir samþykkta production-útgáfu. Commit `71e44cf` var push-að á `main`
og Vercel deployment `dpl_41yuSzha8EXLNCobPTMxvMirVBUH` varð `Ready` með
production aliases, þar á meðal `teskeid.is`. Engin migration var keyrð og engum
Vercel env-breytum var breytt. AI-myndgreining virkjar Stebbi sérstaklega með
`EXPENSE_RECEIPT_AI_ENABLED`, `ANTHROPIC_API_KEY` og `EXPENSE_RECEIPT_MODEL`.
