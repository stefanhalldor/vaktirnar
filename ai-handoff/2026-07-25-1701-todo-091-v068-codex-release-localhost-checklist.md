# TODO 091 v068 — Loka-rýni og localhost release-checklist

Created: 2026-07-25 17:01  
Timezone: Atlantic/Reykjavik

## Loka-niðurstaða

**Tilbúið í localhost release-prófun hjá Stebba.**

Codex fann eitt lítið type-contract gat í v067 og lagaði það:
`searchParams` í Next.js getur innihaldið `undefined`. Legacy redirect helper
tekur nú við því og sleppir slíku gildi í stað þess að reyna að iterate-a það.
Targeted próf var bætt við.

Eftir lagfæringuna eru type-check, targeted tests, full tests, production
build og `git diff --check` græn. Engin frekari kóðaframkvæmd er nauðsynleg
áður en Stebbi prófar.

## Findings

Enginn opinn blocker fannst eftir lagfæringuna.

Eftirstandandi áhætta er eingöngu sú sem þarf browser/manual staðfestingu:

- raunveruleg MapLibre rendering og responsive layout;
- network-silence fyrir notanda án road-intelligence capability;
- sessionStorage og browser/device back yfir raunveruleg route transitions;
- auth/public middleware-keðja með raunverulegu sessioni.

## Breyting Codex eftir v067

### Skrár

- `lib/weather/prototypeRedirect.ts`
  - input type er nú
    `Record<string, string | string[] | undefined>`;
  - aðeins arrays eru iterate-uð;
  - `undefined` er sleppt fail-safe.
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx`
  - Next.js 15 `searchParams` type samræmt helpernum.
- `lib/__tests__/prototypeRedirect.test.ts`
  - nýtt próf staðfestir að `undefined` query-gildi valdi ekki villu.
- `TODO.md`
  - #92 uppfært með staðfestingu að met.no Locationforecast-punktar séu
    reiknaðar spár, ekki mælistöðvar.

## Endanlegar release-gáttir

1. `npm.cmd run type-check`
   - Exit code 0.
2. Targeted:
   `npm.cmd run test:run -- lib/__tests__/prototypeRedirect.test.ts lib/__tests__/pulseBack.test.ts lib/__tests__/road-map-navigation.test.ts lib/__tests__/pulseTarget.test.ts`
   - Exit code 0.
   - 4 skrár, 65 tests passed.
3. `npm.cmd run test:run`
   - Exit code 0.
   - 137 test files passed.
   - 3.618 tests passed, 27 skipped, 8 todo.
   - Tvö jsdom navigation-skilaboð án test failure.
4. `npm.cmd run build`
   - Exit code 0.
   - Next.js 15.5.14 compile, lint/type phase, 100/100 static pages og build
     traces lokið.
   - Aðeins fyrirliggjandi hook/img/caniuse warnings.
5. `git diff --check`
   - Exit code 0.
   - Aðeins Windows line-ending warnings.

Enginn dev server var ræstur eða endurræstur.

---

# Localhost checks for Stebbi

## 0. Undirbúningur

Notaðu localhost/dev serverinn sem Stebbi keyrir nú þegar. Ekki breyta env eða
feature flags eingöngu fyrir þessi próf nema Stebbi viti nákvæmlega hvaða
local state er verið að prófa.

Hafðu DevTools opið:

- Console: Preserve log á;
- Network: Preserve log á;
- Network filterar sem nýtast:
  - `road-intelligence`;
  - `saved-places`;
  - `travel`;
  - `vedurstofan`;
  - `vegagerdin`;
  - `puls`.

Prófaðu fyrst í mobile viewport sem þú notar venjulega, um 390 × 844 eða
530 × 934. Gerðu síðan stutta desktop-staðfestingu.

Notaðu eina þekkta leið sem hefur áður virkað, til dæmis Reykjavík →
Akureyri, og eina staðbundnari leið. Ekki nota viðkvæm heimilisföng ef þú
tekur skjáskot eða deilir console/network upplýsingum.

## 1. Hraðgátt — stoppa strax ef þetta bilar

### 1.1 Public canonical route

1. Skrá út eða opna private/incognito glugga.
2. Opna `/vedrid`.
3. Vænt:
   - nýja sameinaða kortið opnast;
   - enginn redirect á gamla prototype;
   - public navigation sést;
   - kortið fyllir skjáinn;
   - engin rauð React/Next/MapLibre villa í Console.

### 1.2 Auth canonical route

1. Skrá inn með venjulegum weather-notanda.
2. Opna `/vedrid`.
3. Vænt:
   - middleware sendir á `/auth-mvp/vedrid`;
   - authenticated navigation sést;
   - engin redirect loop;
   - kortið opnast og er nothæft.

### 1.3 Ein leið

1. Velja `Akstur`.
2. Setja Reykjavík í `Frá` og Akureyri í `Til`.
3. Reikna.
4. Vænt:
   - Teskeið-loader og loader-textar sjást;
   - niðurstaða kemur;
   - leiðarlína, bíll/tímar og veðurpunktar sjást;
   - ekkert `map_not_ready`, maximum update depth, hydration mismatch eða
     óútskýrt 401 í Console.

Ef eitthvert þessara þriggja atriða bilar skal stoppa og senda Codex/Claude
nákvæma slóð, auth-state, screenshot og fyrstu rauðu console-villuna.

## 2. Public veðurstillingar og session

Prófa í signed-out/private glugga.

1. Opna `/vedrid`.
2. Staðfesta að sjálfgefnir public staðir/spápunktar birtist.
3. Fara í upplýsingaflipann og breyta engu.
4. Vænt:
   - `Vista mínar veðurvæntingar` birtist ekki.
5. Breyta einu veðurmarki.
6. Vænt:
   - vistunar-CTA birtist aðeins eftir raunverulega breytingu.
7. Fara á kort og aftur í gögn/upplýsingar.
8. Vænt:
   - valdir staðir og mörk haldast.
9. Endurhlaða innan sama tabs.
10. Vænt:
    - public session-state helst samkvæmt gildandi TTL.
11. Opna nýjan tab eða private context ef við á.
12. Staðfesta að session sé ekki ranglega orðið varanlegt yfir óskyld
    browser-session mörk.
13. Láta public session renna út ef hægt er án óeðlilegrar biðar, eða nota
    núverandi dev leið til að setja eldra timestamp án að breyta production.
14. Vænt:
    - „Viltu geyma veðurstillingarnar?“ prompt birtist áður en state glatast;
    - notandi getur haldið áfram án innskráningar eða valið að skrá inn.

## 3. Public vistaðir staðir og innskráningar-merge

1. Signed out: velja/bæta við að minnsta kosti tveimur stöðum.
2. Nota staðina í `Frá` og `Til`.
3. Staðfesta texta um að staðirnir geymist tímabundið í þessum flipa.
4. Smella CTA til að skrá inn og vista.
5. Vænt:
   - `next` fer á `/auth-mvp/vedrid?context=route&view=information`;
   - eftir innskráningu er notandi aftur í Akstri;
   - public staðir bætast við vistaða staði notandans;
   - fyrirliggjandi vistaðir staðir notandans eru ekki yfirskrifaðir;
   - duplicates fjölga ekki að óþörfu;
   - autosave tekur við fyrir innskráðan notanda.
6. Eyða einum stað, endurhlaða og staðfesta rétta persistence.
7. Console/Network:
   - engin stjórnlaus endurtekning á `saved-places`;
   - engin 401 eftir að session er komið;
   - engin gögn annars notanda sjást.

## 4. Gagnkvæm `Frá`/`Til` sía

1. Velja Reykjavík í `Frá`.
2. Opna tillögur í `Til`.
3. Vænt: Reykjavík er ekki í boði sem áfangastaður.
4. Velja Akureyri í `Til`.
5. Opna tillögur í `Frá`.
6. Vænt: Akureyri er ekki í boði sem upphafsstaður.
7. Prófa bæði nýlega staði og vistaða staði.
8. Prófa að hreinsa annað fieldið.
9. Vænt: staðurinn verður aftur valanlegur í hinu fieldinu.

## 5. Staðaleit og fallback fyrir eldri vistaðan stað

1. Velja eldri vistaðan stað sem er ekki canonical í nýja staðalistanum,
   t.d. `Melás 8`, ef slíkur staður er til í local accountinu.
2. Setja annan þekktan stað í hitt fieldið.
3. Reikna.
4. Vænt:
   - kerfið reynir bridge-place leit;
   - ef nákvæmur staður finnst ekki kemur nálægur þekktur staður sem skýr
     tillaga;
   - notandi þarf að samþykkja breytinguna;
   - leið er ekki reiknuð frá 0,0 eða röngum hnitum;
   - field-label uppfærist í staðinn sem raunverulega er notaður.
5. Prófa síðan venjulegan canonical stað til að tryggja enga regression.

## 6. Loader og akstursniðurstaða

1. Reikna Reykjavík → Akureyri.
2. Fylgjast með loader-röðinni.
3. Væntir textar:
   - `Sæki leiðir frá Google Maps...`
   - `Sæki gögn frá Veðurstofu Íslands á þessum leiðum...`
   - `Sæki gögn frá Vegagerðinni á þessum leiðum...`
   - `Raða veðurgögnum á rétta tímapunkta á leiðinni...`
4. Vænt:
   - Teskeið-loader birtist, ekki dautt `Reikna...`;
   - takkinn tvísubmit-ar ekki;
   - route birtist aðeins þegar gögn/state eru samhangandi;
   - loader hverfur við success og skiljanleg villa birtist við failure.
5. Endurtaka með styttri leið.
6. Staðfesta að fyrri leið sé ekki blandað inn í nýju niðurstöðuna.

## 7. Litla leiðarkortið

1. Skoða kortið inni í Akstursgögnum.
2. Vænt:
   - sami reusable map-kjarni og stóra kortið;
   - leiðarlína og stöðupunktar;
   - bíll og aksturstímapillur;
   - Veðurstofu-attribution, ekki rangur texti um að allt byggi á
     Vegagerðargögnum;
   - filterpillur, t.d. `Innan marka`, `Nálgast...` og `Óþægilegt`, birtast
     samkvæmt tiltækum gögnum.
3. Smella filterpillu.
4. Vænt: réttir punktar felast/sýnast án þess að kortið hoppi.
5. Smella á punkt.
6. Vænt:
   - kortið þysjist ekki óvænt út;
   - punkturinn verður `Valinn punktur`;
   - heiti stöðvar birtist í valda-punkts UI, ekki sem rangt kortamerki;
   - notandi er ekki sendur í innskráningu;
   - rétt spjald/gögn birtast.

## 8. Stóra Aksturskortið og layers

1. Stækka kort.
2. Vænt:
   - leið og zoom/pan state haldast;
   - punktar eru nógu stórir til að smella/tappa;
   - Vegagerðin vegakerfi og vegfærð eru til staðar þegar capability leyfir;
   - engir `Fela vegakerfi`/`Fela vegfærð` controls eða gamla neðsta
     skýringasvæðið birtist;
   - kortaattribution er rétt.
3. Smella Veðurstofupunkti.
4. Vænt: rétta fulla Veðurstofuspjaldið opnast, ekki inline/rangt spjald.
5. Fara til baka.
6. Smella Vegagerðarpunkti.
7. Vænt: rétta fulla Vegagerðarspjaldið opnast.
8. Staðfesta að filterpillur og valinn tími haldist.

## 9. Stöðvaspjöld og nákvæm back-state

Prófa bæði Veðurstofu- og Vegagerðarspjald.

1. Byrja með reiknaða leið og vera í `Kort`.
2. Smella stöð.
3. Vænt:
   - detail page opnast;
   - back-link segir `Til baka í akstur`;
   - engin hydration mismatch í Console;
   - íslensk tala notar sama server/client formatting, t.d. `17,7 km`.
4. Smella `Til baka í akstur`.
5. Vænt:
   - sama leið er enn valin;
   - notandi lendir aftur í `Kort`;
   - zoom/pan og valinn tími eru eins nálægt fyrra state og skilgreint er.
6. Endurtaka en byrja í `Gögn`.
7. Vænt: notandi lendir aftur í `Gögn`.
8. Endurtaka með innbyggðum back-takka símtækis/browser.
9. Endurtaka með browser forward.
10. Vænt:
    - engin tóm `Frá`/`Til`;
    - engin tvöföld route calculation loop;
    - engin login redirect fyrir public punkt.

## 10. Legacy prototype redirect

### Signed out

1. Opna:
   `/auth-mvp/vedrid/road-map-prototype`
2. Vænt: endar á `/vedrid`.
3. Opna:
   `/auth-mvp/vedrid/road-map-prototype?context=route&view=map&restoreRoute=1`
4. Vænt:
   `/vedrid?context=route&view=map&restoreRoute=1`
5. Prófa query með special character ef auðvelt er.
6. Vænt: query brotnar ekki og enginn open redirect er mögulegur.

### Signed in

1. Opna sömu legacy restore-slóð.
2. Vænt redirect-keðja:
   - legacy page → `/vedrid?...`;
   - middleware → `/auth-mvp/vedrid?...`.
3. Vænt:
   - query varðveitist;
   - engin loop;
   - route/view restore virkar.

## 11. Road-intelligence capability

### Notandi með capability eða public `WEATHER_ENABLED=all`

1. Reikna leið og opna stóra kortið.
2. Network filter: `road-intelligence`.
3. Vænt eftir virkni:
   - `map-proxy` tile-köll mega koma;
   - `road-segments` mega koma við load/pan;
   - `road-surface` kemur aðeins þegar surface-flæði notar það;
   - `station-markers` má koma sem fallback;
   - engin óvænt 401/403/404.
4. Pan/zoom kortið.
5. Vænt: ekki request storm; segment fetch er debounced/abortable.

### Authenticated notandi án `road-intelligence-v1`

Þetta þarf account/env-state sem raunverulega uppfyllir skilyrðið. Ekki breyta
production feature flags til að búa það til.

1. Opna `/auth-mvp/vedrid`.
2. Reikna leið og pan/zoom.
3. Network filter: `road-intelligence`.
4. Vænt: **engin köll** á:
   - `/map-proxy`;
   - `/road-segments`;
   - `/road-surface`;
   - `/station-markers`.
5. Vænt:
   - grunnkort, Veðurstofugögn og leiðarreikningur virka;
   - engin road/surface controls;
   - engin console 401/403/404 vegna þessara endpoints.

## 12. Spákort og spáspjöld

1. Fara í Spá/Spákort.
2. Velja nokkrar stöðvar, þar með Reykjavík, Akureyri og Vestmannaeyjar ef
   tiltækar.
3. Vænt:
   - sticky röð hylur gögn sem fara undir hana;
   - engin gildi sjást í gegnum/upp fyrir sticky röð;
   - connector-lína snertir spjald eða staðarheiti, líka Vestmannaeyjar;
   - spáspjöld reyna að vera nálægt sínum punkti;
   - spjöld skarast aldrei.
4. Velja nógu margar stöðvar til að skjárinn fyllist.
5. Vænt:
   - umframspjöld eru ekki lögð undir önnur controls;
   - banner neðst segir hversu mörg spjöld eru falin;
   - banner leggur til útþysjun eða fækkun stöðva.
6. Prófa A−/A+:
   - mobile: efst hægra megin;
   - desktop: í skýringarspjaldi.
7. Vænt: texti stækkar/minnkar án overlap eða horizontal overflow.

## 13. Veðurvæntingar og úrkoma

1. Setja úrkomumörk á 0.
2. Skoða töfluna þar sem úrkoma er mjög lítil en ekki nákvæmlega 0.
3. Vænt:
   - fleiri aukastafir birtast þegar nauðsynlegt er;
   - raunverulegt non-zero gildi lítur ekki út eins og `0`;
   - rétt gildi grámast samkvæmt mörkum.
4. Prófa hitastig og vindmörk.
5. Vænt: taflan uppfærist án maximum update depth eða render-loop.

## 14. Ferðalag regression

1. Signed out: opna `/vedrid/ferdalagid`.
2. Vænt: núverandi guest `FerdalagidClient` virkar óbreytt.
3. Signed in: opna `/auth-mvp/vedrid/ferdalagid`.
4. Vænt: authenticated ferðalag virkar og feature access hegðun er óbreytt.
5. Reikna eina leið í hvoru flæði ef tími leyfir.
6. Vænt:
   - engin route/provider regression;
   - pulse links og back links vísa í rétt ferðalagssamhengi;
   - canonical `/vedrid` promotion hefur ekki brotið deep links.

## 15. Mobile, keyboard og safe area

Prófa að minnsta kosti 360 px, 390 px og 530 px breidd.

1. Prófa Spá, Akstur Gögn, Akstur Kort og stöðvaspjald.
2. Opna keyboard í `Frá`, `Til` og staðaleit.
3. Vænt:
   - ekkert óvænt mobile zoom;
   - enginn horizontal scrollbar;
   - suggestions fara ekki út fyrir viewport;
   - sticky/header/footer overlap-a ekki input;
   - scroll-state lagast eftir keyboard lokun.
4. Snúa tæki eða breyta viewport-hæð.
5. Vænt:
   - MapLibre canvas resize-ar;
   - kortið verður ekki autt eða klippt;
   - safe-area/notch/home indicator hylur ekki controls.
6. Prófa loader við navigation.
7. Vænt: Teskeið-loader er sýnilegur og veldur ekki layout shift.

## 16. Desktop

1. Prófa við a.m.k. 1280 px breidd.
2. Vænt:
   - A−/A+ er á desktop-stað;
   - panel width er eðlileg;
   - kort og spjöld nýta pláss en teygjast ekki óhóflega;
   - engin mobile-only controls hanga á röngum stað;
   - sticky og footer hegðun er rétt.

## 17. Console og Network lokaathugun

Hreinsa Console og Network og endurtaka eitt fullkomið flæði:

1. `/vedrid`.
2. Velja/breyta public stað.
3. Reikna leið.
4. Opna stóra kortið.
5. Smella Veðurstofupunkti.
6. Til baka í akstur.
7. Smella Vegagerðarpunkti.
8. Browser/device back.

**Má sjást:**

- development-only Vercel analytics skilaboð;
- fyrirliggjandi preload warning ef það er enn til;
- controlled diagnostic logs.

**Má ekki sjást:**

- hydration mismatch;
- maximum update depth;
- `map_not_ready` eftir eðlilega bið;
- óútskýrð 401/403/404;
- `ERR_CONNECTION_REFUSED` þegar dev server/API er í gangi;
- repeated request loop;
- React state update after unmount;
- uncaught TypeError;
- manifest syntax error;
- station locale server/client mismatch.

## 18. Lokastaðfesting til Codex/Claude Code

Ef allt stenst, sendu:

- `Localhost release-checklist staðist`;
- hvaða auth-states voru prófuð;
- hvaða mobile/desktop stærðir voru prófaðar;
- hvort notandi án road-intelligence capability var tiltækur;
- hvort Console og Network voru hrein.

Ef eitthvað bilar, sendu fyrir hvert atriði:

1. nákvæma slóð;
2. signed-in/signed-out og capability state;
3. skref til að endurtaka;
4. vænta niðurstöðu;
5. raunverulega niðurstöðu;
6. skjáskot;
7. fyrstu viðeigandi Console-villu;
8. status/response fyrir viðeigandi Network-kall.

## Eftir localhost-prófun

Ef Stebbi staðfestir checklistuna er næsta skref:

1. loka code review;
2. stage-a aðeins TODO 091 runtime/test/handoff skrár og TODO #92 ef það á að
   fylgja;
3. **útiloka `.obsidian/workspace.json`**;
4. commit aðeins með sérstöku leyfi Stebba;
5. push/deploy aðeins með sérstöku leyfi;
6. fylgjast með Vercel build þar til það er grænt ef push er samþykkt.

## Route intelligence check

Engin ný route-family, vegkaflaþekking, provider matching, cache lykill eða
persónuleg ferðagögn voru bætt við í lokahringnum. `IcelandRoadmap.md` þarf
ekki uppfærslu.

## Framkvæmdarstaða

Codex breytti aðeins TODO #92, legacy redirect type/helper og targeted test,
auk þess að búa til þessa handoff-skrá. Ekkert commit, push, deploy,
migration, Supabase-, env- eða production-inngrip var gert.

