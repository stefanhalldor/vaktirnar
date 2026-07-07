# TODO 067 - v128 Codex handoff: beta-banner fyrir staðbundna vegarkaflaþekkingu

Created: 2026-07-07 10:18  
Timezone: Atlantic/Reykjavik

## Staða

Stebbi vill bæta í prófanaútgáfu-bannerinn efst í Ferðaveðrinu þannig að notendur, sérstaklega fólk með staðbundna vegakaflaþekkingu, sendi ábendingar í Facebook skilaboðum.

Kjarnahugmyndin er rétt: Ferðaveðrið á ekki bara að lesa veðurspá. Það á síðar líka að geta tekið tillit til staðbundinnar þekkingar um íslenska vegarkafla, vindáttir, hviður, hliðarvind, landslag og farartæki.

Codex mælir samt með að bannerinn sjálfur verði stuttur. Hann á að kalla eftir ábendingum, ekki útskýra allt framtíðarlíkanið.

## Findings / áhætta

### 1. Bannerinn má ekki lofa virkni sem er ekki komin

Núverandi ferðaveður notar deterministic veðurmat úr leið, tíma og spápunktum. Staðbundin vegarkaflaþekking er ekki komin inn sem formlegt gagnalag eða risk modifier.

Textinn má því ekki segja að Teskeið taki nú þegar tillit til allra svona atriða. Rétt orðalag er eitthvað á borð við:

- "Við erum að safna..."
- "Sendu okkur dæmi..."
- "Þetta hjálpar okkur að styrkja ferðaveðrið..."

Ekki:

- "Ferðaveðrið veit..."
- "Við tökum tillit til..."
- "Matið notar..."

### 2. Ekki setja allan dæmalistann í bannerinn

Listinn sem Stebbi skrifaði er góður sem product/model notes, en of langur fyrir top-banner. Ef hann fer óbreyttur í UI verður bannerinn of hár á mobile og notandi þarf að lesa of mikið áður en hann kemst í aðalverkefnið.

Hafið bannerinn sem stutt call-to-action og geymið nákvæma áhættuflokkun í handoffinu eða framtíðar docs/data-model.

### 3. Þetta er data-model hugmynd, ekki bara copy

Í fyrsta áfanga er þetta bara banner-copy. En mikilvægt er að skilgreina merkinguna strax:

Staðbundin vegarkaflaþekking á síðar að vera "risk modifier", ekki hörð regla. Hún hækkar eða lækkar áhættumat eftir samhengi, t.d. vindátt, farartæki, hviður og staðsetningu.

## Tillaga að Phase 1 framkvæmd

Claude Code: breyttu aðeins banner-texta og þýðingum. Ekki breyta veðurmati, thresholds, route logic, API köllum, Supabase eða gagnagrunni í þessum áfanga.

Núverandi staðir sem líklega þarf að snerta:

- `components/weather/WeatherBetaBanner.tsx`
- `messages/is.json`
- `messages/en.json`

Núverandi Facebook hlekkur er þegar til í `WeatherBetaBanner`:

`https://www.facebook.com/profile.php?id=61590612753245`

## UI copy

Mælt er með að halda núverandi title:

IS:

`Prófanaútgáfa`

EN:

`Test version`

Mælt er með að uppfæra body textann eða bæta við einum stuttum second-line texta. Best væri að halda þessu sem 1-2 stuttar málsgreinar í banner, ekki bullet-lista.

Tillaga að íslensku:

`Við erum að þróa ferðaveðrið. Berðu matið saman við opinbera veðurspá og aðstæður á vegum. Sendu okkur endilega Facebook-skilaboð með skjámynd ef eitthvað er óskýrt, rangt eða ef þú þekkir vegarkafla þar sem vindátt, hviður, hliðarvindur eða eftirvagn breytir áhættunni.`

Styttri valkostur ef þetta verður of langt á mobile:

`Við erum að þróa ferðaveðrið. Berðu matið saman við opinbera veðurspá og aðstæður á vegum. Þekkirðu vegarkafla þar sem vindátt, hviður, hliðarvindur eða eftirvagn breytir áhættunni? Sendu okkur dæmi á Facebook.`

Tillaga að ensku:

`We are still developing the travel weather assessment. Compare it with official forecasts and road conditions. If you know a road section where wind direction, gusts, crosswind or trailers change the risk, send us a Facebook message with a screenshot and explanation.`

CTA má áfram vera:

IS:

`Senda ábendingu`

EN:

`Send feedback`

## Design.md viðmið

Viðeigandi Design.md atriði:

- Allur notendatexti skal vera í `messages/is.json` og `messages/en.json`.
- Hanna fyrst við 360-460 px breidd.
- Texti má ekki skarast eða flæða út úr controls.
- Controls, texti og page-wrapper mega ekki valda láréttu overflowi.
- Appið á að vera mobile-first og ekki ýta aðalverkefninu of langt niður.

Acceptance criteria fyrir banner:

- Banner helst læsilegur á 360 px breidd.
- Enginn láréttur overflow.
- Facebook linkur er enn keyboard/focus accessible.
- Bannerinn er greinilega prófanaútgáfu-feedback, ekki villuviðvörun.
- Textinn lofar ekki að local risk modifiers séu þegar í notkun.

## Product notes fyrir seinni fasa

Þetta á að verða staðbundið "risk modifier" lag síðar. Ekki setja þetta inn í deterministic matið fyrr en það er komið formlegt gagnalíkan og review.

Gott framtíðarform fyrir svona færslur gæti verið:

- `roadSegmentName`: heiti eða lýsing á kafla.
- `from` / `to`: staðir eða route anchors.
- `geometry`: valfrjálst polyline eða bounding area.
- `directionOfTravel`: ef áhætta er mismunandi eftir akstursstefnu.
- `windDirection`: t.d. norðanátt, suðvestanátt, vestanátt.
- `riskType`: hliðarvindur, hviður, landslag, brú/heiði/dalur, skyggni o.s.frv.
- `vehicleTypes`: bíll, háir bílar, eftirvagn, kerrur, hjólhýsi, fellihýsi.
- `effect`: hækkar áhættu, lækkar áhættu eða breytir vægi hviða/meðalvinds.
- `confidence`: óstaðfest, staðfest af notendum, staðfest af admin.
- `notes`: mannamálslýsing eða dæmi.
- `source`: feedback, admin, sérfræðingur, önnur heimild.

Dæmi úr pælingu Stebba sem framtíðarlagið þarf að geta lýst:

- Á ákveðnum kafla skal sérstaklega flagga norðanátt.
- Á ákveðnum kafla skal sérstaklega flagga suðvestanátt.
- Hliðarvindur getur verið verri fyrir hjólhýsi, fellihýsi, háa bíla og kerrur.
- Vindur getur orðið varasamur þótt meðalvindur virðist ekki mjög hár.
- Á sumum köflum skiptir vindhviða meira máli en meðalvindur.
- Betra getur verið að keyra fyrr eða síðar ef vindátt snýst.
- Mikill munur getur verið á akstri með og án eftirvagns.

## Ekki gera í þessum áfanga

- Ekki breyta thresholds.
- Ekki breyta veðurmati.
- Ekki bæta við Supabase töflu eða migration.
- Ekki bæta við feedback-formi inni í appinu.
- Ekki bæta við admin UI fyrir vegarkafla.
- Ekki gera nýja risk modifier logic fyrr en Stebbi biður sérstaklega um það.

## Prófanir / checks fyrir Claude Code

Keyra eftir breytingu:

- `npm run type-check`
- `npm run test:run`

Ef aðeins message texti og banner markup breytist gæti test suite verið óbreytt, en type-check og núverandi tests eiga samt að vera græn áður en Stebbi prófar.

## Localhost checks for Stebbi

Opna á localhost:

- `/auth-mvp/vedrid`
- Ferðalagið flæði, t.d. leið frá Garðabæ til Akureyrar.

Prófa:

1. Staðfesta að banner birtist efst á veðurskjánum og í ferðalaginu.
2. Lesa bannerinn á mobile breidd, t.d. 360-390 px.
3. Staðfesta að textinn sé skýr en ekki of þungur.
4. Smella á `Senda ábendingu`.
5. Staðfesta að Facebook linkur opnist í nýjum tab/glugga.
6. Staðfesta að enginn láréttur overflow eða texta-overlap komi í banner.
7. Staðfesta að bannerinn virki sem prófanaútgáfu-feedback, ekki sem rauð viðvörun eða ábyrgðaryfirlýsing.

Passa sérstaklega:

- Bannerinn má ekki ýta aðalflæðinu óþægilega langt niður.
- Textinn má ekki hljóma eins og staðbundin áhættulögík sé þegar farin að hafa áhrif á niðurstöður.
- Enska útgáfan þarf að vera til staðar ef locale er `en`.

## Óvissa / þarf að staðfesta

- Codex skoðaði núverandi `WeatherBetaBanner` og message-lykla, en ekki allt ferðaveðursflæðið í browser.
- Ef Claude Code sér að bannerinn verður of hár á mobile, skal velja styttri íslenska textann hér að ofan.
- Ef Stebbi vill síðar safna þessum ábendingum inni í appinu í stað Facebook, þarf sér plan með data model, privacy, RLS og admin review.
