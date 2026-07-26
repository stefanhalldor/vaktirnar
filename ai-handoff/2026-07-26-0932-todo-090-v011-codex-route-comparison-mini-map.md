# TODO 090 v011 — Lítið samanburðarkort fyrir leiðir

## Plan áfangans

Setja endurnýtanlegt, lítið kort inn í leiðavalsrammann á canonical `/vedrid` Akstursskjánum. Kortið sýnir Google-leið og Teskeiðarleið samtímis í sama viewporti og deilir MapLibre-kjarna með núverandi aksturskorti.

## Hvað var raunverulega gert

- `DriveRouteMap` styður nú bæði gamla einleiða-inntakið og endurnýtanlegt `routes`-fylki með lit, breidd, gegnsæi og hliðrun fyrir hverja leið.
- Nýr `RouteComparisonMiniMap` sýnir tvær eða fleiri reiknanlegar leiðir, en felur sig ef aðeins ein leið er tiltæk.
- Google er blá leið og Teskeið appelsínugul. Línurnar eru örlítið hliðraðar svo þær sjáist báðar þegar ferlarnir skarast.
- Valin leið er aðeins sterkari/breiðari.
- Kortið er 120 px hátt og óvirkt svo það steli ekki farsímaskrolli.
- Skýringar undir kortinu og litastrik í leiðaspjöldum tengja kortalínur við valkostina.
- Texti fyrir aðgengilegt kortaheiti var settur í íslensku og ensku þýðingarskrárnar.
- Við lokarýni fannst og lagaðist jaðartilvik þar sem upphafsmiðja fjölleiðakorts var enn sótt úr gamla einleiða-inntakinu.

## Design.md

Lausnin fylgir mobile-first viðmiðunum: hún bætir litlu hagnýtu verkfæri inn í núverandi ramma, er ekki gagnvirk, veldur ekki láréttu overflowi og viðheldur sýnilegri kortaheimild í sameiginlega kortahlutanum.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `components/weather/DriveRouteMap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- viðeigandi próf og þýðingarlyklar

## Skrár sem voru breyttar í þessum áfanga

- `components/weather/DriveRouteMap.tsx`
- `components/weather/RouteComparisonMiniMap.tsx` (ný)
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/route-comparison-mini-map.test.tsx` (ný)
- þessi handoff-skrá

Ótengdar og eldri ócommittaðar breytingar í vinnutrénu voru varðveittar.

## Skipanir og niðurstöður

- Afmörkuð API/regression-próf: exit 0, 59 próf græn.
- Fullt `npm run test:run`: exit 0, 145 test files passed, 1 skipped; 3.676 próf græn, 28 skipped, 8 todo.
- Fyrsta `npm run build`: mistókst vegna conditional hook í nýja componentinum. Hook-röðin var leiðrétt.
- Endurtekið `npm run build`: exit 0; build og route-generation græn. Aðeins fyrirliggjandi warnings.
- `npm run type-check`: exit 0.
- Endurtekið afmarkað mini-map próf eftir lokaleiðréttingar: exit 0, 2 próf græn.
- JSON parse og `git diff --check`: exit 0; aðeins line-ending warnings.

## Ákvarðanir og eftirstandandi áhætta

- Sameiginlegi `DriveRouteMap` var útvíkkaður í stað þess að búa til annan MapLibre-kjarna. Þessi vinna nýtist því beint þegar fleiri Teskeiðarleiðir eða providers bætast við.
- Kortið birtist aðeins þegar minnst tvær leiðir hafa að minnsta kosti tvo punkta.
- Engin browserprófun var framkvæmd af Codex og því þarf Stebbi að staðfesta raunútlit og scroll á localhost.
- Engin migration, Supabase-, auth-, production-, deployment-, commit- eða push-aðgerð var framkvæmd.

## Localhost checks for Stebbi

1. Opnaðu `/auth-mvp/vedrid`, farðu í **Akstursgögn** og reiknaðu leið þar sem bæði Google- og Teskeiðarvalkostur kemur fram.
2. Staðfestu að lítið kort birtist í gula leiðavalsrammanum og sýni bláa Google-leið og appelsínugula Teskeiðarleið í sama viewporti.
3. Berðu litina saman við skýringarnar og litastrikin í leiðaspjöldunum.
4. Veldu hvorn valkost fyrir sig. Valin lína á að verða aðeins sterkari án flökts, endurhleðslulykkju eða brotins korts.
5. Prófaðu bæði leiðir sem liggja nær alveg saman og leiðir sem greinast greinilega. Við skörun eiga báðar línur að sjást hlið við hlið.
6. Prófaðu farsímabreiddir um 360, 390 og 460 px. Kortið á ekki að valda láréttu overflowi eða hindra lóðrétt scroll.
7. Staðfestu að kortaheimild sjáist og að ramminn haldi eðlilegri hæð.
8. Prófaðu svo tilfelli þar sem Teskeiðarleið vantar eða timeout verður. Þá á mini-kortið að vera falið og núverandi einleiðaflæði að halda áfram óbreytt.

## Næsta skref

Stebbi prófar á localhost. Ef útlitið stenst má sama `routes`-viðmót taka við fleiri Teskeiðarleiðum síðar án nýs kortakjarna.
