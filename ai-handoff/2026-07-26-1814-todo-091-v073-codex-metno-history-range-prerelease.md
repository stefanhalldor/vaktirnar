# TODO-091 v073 — met.no samhliða hleðsla og einföld samfelld spásaga

**Created:** 2026-07-26 18:14  
**Timezone:** Atlantic/Reykjavik  
**Fyrra handoff:** `2026-07-26-1720-todo-091-v072-codex-v071-deep-prerelease-review.md`  
**Framkvæmdarleyfi:** Stebbi hafði samþykkt afmarkaðar kóða-, prófa- og handoff-breytingar fyrir spátöfluna og tengdan prerelease-pakka. Leyfið náði ekki til SQL-keyrslu, Supabase/production/env breytinga, dev-server, commit, push eða deploy.

## Findings fyrst

### Hátt — lagað: history-propið slökkti á núverandi met.no-hleðslu

`WeatherChasePanel` sleppti `onLoadItemRows` alfarið þegar `onLoadHistoryDay` var til staðar. Veðurstofuröð gat því birst úr fyrirliggjandi gögnum á meðan met.no-röð, sem þarf lazy point-fetch, varð auð.

Nú keyra current met.no-sókn og history-sókn samhliða. History-request metadata er byggt úr stöðugum `items`/ID-gildum svo current-row state update endurræsi ekki eða tvítaki history-effectið.

### Hátt — lagað: einfalt hopp á elsta dag hefði skilið millidaga auða

Gamla history-contractið las aðeins einn dag. Að skipta örvaflettingu út fyrir „Skoða eldri spár“ án server-breytingar hefði því sýnt elsta daginn og framtíðina en auða daga þar á milli.

`day` er nú afmarkaður, inclusive upphafsdagur. Server les history samfellt frá þeim degi til loka dagsins í dag og sameinar current/latest provider-raðir sem ná áfram inn í framtíðina. Validation heldur áfram að takmarka upphafið við 14 daga retention og að hámarki sjö canonical staði.

### Hátt — lagað: provider-bilun gat litið út eins og lögmæt auður history-dálkur

Provider-sóknir voru sameinaðar með `Promise.allSettled`; ef önnur tókst var hin cache-uð sem tómt safn án villu eða retry. Explicit eldri-range request notar nú `Promise.all`: current taflan hleðst áfram progressive provider fyrir provider, en eldri samfellda bilið telst aðeins tilbúið þegar allir providerar sem voru raunverulega umbeðnir svara. Bilun varðveitir núverandi töflu og býður retry.

### Miðlungs — lagað: fyrsta history-discovery villa var ósýnileg

Ef fyrsta bakgrunnsbeiðnin fyrir `availableFromDay` fékk tímabundið 503 birtist hvorki hnappur né retry. Nú birtist eitt skýrt „Náði ekki í eldri spár. Reyna aftur“, loading-state helst stöðugt við retry og successful retry birtir hnappinn ef eldri gögn eru í raun til.

### UX/accessibility — lagað: dagaflettingu skipt út fyrir eitt samfellt flæði

- Sjálfgefið bil byrjar í dag.
- „Skoða eldri spár“ birtist aðeins þegar eldri gögn eru til.
- Smellur sækir beint frá elsta retained degi.
- Taflan býr til alla almanaksdaga samfellt frá upphafinu til síðasta raunverulega framtíðargildis.
- Lárétta taflan er færð alveg til vinstri og keyboard-focus fer á samanburðarsvæðið þegar hleðslu lýkur.
- Gömlu vinstri/hægri dagörvarnar og fasta sjö daga gluggann var fjarlægt.

Lausnin fylgir `Design.md`: eitt secondary control, 40 px touch target, sýnilegt loading/error/retry, afmarkað innra horizontal overflow og focus-handoff þegar virkt control hverfur.

## Plan þessa áfanga

1. Greina af hverju Veðurstofugildi birtust en met.no ekki.
2. Endurvirkja current met.no lazy-load samhliða history án effect-loopa.
3. Einfalda history UI í einn hnapp og samfellt oldest-to-future bil.
4. Herða provider failure, discovery retry og focus behavior.
5. Keyra markpróf, full tests, type-check, diff-check og production build.
6. Skrá leiðrétta SQL/deployment-stöðu og localhost checks.

## Hvað var raunverulega gert

- Current met.no point-loader er ekki lengur disable-aður af history-loader.
- History-effect er stöðugt þótt current met.no rows komi inn á meðan request er í flugi.
- History query les range `[requested day … today]`, current/latest raðir ná áfram út forecast-horizon.
- Taflan sýnir default daginn í dag til síðasta tiltæka framtíðardags; eftir click sýnir hún elsta tiltæka dag til sama framtíðarenda.
- Einn „Skoða eldri spár“ takki kom í stað dagörva.
- Initial history discovery og explicit older range hafa loading/error/retry state.
- Explicit mixed-provider history request er atomic og cache-ar ekki provider-bilun sem tóm gögn.
- Focus færist á uppfærða töfluna og horizontal scroll fer á elsta dálk eftir successful click.
- Íslenskur og enskur texti var uppfærður.
- Regression-próf voru bætt við fyrir samhliða met.no load, stable in-flight history, samfellt dagabil, fullan framtíðarenda, retry og focus.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- v072 handoffið
- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/weatherChaseHistory.server.ts`
- `lib/weather/weatherChaseHistory.types.ts`
- `app/api/teskeid/weather/forecast-history/route.ts`
- tengd history/met.no/API próf og translation keys

## Skrár breyttar í þessum framhaldsáfanga

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/weatherChaseHistory.server.ts`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`
- `lib/__tests__/weather-chase-history.test.ts`
- `messages/is.json`
- `messages/en.json`
- þetta handoff

Vinnusvæðið inniheldur einnig fyrri samþykktar prerelease-breytingar og user-owned `.obsidian/workspace.json`. Engu slíku var rúllað til baka.

## Skipanir og niðurstöður

- Fyrstu markpróf eftir met.no-fix: **5 files, 40/40 pass**.
- Markpróf eftir history-UI/range: **5 files, 44/44 pass**, exit 0.
- Lokalegt `npm run type-check`: exit 0.
- Lokalegt `git diff --check`: exit 0; aðeins fyrirliggjandi LF/CRLF warnings.
- Lokalegt `npm run test:run`: exit 0; **160 files passed, 1 skipped; 3801 tests passed, 28 skipped, 8 todo**.
- Lokalegt `npm run build`: exit 0; compile, type/lint phase og 105 static pages pass.

Build sýnir fyrirliggjandi hook-warning backlog í eldri components, eina `<img>` viðvörun og gamalt Browserslist-gagnasafn. Engin ný build-villa eða warning frá `WeatherChasePanel` kom fram.

## Hvað mistókst eða var sleppt

- Fyrsta markkeyrsla fann viljandi malformed-row fixture og of þrönga deferred-promise typing í nýju prófi; bæði voru leiðrétt áður en final keyrslur fóru grænar.
- Engin browser-, localhost- eða rauntækjaprófun var keyrð af Codex; Stebbi á dev serverinn.
- Codex keyrði ekkert SQL, breytti ekki Supabase, RLS, auth, env eða production.
- Ekkert var commit-að, push-að eða deployað.

## Ákvarðanir

- Default tafla byrjar alltaf í dag, en endar við síðasta raunverulega framtíðargildi í stað fastra sjö daga.
- Eldri history birtist sem eitt samfellt dagabil; engar faldar dagasíður eða örvar.
- Current providerar mega áfram birtast progressive. Explicit older-range samanburður er atomic yfir þá providera sem requestið inniheldur svo vöntun líti ekki út sem raunverulegt `–`.
- Engin fortíð er búin til afturvirkt. Nýtt met.no history byrjar þegar projection/warmup fer að safna snapshotum.
- `day` í núverandi internal API er varðveitt vegna backward compatibility en er skjalfest sem inclusive range-start.

## SQL / Supabase / öryggi

### Staðfest af Stebba í þessum þræði

- `sql/84_metno_point_forecasts_history.sql` — **keyrt successfully af Stebba**.
- `sql/93_weather_chase_metno_place_history.sql` — **keyrt successfully af Stebba eftir SQL 84**.
- Admin warmup `POST /api/admin/weather/warm-metno-points` — **HTTP 200; total 43, succeeded 43, failed 0**, keyrt af Stebba.

Codex keyrði ekkert af þessu og staðfesti ekki sjálfstætt hvaða Supabase environment localhost tengdist. Warmup sannar að canonical 43 punktar gátu verið sóttir og skrifaðir í umhverfið sem Stebbi notaði; það býr ekki til eldri snapshot afturvirkt.

### Leiðrétt dependency/deployment röð

1. SQL 84 þarf að vera til áður en SQL 93 er keyrt. **Bæði staðfest keyrð af Stebba.**
2. SQL 92 þarf að vera keyrt áður en LKG road graph snapshot er bootstrapað. **Ekki staðfest í þessum framhaldsáfanga.**
3. SQL 93 víkkar SQL 84 töfluna fyrir canonical `road_map_place` history. **Staðfest keyrt.**
4. Road graph bootstrap/refresh á réttu umhverfi, ef SQL 92 og candidate release eiga að fara út.
5. met.no warmup. **43/43 staðfest af Stebba á tengdu umhverfi.**
6. Deploy og afmarkað smoke; víkka per-user flag aðeins eftir staðfestingu.

Engin ný migration, RLS policy eða grant var skrifuð í v073. Service-role-only history access og provider access-gates eru óbreytt.

## Áhætta sem er enn til staðar

- Raunveruleg browser/network hegðun eftir Fast Refresh þarf localhost-prófun.
- Þar sem SQL 84/93 voru nýkeyrð getur met.no haft current/future rows en enga eldri fortíð enn. Það er rétt og má ekki fela með tilbúnum gildum.
- Ef blandað explicit older-range request missir annan provider birtist retry í stað partial history. Current taflan sjálf heldur áfram að sýna provider-raðir sem þegar eru tiltækar.
- SQL 92/LKG bootstrap staða er ekki staðfest í þessum áfanga.
- Fyrirliggjandi map hook-warning backlog er áfram utan scope.

## Tillaga að næsta skrefi

Stebbi gerir localhost-prófin hér að neðan. Ef þau eru græn getur Claude Code yfirfarið v073 og heildardiffið fyrir commit/deploy ákvörðun. SQL 84/93 og warmup þarf ekki að endurtaka vegna þessarar kóðalagfæringar.

## Spurningar fyrir Claude Code

1. Sér Claude Code einhverja stale-request eða provider-gate leið eftir að explicit history range notar `Promise.all` en current provider loading er áfram progressive?
2. Er einhver ástæða til að endurnefna internal `day` í `fromDay` í seinni backward-compatible cleanup, eða er núverandi skjalfesting næg?
3. Staðfestir Claude Code að SQL 84 → SQL 93 röðin og 43/43 warmup séu nægar forecast-history forsendur, að því gefnu að environment hafi verið rétt?
4. Er SQL 92 og road graph bootstrap þegar keyrt á release-umhverfinu, eða stendur það enn út af fyrir route-candidate hlutann?

## Localhost checks for Stebbi

### A. Strax: met.no regression

**Slóð:** `/auth-mvp/vedrid` með sömu stöðum og á skjámyndinni; prófa einnig `/vedrid` ef public aðgangur á við.

1. Leyfa Fast Refresh að klárast eða endurhlaða síðuna einu sinni.
2. Velja að minnsta kosti eina Veðurstofustöð og einn `Yr / met.no` stað.
3. Vænt:
   - taflan birtist um leið og annar provider hefur gildi;
   - met.no current/future gildi bætast sjálfkrafa við;
   - hver óklár lína segir aðeins einu sinni `Sæki spá...`;
   - history-request er ekki tví-/þrísend við það eitt að met.no rows koma inn;
   - engin rauð 401/404/503 frá point/history í eðlilegu flæði.
4. SQL 84/93 eða 43 punkta warmup þarf **ekki** að keyra aftur fyrir þetta próf.

### B. Default dagabil

1. Velja `00`, `12` eða annan tíma sem er þegar liðinn í dag.
2. Vænt: dagurinn í dag er áfram fyrsti dagur og geymt gildi dagsins sést þó klukkan sé liðin.
3. Taflan heldur áfram til síðasta dags sem einhver valinn provider á raunverulegt forecast-gildi fyrir; hún er ekki lengur bundin við nákvæmlega sjö daga.
4. Þar sem provider vantar tiltekið station/time gildi sést `–`; heill dagur má ekki hverfa úr samfellda bilinu.

### C. „Skoða eldri spár“

**Forsenda:** eldri history-row en dagurinn í dag þarf raunverulega að vera til fyrir að hnappurinn birtist. Nýi met.no warmup-inn býr ekki til fortíð; Veðurstofan gæti þegar átt eldri gögn og met.no safnast upp með tímanum.

1. Þegar hnappurinn birtist, ýta á **„Skoða eldri spár“**.
2. Vænt:
   - engar vinstri/hægri dagörvar;
   - eitt stöðugt `Sæki eldri spár…` pending-state;
   - taflan hoppar að elsta raunverulega retained degi;
   - allir almanaksdagar þaðan til dagsins í dag og áfram út forecast-horizon eru í einni samfelldri töflu;
   - lárétta skrollið byrjar alveg vinstra megin;
   - keyboard-focus lendir á töflusvæðinu eftir hleðslu;
   - hnappurinn hverfur þegar bilið er komið.
3. Ef request bilar tímabundið: núverandi tafla helst og eitt **„Reyna aftur“** birtist. Sama á við ef fyrsta bakgrunnsleit að elsta degi bilar.

### D. Provider, public og mobile regression

1. Prófa met.no-only, Veðurstofan-only og blandað station-set.
2. Með `WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true` sem public:
   - met.no current/history sem notandi má sjá heldur áfram að virka;
   - client sendir ekki óleyfilega Veðurstofu-history beiðni.
3. Breyta stöðum og sýnilegum tímum eftir að current gögn eru komin; engin gömul röð má leka milli staða.
4. Prófa 360, 390 og 460 px:
   - enginn page-level horizontal overflow, overlap eða mobile zoom;
   - aðeins taflan sjálf má skrolla lárétt;
   - „Skoða eldri spár“ og retry hafa að minnsta kosti 40 px snertiflöt.
5. Skoða Console og Network meðan current met.no kemur inn og þegar eldri spár eru sóttar.

### E. Atriði úr sameinuðum release-pakka sem standa enn til prófunar

- OTP fyrsta kóða/resend/uncertain delivery flæði.
- Public CTA og engar expected 401 console-villur.
- Route comparison: ólíkir litir, fullscreen leiðaval, preview án veðurreiknings og apply sem endurheimtir fullan scrubber.
- Teskeið candidate: global + per-user gate, automatic pending retry og LKG snapshot eftir að SQL 92/bootstrap er staðfest.
- Mobile Safari safe-area, kortadisclaimer/„Stækka kort“ og route comparison fullscreen.

