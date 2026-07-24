# Handoff — TODO #91 Akstur default, mini-kort og einfalt stórt Kort

Created: 2026-07-24 11:03  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Relevant TODO: #91 — Veður: basemap refresh og kortapússun

## Skilningur á samþykki

Stebbi samþykkti að Codex:

- opnaði appið sjálfgefið undir `Akstur`, ekki á stóra kortinu;
- miðaði fyrstu Akstur-sýn við brottför `Núna`;
- setti lítið gagnvirkt leiðarkort undir Elta veðrið/samanburðinn;
- sýndi versta punkt sjálfgefið og leyfði val á öðrum punkti;
- setti alla spápunkta í collapsed skúffu;
- lagaði raw translation keys;
- einfaldaði stóra `Kort`;
- lét `Kort` opna sömu leið og brottfarartíma úr Akstur;
- bætti þar við pillum fyrir brottfararspá og Vegagerðina;
- fjarlægði stóra route-detail/bottom-card samsetninguna af kortinu;
- skrifaði handoff.

Samþykkið fól í sér kóða-, messages-, prófa- og handoff-breytingar. Það fól
ekki í sér commit, push, deploy, migration, Supabase-, env-, secrets-, billing-
eða production-breytingar.

## Hvað var gert

### Sjálfgefið Akstur og Núna

- `isPanelOpen` byrjar nú `true`.
- `lastMapContext` byrjar nú sem `route`.
- Þegar route er submit-að eða skipt um route option helst Akstur-panel opið.
- Full Veðurstofu departure timeline er byggð sjálfkrafa eftir route-reikning.
- Fyrsti candidate, sem er nákvæmur `Núna`-brottfarartími, verður virkur
  forecast candidate.
- Sama valda candidate-state fylgir þegar notandi fer í `Kort`.

### Lítið kort undir Elta veðrið

- Nýtt provider-frjálst SVG route-kort var sett í `DriveJourneyPanel`.
- Kortið notar:
  - `auditPolylinePoints` úr sömu route-niðurstöðu;
  - matched Veðurstofustöðvar;
  - status-liti sömu threshold-classification;
  - hvítan route-outline og Teskeið-græna route-línu.
- Engin ný API-köll, tile provider eða map engine eru notuð.
- Punktar eru smellanlegir og keyboard-virkir með Enter/Space.

### Versti og valinn punktur

- Versti punktur er valinn sjálfgefið.
- Smellur á punkt í mini-korti sýnir fulla `VedurstofanPointCard` fyrir þann
  punkt beint undir kortinu.
- Valinn punktur er merktur stærri á kortinu.
- `Fara á versta punkt` birtist þegar notandi hefur valið annan punkt.

### Collapsed allir spápunktar

- Allur opni listinn var færður í native `<details>`.
- Skúffan er lokuð sjálfgefið.
- Titill:
  `Allir spápunktar á leiðinni`.
- Station-count birtist hægra megin í summary-röðinni.
- Við opnun birtast öll fullu Veðurstofuspjöldin.

### Þýðingar

Raw keys komu vegna þess að `DriveJourneyPanel` sótti road-map lykla úr röngu
namespace.

Lagað:

- `roadMapPrototypeScrubberNow` er nú sótt með
  `teskeid.vedrid.ferdalagid`.
- `roadMapPrototypeVedurstofanStationCount` er nú sótt úr sama rétta
  namespace.
- Aðrir road-map lyklar í panelnum voru samræmdir við sama namespace.
- Nýir is/en lyklar:
  - `allRouteForecastPointsDrawer`;
  - `roadMapPrototypeMapDeparturePill`.

### Einfaldara stórt Kort

Gamla stóra bottom-strip samsetningin var fjarlægð úr route-map context:

- simple/detailed toggle;
- status pill-listi;
- opna-brottfararspá card;
- compact station card;
- full route-detail disclosure;
- tvöfaldur scrubber;
- stóra route-detail boxið.

Í staðinn eru tvær pillur:

1. `Vegagerðin`
   - sýnir núverandi mælingar;
2. `Brottför {tími}`
   - sýnir Veðurstofuspá miðað við valinn brottfarartíma.

`Brottför` er sjálfgefin eftir að route hefur reiknast. Notandi getur skipt
milli þess og Vegagerðarinnar án þess að missa route eða tímaval.

## Skrár sem Codex breytti

- `components/weather/DriveJourneyPanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/__tests__/drive-journey-panel.test.ts`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-24-1103-todo-091-v005-codex-drive-default-mini-map.md`

## Fyrirliggjandi breytingar

- `.obsidian/workspace.json` var þegar breytt og var ekki snert af Codex.
- Fyrri TODO #91 breytingar úr v004 voru þegar í núverandi kóðastöðu og voru
  ekki afturkallaðar.

## Prófanir og skipanir

1. `npm.cmd run test:run -- lib/__tests__/drive-journey-panel.test.ts lib/__tests__/weather-travel.test.ts lib/__tests__/road-intelligence-route-slot-statuses.test.ts lib/__tests__/weather-vedurstofan-blend.test.ts`
   - Exit code: 0
   - 4 test files passed
   - 149 tests passed
   - 5 tests skipped
2. `npm.cmd run type-check`
   - Exit code: 0
3. `npm.cmd run build`
   - Exit code: 0
   - Next.js production build completed
   - Aðeins fyrirliggjandi lint warnings komu fram
4. `git diff --check`
   - Exit code: 0
   - Aðeins Windows CRLF warnings

## Ný/uppfærð próf

`drive-journey-panel.test.ts` staðfestir nú einnig:

- að route-coordinate vörpun setji endapunkta rétt innan SVG mini-map bounds.

Fyrri próf staðfesta áfram:

- ETA eftir route-fraction;
- val á næstu Veðurstofuspáröð;
- threshold classification;
- comparison row conversion án Yr/met.no links.

## Hvað var ekki gert

- Dev server var ekki ræstur.
- Browser-/localhost-prófun var ekki framkvæmd.
- Engin interpolation milli 3 klst. spátíma var útfærð.
- Engin route-, provider- eða Supabase-lógík var breytt.
- Ekkert commit, push eða deploy var gert.

## Design.md samræmi

- Akstur er sjálfgefin app-sýn.
- Mini-kortið er responsive `viewBox` SVG og veldur ekki horizontal overflow.
- Punktar hafa bæði pointer og keyboard interaction.
- Detail-listinn er lokaður sjálfgefið og minnkar sjónrænt álag.
- Stóra kortið hefur aðeins tvo skýra mode-controls.
- Allur nýr notendatexti er í is/en messages.
- Touch controls nota minnst um 40 px hæð þar sem við á.

## Route intelligence check

- Sama route polyline, routeFraction, duration og candidate-state er endurnýtt.
- Engin ný canonical segment- eða provider-binding þekking var búin til.
- `IcelandRoadmap.md` þurfti ekki uppfærslu.
- Engin nákvæm route query eða notendastaðsetning er nýlega geymd.

## Áhætta / þarf að staðfesta

1. **Mini-kort er schematic**
   - SVG-kortið sýnir rétta route geometry hlutfallslega en hefur ekki basemap.
   - Þetta er viljandi létt mini-kort, en Stebbi þarf að staðfesta að það sé
     nógu læsilegt.
2. **Mjög láréttar/lóðréttar leiðir**
   - Bbox projection teygir leiðina að component bounds.
   - Hún getur litið ýkt út á mjög stuttri eða nær-beinni leið.
3. **Station coordinates**
   - Aðeins matched Veðurstofustöðvar með lat/lon sjást á mini-korti.
4. **Endpoint comparison**
   - Eins og í v004 notar samanburður fyrsta/síðasta matched station sem proxy.
5. **Kort point detail**
   - Stóra kortið sýnir nú aðeins mode-pillurnar í bottom strip.
   - Fyrri compact station card er ekki lengur sýnilegt þar.
6. **Translation scan**
   - Tvö staðfest raw-key tilvik voru lagfærð. Browser-próf þarf að staðfesta að
     enginn annar lykill leki við mismunandi states.

## Localhost checks for Stebbi

### Forsendur

- Stebbi keyrir dev server sjálfur.
- Opna `/auth-mvp/vedrid/road-map-prototype`.
- Nota route með nokkrum Veðurstofustöðvum.
- Engin Supabase-, auth-, billing-, secrets- eða production-breyting er hluti
  prófsins.

### Default opnun

1. Endurhlaða síðuna.
2. Vænt:
   - `Akstur` er virk pilla;
   - route-formið er opið;
   - stóra kortið er ekki aðalsýnin.
3. Reikna leið.
4. Vænt:
   - Akstur helst opið;
   - fyrsta valið er `Núna`;
   - enginn raw translation key birtist í scrubber eða station-count.

### Mini-kort og punktaval

1. Scrolla niður fyrir samanburðartöfluna.
2. Vænt:
   - lítið route-kort birtist;
   - route-lína og Veðurstofupunktar sjást;
   - versti punktur er stærri/valinn;
   - fulla spjaldið undir kortinu sýnir versta punkt.
3. Smella á annan punkt.
4. Vænt:
   - punkturinn verður valinn/stærri;
   - detail-spjaldið skiptir yfir í valinn punkt;
   - `Fara á versta punkt` birtist.
5. Smella `Fara á versta punkt`.
6. Vænt:
   - versti punkturinn verður aftur virkur.
7. Prófa sama með Tab + Enter/Space.

### Allir spápunktar

1. Staðfesta að `Allir spápunktar á leiðinni` sé lokað sjálfgefið.
2. Opna skúffuna.
3. Vænt:
   - öll matched Veðurstofuspjöld birtast;
   - listinn ýtir ekki mini-korti eða völdu spjaldi í bilað layout;
   - station-count er þýddur eðlilega.
4. Loka skúffunni aftur.

### Stóra Kort

1. Velja `Kort`.
2. Vænt:
   - sama route opnast;
   - `Brottför Núna` eða nákvæmur valinn tími er virk pilla;
   - `Vegagerðin` er við hliðina;
   - gamla stóra detail-/scrubber-kortið sést ekki.
3. Velja `Vegagerðin`.
4. Vænt:
   - current Vegagerðin-stöðvar birtast;
   - route helst.
5. Velja `Brottför {tími}`.
6. Vænt:
   - Veðurstofuspárpunkta-mode kemur aftur;
   - sami brottfarartími og í Akstur helst.
7. Fara aftur í Akstur.
8. Vænt:
   - valin leið og brottfarartími tapast ekki.

### Mobile

Endurtaka við 360, 390 og 460 px:

1. Default Akstur.
2. Scrubber.
3. Samanburðartafla.
4. Mini-kort og punktaval.
5. Collapsed punktaskúffa.
6. Skipti í Kort og milli pillanna.

Vænt:

- enginn horizontal page-overflow;
- mini-kortið passar fulla breidd;
- punktar eru snertanlegir;
- detail-listi er lokaður sjálfgefið;
- enginn tvöfaldur scrubber;
- enginn raw translation key;
- browser chrome/safe areas hylja ekki controls.

## Tillaga að næsta skrefi

Stebbi sendir skjáskot af:

1. default Akstur eftir reload;
2. mini-korti með versta punkti;
3. mini-korti með öðrum völdum punkti;
4. lokaðri og opinni punktaskúffu;
5. stóra Kort með báðum pillum;
6. mobile 390 px.

Næsta breyting ætti aðeins að fínpússa staðfest visual frávik.

## Supabase / production

- Engin SQL-skrá var skrifuð.
- Engin migration var skrifuð eða keyrð.
- Engin áhrif á gögn, RLS, auth, grants, policies eða functions.
- Engin env-, secrets-, billing-, deploy- eða production-breyting var gerð.
- Ekkert commit eða push var gert.
