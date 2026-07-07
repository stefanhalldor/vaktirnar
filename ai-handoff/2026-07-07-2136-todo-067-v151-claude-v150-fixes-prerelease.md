# Handoff: todo-067 v151 - v150 Codex review fixes, Phase C prerelease

**Date:** 2026-07-07 21:36
**From:** Claude (Sonnet 4.6)
**To:** Codex eða næsta Claude session
**Commit:** uncommitted (in working tree, á main)

---

## Hvað var gert

Lagfærðar allar findings úr v150 Codex review sem þurfti að laga. Finding #2
(lína til Vestmannaeyja áður en höfn er valin) var sleppt - Stebbi staðfesti
að það sé í lagi.

---

## Skrár breyttar

```
app/auth-mvp/vedrid/FerdalagidClient.tsx    - handleFerryPortSelected hreinsar stale result
lib/weather/ferryPorts.ts                   - textaleit fjarlægð, eingöngu bbox
lib/__tests__/ferryPorts.test.ts            - tests uppfærðar, 2 nýjar negative tests
messages/is.json                            - ferryCheckHerjolfurNote fjarlægt
messages/en.json                            - ferryCheckHerjolfurNote fjarlægt
```

---

## High #1 - Stale result við hafnarskipti

**Vandinn:** Notandi gat skipt um ferjuhöfn eftir að niðurstaða hafði borist og
náð í gömlu niðurstöðuna á nyjan leik í gegnum step-nav, sem er traust-krítikal.

**Leiðrétting:** `handleFerryPortSelected` hreinsar nú:

```ts
setResult(null)
setError(null)
setShowDetails(false)
setShowExplainer(false)
setSelectedHeatmapIdx(null)
setSelectedReturnHeatmapIdx(null)
setSubmittedThresholds(null)
```

Ásamt þegar-til: `setSelectedRouteId(null)`, `setRouteOptions(null)`,
`setRouteOptionsError(null)`, `setRouteFallback(false)`.

---

## Medium #2 - Lína til Vestmannaeyja (sleppt)

Stebbi staðfesti: "Mér finnst persónulega allt í lagi að lína sé dregin beint
til Vestmannaeyja áður en notandi velur Landeyjahöfn eða Þorlákshöfn."

Engin breyting.

---

## Medium #3 - Textaleit false-positive

**Vandinn:** `isVestmannaeyjarDestination` gat skilað `true` fyrir meginlandsstaði
með "Vestmannaeyjar" eða "Heimaey" í nafni/heimilisfangi, þótt hnit væru
skýrt utan bbox.

**Leiðrétting:** Textaleit fjarlægð að fullu. Fallið notar **eingöngu bbox**:

```ts
export function isVestmannaeyjarDestination(place: { lat: number; lon: number }): boolean {
  return (
    lat >= VESTMANNAEYJAR_BBOX.minLat &&
    lat <= VESTMANNAEYJAR_BBOX.maxLat &&
    lon >= VESTMANNAEYJAR_BBOX.minLon &&
    lon <= VESTMANNAEYJAR_BBOX.maxLon
  )
}
```

Rökin: geocoded staðir fá alltaf hnit frá Google. Textaleit þarf ekki og skaðar.

---

## Low #5 - Ónotaður lykill fjarlægður

`ferryCheckHerjolfurNote` var skilgreindur en aldrei notaður í UI (check-Herjólfur
orðalag er inni í `ferrySelectedNote`). Fjarlægt úr `messages/is.json` og
`messages/en.json` til að koma í veg fyrir þýðingardrift.

---

## Tests

Tvær nýjar negative tests bætt við `lib/__tests__/ferryPorts.test.ts`:

- `'returns false for coords just outside the bbox even if name contains Vestmannaeyjar'`
- `'returns false for mainland coords with a matching name (Vestmannaeyjar hotel/business)'`
- `'returns false for mainland coords with formattedAddress containing Heimaey'`

Eldra test `'returns true by text hint when name contains Vestmannaeyjar'` uppfært
í `false` (text trigger er horfið).

```
npm run type-check  -> exit 0
npm run test:run    -> 1809 passed / 27 skipped / 8 todo (56 files)
```

---

## Test niðurstöður yfir alla Phase C

| Útgáfa | Skrár | Tests |
|--------|-------|-------|
| Fyrir Phase C (v147) | 55 | 1793 |
| v149 (Phase C first) | 56 | 1807 |
| v151 (þessi handoff) | 56 | 1809 |

---

## Localhost checks fyrir Stebbi

### Uppsetning

Opna `/auth-mvp/vedrid` innskráður með `vedrid` access.

### Aðalflæðið

1. Velja `Reykjavík` → `Vestmannaeyjar`.
2. **Búist við:** Ferry-kortið birtist. Kort sýnir beina línu til Vestmannaeyja
   (Stebbi hefur samþykkt þetta).
3. Smella á `Landeyjahöfn`.
4. **Búist við:** Leiðarmöguleikar birtast fyrir Reykjavík → Landeyjahöfn. Kort
   uppfærist. Nóta: `Áfangastaður eftir ferju: Vestmannaeyjar. Veðurmatið hér
   er fyrir aksturinn að Landeyjahöfn. Athugaðu stöðu Herjólfs...`
5. Velja leið → eftirvagn → veðurmörk → niðurstaða.
6. **Búist við:** `RouteSummary` sýnir `Reykjavík → Landeyjahöfn`. Niðurstöðukortið
   inniheldur: `Ferðaveðrið er reiknað fyrir akstur að Landeyjahöfn. Það metur
   ekki siglingu Herjólfs.`

### Stale-result test (High #1)

7. Frá niðurstöðuskrefi: smella á `Breyta forsendum` (eða `Nota aftur`).
8. Fara til baka í route-skref (t.d. með bakhnapp í step-nav).
9. Skipta yfir í `Þorlákshöfn`.
10. **Búist við:** Eldri Landeyjahöfn-niðurstaða er EKKI aðgengileg. Leiðarmöguleikar
    birtast upp á nýtt fyrir Þorlákshöfn. Step-nav á EKKI að bjóða upp á gamla
    niðurstöðuna.

### Meginlandsstaðir með "Vestmannaeyjar" í nafni

11. Leita að stað eins og `Vestmannaeyjar hotel` eða `Heimaey guesthouse` á
    meginlandinu (ef þess konar staðir eru í Google geocoder).
12. **Búist við:** Ferry-kortið birtist EKKI.

### Afturvirk samhæfni

1. `Reykjavík → Selfoss` — enginn ferry-valmöguleiki.
2. `Garðabær → Akureyri` — enginn ferry-valmöguleiki.
3. Route fallback (`Nota sjálfgefna leið`) virkar enn.
4. Public top nav á `/`, `/senda-hugmynd`, `/innskraning` sést enn.
5. `Lánað og skilað` virkar enn.

### Hvað á EKKI að prófa hér

- Herjólfur live status, fargildi, sjólag, hafnarlokanir.
- Supabase, SQL, RLS, Vercel env, production gögn, billing.

---

## Opnar spurningar

1. **Hafnarhnit**: Áður en gefið er út ætti Stebbi að staðfesta að
   `Landeyjahöfn` og `Þorlákshöfn` pinna séu á réttan stað á kortinu.
   Ef rangt: breyta eingöngu `lat`/`lon` í `lib/weather/ferryPorts.ts`.

2. **Öfug ferð** (Vestmannaeyjar → meginland): Ekki meðhöndlað í Phase C.

3. **Herjólfur-hlekkur**: Óákveðið hvort á að bæta upplýsingahlekk við seinna.

---

## Hvað Claude Code gerði EKKI

Engin SQL. Engar migrations. Engar Supabase-breytingar. Ekkert commit. Ekkert push.
Ekkert production key, Vercel env, eða billing.
