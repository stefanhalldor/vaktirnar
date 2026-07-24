# TODO-091 v024 — A−/A+ spáspjöld og fyrsta fjallalag

## Plan áfangans

1. Stækka sjálfgefin spágildi í kortaspjöldum.
2. Bæta við aðgengilegri A−/A+ stærðarstýringu.
3. Vista stærðarval staðbundið og endurreikna card collision.
4. Bæta takmörkuðum helstu fjöllum við Spákortið.
5. Nota hæð yfir sjávarmáli sem fyrsta hierarchy-mæligildi.
6. Sýna metratölu aðeins við nánara zoom.

## Hvað var raunverulega gert

### Spáspjöld

- Forecast value text notar nú CSS-breytuna
  `--teskeid-forecast-card-scale`.
- Stækkunin gildir um:
  - vindgildi,
  - vindör,
  - hitastig,
  - úrkomu/annað neðra mæligildi.
- Provider-heiti og staðaheiti haldast minni svo hierarchy varðveitist.
- Þrjú stærðarstig:
  - 100%,
  - 120% sjálfgefið,
  - 140%.
- A−/A+ control birtist aðeins þegar kortasýn er virk.
- Hvort tveggja Spá- og Aksturskort notar sömu aðgengisstillingu þar sem
  spáspjöldin deila marker-componenti.
- Val vistast í:
  `teskeid_forecast_card_scale_v1` í `localStorage`.
- Eftir stærðarbreytingu eru weather-card collision og route-label collision
  endurkeyrð í næsta animation frame.
- Buttons eru 40×40 px, með disabled end-states, focus-ring og íslenskum/enskum
  screen-reader heitum.

### Fjöll

- Fyrsta takmarkaða fjallalagið inniheldur:
  - Heklu, 1.491 m,
  - Herðubreið, 1.682 m,
  - Snæfell, 1.833 m,
  - Kverkfjöll, 1.936 m,
  - Bárðarbungu, 2.000 m,
  - Hvannadalshnúk, 2.110 m.
- Hæð yfir sjávarmáli er fyrsta sjónræna hierarchy-mæligildið.
- Leturstærð skalar dempað frá um 10 til 14 px eftir hæð og stækkar lítillega
  við innzoom.
- Fjöll byrja að birtast frá zoom 6,2–6,6 eftir mikilvægi/hæð.
- Við zoom 7,5+ birtist hæð undir heitinu.
- Fjöll eru auðkennd með `▲`, brúngráum texta og ljósri útlínu.
- Fjallamerki eru `pointer-events:none`, aðeins í `weather` context og eru
  fjarlægð í cleanup.

## Gagnavarúð fjalla

- Þetta er fyrsta sjónræn prototype-skrá, ekki fullgilt canonical
  náttúrugagnasafn.
- Opinberar heimildir staðfesta meðal annars:
  - Kverkfjöll/Skarphéðinstind, 1.936 m hjá Vatnajökulsþjóðgarði.
  - Herðubreið, 1.682 m í útgáfu Náttúrufræðistofnunar.
- Hinn samræmdi listi yfir hnit, hæðir og sérstaklega prominence hefur ekki enn
  verið tengdur við eina authoritative machine-readable heimild.
- Áður en fjallalagið verður production/canonical þarf að staðfesta öll hnit og
  hæðir gegn einni opinberri gagnaveitu og bæta við source/version metadata.
- Prominence er betra langtíma hierarchy-mæligildi en hæð ein og sér, en var
  ekki notað í þessari fyrstu prófun.

## Notendatextar

Bætt við íslensku og ensku:

- Textastærð spáspjalda / Forecast card text size
- Minnka texta í spáspjöldum / Decrease forecast card text size
- Stækka texta í spáspjöldum / Increase forecast card text size

## Skrár sem voru skoðaðar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `Design.md`
- Opinber gögn/síður Vatnajökulsþjóðgarðs og Náttúrufræðistofnunar.

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-24-2327-todo-091-v024-codex-card-text-scaling-and-mountains.md`

## Skipanir og niðurstöður

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx lib/__tests__/weather-chase-preferences.test.ts`
  - Exit code 0; 2 skrár og 4 próf stóðust.
- `git diff --check`
  - Exit code 0; engar whitespace-villur, aðeins line-ending viðvaranir.
- `npm.cmd run build`
  - Fyrri keyrsla: exit code 1 eftir compilation vegna tímabundinna
    `PageNotFoundError` fyrir `/admin` og `/chat/[id]`.
  - Óbreytt endurkeyrsla: exit code 0.
  - Aðeins fyrirliggjandi lint-viðvaranir.

## Hvað mistókst eða var sleppt

- Dev server/browser var ekki ræstur.
- Engin automated visual/collision próf voru skrifuð.
- Fjallagögn voru ekki flutt í sérstaka typed data-skrá.
- Prominence og full source/version metadata voru ekki innleidd.
- Stærðarstilling vistast aðeins í tækinu, ekki í Supabase notandastillingum.

## Ákvarðanir

- 120% er nýtt default; notandi getur minnkað í eldri stærð eða stækkað í
  140%.
- Aðeins mæligildi stækka, ekki öll spjöldin jafnt.
- Stýringin er staðsett vinstra megin við MapLibre zoom-control til að
  aðgreina textastærð og kortazoom.
- A−/A+ fylgir `Design.md` með 40 px touch targets, focus-rings og þýddum
  accessible names.
- Fjöll birtast við meira zoom en jöklar til að halda Íslands-yfirliti rólegu.
- Hæð er notuð sem tímabundið fyrsta metric; prominence er deferred.

## Áhætta

- 140% getur aukið overlap og valdið því að fleiri spjöld færast eða felast á
  mobile.
- A−/A+ control getur rekist á MapLibre controls eða kortaspjöld við 360 px.
- `localStorage` val er per browser/device og fylgir ekki notanda milli tækja.
- Fjallalögin geta rekist á jöklaheiti, sérstaklega á Vatnajökulssvæðinu.
- Fjallagögnin þurfa sameinaða authoritative staðfestingu áður en production
  staðreyndalag er samþykkt.
- Tvö `zoom` listeners uppfæra nú fimm jökla og sex fjöll; það er létt, en
  architecture þarf hreinsun áður en tugum náttúrufyrirbæra er bætt við.

## Supabase, SQL og production

- Engin SQL, Supabase, RLS, auth, secret, billing eða notendagagnabreyting.
- Ekkert var committað, push-að eða deployað.

## Tillaga að næsta skrefi

Stebbi prófi fyrst A−/A+ á mobile og fjalla/jökla-overlap við zoom 6–9. Ef
tilraunin stenst ætti næsti tæknilegi áfangi að vera að færa natural-feature
gögn og rendering úr stóra map componentinu í typed catalog/helper og tengja
fjöll við eina opinbera heimild með prominence.

## Atriði sem Codex ætti sérstaklega að rýna

- Hvort 120/140% stig séu nógu stór fyrir sjónskerta.
- Hvort aðeins mæligildi eigi að stækka eða provider/stöðvarheiti líka á 140%.
- Collision og control overlap á 360 px.
- Fjallahnit/hæðir og val á fjöllum.
- Hvort elevation-only hierarchy gefi skynsamlega kortamynd.

## Localhost checks for Stebbi

Prófunarsíða: `/auth-mvp/vedrid/road-map-prototype`

### A−/A+

1. Gerðu hard refresh og opnaðu **Spákort**.
2. Vænt:
   - A−/A+ control birtist við kortastýringarnar.
   - Spágildi eru um 20% stærri en áður.
3. Smelltu á A+.
   - Vænt: vindur, hitastig og úrkoma stækka í 140%.
   - A+ verður disabled.
   - Provider- og staðaheiti haldast minni.
4. Smelltu tvisvar á A−.
   - Vænt: 120%, síðan 100%.
   - A− verður disabled við 100%.
5. Fylgstu með spjöldum og tengilínum eftir hvert skref.
   - Vænt: card collision endurreiknast og línur tengjast áfram rétt.
6. Endurhladdu síðuna.
   - Vænt: síðasta stærðarval endurheimtist.
7. Skiptu í **Aksturskort**.
   - Vænt: sama textastærð gildir um spáspjöld Aksturskorts.
8. Opnaðu Gögn eða Skilaboð.
   - Vænt: A−/A+ control hverfur þegar kortasýn er ekki virk.
9. Prófaðu Tab/Enter/Space og screen reader ef tiltækt.
   - Vænt: „Minnka/Stækka texta í spáspjöldum“ er lesið.

### Fjöll

1. Á Spákorti, byrjaðu við Íslands-zoom og zoom-aðu frá 6 upp í 8.
2. Vænt:
   - Hvannadalshnúkur, Hekla, Bárðarbunga, Herðubreið, Snæfell og Kverkfjöll
     birtast stigvaxandi frá zoom 6,2–6,6.
   - Hærri fjöll hafa stærra letur.
3. Við zoom 7,5+:
   - Vænt: metratala birtist undir heitinu, t.d.
     `▲ Hvannadalshnúkur` / `2.110 m`.
4. Athugaðu sérstaklega Vatnajökulssvæðið.
   - Passa overlap milli Vatnajökuls, Bárðarbungu, Kverkfjalla,
     Hvannadalshnúks og spáspjalda.
5. Prófaðu 360, 390 og 460 px.
   - Fjöll eiga að vera sjónrænt undir spáspjöldum.
   - Textinn á ekki að fanga pan/zoom gestures.
6. Skiptu í Aksturskort.
   - Öll fjallaheiti og hæðir eiga að hverfa.

Ekki treysta fjallahæðum/hitum sem canonical production-gögnum fyrr en
sameinuð authoritative staðfesting hefur farið fram. Prófunin snertir ekki
Supabase eða production-gögn.
