# TODO 067 - v129 Codex review: v127 forecast distance + v128 local road risk banner

Created: 2026-07-07 10:22  
Timezone: Atlantic/Reykjavik

## Samantekt

Þetta skjal sameinar:

1. Codex rýni á `2026-07-07-1020-todo-067-v127-claude-forecast-distance.md`.
2. Áframhaldandi handoff úr Codex v128 um prófanaútgáfu-banner og staðbundna vegarkaflaþekkingu.

Niðurstaða Codex: Claude v127 er ekki með blocking issue. Type-check og tests eru græn. Það er þó eitt mikilvægt orðalags-/nákvæmnisatriði sem þarf að hafa í huga: kóðinn reiknar fjarlægð frá met.no spápunkti að völdum route sample point, ekki endilega stystu fjarlægð að sjálfri route polyline.

## Findings

### Low - Textinn segir "frá leiðinni", en útreikningurinn er frá route sample point

Skrár:

- `components/weather/travelAuditMap.helpers.ts:143-144`
- `components/weather/travelAuditMap.helpers.ts:253-258`
- `components/weather/TravelAuditMap.tsx:600-605`
- `messages/is.json:688-689`

Claude v127 reiknar:

`haversineMeters(getRoutePointLatLng(pt), getForecastPointLatLng(pt))`

Þetta er fjarlægð milli veðurspápunktsins og þess leiðarpunkts sem við höfum valið/samplað. Það er gagnlegt og líklega nægilega gott fyrir MVP, sérstaklega ef route-sampling er orðið þétt. En tæknilega séð er þetta ekki endilega stysta fjarlægð frá spápunkti að veglínu / polyline.

Núverandi texti:

`Spápunkturinn er um {meters} m frá leiðinni...`

Ef Stebbi vill hámarks nákvæmni í orðalagi, mæli ég frekar með:

`Spápunkturinn er um {meters} m frá þessum leiðarpunkti. Veðurmatið notar þennan met.no punkt vegna þess að spáin er á hnitaneti.`

Eða mýkra:

`Spápunkturinn er um {meters} m frá metna leiðarpunktinum. Veðurmatið notar þennan met.no punkt vegna þess að spáin er á hnitaneti.`

Þetta þarf ekki að blokka prerelease ef Stebbi er sáttur við "frá leiðinni" sem mannamálsnálgun, en ef notendur verða að geta sannreynt þetta nákvæmlega er betra að forðast overclaim.

### Low - `< 50m` message branch er líklega óaðgengileg eins og Claude bendir á

Skrár:

- `components/weather/TravelAuditMap.tsx:595-605`
- `components/weather/travelAuditMap.helpers.ts:47-51`

Panel section birtist aðeins þegar `summary.hasSeparateForecastPoint` er true. Það verður true þegar route point og forecast point eru meira en 50m frá hvort öðru. Þess vegna birtist `forecastPointOnRoute` líklega ekki núna.

Þetta er ekki vandamál í keyrslu. Það er bara örlítil dauð grein til framtíðar. Hún má vera áfram.

### No blocker - Próf ná yfir helper útreikninginn

Skrá:

- `lib/__tests__/travelAuditMap.helpers.test.ts:234-252`

Claude bætti við testum fyrir:

- 0m þegar route og forecast coords eru eins.
- jákvæða fjarlægð þegar coords eru ólík.
- sirka 2km offset með væntanlegu bili.

Það vantar ekki blocker test fyrir UI textann, en helper-testin ná kjarna útreikningsins.

## Staðfesting á Claude v127

Claude v127 segir að þetta hafi verið gert:

- `PointSummary` fékk `forecastDistanceFromRouteM`.
- `buildPointSummary` reiknar fjarlægð með Haversine.
- `TravelAuditMap` sýnir concrete distance texta í stað óljósrar línu.
- `messages/is.json` og `messages/en.json` fengu nýja lykla.
- `travelAuditMap.helpers.test.ts` fékk 3 ný tests.

Codex staðfesti í kóða að þetta er til staðar:

- `components/weather/travelAuditMap.helpers.ts:143-144`
- `components/weather/travelAuditMap.helpers.ts:257-258`
- `components/weather/TravelAuditMap.tsx:600-605`
- `messages/is.json:687-689`
- `messages/en.json:683-685`
- `lib/__tests__/travelAuditMap.helpers.test.ts:234-252`

## Skipanir keyrðar af Codex

Codex keyrði:

```bash
npm run type-check
```

Niðurstaða:

- Exit code: 0
- `tsc --noEmit` grænt.

Codex keyrði:

```bash
npm run test:run
```

Niðurstaða:

- Exit code: 0
- 53 test files passed
- 1759 tests passed
- 27 skipped
- 8 todo

## V127 niðurstaða

Codex telur Claude v127 tilbúið í localhost prófun hjá Stebba.

Eina ákvörðunin sem eftir stendur:

- Halda textanum sem "frá leiðinni" sem einfaldri notendavænni nálgun.
- Eða breyta textanum í "frá þessum leiðarpunkti" til að vera tæknilega nákvæmari.

Mín ráðlegging: fyrir prerelease má halda þessu ef Stebbi vill ekki hægja á flæðinu. En ef við erum að byggja traust í audit UI væri nákvæmara orðalag betra.

## Næsti framkvæmdarhluti úr v128: beta-banner um staðbundna vegarkaflaþekkingu

Stebbi vill bæta í prófanaútgáfu-bannerinn efst í Ferðaveðrinu þannig að notendur, sérstaklega fólk með staðbundna vegakaflaþekkingu, sendi ábendingar í Facebook skilaboðum.

Kjarnahugmyndin:

Ferðaveðrið á ekki bara að lesa veðurspá. Það á síðar líka að geta tekið tillit til staðbundinnar þekkingar um íslenska vegarkafla, vindáttir, hviður, hliðarvind, landslag og farartæki.

Codex mælir samt með að bannerinn sjálfur verði stuttur. Hann á að kalla eftir ábendingum, ekki útskýra allt framtíðarlíkanið.

### Mikilvæg áhætta

Bannerinn má ekki lofa virkni sem er ekki komin.

Núverandi ferðaveður notar deterministic veðurmat úr leið, tíma og spápunktum. Staðbundin vegarkaflaþekking er ekki komin inn sem formlegt gagnalag eða risk modifier.

Textinn má því ekki segja að Teskeið taki nú þegar tillit til allra svona atriða.

Rétt orðalag:

- "Við erum að safna..."
- "Sendu okkur dæmi..."
- "Þetta hjálpar okkur að styrkja ferðaveðrið..."

Forðist:

- "Ferðaveðrið veit..."
- "Við tökum tillit til..."
- "Matið notar..."

### Ekki setja allan dæmalistann í bannerinn

Listinn sem Stebbi skrifaði er góður sem product/model notes, en of langur fyrir top-banner. Ef hann fer óbreyttur í UI verður bannerinn of hár á mobile og notandi þarf að lesa of mikið áður en hann kemst í aðalverkefnið.

Hafið bannerinn sem stutt call-to-action og geymið nákvæma áhættuflokkun í handoffinu eða framtíðar docs/data-model.

## Tillaga að Phase 1 framkvæmd fyrir Claude Code

Claude Code: breyttu aðeins banner-texta og þýðingum. Ekki breyta veðurmati, thresholds, route logic, API köllum, Supabase eða gagnagrunni í þessum áfanga.

Núverandi staðir sem líklega þarf að snerta:

- `components/weather/WeatherBetaBanner.tsx`
- `messages/is.json`
- `messages/en.json`

Núverandi Facebook hlekkur er þegar til í `WeatherBetaBanner`:

`https://www.facebook.com/profile.php?id=61590612753245`

## UI copy fyrir banner

Halda title:

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

## Design.md viðmið fyrir banner

Viðeigandi Design.md atriði:

- Allur notendatexti skal vera í `messages/is.json` og `messages/en.json`.
- Hanna fyrst við 360-460 px breidd.
- Texti má ekki skarast eða flæða út úr controls.
- Controls, texti og page-wrapper mega ekki valda láréttu overflowi.
- Appið á að vera mobile-first og ekki ýta aðalverkefninu of langt niður.

Acceptance criteria:

- Banner helst læsilegur á 360 px breidd.
- Enginn láréttur overflow.
- Facebook linkur er enn keyboard/focus accessible.
- Bannerinn er greinilega prófanaútgáfu-feedback, ekki villuviðvörun.
- Textinn lofar ekki að local risk modifiers séu þegar í notkun.

## Product notes fyrir seinni fasa: staðbundin áhættuflögg

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

## Ekki gera í næsta áfanga

- Ekki breyta thresholds.
- Ekki breyta veðurmati.
- Ekki bæta við Supabase töflu eða migration.
- Ekki bæta við feedback-formi inni í appinu.
- Ekki bæta við admin UI fyrir vegarkafla.
- Ekki gera nýja risk modifier logic fyrr en Stebbi biður sérstaklega um það.

## Prófanir / checks fyrir Claude Code eftir banner breytingu

Keyra eftir breytingu:

```bash
npm run type-check
npm run test:run
```

Ef aðeins message texti og banner markup breytist gæti test suite verið óbreytt, en type-check og núverandi tests eiga samt að vera græn áður en Stebbi prófar.

## Localhost checks for Stebbi

### Forecast distance úr v127

Opna á localhost:

- `/auth-mvp/vedrid`
- Ferðalagið flæði, t.d. Garðabær til Akureyrar eða Garðabær til Grímsness.

Prófa:

1. Reikna ferð sem sýnir interactive route map.
2. Smella á punkt þar sem `Punktur á leið` og `Spápunktur met.no` eru ekki nákvæmlega sama hnit.
3. Staðfesta að detail panel sýni fjarlægð í metrum eða km.
4. Meta hvort textinn "frá leiðinni" er nógu skýr, eða hvort Stebbi vill frekar "frá þessum leiðarpunkti".
5. Smella á `Skoða veðurspá` og bera saman við punktinn sem birtist.

Expected:

- Ekki lengur óljóst "hann getur verið örlítið frá veginum".
- Notandi sér concrete tölu, t.d. "um 280 m" eða "um 1,4 km".
- Engin console villa tengd þessum detail panel.

### Banner úr v128

Opna á localhost:

- `/auth-mvp/vedrid`
- Ferðalagið flæði.

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

- Codex rýndi v127 kóðann og keyrði type-check/tests, en prófaði ekki browser UI.
- Worktree er mjög óhreint með mörgum ócommittuðum og untracked veðurskrám. Codex afmarkaði rýnina við v127 handoff-scope og v128 banner handoff.
- Ef Stebbi vill að fjarlægðin sé bókstaflega stysta fjarlægð að route polyline, þarf sér útfærslu með point-to-polyline distance. Núverandi v127 er fjarlægð að völdum route sample point.
- Ef Stebbi vill síðar safna vegarkaflaábendingum inni í appinu í stað Facebook, þarf sér plan með data model, privacy, RLS og admin review.
