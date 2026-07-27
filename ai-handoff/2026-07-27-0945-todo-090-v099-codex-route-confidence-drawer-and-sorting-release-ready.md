# TODO-090 v099 — fullbreið skýring, traustari leiðaröðun og veðurvissa

**Agent:** Codex  
**Tími:** 2026-07-27 09:45  
**Staða:** Útfært og fullprófað; bíður sjónrænnar localhost-staðfestingar Stebba.

## 1. Plan áfangans

1. Taka caution-skýringuna úr 205–245 px lárétta leiðarspjaldinu og opna hana í fullbreiðri, sýnilegri focus-skúffu.
2. Leiðrétta sjálfgefna röðun svo magn óstaðfests slitlags ráði áður en malarkílómetrar eru bornir saman.
3. Nota staðsetningu nothæfra Vegagerðin-vindmælinga sem afmarkaðan confidence-mælikvarða, án þess að fullyrða að veður sé slæmt.
4. Setja Google-leiðir aftast í sjálfgefnu röðuninni þar sem spjöld þeirra hafa ekki sambærilega Teskeiðar-greiningu.
5. Skrá HMS-staðaleitarviðhengið sem nýtt TODO-atriði án framkvæmdar.
6. Keyra targeted próf, type-check, fulla test suite, production build og diff-check.

## 2. Hvað var raunverulega gert

### Fullbreið focus-skúffa

- Inline `<details>` inni í lárétta spjaldinu var fjarlægt.
- Triggerinn opnar nú fullbreiða bottom-sheet yfir núverandi fullscreen leiðakorti.
- Skúffan hefur dimmað backdrop, sticky header, eigið vertical scroll, 72dvh hámark og safe-area padding.
- Focus fer á 40x40 px loka-hnapp eftir opnun.
- Escape og backdrop/loka-hnappur loka skúffunni; focus fer aftur á trigger leiðarinnar.
- Tab helst á eina interactive control skúffunnar meðan hún er opin.
- Leiðarval breytist ekki þegar skýringin er opnuð.

### Sjálfgefin leiðaröðun

- Google-leiðir fara aftast í `default` röðun.
- Innan Teskeiðarleiða er fyrst greint milli staðfests og óstaðfests slitlags og síðan er raunverulegur fjöldi óstaðfestra kílómetra borinn saman.
- Því fer leið með 14,7 km óstaðfest slitlag fram fyrir leið með 69 km, jafnvel þótt sú fyrri hafi lengri malarkafla.
- Núverandi fjallvega-, route-caution-, veðurvissu- og malarreglur halda áfram að brjóta jafntefli innan viðeigandi confidence-flokks.
- Sérstök röðun eftir aksturstíma, vegalengd eða veðri fylgir áfram valda mælikvarðanum og setur Google ekki sjálfkrafa aftast.

### Veðurvissa

- Candidate-leiðir eru bornar saman við Vegagerðin-stöðvar innan núverandi 2,5 km route-match marka.
- Aðeins stöðvar með nothæfum vindgögnum telja til coverage.
- Nýr pure helper reiknar mestu vegalengd eftir leiðinni frá hvaða punkti sem er að næstu matched stöð:
  - endar leiðar eru mældir beint að fyrstu/síðustu stöð;
  - innri bil nota helming bilsins þar sem næsta stöð getur verið sitt hvorum megin.
- Confidence-mörkin eru 50 km. Leið fær `Takmörkuð veðurvissa` ef engin nothæf stöð finnst eða mesti station-distance fer yfir 50 km.
- Skýringin segir skýrt að þetta sanni ekki slæmt veður; Teskeið geti aðeins ekki staðfest aðstæður með sama öryggi.
- Confidence-leiðir fara aftar í default og `Veðri núna` röðun.
- Leið með takmarkaða coverage fær ekki græna `Besta veðrið ef lagt er af stað núna` merkið.
- Ef ein leið hefur engin gögn halda aðrar leiðir samt sínu weather score; veðurröðun verður virk ef að minnsta kosti ein leið hefur nothæf gögn og gagnalausa leiðin fer aftast.
- Veðurvissa er aðskilin frá eftirvagnaviðvörun. `Varasamt með eftirvagna` er aðeins sýnt þegar route-caution contract styður það.

### TODO #93

- Viðhengið um HMS Staðfangaskrá og autocomplete var skráð sem `#93 Veður: HMS staðaleit og autocomplete`.
- Forgangstafla og Pakki F voru uppfærð.
- Atriðið inniheldur discovery, gagnalíkan/import/API/UX, privacy, manual pre-check og framtíðar localhost checks.
- Engin HMS-rannsókn, gagnasækja, SQL, Supabase- eða UI-framkvæmd var gerð.

## 3. Skrár sem voru skoðaðar

- `AGENTS.md`
- `WORKFLOW.md`
- `Design.md`
- `IcelandRoadmap.md`
- `TODO.md`
- Viðhengið `pasted-text.txt` frá Stebba
- Viðeigandi route-comparison, RoadMap, provider matching, message og test skrár

## 4. Skrár sem voru breyttar í þessum áfanga

- `components/weather/RouteComparisonMiniMap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/providerRouteMatching.ts`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- `lib/__tests__/providerRouteMatching.test.ts`
- `messages/is.json`
- `messages/en.json`
- `IcelandRoadmap.md`
- `TODO.md`
- Þessi handoff-skrá

Vinnusvæðið var þegar með margar ócommittaðar breytingar frá fyrri áföngum/öðrum agent. Ekkert var resettað eða afturkallað.

## 5. Skipanir sem voru keyrðar

| Skipun | Niðurstaða |
| --- | --- |
| `npm run type-check` | Exit 0; keyrt aftur eftir lokabreytingu |
| `npm run test:run -- lib/__tests__/route-comparison-mini-map.test.tsx lib/__tests__/providerRouteMatching.test.ts` | Fyrsta keyrsla fann focus-timing test-villu; eftir lagfæringu exit 0, 44/44 próf |
| `npm run test:run` | Exit 0, 168 passed og 1 skipped test files; 3888 passed, 28 skipped, 8 todo, 3924 total; loka-keyrslan var eftir síðustu logic-breytingu |
| `npm run build` | Exit 0; production build, type/lint validation og 105 static pages; loka-keyrslan var eftir síðustu logic-breytingu |
| JSON parse á `messages/is.json` og `messages/en.json` | Exit 0 |
| `git diff --check` | Exit 0; aðeins fyrirliggjandi LF/CRLF viðvaranir |

## 6. Niðurstöður og exit codes

- Loka full test suite: **3888 passed**, 28 skipped, 8 todo.
- Loka production build: exit 0.
- Targeted component/helper próf: **44/44 passed**.
- Build sýnir fyrirliggjandi warnings um hook dependencies, `<img>` og sex mánaða gamlan Browserslist gagnagrunn; engin ný build villa kom fram.
- Fyrirliggjandi jsdom `Not implemented: navigation to another Document` texti var non-failing output.

## 7. Hvað mistókst eða var sleppt

- Fyrsta targeted UI-prófið sýndi að synchronous jsdom `requestAnimationFrame` gat keyrt áður en drawer-ref commit-aðist. Focus var færður í `useEffect` eftir render; allar endurkeyrslur urðu grænar.
- Engin browser automation eða skjámynd var tekin; Stebbi þarf að staðfesta útlit og raunleiðir á sínum localhost.
- Dev server var hvorki ræstur né endurræstur.
- Engin snapshot refresh, Supabase-aðgerð, SQL, commit, push, deploy eða production breyting var framkvæmd.

## 8. Ákvarðanir sem Codex tók

- Fullbreið bottom-sheet var valin fremur en að reyna að stækka card inni í láréttu overflow-svæði; hún tryggir sýnileika og focus óháð x-stöðu spjaldsins.
- 50 km confidence-mörk eru notuð sem gagnavissuviðmið í samræmi við fyrirliggjandi 50 km unavailable-confidence mörk Veðurstofu-provider. Þetta er ekki safety- eða weather-severity fullyrðing.
- Vegagerðin-stöð án nothæfra vindgagna telur ekki sem sannanir fyrir núverandi veðri.
- Green best-weather badge er aðeins veitt leið sem stenst coverage-confidence.
- Provider-röðun á aðeins við `default`; explicit user sort heldur merkingu sinni.
- Google er sett aftast þar sem Teskeið getur ekki enn borið Google-spjöld saman með sömu surface/caution confidence og eigin candidates.

## 9. Áhætta sem er enn til staðar

- 50 km mörkin eru skýr og varfærin product-regla, en þarf raunleiðaúttekt hjá Stebba. Strjál stöðvanet þýðir óvissu, ekki sjálfkrafa hættulegan veg.
- Coverage notar núverandi Vegagerðin road-weather gögn. Hún tekur ekki sjálfkrafa allar Veðurstofu forecast-stöðvar með, því mælikvarðinn er um matched númælingar sem weather-score notar.
- Provider-reported route distance er notuð með routeFraction úr canonical matching-polyline; mikill geometry/provider munur gæti skekkt birtan confidence-distance lítillega.
- Fullscreen bottom-sheet þarf sjónræna staðfestingu á Safari/iPad/mobile browser chrome þótt layout, a11y og build próf séu græn.
- Active road-graph snapshot er enn óbreytt frá v098; slitlags-source lagfæringin þar verður ekki virk í gögnunum fyrr en sérstök refresh-keyrsla fær leyfi.

## 10. Tillaga að næsta skrefi

1. Stebbi keyrir localhost checks hér að neðan.
2. Ef 50 km merkingin er of algeng eða of sjaldgæf skal safna nokkrum nafngreindum leiðadæmum áður en mörkunum er breytt.
3. Ef UI er staðfest er kóðinn tilbúinn í venjulega commit/deploy-rýni; commit, push og deploy þurfa áfram sérstakt leyfi.
4. Protected snapshot refresh úr v098 er aðskilin gagnaskref og þarf sértækt leyfi.

## 11. Atriði sem næsta rýni ætti sérstaklega að skoða

- Hvort fullbreið skúffa haldist alveg sýnileg með mobile browser chrome og við landscape viewport.
- Hvort 50 km `Takmörkuð veðurvissa` gefi réttan fjölda merktra leiða í raunnotkun.
- Hvort Google-aftast sé æskilegt jafnvel þegar allar Teskeiðarleiðir eru með surface/caution merki; þessi röðun er nú vísvitandi product-ákvörðun Stebba.
- Hvort síðar eigi að reikna coverage úr sameinuðum Vegagerðin-mælingum og staðfestum Veðurstofu-mælingum, með provider-neutral confidence contracti.

## 12. Supabase, SQL, auth og production

- **SQL:** ekkert skrifað eða keyrt.
- **Supabase/storage/snapshot:** ekkert lesið eða skrifað af þessum breytingum/prófum.
- **RLS/auth/grants/functions:** óbreytt.
- **Production/notendagögn/secrets/billing:** engin áhrif.
- **HMS:** aðeins textaviðhengi Stebba var lesið og skráð í TODO; engin ytri gagnaveita var kölluð.

## Route intelligence check

- Route geometry, provider contract og snapshot topology eru óbreytt í þessum áfanga.
- Nýja station-confidence fallið er pure og vinnur aðeins með provider-neutral route fraction + route distance eftir að Vegagerðin matching hefur lokið.
- Veðurvissa breytir framsetningu og ordering; hún breytir ekki route computation eða gefur safety claim.
- Google-last reglan er eingöngu UI default ordering og breytir ekki Google/Teskeið provider responses.
- `IcelandRoadmap.md` v0.9.1 skráir mörk, semantics og fail-safe texta.

## Design.md samræmi

- Mobile-first fullbreið sheet; ekkert lárétt overflow úr 245 px carousel-cardi.
- 40 px close touch target, sýnilegt focus, Escape og focus restore.
- Safe-area padding og max-height/own-scroll verja neðra efni fyrir browser chrome.
- Stutt, róleg hegðun án layout shift í route-card listanum.
- Allur nýr notendatexti er í íslenskum og enskum message-skrám.

## 13. Localhost checks for Stebbi

**Slóð/state:** Opnaðu núverandi Veðrið-route flæði á localhost, reiknaðu leið með a.m.k. tveimur Teskeið candidates og einni Google-leið og opnaðu `Veldu leið á korti`.

1. Opnaðu skýringu á `Varasamt með eftirvagna` eða `Takmörkuð veðurvissa`.
   - Vænt: fullbreið skúffa birtist neðst á tækinu, óháð því hvar cardið er í lárétta listanum.
   - Vænt: dimmað backdrop og allur skýringartexti eru sýnileg; efnið má scrolla innan 72dvh.
   - Vænt: focus er á `×`-hnappnum og leiðin sjálf skiptir ekki um selected state.
2. Lokaðu með `×`, Escape og backdrop í þremur aðskildum opnunum.
   - Vænt: skúffan lokast, route map lokast ekki og focus fer aftur á triggerinn.
3. Prófaðu við 360, 390, 460 og iPad 768x1024, bæði portrait og landscape ef hægt er.
   - Vænt: enginn láréttur overflow, overlap eða texti utan skjás.
4. Finndu leiðirnar úr dæminu með um 69 km og 14,7 km óstaðfest slitlag.
   - Vænt: 14,7 km óstaðfesta leiðin kemur á undan 69 km leiðinni þótt hún hafi 21,3 km möl á móti 7,5 km.
5. Veldu `Sjálfgefið`.
   - Vænt: allar Google-leiðir eru aftast; Teskeiðarleiðir raðast samkvæmt confidence/caution/surface reglum.
6. Veldu `Aksturstíma`, `Vegalengd` og `Veðri núna`.
   - Vænt: Google-last override gildir ekki; hver filter raðar eftir sínu heiti og carousel fer lengst til vinstri.
7. Prófaðu leið með löngum stöðvabilum eða enga matched stöð.
   - Vænt: `Takmörkuð veðurvissa` birtist og drawer segir annaðhvort að engin stöð með nothæf vindgögn hafi fundist eða sýnir mesta vegalengd að næstu stöð.
   - Vænt: textinn segir skýrt að þetta sanni ekki slæmt veður.
   - Vænt: leiðin fær ekki grænt `Besta veðrið` merki.
8. Ef ein leið hefur engar stöðvar en önnur hefur mælingar, veldu `Veðri núna`.
   - Vænt: filterinn er virkur, mælda leiðin heldur veðurskori og gagnalausa leiðin fer aftast.

**Regressions:** Kort-smellur á áfram að færa rétt card mjúklega í fókus; `Finna fleiri Teskeiðarleiðir` og aðal-CTA eiga að virka; summary-spjald má ekki blikka áður en fullscreen kort opnast.

**Öryggisvarúð:** Þessi checks þurfa hvorki Supabase né snapshot refresh. Ekki keyra protected refresh eða production rollout sem hluta af sjónrænu prófi án sérstaks leyfis.
