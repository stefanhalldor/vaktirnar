# 2026-07-16 16:40 — TODO-086 v340 — Codex road-segment caution text handoff

## Staða

Stebbi rýndi sérmerktar varasamar leiðir betur með ChatGPT og skýrði product direction eftir v339.

Mikilvæga leiðréttingin:

**Varúðin á að fylgja vegkaflanum sjálfum, ekki origin/destination pari.**

Það skiptir ekki máli hvort notandi er að koma frá Reykjavík, Höfn, Akureyri eða öðrum stað. Ef valin Google route fer um þekktan varasaman vegarkafla, þá á Teskeið að merkja leiðina og útskýra það. Ef route fer ekki um slíkan kafla, þá á ekki að merkja hana bara af því áfangastaður er til dæmis Ísafjörður eða Egilsstaðir.

Þetta handoff supersedar þann hluta af v339 sem gæti lesist eins og Hólmavík/Öxi séu fyrst og fremst origin/destination-reglur. Hólmavík getur áfram verið suggested alternate, en varúðarlagið sjálft á að vera **segment-based**.

## Af hverju þetta skiptir máli

Google Maps segir hvaða leið er möguleg og oft fljótleg.

Teskeið á að hjálpa notanda að meta hvort leiðin sé skynsamleg miðað við íslenskar aðstæður, ökutæki, eftirvagna, veður og vegaaðstæður.

Við eigum ekki að fullyrða að vegur sé alltaf hættulegur. Rétta framsetningin er:

> Leiðin inniheldur vegarkafla sem þarf að meta sérstaklega.

Fyrstu tveir vegkaflarnir:

1. **Sunnanverðir Vestfirðir / Vestfjarðavegur leið 60**  
   Google getur valið styttri/fljótlegri leið til eða frá Ísafirði sem fer um erfiðari kafla á sunnanverðum Vestfjörðum. Malbikaða leiðin um Hólmavík og Djúpveg er oft einfaldari og fyrirsjáanlegri.

2. **Öxi / Axarvegur 939**  
   Google getur valið Öxi sem styttri leið til eða frá Egilsstöðum. Öxi er brattur, hlykkjóttur fjallvegur sem getur verið erfiður í þoku, úrkomu, vindi, hviðum og lélegu skyggni, sérstaklega með hjólhýsi/fellihýsi/kerru.

## Product decision

### 1. Greina varasama kafla út frá route geometry

Ekki byggja warning á:

- origin bounds
- destination bounds
- route name einum og sér
- því að áfangastaður sé “Vestfirðir” eða “Egilsstaðir”

Byggja warning á:

- hvort decoded Google route polyline sker/fylgir skilgreindum varasömum vegkafla
- vikmörkum í metrum í kringum vegkaflann
- helst fullri polyline geometry, ekki eingöngu fáum sampled points

### 2. Sýna label á leiðarvali

Á route option card:

- `Varasamt með eftirvagna`
- amber/varúðar chip, ekki rauð hættumerking nema síðar þegar Vegagerð/veður gefur tilefni til
- ef fleiri en einn segment match-ar, sýna sameiginlegt chip og stuttan summary texta

### 3. Setja lítinn textakafla undir viðkomandi leið

Stebbi vill faglegri framsetningu en bara chip. Bæta við compact textakafla undir route option eða strax undir route þegar hún er valin.

Textinn á að útskýra hvað var greint og hvað notandi ætti að gera næst.

Dæmi fyrir Vestfirði:

> Leiðin fer um erfiðari vegarkafla á sunnanverðum Vestfjörðum. Google Maps hefur valið styttri leið sem getur innihaldið malarkafla, fjallvegi og hægari akstur en ferðatíminn gefur til kynna. Leiðin um Hólmavík er oft einfaldari kostur.

Dæmi fyrir Öxi:

> Leiðin fer um Öxi. Öxi er brattur og hlykkjóttur fjallvegur sem getur verið erfiður í þoku, úrkomu, vindi og lélegu skyggni. Leiðin um firðina er oft einfaldari kostur.

Ef notandi er síðar með “ökutæki með eftirvagn” stillingu má textinn verða sterkari:

> Teskeið mælir almennt ekki með þessari leið með hjólhýsi, fellihýsi eða annan eftirvagn nema aðstæður og vegurinn hafi verið skoðuð sérstaklega.

Ekki innleiða vehicle profile núna nema það sé þegar til. En data model á að gera ráð fyrir því.

## UX leiðbeining

Þetta á ekki að verða stórt, hræðandi warning box.

Fylgja `Design.md`:

- mobile-first
- compact texti
- ekki card inni í card ef hægt er að komast hjá því
- amber fyrir varúð, ekki destructive rauður
- status-litur má ekki vera eina merkingin
- texti í `messages/is.json` og `messages/en.json`
- enginn láréttur overflow á 360/390/460 px

Mælt pattern:

```txt
[⚠ Varasamt með eftirvagna]
Leiðin fer um Öxi. Öxi er brattur og hlykkjóttur fjallvegur sem þarf að meta sérstaklega, sérstaklega í vindi, þoku eða úrkomu.
Athugaðu aðstæður hjá Vegagerðinni.
```

Ef þetta er inni í route option card skal textinn vera collapse/compact ef hann verður langur. Fyrsta útgáfa má sýna 1-2 línur og “Sjá nánar” ef þörf krefur, en ekki flækja um of.

## Tæknileg nálgun

### Nýr eða endurnýttur registry

Búa til eða betrumbæta registry, til dæmis:

```ts
type SensitiveRoadSegment = {
  id: string;
  name: string;
  roadNumbers: string[];
  geometry: GeoJSON.LineString;
  detectionBufferMeters: number;
  defaultSeverity: "info" | "warning" | "strong_warning";
  vehicleTags?: Array<"trailer" | "caravan" | "camper" | "heavy_vehicle">;
  characteristics: {
    gravelPossible?: boolean;
    mountainRoad?: boolean;
    steep?: boolean;
    winding?: boolean;
    limitedVisibilityRisk?: boolean;
    trailerSensitive?: boolean;
    seasonalRisk?: boolean;
  };
  alternativeRoute?: {
    id: string;
    nameMessageKey: string;
    via?: { lat: number; lng: number; label: string };
  };
  messageKeys: {
    label: string;
    summary: string;
    detail: string;
    trailer?: string;
    badWeather?: string;
  };
  rules: {
    discourageWithTrailer?: boolean;
    requireRoadConditionCheck?: boolean;
    increaseSeverityInStrongWind?: boolean;
    increaseSeverityInGusts?: boolean;
    increaseSeverityInFog?: boolean;
    increaseSeverityInPrecipitation?: boolean;
    increaseSeverityInIcingRisk?: boolean;
  };
  source: {
    type: "manual-curated";
    note: string;
    verifiedAt?: string;
    sourceUrl?: string;
  };
};
```

Nöfn mega vera önnur, en kjarni þarf að vera reusable fyrir fleiri kafla síðar.

### Detection

Fyrir hverja Google route option:

1. Decode-a fulla route polyline.
2. Bera hana saman við `SensitiveRoadSegment.geometry`.
3. Match ef route fer innan `detectionBufferMeters` frá segmenti yfir nægilega langan kafla eða sker buffer.
4. Skila `route.cautions: RouteCautionResult[]`.

Forðist að nota bara 1-2 route points eða midpoint. Það er of brothætt fyrir langar leiðir.

### Suggested alternates

Hólmavík-reglan á að verða alternate suggestion sem er tengd varasama Vestfjarða-segmentinu:

- Ef route match-ar Vestfjarða-segment sem hefur `alternativeRoute.via = Hólmavík`, má bjóða “Gegnum Hólmavík”.
- Ekki bjóða duplicate ef núverandi route fer nú þegar um Hólmavík / Djúpveg.
- Þetta er alternate-route logic, ekki warning logic.

Öxi-reglan getur síðar haft suggested alternate “um firðina”, en ef Google þegar sýnir þá leið sem alternate þarf ekki að smíða hana handvirkt í fyrstu útgáfu.

## Mikilvæg leiðrétting frá v337/v339

Í v337/v339 var Hólmavík-umræðan orðin of bundin við “frá höfuðborgarsvæði til Vestfjarða”.

Ný regla:

- Warning er alltaf segment-based.
- Alternate getur verið destination-aware ef það þarf að kalla Google Directions með via point, en triggerinn á helst að vera matched segment.
- Höfn → Ísafjörður á ekki að missa Hólmavík/suðurleiðarval bara af því origin er ekki Reykjavík.
- Ísafjörður → Höfn á sama hátt.
- Höfn → Egilsstaðir á að flagga Öxi aðeins ef route fer um Öxi.

## Fyrstu gögn sem þarf að staðfesta

Claude Code má ekki giska á nákvæma veglínu nema með skýrum TODO/óvissu.

Fyrir hverja fyrstu skilgreiningu þarf að skrá:

- segment id
- friendly name
- road number(s)
- approximate geometry
- detection buffer
- why segment exists
- whether geometry was manually traced/verified

Ef nákvæm geometry liggur ekki fyrir í fyrstu iteration:

- Setja þetta sem “manual-curated approximate geometry”
- Halda detection buffer varlega
- Bæta TODO um að sannreyna geometry betur áður en fleiri kaflar fara inn

## Prófanir sem þarf að bæta

Lágmarks unit tests:

1. Route sem fer um Öxi fær `oxi-road-939` caution.
2. Route milli sömu staða sem fer um firðina fær ekki Öxi caution.
3. Route sem fer um skilgreindan Vestfjarða Route 60 kafla fær Vestfjarða caution.
4. Sama route í öfuga átt fær sömu caution.
5. Origin/destination skipta ekki máli: route sem sker segment fær warning þó hvorki origin né destination sé í pre-defined bounds.
6. Route til Ísafjarðar sem fer ekki um varasama segmentið fær ekki segment warning.
7. Ef segment hefur suggested alternate via Hólmavík og route match-ar segment, þá birtist alternate “Gegnum Hólmavík” nema route fari þegar um Hólmavík.
8. Ef route match-ar fleiri en eitt segment, birtast öll caution results án duplicate labels.

Regression tests:

- núverandi curated route tests mega ekki brotna
- Google route cards halda áfram að rendera með duration/distance/selected state
- mobile route selection má ekki fá horizontal overflow

## Localhost checks for Stebbi

Þegar Claude Code hefur útfært þetta, prófaðu:

1. `/vedrid`, public eða innskráður, Reykjavík → Ísafjörður  
   - Ef Google sýnir styttri/sunnanverða Vestfjarðaleið, á hún að fá `Varasamt með eftirvagna`.
   - Textakafli á að útskýra að leiðin fari um erfiðari kafla á sunnanverðum Vestfjörðum.
   - Leið “Gegnum Hólmavík” á að birtast ef hún er ekki duplicate.

2. `/vedrid`, Höfn → Ísafjörður  
   - Varúð á að fylgja Vestfjarða-kaflanum óháð því að origin sé Höfn.
   - Ef báðar Google routes fara um sama varasama Vestfjarða-kafla, mega báðar fá sama caution.
   - Ef Hólmavík-alternate er möguleg á hún að birtast sem sérstakur kostur.

3. `/vedrid`, Ísafjörður → Höfn  
   - Sama varúð á að birtast í öfuga átt ef route fer um sama kafla.

4. `/vedrid`, Höfn → Egilsstaðir  
   - Ef Google leið fer um Öxi / 939, á hún að fá Öxi caution.
   - Ef leið fer um firðina/Route 1 án Öxi, á hún ekki að fá Öxi caution.

5. Mobile widths 360, 390 og 460 px  
   - Route cards, caution chip og textakafli mega ekki flæða út.
   - “Nýjast frá notendum Teskeið.is” / Safnpúls og route caution mega ekki ýta route choice í rugl eða búa til stóran vegg af texta.

Ekki prófa með production env/secrets eða breyta Vercel/Supabase í þessu skrefi nema Stebbi biðji sérstaklega um það.

## Áhætta / edge cases

- **False positive:** detection buffer of stór getur merkt nálæga leið sem fer ekki raunverulega um kaflann.
- **False negative:** of þröng geometry getur misst leið sem Google sýnir á sama vegi.
- **Route naming er ótryggt:** ekki treysta eingöngu á route summary eins og “Route 60” eða “939”.
- **Viðvörunarþreyta:** ef textinn verður of stór á öllum route cards hættir notandi að lesa hann.
- **Product liability:** forðast orðalag sem hljómar eins og Teskeið sé að gefa endanlegt akstursleyfi eða bann.
- **Nákvæm staða malbiks/malar getur breyst:** texti þarf að segja “getur innihaldið” eða “þarf að meta”, ekki fullyrða of mikið án source.

## Tillaga að næsta skrefi fyrir Claude Code

1. Rýna núverandi v337 route caution implementation.
2. Finna hvar route options eru typed og rendered.
3. Hanna minimal `SensitiveRoadSegment` registry og `detectRouteCautions(routePolyline)` helper.
4. Færa núverandi Vestfjarða/Öxi logic yfir í segment-based model eins langt og öruggt er.
5. Setja compact text section undir route card/selected route.
6. Bæta tests fyrir segment matching og Hólmavík alternate.
7. Skila handoff, ekki commit/push/deploy.

## Spurningar sem Claude Code á að svara í handoff

1. Er núverandi route data með nægilega nákvæma decoded polyline til að gera segment matching án nýs API-kostnaðar?
2. Hvar er best að geyma first-pass geometry fyrir Öxi og Vestfjarða segmentið?
3. Getum við tengt Hólmavík alternate við matched segment strax, eða þarf transitional destination-based fallback?
4. Hvaða texti fer í `messages/is.json` og `messages/en.json`?
5. Hvernig tryggjum við að warnings séu ekki of stór á mobile route selection?

## Óvissa / þarf að staðfesta

- Nákvæm geometry fyrir “sunnanverðir Vestfirðir / Route 60” þarf að staðfesta. Ekki byggja langvarandi production-reglu á óljósri screenshot-greiningu án þess að merkja hana sem manual/approximate.
- Ekki er staðfest hvort núverandi code geymir fulla route polyline fyrir allar alternates eða aðeins overview/sampled geometry. Þetta ræður hversu nákvæm detection getur orðið í fyrstu iteration.
- Ekki er staðfest hvort user vehicle/trailer profile sé til. Ef ekki, skal aðeins sýna almenna “Varasamt með eftirvagna” framsetningu og geyma sterkari personalization þar til síðar.
