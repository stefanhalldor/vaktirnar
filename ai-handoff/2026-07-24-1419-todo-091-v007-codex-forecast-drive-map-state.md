# TODO-091 v007 — Spá, vistaðir staðir og aðskilin kortasýn

## Plan áfangans

1. Láta nýju veðursíðuna opnast í töflusýn Spár í stað Aksturs.
2. Koma í veg fyrir að upphafsgildi yfirskrifi vistaða staði innskráðs notanda.
3. Aðskilja kortasamhengi Spár og Aksturs.
4. Endurheimta veðurspjöld á Spá-kortinu og sýna alltaf upplýsingaspjöld við Vegagerðarpunkta á valinni akstursleið.
5. Keyra type-check, afmarkað preference-próf og production build.

## Hvað var raunverulega gert

- Sjálfgefin sýn er nú Spá/töflusýn:
  - Spá er opin við fyrstu birtingu.
  - Akstur er lokaður.
  - síðasta kortasamhengi byrjar sem `weather`.
- Flipinn „Mitt veður“ heitir nú „Spá“ á íslensku og „Forecast“ á ensku.
- Spá og Akstur halda nú aðskildu kortasamhengi:
  - Spá-kort felur akstursleið, akstursstöðvar og enda leiðar.
  - Aksturskort felur Spá-markera og yfirlitsmarkera.
  - Kort-flipinn birtir kortið fyrir síðasta valda meginsamhengi.
- Spá-markeraáhrif byggir ekki lengur á því hvort akstursleið hafi einhvern tíma verið reiknuð. Því geta fínu Spá-spjöldin birst aftur þótt leið sé til í Akstri.
- Vistaðir Spá-staðir eru ekki lengur sendir til vistunar áður en preferences hafa verið lesnar:
  - foreldri hunsar selection callback þar til hydration er lokið;
  - `WeatherChasePanel` sendir ekki callback fyrr en upphafsval hefur raunverulega verið sett.
- Á Aksturskorti í „Vegagerðin“ eru veðurspjöld alltaf sýnileg við alla punkta sem standast virka stöðusíu. Spjaldið sýnir vindátt, vind/hviðu, lofthita, veghita og stöðvarheiti. Smellur heldur áfram að opna valið stöðvarspjald.
- Veðurstofuspá á akstursleið var ekki breytt í ríku spjaldasýnina; breytingin er afmörkuð við Vegagerðina.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-24-1430-todo-091-v006-claude-pills-loader-nav-saved-places.md`
- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-chase-preferences.test.ts`
- eldri Git-útgáfa af `RoadMapPrototypeMap.tsx` til að endurnýta áður samþykkt veðurspjald.

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `components/weather/WeatherChasePanel.tsx`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-24-1419-todo-091-v007-codex-forecast-drive-map-state.md`

Ótengda notendabreytingin í `.obsidian/workspace.json` var ekki snert.

## Skipanir sem voru keyrðar

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/weather-chase-preferences.test.ts`
  - Exit code 0; 1 testaskrá og 3 próf stóðust.
- `npm.cmd run build`
  - Exit code 0.
  - Build kláraðist með eldri React Hook/`img` lint-viðvörunum, þar á meðal fyrirliggjandi dependency-viðvörunum í `RoadMapPrototypeMap.tsx`.
- `git diff --check`
  - Engar whitespace-villur í breytingunum; aðeins line-ending viðvaranir og permission-viðvörun fyrir global git ignore.

## Hvað mistókst eða var sleppt

- Engin skipun mistókst.
- Engin browser- eða sjónræn prófun var keyrð, þar sem Stebbi stýrir localhost/dev server.
- Ekki var bætt við DOM/component-prófi fyrir MapLibre-markera; þetta þarf fyrst og fremst sjónræna staðfestingu.
- Ekkert commit, push eða deploy var gert.

## Ákvarðanir

- Kort-flipinn er áfram sameiginlegur hnappur en sýnir síðasta valda samhengi. Þannig verður „Spá → Kort“ Spá-kort og „Akstur → Kort“ aksturskort.
- Vegagerðarspjöldin endurnýta núverandi route-marker component með afmörkuðum `showWeatherCard` valkosti. Þetta kemur í veg fyrir að Veðurstofu-/Spá-markeraútlit breytist óvart.
- Bæði parent og child verja preferences-hydration. Tvöföld vörnin kemur í veg fyrir framtíðarregression þar sem tóm/default selection gæti aftur vistast áður en server/local preferences berast.
- Lausnin fylgir `Design.md` með því að halda efni í þéttum kortaspjöldum, varðveita stór tappanleg svæði og ekki bæta við láréttu layouti eða nýrri mobile-navigation.

## Áhætta sem er enn til staðar

- Mörg Vegagerðarspjöld geta skarast á þéttum leiðarköflum. Krafan um að þau séu alltaf sýnileg var látin hafa forgang; núverandi collision-vörn felur aðeins stöðvarheiti þegar þarf, ekki veðurgildi.
- MapLibre DOM-marker lifecycle er ekki tryggt með sjálfvirku component-prófi.
- Ef vistað station-id er ekki lengur í tiltækum gögnum bíður núverandi hydration-rökfræði eftir gildum lista; það er óbreytt hegðun.
- Fyrirliggjandi hook dependency lint-viðvaranir eru enn til staðar.

## Tillaga að næsta skrefi

Stebbi staðfesti fyrst flæðin hér að neðan á localhost. Ef spjöld skarast of mikið á ákveðinni leið væri næsti litli áfangi að þétta kortin eða hliðra þeim, án þess að fela þau.

## Spurningar fyrir næstu rýni

1. Eru öll Vegagerðarspjöld læsileg á dæmigerðri Akureyri–Reykjavík leið á mobile breidd?
2. Er „síðasta samhengi“ rétt mental model fyrir sameiginlega Kort-flipann?
3. Halda vistaðir staðir sér eftir hard refresh og nýja innskráningu?

## Supabase

Engin SQL-skrá var skrifuð eða keyrð. Engar breytingar voru gerðar á gögnum, RLS, auth, grants, policies, functions eða production.

## Localhost checks for Stebbi

Notaðu núverandi localhost-slóð fyrir:
`/auth-mvp/vedrid/road-map-prototype`

Nauðsynlegt state:

- Prófaðu bæði innskráðan notanda með áður vistuðum Spá-stöðum og akstursleið sem skilar Vegagerðarpunktum.
- Ekki þarf að breyta production-gögnum, SQL eða stillingum.

Skref og vænt niðurstaða:

1. Opnaðu síðuna eða gerðu hard refresh.
   - „Spá“ á að vera valin og töflusýnin opin.
   - Akstur á ekki að opnast sjálfkrafa.
2. Með innskráðum notanda skaltu staðfesta að áður vistaðir staðir birtist.
   - Þeir mega ekki detta aftur í fyrstu þrjá sjálfgefnu staðina.
3. Breyttu einum stað, bíddu eftir vistunarstaðfestingu og gerðu hard refresh.
   - Nýja valið á að haldast.
4. Frá Spá, ýttu á „Kort“.
   - Fínu Spá-spjöldin eiga að birtast fyrir valda staði.
   - Engin gömul akstursleið eða Vegagerðarspjöld mega leka inn í þessa sýn.
5. Opnaðu „Akstur“, veldu eða reiknaðu leið og hafðu „Vegagerðin“ valda.
   - Kortið á að tilheyra Akstri.
   - Við alla sýnilega Vegagerðarpunkta á leiðinni eiga alltaf að sjást spjöld með vindátt, vindi/hviðu, lofthita og veghita.
   - Smellur á punkt/spjald á að velja stöðina og sýna stöðvarupplýsingar.
6. Ýttu á „Kort“ úr Akstri.
   - Valda akstursleiðin og Vegagerðarspjöldin eiga að vera sýnileg.
   - Spá-spjöld úr „Spá“ mega ekki birtast samtímis.
7. Farðu aftur í „Spá“ og síðan „Kort“.
   - Kortið á að skipta aftur yfir í Spá-samhengi og sýna rétt Spá-spjöld.
8. Endurtaktu 4–7 á mjórri mobile breidd.
   - Enginn láréttur overflow, óvænt zoom eða dauðir flipar.

Helstu regressions:

- Vistaðir staðir yfirskrifist við fyrstu hydration.
- Spá-kort sýni akstursleið eða Aksturskort sýni Spá-markera.
- Vegagerðarspjöld hverfi vegna zoom/collision þótt stöðusían leyfi punktinn.
- Kort-flipinn opni rangt samhengi eftir síðasta val.
