# Handoff: Codex rýni á v257 + prototype polish

Created: 2026-07-20 23:50  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Relevant TODO: 086  
Type: Implementation handoff for Claude Code review  

---

## 1. Plan áfangans

Stebbi bað Codex að rýna `2026-07-20-2340-todo-086-v257-claude-m2a-complete-wind-dots`, svara hvað þarf meira til að prófa eftir SQL89/env, og gera breytingar og/eða halda áfram í næstu framkvæmd.

Ég tók þetta sem afmarkað framkvæmdarleyfi fyrir:

- rýni á v257 M2A complete/wind dots
- litlar lagfæringar fyrir prototype-prófun
- engin commit, push, deploy, SQL, Supabase write eða Vercel breyting

---

## 2. Stutt svar við Stebba: hvað þarf meira til að prófa?

Þar sem Stebbi er búinn að:

1. keyra SQL89
2. setja `ROAD_INTELLIGENCE_V1_ENABLED=true` í `.env.local`

þá þarf enn:

1. **Feature access row fyrir notandann**  
   Dæmi:

   ```sql
   insert into public.feature_access (email, feature_key)
   values ('þitt-netfang@domain.is', 'road-intelligence-v1')
   on conflict do nothing;
   ```

   Nota canonical/lowercase emailið sem innskráði notandinn er með.

2. **Endurræsa localhost dev server**  
   `.env.local` lesst ekki örugglega inn í þegar keyrandi dev server fyrr en hann er restartaður.

3. **Vera innskráður á `/auth-mvp/vedrid`**  
   Public `/vedrid` á ekki að sýna Road Intelligence linkinn.

Ef `Korttilraun →` sést ekki eftir þetta er líklegast annað hvort:

- `ROAD_INTELLIGENCE_V1_ENABLED` er ekki lesið inn, eða
- `feature_access` row vantar eða email passar ekki nákvæmlega eftir canonicalization.

---

## 3. Rýni á Claude v257

Meginniðurstaða: v257 er góð og stefnumótandi rétt. MapLibre prototype er orðið miklu meira “alvöru proof” eftir:

- LMÍ grunnkort
- Vegagerðin road network overlay
- live Vegagerðin vindpunkta
- toggle
- NavigationControl
- station marker API sem notar núverandi cache/history fallback

Ég fann engin SQL/RLS/auth veikingu.

Tvö atriði sem ég vildi laga áður en Stebbi prófar:

1. **Hardcode-aðir prototype UI textar**  
   Íhluturinn hafði íslenska texta beint í JSX (`Fela vegakerfi`, `Sýna vegakerfi`, `Kort gat ekki hlaðist`, `stöðvar`). Samkvæmt AGENTS eiga notendatextar að vera í `messages/is.json` og `messages/en.json`.

2. **Overlay toggle gat farið úr sync fyrir map load**  
   Ef notandi smellir á toggle áður en MapLibre style er fullhlaðinn, þá uppfærðist React state en MapLibre layer visibility ekki. Ég bætti við ref sync og set initial layer visibility í `map.on('load')`.

---

## 4. Hvað Codex breytti

### `components/weather/RoadMapPrototypeMap.tsx`

- Bætti við `useTranslations('teskeid.vedrid.overview')`.
- Færði prototype UI texta yfir í translation keys.
- Bætti við `showOverlayRef` til að muna toggle state áður en style er tilbúinn.
- Í `map.on('load')` er `vegagerdin-vegakerfi` visibility nú stillt út frá nýjasta toggle state.
- `handleOverlayToggle()` uppfærir bæði React state og ref.

### `messages/is.json`

Bætti við:

- `roadMapPrototypeErrorTitle`
- `roadMapPrototypeHideRoadNetwork`
- `roadMapPrototypeShowRoadNetwork`
- `roadMapPrototypeStationCount`

### `messages/en.json`

Bætti við sömu keys á ensku.

---

## 5. Skrár sem voru skoðaðar

- `ai-handoff/2026-07-20-2340-todo-086-v257-claude-m2a-complete-wind-dots.md`
- `sql/89_feature_access_road_intelligence_v1.sql`
- `components/weather/RoadMapPrototypeMap.tsx`
- `app/api/teskeid/road-intelligence/map-proxy/route.ts`
- `app/api/teskeid/road-intelligence/station-markers/route.ts`
- `lib/road-intelligence/stationGeoJson.ts`
- `lib/__tests__/road-intelligence-station-geo-json.test.ts`
- `messages/is.json`
- `messages/en.json`
- `lib/weather/providers/vegagerdinCurrent.server.ts`

---

## 6. Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

Engar SQL skrár voru breyttar í þessum Codex-skammti.

---

## 7. Skipanir sem voru keyrðar

- `npm run test:run -- lib/__tests__/road-intelligence-map-proxy.test.ts lib/__tests__/road-intelligence-station-geo-json.test.ts`
  - Exit code: 0
  - 2 files, 10 tests passed

- `npm run type-check`
  - Exit code: 0

- `npm run build`
  - Fyrri keyrsla féll einu sinni í static generation með `PageNotFoundError` fyrir óskyldar routes sem eru til í source.
  - Ég staðfesti að routes væru til og endurkeyrði build.
  - Endurkeyrsla: exit code 0.
  - Build sýnir eldri lint warnings í óskyldum skrám.

- `npm run test:run`
  - Exit code: 0
  - 122 test files passed
  - 3459 tests passed, 27 skipped, 8 todo

---

## 8. Hvað mistókst eða var sleppt

- Ég keyrði ekki dev server.
- Ég gerði ekki browser/screenshot próf.
- Ég keyrði ekki SQL og breytti ekki Supabase.
- Ég bætti ekki við rate limit eða signed tile token.
- Ég hélt ekki áfram í M2B vector segment layer, því M2A browser-prófun er næsta rétta staðfesting áður en við stækkum þetta.

---

## 9. Áhætta sem er enn til staðar

- **Browser end-to-end óstaðfest:** Build/tests eru græn, en Stebbi þarf að staðfesta að MapLibre hlaði tiles og station markers í localhost með auth cookies.
- **Auth-per-tile er prototype lausn:** Í lagi fyrir fáa flaggaða notendur, en þarf signed token/cache/rate-limit áður en þetta opnast víðar.
- **LMÍ basemap er einfalt:** `LMI_Island_einfalt` virkar, en það gæti þurft betra grunnkort með skýrari vegum/örnefnum.
- **Wind dots eru ekki clickable ennþá:** Þetta er sýnileg live layer proof, ekki station detail UX.
- **Legend colors eru hardcoded threshold proof:** Þau passa gróflega við vindhviðu/mean wind sýn, en tengjast ekki enn notendastilltum mörkum.

---

## 10. Tillaga að næsta skrefi

Ég myndi ekki hoppa strax í stærra M2B fyrr en Stebbi hefur prófað þetta í browser.

Næst:

1. Stebbi staðfestir localhost:
   - linkur sést
   - MapLibre kort hleðst
   - Vegagerðin overlay hleðst
   - wind dots hlaðast
   - toggle virkar

2. Claude rýnir sérstaklega:
   - hvort CSS import í client component sé öruggt í production chunking
   - hvort station marker fetch eigi að hafa sýnilegan “hleð” eða villu-state
   - hvort auth-per-tile sé ásættanlegt í release eða eigi að setja proxy cache/rate-limit áður

3. Ef allt virkar:
   - M2A má teljast proof-complete bak við feature flagg.
   - Næsti stóri skammtur getur verið M2B semantic/vector segment sample.

---

## 11. Spurningar sem Claude á sérstaklega að rýna

1. Er `useTranslations()` í `RoadMapPrototypeMap` betra en props frá server page fyrir þessa litlu prototype texta?
2. Er toggle-sync nálgunin með `showOverlayRef` nóg, eða vill Claude frekar `useEffect` sem fylgist með `showOverlay` og map ready state?
3. Á station marker API að skila `cacheStatus`/`measurementFreshness` í GeoJSON properties eða response metadata, svo UI geti sagt hvort punktarnir séu úr fresh cache eða history fallback?
4. Á `station-markers` route að skila 503/empty með reason þegar Vegagerðin cache er unavailable, frekar en silent empty collection?
5. Er næsta skref M2A hardening eða M2B vector segment proof?

---

## 12. Supabase / SQL / auth / production áhrif

- Stebbi hefur keyrt SQL89, en Codex keyrði ekkert SQL.
- Engin RLS/grants/policies breyttust í þessum Codex-skammti.
- Engin Supabase gögn voru lesin eða skrifuð af Codex.
- Engin production deployment var gerð.
- `.env.local` breytingar voru gerðar af Stebba, ekki Codex.
- Til að prófa þarf per-user `feature_access` row fyrir `road-intelligence-v1`.
- Public `/vedrid` á áfram ekki að sýna Road Intelligence prototype.

---

## 13. Localhost checks for Stebbi

### Setup

1. Staðfesta í `.env.local`:

   ```env
   ROAD_INTELLIGENCE_V1_ENABLED=true
   ```

2. Staðfesta feature access row í Supabase:

   ```sql
   select email, feature_key
   from public.feature_access
   where feature_key = 'road-intelligence-v1'
   order by email;
   ```

   Vænt: þitt innskráningar-email sé í listanum.

3. Endurræsa localhost dev server.

### Prófun

1. Opna `/auth-mvp/vedrid` sem innskráður flaggaður notandi.
   - Vænt: `Korttilraun →` sést.

2. Smella á `Korttilraun →`.
   - Vænt: `/auth-mvp/vedrid/road-map-prototype` opnast.

3. Staðfesta kort:
   - Vænt: MapLibre controls efst hægra megin.
   - Vænt: LMÍ grunnkort birtist.
   - Vænt: Vegagerðin road network overlay birtist.
   - Vænt: litaðir vindpunktar birtast eftir smá stund.
   - Vænt: legend sýnir m/s bil og stöðufjölda.

4. Prófa toggle:
   - Smella `Fela vegakerfi`.
   - Vænt: road network overlay hverfur en vindpunktar og grunnkort haldast.
   - Smella `Sýna vegakerfi`.
   - Vænt: overlay kemur aftur.

5. DevTools Network:
   - `/api/teskeid/road-intelligence/map-proxy?...`
     - Vænt: `200`, `Content-Type: image/png`
   - `/api/teskeid/road-intelligence/station-markers`
     - Vænt: `200`, GeoJSON `FeatureCollection`

6. Ef vindpunktar vantar:
   - Keyra eða bíða eftir Vegagerðin cron/warm cache.
   - Athuga `/api/teskeid/weather/vegagerdin/current` ef þarf.

### Ekki prófa kæruleysislega

- Ekki breyta Vercel env eða production feature rows án sér samþykkis.
- Ekki opna þetta fyrir fleiri notendur fyrr en auth-per-tile/rate-limit/cache ákvörðun er rýnd.
- Ekki túlka kortið sem production ráðleggingu; þetta er feature-flaggað prototype.
