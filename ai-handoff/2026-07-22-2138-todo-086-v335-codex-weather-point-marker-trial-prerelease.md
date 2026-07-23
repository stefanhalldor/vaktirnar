# Handoff: Weather Point Marker Trial

Created: 2026-07-22 21:38  
Timezone: Atlantic/Reykjavik  
TODO: 086 - Road Intelligence / Veðrið
Agent: Codex

## Plan Afgangs

Setja nýju veðurpunktahugmyndina í afmarkaðan prufufasa á `/auth-mvp/vedrid/road-map-prototype`, án þess að breyta routing, station matching, SQL, feature flags eða production deploy.

## Hvað var gert

- Breytti route-station DOM markerum í nýja compact veðurpunkta í `RoadMapPrototypeMap`.
- Nýi markerinn sýnir:
  - veðurtákn/emoji fyrir ofan kassann
  - vindátt sem ör
  - vindhraða
  - hviðu í sviga þegar hún er raunveruleg Vegagerðin númæling
  - hitastig
  - úrkomureit
  - stöðvarheiti sem áfram getur falist ef collision-reglan telur það nauðsynlegt
- Veðurstofu forecast-markers sýna ekki hviðutölu. Þar er vindur + hiti + úrkoma + ETA á leiðarpunkt.
- Vegagerðin now-markers sýna hviður ef þær eru til, en úrkoma er `–` þar sem Vegagerðin núgögnin eru ekki með úrkomu.
- Bætti hjálparföllum:
  - `windDirectionTextToArrow()`
  - `weatherEmojiFromText()`
- Bætti translation key-um fyrir aria/tooltip texta í íslensku og ensku.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## Skipanir sem voru keyrðar

- `npm run type-check`
  - Exit code: 0
- `npm run test:run -- lib/__tests__/road-intelligence-route-slot-statuses.test.ts lib/__tests__/windObservationStatus.test.ts`
  - Exit code: 0
  - 2 test files passed, 67 tests passed

## Hvað var ekki gert

- Enginn commit.
- Enginn push.
- Enginn deploy.
- Engin SQL/migration.
- Engin Supabase breyting.
- Ekki breytt gamla Google Maps `/vedrid` kortinu.
- Ekki breytt overview-markerum fyrir allt landið, því stórir 200+ veðurpunktar þurfa clustering/density hönnun áður en það er öruggt.

## Ákvarðanir

- Prufan er aðeins virk í RoadMap prototype route-stöðvum fyrst.
- Status-litur er áfram notaður sem aksturssamhengi á litlum ramma/dot/speed texta, en marker-flöturinn sjálfur er hlutlaus hvítur.
- Veðurstofan fær ekki hviðutölu í marker, í samræmi við þá stefnu að hviður séu bara sýndar þar sem þær eru áreiðanlegar raunmælingar frá Vegagerðinni.
- Emoji fallback fyrir Vegagerðin current er `💨`, því þar er ekki veðurlýsing eða úrkoma í gögnunum.

## Design Alignment

- Fylgir `Design.md` með rólegum, ljósum fleti, litlum radius, skýrum kontrast og mobile-first þéttni.
- Litir eru ekki notaðir sem eina merkingin: tölurnar og aria-label halda áfram að miðla stöðunni.
- Þetta er viljandi ekki gert að canonical component strax. Ef Stebbi samþykkir UX-ið er næsta skref að extract-a reusable marker builder/component.

## Route Intelligence Check

- Snertir route-weather rendering á nýja MapLibre Road Intelligence prototype kortinu.
- Snertir ekki route matching, route memory, Google Routes, Vegagerðin road-surface eða IcelandRoadmap domain gögn.
- Provider-neutral að hluta: sami marker helper er notaður fyrir Vegagerðin og Veðurstofan, en gagnasvið eru provider-aware.
- Engin ný route-gögn eru vistuð og engin privacy áhætta bætist við.

## Áhætta / Óvissa

- Emoji eru OS/browser-háð og geta litið mismunandi út. Ef þetta verður samþykkt sem stefna er líklega betra að fara síðar í eigin icon-set.
- Vindátt örvarnar eru fyrsta túlkun á compass texta. Þarf að staðfesta hvort Stebbi vill að örin sýni hvaðan vindurinn kemur eða hvert hann blæs.
- Markerarnir eru stærri en eldri pillur. Þetta þarf að prófa sérstaklega á löngum leiðum með 20-30 stöðvum.
- Úrkomureitur er `–` fyrir Vegagerðin current þar sem gögnin hafa ekki úrkomu. Það er heiðarlegt en þarf UX-rýni.

## Localhost Checks For Stebbi

1. Opna `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`.
2. Reikna leið sem hefur Vegagerðin stöðvar, t.d. `Reykjavík -> Ísafjörður`.
3. Staðfesta að `Nústaðan hjá Vegagerðinni` sýni nýja compact markerinn:
   - emoji yfir kassa
   - vindátt + vindur + hviða í sviga þar sem hviða er til
   - hitastig neðst vinstra megin
   - `–` í úrkomureit
   - stöðvarheiti sýnilegt þar sem pláss leyfir
4. Opna akstursskúffuna og velja brottfarartíma.
5. Staðfesta að Veðurstofu forecast markerar sýni:
   - emoji byggt á veðurtexta/úrkomu
   - vindátt + vind
   - hitastig og úrkomu
   - ekki hviðutölu
   - `🚗 hh:mm` ef ETA er til
6. Prófa `Einfalt` og `Nánar` og staðfesta að marker status-litur fylgi filter-mode.
7. Prófa mobile breidd um 390-460px og route með þéttum stöðvum, sérstaklega hvort markerar klessast of mikið.

## Næsta Skref

Ef Stebbi fílar grunnformið:

1. Rýna hvort örvarnar eigi að tákna vind úr átt eða vind sem blæs í átt.
2. Hanna 2-3 variantar af sama marker sem hægt er að skipta á milli í prototype.
3. Extract-a marker presentation í reusable helper/component.
4. Bæta density/clustering reglu áður en þetta er sett á almenna overview-kortið.
