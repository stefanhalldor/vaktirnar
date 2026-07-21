# Handoff: M2A kort virkar — blank map leyst

Created: 2026-07-21 08:20
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Relevant TODO: 086
Type: Implementation handoff

---

## Niðurstaða

MapLibre kort á `/auth-mvp/vedrid/road-map-prototype` birtist núna rétt (staðfest í skjámynd 2026-07-21 081509):

- CartoDB Voyager grunnkort (Iceland með vegum og örnefnum)
- Vegagerðin vegakerfi overlay (toggle virkar)
- 201 litaðir vindpunktar yfir landinu
- NavigationControl (zoom +/−) efst til hægri
- Popup við smelli á vindpunkt (nafn, vindur, hvína, loftslag)
- Attribution: "OpenStreetMap contributors | © CARTO | MapLibre"

---

## Rót vandamálsins (diagnostics greindi þetta)

MapLibre GL JS bætir `.maplibregl-map { position: relative }` við `containerRef.current` sjálfan við `new Map()`. Þetta yfirskrifar Tailwind `.absolute` á sama element. Þegar `position` breytist úr `absolute` í `relative` fellur `inset-0` (sem þarf `absolute` til að strekkja element) saman í 0px hæð. MapLibre mælir síðan 300px (default canvas hæð í HTML) og læsir canvas á 300px. `map.resize()` þar á eftir les líka 300px vegna sömu ástæðu.

**Fix:** `className="h-full w-full"` á containerRef í stað `className="absolute inset-0"`. `h-full w-full` lifir af position yfirskrifun vegna þess að þau nota percentage width/height sem eru reiknuð út frá foreldri, óháð position.

Foreldri (ytri div `absolute inset-0`) heldur `absolute inset-0` og fyllir `flex-1 relative min-h-0` div í page.tsx.

---

## Öll vandamál sem voru leyst í þessari lotu (v259–v262)

| Vandamál | Lausn |
|----------|-------|
| LMÍ GWC WMTS → 502 | GWC hefur ekki `LMI_Island_einfalt` cached |
| LMÍ WMS direkt í browser → blank | `{bbox-epsg-3857}` virkar ekki beint í MapLibre raster source |
| LMÍ WMS via proxy → 200 en blank | `LMI_Island_einfalt` er too simplified á zoom 6 (hvítt) |
| CartoDB → 200 en blank | `.maplibregl-map { position: relative }` collapsed container til 0px |
| `mapDivFound: false` í diagnostics | `querySelector('.maplibregl-map')` finnur ekki foreldraþáttinn sjálfan |
| Canvas styleH 300px þrátt resize | Container var collapsed þegar MapLibre mældi; h-full w-full fix |

---

## Skrár breyttar / búnar til í þessari lotu

### Nýjar skrár
- `lib/road-intelligence/lmiTileProxy.ts` — bbox og WMTS helpers
- `lib/__tests__/road-intelligence-lmi-tile-proxy.test.ts` — 27 tests
- `app/api/teskeid/road-intelligence/lmi-tile/route.ts` — WMS bbox proxy fyrir LMÍ
- `app/auth-mvp/vedrid/road-map-prototype/layout.tsx` — route layout sem hleður MapLibre CSS

### Breyttar skrár
- `components/weather/RoadMapPrototypeMap.tsx` — endanleg útgáfa (h-full w-full, CartoDB, popup, resize, ResizeObserver)
- `app/auth-mvp/vedrid/road-map-prototype/page.tsx` — `min-h-0` á flex-1 div
- `messages/is.json` — subtitle "CartoDB + Vegagerðin"
- `messages/en.json` — subtitle "CartoDB + Vegagerðin"

---

## Validation

- `npm run type-check` — exit code 0
- `npm run test:run` (3 road-intelligence test files) — 37 tests passed
- Browser: kort sést, dots sést, toggle virkar (skjámynd 2026-07-21 081509)

---

## Hvað er ennþá óstaðfest

- **Popup í browser:** Staðfest kóðalega en ekki browser-prófað af Stebbi (bætt við í v259)
- **Vegakerfi overlay:** Virðist sýnilegur í skjámynd (blár/grár litinn yfir kortinu) en Stebbi hefur ekki prófað toggle sérstaklega
- **LMÍ basemap:** Tímabundið skipt út fyrir CartoDB. Til að nota LMÍ þarf að finna layer með betri styling (t.d. `grunnkort` eða `IS_50V:*` layers í LMÍ GeoServer)
- **Auth-per-tile rate limit:** Supabase session check á hverja tile request — í lagi fyrir 1-2 notendur en þarf short-lived token áður en þetta opnast víðar

## Næstu skref (ef Stebbi vill halda áfram)

1. Prófa popup og toggle í browser
2. M2B: víxla Vegagerðin raster overlay yfir í GeoJSON vector lines (ArcGIS FeatureServer) svo hægt sé að lita segment eftir færðarástandi
3. Eða: M2A-3 — finna betri LMÍ layer (t.d. `grunnkort2025:*`) til að koma Íslenska kortinu aftur inn
4. Auth-per-tile hardening (short-lived token í stað per-request Supabase check)
