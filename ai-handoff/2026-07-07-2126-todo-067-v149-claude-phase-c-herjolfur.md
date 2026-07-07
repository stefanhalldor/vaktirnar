# Handoff: todo-067 v149 - Phase C: Herjólfur ferry-port fallback

**Date:** 2026-07-07 21:26
**From:** Claude (Sonnet 4.6)
**To:** Codex eða næsta Claude session
**Commit:** uncommitted (in working tree, á main)

---

## Hvað var gert

Phase C: Vestmannaeyjar / Herjólfur ferry-port fallback.

Þegar notandinn velur Vestmannaeyjar/Heimaey sem áfangastað, spyr appið hvaða
ferjuhöfn hann er að keyra að (Landeyjahöfn eða Þorlákshöfn) áður en leiðarmöguleikar
eru sóttir. Ferðaveðrið reiknar veðurmat fyrir aktur að ferjuhöfninni, ekki göngu
yfir höfin.

---

## Skrár breyttar eða búnar til

```
lib/weather/ferryPorts.ts                   - NYR: bbox, isVestmannaeyjarDestination, FERRY_PORTS
lib/__tests__/ferryPorts.test.ts            - NYR: 11 tests
messages/is.json                            - 7 nýir ferry-lyklar bætt við
messages/en.json                            - 7 nýir ferry-lyklar bætt við
components/weather/RouteSelectionStep.tsx   - ferry picker UI + effectMapDest
app/auth-mvp/vedrid/FerdalagidClient.tsx    - ferrySelection state, effect, result note
```

---

## `lib/weather/ferryPorts.ts`

```ts
export type FerryPortId = 'landeyjahofn' | 'thorlakshofn'

export const VESTMANNAEYJAR_BBOX = {
  minLat: 63.30, maxLat: 63.50,
  minLon: -20.45, maxLon: -20.05,
}

export const FERRY_PORTS: Record<FerryPortId, FerryPort> = {
  landeyjahofn: { id: 'landeyjahofn', lat: 63.557, lon: -20.064, name: 'Landeyjahöfn' },
  thorlakshofn: { id: 'thorlakshofn', lat: 63.848, lon: -21.363, name: 'Þorlákshöfn' },
}
```

`isVestmannaeyjarDestination` prófar fyrst hnit (bbox). Textaleit á
`vestmannaeyjar` / `heimaey` er eingöngu varaúrræði.

Hafnarhnit í kóðanum eru eftir bestu þekkingu frá Google Maps. Ef Stebbi sér að
`Landeyjahöfn` eða `Þorlákshöfn` eru röng á kortinu, skal leiðrétta
`lat`/`lon` í `ferryPorts.ts` áður en hér er gefið út.

---

## Notendaflæði

1. Notandi velur `Reykjavík` → `Vestmannaeyjar`.
2. Ferry-kortið birtist (milli kortsins og leiðarmöguleika):
   - Titill: `Þú ert að fara til Vestmannaeyja`
   - Texti: skýring um að appið meti eingöngu aksturinn, ekki siglingu
   - Tveir hnappar: `Landeyjahöfn` | `Þorlákshöfn`
3. Notandi velur höfn → kort uppfærist, leiðarmöguleikar sóttir fyrir
   `Reykjavík → Landeyjahöfn`, staðfestingarhnappur birtist.
4. Staðfestingarnóta birt í route-skrefi:
   `Áfangastaður eftir ferju: Vestmannaeyjar. Veðurmatið hér er fyrir aksturinn að Landeyjahöfn. Athugaðu stöðu Herjólfs áður en þú leggur af stað.`
5. Niðurstaðaskrefi: ferry-nóta birt í niðurstöðukortinu:
   `Ferðaveðrið er reiknað fyrir akstur að Landeyjahöfn. Það metur ekki siglingu Herjólfs.`
6. `RouteSummary` sýnir `Reykjavík → Landeyjahöfn` (ekki `Vestmannaeyjar`).
7. Ef notandi hreinsar áfangastað eða velur annan áfangastað: `ferrySelection` hreinsar sig.
8. Ef notandi skiptir um höfn: leiðir eru sóttar upp á nýtt.

---

## Tæknilegar breytingar í FerdalagidClient

- `ferrySelection: FerrySelection | null` — state sem geymir `ferryPortId`,
  `ferryPort` (RoutePlace), og `finalDestination` (upprunalegi áfangastaðurinn).
- `isVestmannaeyjar` — reiknað úr `destination` með `isVestmannaeyjarDestination`.
- `effectiveDestinationName` — `ferrySelection?.ferryPort.name ?? destination?.name` —
  notað í `RouteSummary`, `TravelAuditMap`, `DepartureHeatmap` og `candidateToIssue`.
- Route fetch effect: gæðir `ferrySelection?.ferryPortId` í deps. Sækir leiðir fyrir
  ferjuhöfnina þegar `isVestmannaeyjar && ferrySelection`, annars bíður.
- `handleSubmit` sendir `ferrySelection?.ferryPort ?? destination` sem `destination`
  til travel endpoint.
- `startOver` og `onClearDestination` hreinsa `ferrySelection`.
- `handleDestinationSelected` (wrapper): hreinsar alltaf `ferrySelection` þegar
  destination breytist.

---

## Tæknilegar breytingar í RouteSelectionStep

- Nýir props: `isVestmannaeyjar`, `ferryPortId`, `onFerryPortSelected`,
  `ferryFinalDestinationName` — allir optional með default.
- `effectMapDest = ferryPort ? ferryPort : destination` — notað í Effect 3
  (destination marker) og Effect 4a (route lines + bounds).
- Effect 3 deps: `[destination?.lat, destination?.lon, ferryPortId, mapLoaded]`.
- Effect 4a deps: `[..., ferryPortId, ...]`.
- Ferry picker sýnt þegar `destination && isVestmannaeyjar`.
- Route options og confirm-hnappur sýnd þegar `!isVestmannaeyjar || ferryPortId`.

---

## Message-lyklar bætt við

Undir `teskeid.vedrid.ferdalagid`:

| Lykill | IS |
|--------|-----|
| `ferryVestmannaeyjarTitle` | Þú ert að fara til Vestmannaeyja |
| `ferryVestmannaeyjarBody` | Ferðaveðrið metur aksturinn... |
| `ferryPortLandeyjahofn` | Landeyjahöfn |
| `ferryPortThorlakshofn` | Þorlákshöfn |
| `ferrySelectedNote` | Áfangastaður eftir ferju: {finalDestination}... |
| `ferryResultNote` | Ferðaveðrið er reiknað fyrir akstur að {portName}... |
| `ferryCheckHerjolfurNote` | Athugaðu stöðu Herjólfs... |

---

## Test niðurstöður

```
npm run type-check  -> exit 0
npm run test:run    -> 1807 passed / 27 skipped / 8 todo (56 files)
```

Fyrri baseline: 55 skrár / 1793 tests. +1 ný test-skrá (ferryPorts.test.ts), +14 tests.

---

## Localhost checks fyrir Stebbi

### Uppsetning

1. Keyra app á localhost með `vedrid` access.
2. Skrá sig inn og opna `/auth-mvp/vedrid`.

### Phase C - ferry detection

1. Velja `Reykjavík` sem upphafsstað.
2. Velja `Vestmannaeyjar` (eða `Heimaey`) sem áfangastað.
3. **Búist við:** Ferry-kortið birtist með titli `Þú ert að fara til Vestmannaeyja`
   og tveimur hnappar: `Landeyjahöfn`, `Þorlákshöfn`.
4. **Staðfesta:** Engin leiðarmöguleikar sýnilegir enn. Engin staðfestingarhnappur.
5. Smella á `Landeyjahöfn`.
6. **Búist við:** Leiðarmöguleikar birtast fyrir Reykjavík → Landeyjahöfn.
   Kortið sýnir leiðirnar að Landeyjahöfn.
   Staðfestingarnótan sýnir: `Áfangastaður eftir ferju: Vestmannaeyjar...`
7. Velja leið og smella á `Nota þessa leið`.
8. Halda áfram í eftirvagn → veðurmörk → niðurstaða.
9. **Búist við:** `RouteSummary` sýnir `Reykjavík → Landeyjahöfn`.
   Niðurstöðukortið inniheldur: `Ferðaveðrið er reiknað fyrir akstur að Landeyjahöfn. Það metur ekki siglingu Herjólfs.`
10. Fara til baka í route-skref og skipta yfir í `Þorlákshöfn`.
11. **Búist við:** Kort og leiðarmöguleikar uppfærast fyrir Þorlákshöfn. Fyrra route-val hreinsast.
12. Hreinsa áfangastað (X-hnappurinn).
13. **Búist við:** Ferry-kortið hverfur. Leiðarmöguleikar og confirm-hnappur hverfa líka.
14. Velja `Selfoss` sem nýjan áfangastað.
15. **Búist við:** Enginn ferry-valmöguleiki. Venjulegar leiðir birtast.

### Afturvirk samhæfni

1. `Reykjavík → Selfoss` — enginn ferry-valmöguleiki, venjulegar leiðir.
2. `Garðabær → Akureyri` — enginn ferry-valmöguleiki.
3. Route alternatives virka enn eftir að ferry state er hreinsað.
4. Public top nav á `/`, `/senda-hugmynd`, `/innskraning` sést enn.
5. `Lánað og skilað` virkar enn.

### Hvað á EKKI að prófa hér

- Herjólfur live status, fargildi, sjólag, hafnarlokanir.
- Supabase, SQL, RLS, Vercel env, production gögn, billing.

---

## Opnar spurningar

1. **Hafnarhnit**: `Landeyjahöfn: lat 63.557, lon -20.064` og `Þorlákshöfn: lat 63.848, lon -21.363`.
   Stebbi ætti að staðfesta að kortið sýni réttan stað áður en kóðinn fer í production.
   Ef rangt: breyta `lat`/`lon` í `lib/weather/ferryPorts.ts`.

2. **Öfug ferð** (Vestmannaeyjar → meginland): Phase C sér aðeins þegar
   *destination* er Vestmannaeyjar. Öfug ferð er ekki meðhöndluð enn.

3. **Herjólfur-hlekkur**: Handoff v148 spurði hvort við ættum að setja inn hlekk á
   Herjólfur síðar. Ef já, einungis til upplýsinga, ekki sem stöðusamþætting.

---

## Hvað Claude Code gerði EKKI

Engin SQL. Engar migrations. Engar Supabase-breytingar. Ekkert commit. Ekkert push.
Ekkert production key, Vercel env, eða billing.
