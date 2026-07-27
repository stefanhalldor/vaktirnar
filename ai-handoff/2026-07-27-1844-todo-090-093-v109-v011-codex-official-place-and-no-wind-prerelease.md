# Prerelease handoff — opinber bæjaleit og „Án vindmælingar“

**Dagsetning:** 2026-07-27 18:44

**Staða:** Útfært local og sjálfvirkar gæðagáttir grænar. Ekki commit-að, push-að eða deployað.

## Plan áfangans

1. Sameina stöðvar sem hafa engin vindgögn í eitt skýrt filter og fela þær sjálfgefið.
2. Bæta provider-neutral opinberri þéttbýlisskrá við HMS svo bæir eins og Hella finnist rétt.
3. Aðgreina bæi, staðföng og valda punkta í viðmóti og sýna réttar gagnatilvísanir.
4. Sannreyna Hella, fjölpóstnúmerabæi, rangar samnefndar HMS-niðurstöður og map/current-location flæði.
5. Keyra targeted próf, type-check, lint, full test suite og production-build.

## Hvað var raunverulega gert

- Nýr sameinaður filter-pillur **Án vindmælingar** telur bæði `no_data` og `no_wind_data`.
- Stöðvar án vindmælingar eru faldar sjálfgefið, líka eftir heppnaðan leiðarreikning og nýja leið. Notandinn getur birt þær og valið helst við live-refresh.
- Nýr versionaður last-known-good snapshot með 111 opinberum þéttbýlisstöðum og 174 póststöðum.
- Hagstofa gefur canonical bæjarheiti/auðkenni, IS 50V gefur núverandi byggðarfláka og point-on-surface hnit, Byggðastofnun gefur póstnúmer/póststaðaheiti.
- Runtime kallar aldrei beint í WFS. Handvirki generatorinn er fail-closed og snapshotið fer í code review.
- Hella er nú canonical `Þéttbýli` við rétt hnit og birtist sem `850 Hella`.
- HMS er áfram canonical fyrir nákvæm staðföng: `Hella 8` og `Melás 8` fá áfram HMS-forgang.
- Reykjavík og Kópavogur eru leitarhæf með mörgum staðfestum póstnúmerum, en viðmótið velur ekki eitt handahófskennt póstnúmer sem lýsingu á öllum bænum.
- Nágrannapóstnúmer og póststaðaheiti verða ekki frjáls alias fyrir rangan bæ; m.a. 170/200/210 lekur ekki yfir röng mörk og `Egilsstaðir` skilar ekki Fellabæ.
- Sameiginleg framsetning sýnir `Þéttbýli` vs. `Staðfang`, póststað, sveitarfélag og rétt accessibility-label.
- Gagnatilvísanir fyrir HMS, Hagstofu, IS 50V og Byggðastofnun birtast þar sem við á. IS 50V-attribution inniheldur generated retrieval-date.
- Nákvæm `device`/`map` hnit halda sínum uppruna og eru ekki vistuð sem aukaverkun. Sérstakt `labelSource` varðveitir aðeins uppruna nálægs birtingarheitis svo HMS-attribution sé rétt.
- Valinn device/map punktur sýnir áfram „Nálægt …“ í stað þess að póstnúmer nærliggjandi staðfangs yfirtaki lýsinguna.

## Skrár skoðaðar

- `WORKFLOW.md`, `Design.md`, `AGENTS.md` og núverandi staðaleitar-/kort-/filterflæði.
- Núverandi HMS search/reverse API, saved-place contract, route bridge, map picker og Veðrið/Vegagerðin state.
- Opin WFS metadata/gögn frá Hagstofu/LMÍ/Byggðastofnun í gegnum afmarkaða generator-keyrslu.

## Skrár breyttar eða nýjar

- `DataLicenses.md`
- `package.json`
- `scripts/generate-official-place-directory.mjs`
- `lib/places/officialPlaceDirectory.generated.json`
- `lib/places/officialPlaceAttribution.generated.ts`
- `lib/places/officialPlaceDirectory.server.ts`
- `lib/places/hmsDirectory.server.ts`
- `lib/places/currentLocation.client.ts`
- `lib/places/display.ts`
- `lib/places/types.ts`
- `lib/road-intelligence/placeSearchBridge.ts`
- `app/api/place/search/route.ts`
- `components/weather/PlaceSearch.tsx`
- `components/weather/PlaceMapPicker.tsx`
- `components/weather/PlaceResultIdentity.tsx`
- `components/weather/PlaceDataAttributions.tsx`
- `components/weather/WindStatusFilterPills.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`, `messages/en.json`
- Viðeigandi regression-próf undir `lib/__tests__/` fyrir official/HMS/API/display/map/current-location/bridge/no-wind.

`.obsidian/workspace.json` var þegar breytt af Stebba og var hvorki lesin, breytt né endurstillt af Codex. Eldri ótrackuð handoff-skjöl voru varðveitt.

## Skipanir og niðurstöður

- `npm run places:refresh-official` — exit 0; 111 bæir, 174 póststaðir, Hella 850 staðfest.
- Targeted 12-file regression suite — exit 0; 114/114 próf.
- Loka-targeted no-wind suite — exit 0; 11/11 próf.
- `npm.cmd run type-check` — exit 0.
- `npm.cmd run lint` — exit 0; aðeins eldri, óbreyttar warnings.
- `npm.cmd run test:run` á endanlegu ástandi — exit 0; 188 test files passed, 1 skipped; 4.076 tests passed, 28 skipped, 8 todo.
- `npm.cmd run build` á endanlegu ástandi — exit 0; compile, type/lint validation og 107 static pages græn.
- `git diff --check` — exit 0.

Fyrsta type-check keyrsla fann aðeins of vítt `Set<string>` test-type og var lagfærð. Fyrsta samhliða lint-tilraun stöðvaðist á staðbundinni PowerShell execution-policy áður en lint hófst; `npm.cmd` keyrslan kláraði síðan með exit 0.

Next build birti venjulega línuna `Environments: .env.local`. Codex opnaði ekki, prentaði ekki og breytti ekki `.env.local` eða secrets.

## Design.md og mobile

- Núverandi full-screen mobile map-picker mynstri er haldið.
- Controls halda minnst 40–44 px snertiflötum, texti wrappar og enginn nýr láréttur overflow-flötur var settur inn.
- Staðartegund er compact badge en aðalheiti og samhengi eru áfram læsileg.
- Engin ný route-transition eða server-síða var búin til; krafa um nýtt `loading.tsx` á því ekki við.

## Ákvarðanir

- Ekki nota HMS eitt og sér sem bæjaskrá; HMS er staðfangaskrá.
- Ekki nota Google til að laga canonical íslenska bæi; Google er áfram fallback aðeins þegar allar local heimildir skila engu.
- Ekki velja eitt póstnúmer fyrir fjölpóstnúmerabæ til birtingar.
- Ekki breyta primary source device/map í HMS; nálægt heiti fær sér `labelSource` svo privacy og attribution séu bæði rétt.
- Ekki gera hálfa breytingu á authenticated saved-place schema í þessum pakka.

## Eftirstandandi áhætta / sleppt

- Manual localhost/browserpróf voru ekki keyrð af Codex þar sem Stebbi stýrir dev servernum.
- Authenticated „Nýlegir staðir“ geyma enn aðeins name/address/hnit í núverandi DB-schema. Eftir endurhleðslu getur `Þéttbýli`/`Staðfang` badge og provider-attribution því horfið af vistaðri færslu. Rétt heildarlausn er sér migration + API/client contract áfangi; device/map punktar eiga áfram aldrei að vistast sjálfkrafa.
- Generated opinbert snapshot þarf að vera code-reviewað eins og önnur versionuð gögn við framtíðar-refresh.
- Eldri lint warnings eru óbreyttar og utan þessa scope.

## Route intelligence check

- Engin breyting var gerð á route candidate reikningi, vegagröfum, slitlagsmati eða áhætturöðun.
- Nýjar official/HMS niðurstöður fara í gegnum sama provider-neutral bridge og nákvæm valin hnit halda sér.
- Route-success reset er nú með réttu sjálfgefna wind-filter setti; live measurement refresh varðveitir núverandi val notanda.
- Full test suite og build innihalda route/weather regressions og eru græn.

## Supabase / SQL / production

- Engin SQL-skrá var skrifuð eða keyrð.
- Engar Supabase-lestrar eða -skrifaðgerðir voru framkvæmdar í þessum áfanga.
- Engin breyting á RLS, grants, auth, functions eða production-gögnum.
- Engin environment variable, secret, Vercel stilling eða deployment var snert.
- Ekkert commit, push eða deploy var framkvæmt.

## Localhost checks for Stebbi

**Forsenda:** Keyrðu eigin dev server og skráðu þig inn í Veðrið. Notaðu slóð dev serversins + `/auth-mvp/vedrid` (eða `/vedrid` ef redirectið þitt notar hana).

1. **Án vindmælingar**
   - Reiknaðu leið og opnaðu `Vegagerðin` / núverandi aðstæður.
   - Vænt: stöðvar án vindmælingar sjást ekki sjálfgefið; pillan `Án vindmælingar (N)` sést ef slíkar stöðvar eru til.
   - Smelltu á pilluna. Vænt: stöðvarnar birtast, pillan verður greinilega virk og talan passar.
   - Bíddu eftir live refresh eða reiknaðu aðra leið. Vænt: val notandans helst við refresh; ný leið byrjar aftur með þær faldar.

2. **Hella sem bær**
   - Leitaðu að `Hella`, `Hella 850` og `850 Hella`.
   - Vænt: rétt Hella á Suðurlandi kemur fremst sem `Þéttbýli`, með `850 Hella`, og markerinn er við Hellu en ekki úti á sjó.
   - Opnaðu `Velja af korti`. Vænt: allar samnefndar niðurstöður sjást með númeri og réttri staðsetningu; valið kort færist í fókus.

3. **Bær vs. staðfang**
   - Leitaðu að `Hella 8` og `Melás 8`.
   - Vænt: nákvæm HMS-staðföng koma á undan almenna bænum og eru merkt `Staðfang`.
   - Leitaðu að `Hella 611`. Vænt: Grímsey/Akureyrarbær samhengi er skýrt og staðurinn er ekki ranglega settur við Hellu á Suðurlandi.

4. **Fjölpóstnúmer og landamæri**
   - Leitaðu að `101 Reykjavík`, `105 Reykjavík`, `200 Kópavogur` og `203 Kópavogur`.
   - Vænt: réttur bær finnst en almenna bæjarspjaldið fullyrðir ekki eitt handahófskennt póstnúmer.
   - Prófaðu `Reykjavík 200`, `Reykjavík 170`, `Kópavogur 108` og `Kópavogur 210`.
   - Vænt: röng bæjar/póstnúmerasamsetning verður ekki canonical exact bæjarmatch.
   - Leitaðu að `Egilsstaðir`. Vænt: Fellabær birtist ekki bara vegna póststaðaheitis.

5. **Núverandi staðsetning og kortpunktur**
   - Á mobile, veldu núverandi staðsetningu; síðan veldu annan punkt beint á korti.
   - Vænt: nákvæm hnit haldast, staðfesting sýnir `Nálægt …` þegar reverse lookup finnur heiti, accuracy sést fyrir GPS og HMS/Byggðastofnun attribution birtist þegar heitið kemur frá HMS.
   - Vænt: keyboard veldur hvorki zoom-i, overlap-i né láréttu overflowi og confirm-button er sýnilegur.

**Varúð:** Þessi manual próf þurfa engin SQL-, Supabase-, env-, secret- eða production-skrif. Ekki keyra official refresh aftur nema ætlunin sé að endurgenerera snapshot og yfirfara diff.

## Tillaga að næsta skrefi

Stebbi keyrir localhost-skrefin hér að ofan. Ef þau standast er næsta stóra skref afmarkað commit/release scope-audit; migration fyrir saved-place provenance á að vera sér TODO/áfangi, ekki bætt við í flýti.

## Spurningar fyrir rýni

1. Finnst badge-aðgreiningin `Þéttbýli` / `Staðfang` nægilega skýr á mobile?
2. Er rétt product-ákvörðun að fela `Án vindmælingar` sjálfgefið en leyfa opt-in?
3. Viljum við taka saved-place provenance migration sem næsta sjálfstæða áfanga áður en þessi pakki fer í production?

## Prerelease-póstur

- Sendur á `stefanhalldor@gmail.com` með þessu handoffi í viðhengi.
- Gmail message/thread ID: `19fa4e5ff6da5b77`.
- Sending tókst; Gmail connector skilaði `isError: false`.
