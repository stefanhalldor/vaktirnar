# TODO #67 Vedrid - Phase 2A1 shipped

Created: 2026-07-03 16:25
Timezone: Atlantic/Reykjavik
From: Claude Code (Sonnet 4.6)
To: Stebbi og Codex
Status: Handoff — Phase 2A1 framkvæmt og localhost prófun klárað. Engin commit, push eða production breytingar gerðar.

---

## Staða

Phase 2A1 er **lokið og prófað á localhost**. Stebbi staðfesti að localhost prófun gengi vel.

Engar skrár commitaðar. Engar production breytingar.

---

## Hvað var gert (Phase 2A1)

### Skrár breyttar

| Skrá | Breyting |
|------|----------|
| `lib/weather/types.ts` | Bætti við `GolfWindow` type og `windows?: GolfWindow[]` á `DeterministicResult` |
| `lib/weather/places.ts` | 20 nýir staðir: 6 golfvellir + 14 ferðamannastaðir. 10 nýjar aliases. |
| `lib/weather/question.ts` | `detectIntent` skilar `'activity_window_golf' \| 'route_towable_trailer'`. Nýjar: `extractTrailerKind`, `extractRouteOrigin`, `extractRouteDestination`. `PLACE_PATTERNS` stækkað. |
| `lib/weather/tools.ts` | `checkGolfWindow`: 5 stunda sliding window, besti gluggi + 2 alternatívar, golfþröskuldar. |
| `app/api/teskeid/weather/ask/route.ts` | `route_towable_trailer` → 422 `provider_not_configured`. `activity_window_golf` → `checkGolfWindow`. |
| `messages/is.json` | `errorProviderNotConfigured` bætt við. `errorUnknownPlace` uppfært. |
| `messages/en.json` | `errorProviderNotConfigured` bætt við. `errorUnknownPlace` uppfært. |
| `app/auth-mvp/vedrid/VedridClient.tsx` | `provider_not_configured` villa mapped í UI. |
| `lib/__tests__/weather-question.test.ts` | +50 tests: golf/route intent, golf course extraction, destinations, extractTrailerKind, extractRouteOrigin/Destination |
| `lib/__tests__/weather-tools.test.ts` | +32 tests: checkGolfWindow (graent/gult/rautt, best window, alternatives, non-overlapping, shape) |

**Heildarniðurstaðar: 82 tests í weather-question + weather-tools. 1554 tests í heildina. Ekkert brotið.**

### Golfþröskuldar sem útfærðir eru

- `discomfortWindMs`: 13 m/s → gult (golfveður óþægilegt)
- `hardWindMs`: 17 m/s → rautt (golf ómögulegt)
- 10-11 m/s → gult, **aldrei rautt** (staðfest í tests)
- `eighteenHolesHours`: 4.5 → 5 stunda sliding window

### Staðir sem bætt var við

**Golfvellir:**
Keilir (Hafnarfjörður), Korpa (Kópavogur), Vesturbær (Reykjavík), Leynir (Akranes), Akranes, Nesskot/Ness (Akureyri), Grafarholt (þegar til staðar)

**Ferðamannastaðir:**
Apavatn, Húsavík, Mývatn, Vík í Mýrdal (via mýrdal alias), Höfn í Hornafirði, Egilsstaðir, Ísafjörður, Stykkishólmur, Flúðir, Skógar/Skógafoss, Þingvellir, Geysir/Gullfoss, Jökulsárlón, Landmannalaugar

---

## Localhost prófun — Stebbi staðfesti

1. `Hvenær er best að spila golf í Grafarholti á morgun?` → besti gluggi + 2 alternatívar, vindur skráður. **Virkar.**
2. 10-11 m/s vindur → gult, **ekki rautt.** ✓
3. Golfvöllur sem er ekki í listanum → `errorUnknownPlace` skilaboð. ✓
4. `Er mér óhætt að keyra með hjólhýsi frá Reykjavík að Apavatni?` → `errorProviderNotConfigured` skilaboð — ekkert fake veður. ✓
5. `Er grillveður í Mosó í kvöld?` → virkar eins og áður. ✓

---

## Næsta skref — Phase 2A2

Phase 2A2 þarf:

- [ ] Google Cloud API lykla (sjá v037 fyrir nákvæmar leiðbeiningar)
  - `GOOGLE_MAPS_SERVER_KEY` — Geocoding + Routes (server only)
  - `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` — Maps JS + Places + Static Maps (browser restricted)
- [ ] Quota caps settir í Google Cloud (Static Maps 500/day, Geocoding 200/day, Routes 200/day, Places 200/day)
- [ ] Budget alert ($20/mánuð) í Google Cloud Billing
- [ ] `WEATHER_MAP_PROVIDER=google` sett í `.env.local`
- [ ] Dependency ákvörðun: `@googlemaps/js-api-loader` (v2-style: `setOptions()` + `importLibrary('places')`) — bæta við með sér framkvæmdarleyfi
- [ ] Framkvæmdarleyfi: **"Claude Code, framkvæmdu Phase 2A2"**

Þar til þá: allt í Phase 2A1 er í lagi og tilbúið til commit þegar Stebbi vill.

---

## Opið atriði — commit

Phase 2A1 kóðinn er **uncommitted**. Stebbi ákveður:
- Commita Phase 2A1 eitt og sér núna
- Eða bíða og commita allt (Phase 1 + 2A1 + 2A2 + 2A3) saman í Phase 2A4

Samkvæmt fyrri ákvörðun (v037): "Ship saman í Phase 2A4." En ef Stebbi vill commita millistig er það einnig hægt.

---

## Óvissa sem stendur

- **Capacitor og Places API:** Óprófað í WebView — þarf test þegar Capacitor setup byrjar (Phase 2A2 eða síðar)
- **Google Routes á hálendi:** Óstaðfest fyrir Kjöl/Sprengisand — kemur í ljós við prófun
- **Static Maps attribution á 360px:** Google krefst attribution — þarf að passa við Phase 2A2
