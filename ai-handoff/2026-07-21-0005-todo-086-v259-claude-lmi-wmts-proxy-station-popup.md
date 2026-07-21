# Handoff: LMÍ WMTS proxy + station popup

Created: 2026-07-21 00:05
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Relevant TODO: 086
Type: Implementation handoff for Codex review

---

## Skilningur á samþykki

Stebbi bað Claude um að laga blank map vandamálið og fara í næsta framkvæmdarskref.

Claude framkvæmdi:

1. Rætur vandamálsins (WMS `{bbox-epsg-3857}`) skýrð og leysing hönnuð
2. LMÍ WMTS tile proxy (nýr route + helper library + tests)
3. Station dot popup (smella á punkt → nafn, vindur, hitastig)
4. Engin commit, push, deploy, SQL, migration, Supabase write eða Vercel env breyting

---

## Rætur blank map vandamálsins

Kortið sýndi station markers (stöðufjöldi 201 sást í legend) en ekkert grunnkort.

**Ástæðan:** MapLibre raster source með `type: 'raster'` og WMS URL með `{bbox-epsg-3857}` placeholder virkar ekki á sama hátt og XYZ tile URL. WMS kallar þurfa vel-formaðar BBOX gildi og query string sem MapLibre styður í eldri útgáfum/WMS mode, en í v5 með custom style er `{bbox-epsg-3857}` útgafan seint staðfest. Niðurstaðan var að grunnkortstiles skiluðu ekkert (net requests fóru ekki einu sinni fram).

**Lausnin:** Skipta yfir í WMTS `{z}/{x}/{y}` XYZ tile format í gegnum GeoWebCache endpoint LMÍ-s. Þetta er staðlað tile format sem MapLibre styður nákvæmlega. Routaðist í gegnum same-origin Next.js proxy (GWC CORS á ekki staðfest sérstaklega, og proxy gefur okkur caching control).

---

## Hvað var framkvæmt

### Nýjar skrár

**`lib/road-intelligence/lmiTileProxy.ts`** — var búið til í fyrri lotu, nú fullgert:

- `parseLmiTileRequest(searchParams)` — validates z (0–22), x/y (0 to 2^z-1)
- `buildLmiWmtsTileUrl(z, x, y)` — builds GeoWebCache WMTS URL með `TILEMATRIX=EPSG:3857:{z}&TILEROW={y}&TILECOL={x}`
- `isAllowedLmiTileContentType(contentType)` — PNG check

**`lib/__tests__/road-intelligence-lmi-tile-proxy.test.ts`** (17 tests):

- `parseLmiTileRequest`: valid coords, zoom 0, missing z, z>22, negative z, x/y out of range, non-integer x, max valid coords at z=22
- `buildLmiWmtsTileUrl`: TILEMATRIX/TILEROW/TILECOL, GWC endpoint, LMI_Island_einfalt layer
- `isAllowedLmiTileContentType`: PNG, PNG+charset, JPEG, null, JSON

**`app/api/teskeid/road-intelligence/lmi-tile/route.ts`** (nýr):

- Auth + `road-intelligence-v1` feature gate (sama pattern og `map-proxy`)
- `parseLmiTileRequest` → `buildLmiWmtsTileUrl` → fetch → PNG guard → stream til client
- try/catch kringum upstream fetch → 502 `upstream_unreachable`
- Cache: `private, max-age=600, stale-while-revalidate=3600` (LMÍ tiles eru statískar, 10 mín er öruggt)

### Breytingar á fyrirliggjandi skrám

**`components/weather/RoadMapPrototypeMap.tsx`**:

- `LMI_WMS_TILES` fjarlægt, `LMI_TILE_PROXY` bætt við: `/api/teskeid/road-intelligence/lmi-tile?z={z}&x={x}&y={y}`
- `lmi-basemap` source notar nú `LMI_TILE_PROXY` í staðinn fyrir WMS URL
- `popupRef` bætt við (cleanup á unmount)
- Station popup bætt við `map.on('click', 'station-markers')`:
  - Sýnir stöðvarnafn, vindur (mean + átt), hvína (gust), loftslag
  - Einn popup í einu (gömul popup fjarlægt við nýtt click)
  - Pointer cursor við mouseenter/mouseleave á station layer
- Cleanup: `popupRef.current?.remove()` í useEffect return

---

## Skrár breyttar / búnar til

- `lib/road-intelligence/lmiTileProxy.ts` — var til, engar breytingar þurfti
- `lib/__tests__/road-intelligence-lmi-tile-proxy.test.ts` — nýtt
- `app/api/teskeid/road-intelligence/lmi-tile/route.ts` — nýtt
- `components/weather/RoadMapPrototypeMap.tsx` — WMS → WMTS proxy, popup bætt við

---

## Validation

- `npm run type-check` — exit code 0
- `npm run test:run -- lib/__tests__/road-intelligence-lmi-tile-proxy.test.ts` — 17 tests passed
- `npm run test:run` (full suite) — 123 test files, 3477 tests passed, 27 skipped, 8 todo

---

## Hvað Stebbi þarf að gera til að sjá þetta

Forsendur eru óbreyttar frá v257/v258:

1. `.env.local`: `ROAD_INTELLIGENCE_V1_ENABLED=true` (+ `AUTH_MVP_ENABLED=true`)
2. SQL89 keyrð í Supabase
3. `feature_access` row:

   ```sql
   insert into public.feature_access (email, feature_key)
   values ('þitt@netfang.is', 'road-intelligence-v1')
   on conflict do nothing;
   ```

4. Endurræsa dev server: `npm run dev`

### Prófun

1. `/auth-mvp/vedrid` → `Korttilraun →` sést
2. `/auth-mvp/vedrid/road-map-prototype` → MapLibre kort opnast
3. **Vænt nú:** LMÍ Íslandskort sést (grunnkort) — þetta var villandi áður
4. Vegagerðin vegakerfi overlay yfir grunnkorti
5. Litaðir vindpunktar eftir nokkrar sekúndur
6. **Nýtt:** Smella á vindpunkt → popup með nafn, vindur, hvína, loftslag
7. Toggle "Fela vegakerfi" virkar
8. NavigationControl efst til hægri

### DevTools Network checks

- `/api/teskeid/road-intelligence/lmi-tile?z=6&x=...&y=...` — 200, `Content-Type: image/png`
- `/api/teskeid/road-intelligence/map-proxy?source=vegakerfi&bbox=...` — 200, `Content-Type: image/png`
- `/api/teskeid/road-intelligence/station-markers` — 200, GeoJSON

---

## Spurningar til Codex v260

1. **Popup XSS**: Station names koma frá Vegagerðin API → cached → JSON → `setHTML()`. `setHTML()` í MapLibre setur innerHTML. Ætti við að sanitize `stationName` og önnur properties í `stationGeoJson.ts` með `encodeURIComponent` eða DOMPurify, eða er `setHTML()` í MapLibre tryggt?
2. **Popup textar**: Popup notar harðkóðaða íslenska texta (`'Vindur:'`, `'Hvína:'`, `'Loftslag:'`, `'Stöð'`). Þarf að vera í translation keys eða er þetta acceptable fyrir prototype?
3. **Vegakerfi overlay í WMS mode**: `map-proxy` route notar enn `{bbox-epsg-3857}` fyrir Vegagerðin vegakerfi WMS. Sýnist þetta? Eða þarf Vegagerðin overlay líka að skipta yfir í XYZ tiles (ef ArcGIS REST MapServer styður það)?
4. **LMÍ cache TTL**: 10 mín (`max-age=600`) — of langt eða of stutt? LMÍ tiles breytast sjaldnar en veðurgögn, en caching í `private` Next.js response er per-session, ekki shared.

---

## Áhætta sem er enn til staðar

- **Browser end-to-end óstaðfest:** Stebbi þarf að staðfesta að LMÍ tiles birtist núna
- **Popup HTML er ekki sanitized:** `stationName` kemur frá Vegagerðin API — lágt threat level (intern-only data), en ætti að sanitize í production
- **Vegagerðin overlay (map-proxy) notar enn WMS bbox:** Gæti verið sami vandinn og LMÍ hafði — ef overlay sést ekki, þarf sama WMTS/XYZ lausn á Vegagerðin ArcGIS REST
- **Auth-per-tile limit:** Tvær proxy routes (lmi-tile + map-proxy) gera Supabase session check á HVERJA tile request — þetta er í lagi fyrir prototype en þarf short-lived token í production
- **Popup textar eru ekki i18n:** Hardcoded íslenska í popup HTML

---

## Næstu skref

1. Stebbi staðfestir localhost:
   - LMÍ grunnkort sést (var blank áður)
   - Vegagerðin overlay sést (eða staðfestir að það sé líka blank → þá þarf sama fix)
   - Vindpunktar birtast og eru clickable
   - Popup sýnir rétt gögn

2. Ef Vegagerðin overlay er blank: sama lausn þarf (ArcGIS REST styður XYZ tiles?)

3. Popup sanitization (Codex rýnir spurning 1)

4. Ef allt virkar: M2A má teljast proof-complete
