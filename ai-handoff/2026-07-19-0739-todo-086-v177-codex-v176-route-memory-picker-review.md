# 2026-07-19 07:39 - TODO 086 v177 - Codex: v176 route-memory picker review

Created: 2026-07-19 07:39
Timezone: Atlantic/Reykjavik

---

## Stutt mannamál

v176 tekur mikilvægt kostnaðarskref: `/vedrid` notar ekki lengur Google
PlaceSearch í route-memory flowinu, heldur velur notandi úr route-memory grunni
sem SQL86 fyllir út frá raunverulegum `/ferdalagid` útreikningum.

Það er þó ekki komið kortaval eins og Stebbi lýsti, heldur pill-listi. Þetta má
vera ágæt v1 til að losna hratt við Google í hraðskjánum, en handoffið má ekki
selja þetta sem fullbúið "map picker" ef Stebbi ætlast til Frá/Til korta.

Release niðurstaða: ekki augljós auth/RLS blocker. Ég myndi leyfa hraða
prerelease/release ef Stebbi samþykkir pill-lista sem tímabundna v1 og prófar
eina leið á localhost/production áður en gefið er út víðar.

---

## Findings

### Medium: Þetta er ekki kortaframsetningin sem var beðið um

`components/weather/RouteMemoryPicker.tsx` er pill-listi, ekki kort af þeim
`Frá` stöðum sem eru í boði né kort sem síar `Til` staði eftir vali.

Þetta er samt gott cost-control skref, því það skiptir Google Places út fyrir
route-memory API á `/vedrid`. En product-scope þarf að vera skýrt:

- v176 leysir "ekki nota Google dropdown á /vedrid"
- v176 leysir ekki "sýna Frá/Til val á korti"
- v176 leysir ekki "Nota núverandi staðsetningu"

Mín afstaða: release-a má sem v1 ef Stebbi er sáttur við tímabundið pill UI.
Ef Stebbi vill kortaupplifun fyrir fyrstu release, þá er þetta ekki tilbúið.

### Medium: Provider-row ambiguity getur falið provider-lag á route-memory leið

`lookupRouteMemory()` skilar alltaf `vedurstofanStationIds` og
`vegagerdinStationIds` sem arrays. Ef provider hefur engar rows í
`weather_route_memory_stations` verður array tómt.

Í `WeatherOverviewClient.tsx` þýðir tómt array að provider-lagið síast niður í
engar stöðvar fyrir þá leið. Það getur verið rétt ef provider var metinn og 0
stöðvar pössuðu, en það getur líka gerst ef provider var ekki tiltækur þegar
leiðin var fyrst reiknuð.

Þetta skiptir sérstaklega máli fyrir Vegagerðina: ef route-memory record varð
til þegar Vegagerðin cache var unavailable, gæti `/vedrid` sýnt enga
Vegagerðarpunkta fyrir þá leið þar til leiðin er reiknuð aftur.

Ekki blocker ef Vegagerðin cache/history er komið vel inn og Stebbi reiknar
leiðir eftir það. Betra langtímamodel væri að SQL86 eða næsta migration geymi
provider evaluation state per route/provider, t.d. `providers_evaluated`, svo
UI greini "0 stöðvar" frá "unknown".

### Low: `selectedFrom!` er óþarfi og má hreinsa

Í `RouteMemoryPicker.tsx` notar `handleToSelect()` `selectedFrom!`. Render-path
gerir þetta líklega öruggt, en það er óþarfa non-null assertion. Betra:

```ts
if (!selectedFrom) return
onPlacesChange(toRouteDraftPlace(selectedFrom), toRouteDraftPlace(place))
```

### Low: v176 bætti ekki sértækum prófum fyrir nýju endpointin/componentinn

Ég fann engin tests sem vísa í:

- `/api/teskeid/weather/route-memory/places`
- `/api/teskeid/weather/route-memory/destinations`
- `RouteMemoryPicker`

Targeted núverandi tests eru græn, en nýja public service-role read layerið á
skilið lágmarkspróf: empty DB, duplicates, DB error, from missing, destinations
filter, og ideally middleware exact-public contract.

### Low/UX: Empty state notar gamla cache-miss textann

`RouteMemoryPicker` notar `routeLensCacheMiss` sem empty state þegar engar leiðir
eru til. Textinn segir "Þessi leið er ekki í hraðskjánum enn", en í empty
state er engin leið valin. Handoffið nefnir þetta sjálft. Þetta má laga strax
eða eftir release með nýjum `routeMemoryPickerEmpty` texta.

---

## Staðfest gott

- `/vedrid` overview import-ar nú `RouteMemoryPicker`, ekki `OverviewRouteLensPanel`.
- `RouteMemoryPicker` notar `/api/teskeid/weather/route-memory/places` og
  `/destinations`, ekki Google Places.
- `PlaceSearch` er enn til en virðist ekki vera notað í `/vedrid` overview
  flowinu. Það er enn eðlilegt í `/ferdalagid` route-selection flowinu.
- Nýju route-memory endpointin eru exact public paths í `middleware.ts`, ekki
  prefix-open.
- `lookup` endpointið úr v544 heldur provider-gating fyrir station IDs.
- `travel/route.ts` log-safety er lagað í static message.
- SQL86 þarf ekki að keyra aftur fyrir þessa breytingu.

---

## Google kostnaðarstaða

Þetta er rétta áttin fyrir kostnað:

- `/vedrid` browse/overview á ekki lengur að kalla Google Places við Frá/Til val.
- Google Places/Routes eiga áfram aðeins heima í meðvitaðri `/ferdalagid`
  reikniaðgerð.
- Route-memory á að safna afleiddu station-settinu úr `/ferdalagid` svo næsta
  `/vedrid` notkun verði ódýrari.

Release-rýni á næsta handoff ætti að `rg`-a sérstaklega:

- `PlaceSearch`
- `loadPlacesLibrary`
- `AutocompleteSuggestion`
- Google Routes/Places imports í `/vedrid` overview path

og staðfesta að ekkert slíkt keyri við `/vedrid` page-load, typing, route-filter
eða reset.

---

## Route intelligence check

- Snertir `/vedrid` overview route-filter og SQL86 route-memory station sets.
- Ný þekking er réttilega í `lib/iceland-routes/` og Supabase route-memory,
  ekki í Google-specific UI.
- Lausnin er provider-neutral fyrir station IDs: Veðurstofan og Vegagerðin eru
  báðar filteraðar út frá sama route-memory concepti.
- Ekki er verið að vista raw Google geometry, place IDs, duration eða distance.
- Privacy er enn sæmilega örugg: public API sýnir aðeins normalized place labels
  og `lookup` gate-ar provider station IDs eftir provider access.
- Roadmap þarf ekki nýja uppfærslu fyrir v176; það sem gerðist passar undir R5
  route-memory station sets.

---

## Skipanir keyrðar

```bash
npm run type-check
# exit 0

npm run test:run -- lib/__tests__/route-place-normalization.test.ts lib/__tests__/weather-route-memory-migration.test.ts lib/__tests__/overview-route-draft.test.ts lib/__tests__/iceland-routes-lens.test.ts lib/__tests__/weather-public.test.ts lib/__tests__/middleware.test.ts
# 6 files passed, 172 tests passed

git diff --check
# exit 0, aðeins LF -> CRLF warnings á TODO.md og WORKFLOW.md
```

Ég keyrði ekki fulla test suite og ekki browser/localhost próf.

---

## Localhost checks for Stebbi

Prófa fyrir release:

1. Opna `/vedrid` áður en ný route-memory leið er til.
   - Vænt: ekkert Google autocomplete input.
   - Vænt: skiljanlegt empty state eða pill-listi ef route-memory er þegar til.

2. Fara í `/ferdalagid` og reikna eina leið, t.d. Reykjavík -> Akureyri.
   - Vænt: útreikningur klárast og route-memory write veldur ekki villu.
   - Ath: þetta er Google Routes kall, svo ekki fikta endalaust með margar leiðir.

3. Fara aftur á `/vedrid`.
   - Vænt: `Frá` sýnir pillu fyrir Reykjavík.
   - Vænt: ekki Google dropdown.

4. Velja Reykjavík.
   - Vænt: `Til` sýnir Akureyri ef route-memory skrifaðist.

5. Velja Akureyri.
   - Vænt: kortið síar niður á nákvæmar stöðvar úr `/ferdalagid`, ekki allt land.
   - Vænt: status pillur telja bara route-filteraðar stöðvar.
   - Vænt: bæði Veðurstofan og Vegagerðin sjást ef route-memory hefur rows fyrir báða providers.

6. Smella `Hreinsa leið`.
   - Vænt: leiðarsía hreinsast og kortið fer aftur í yfirlitsstöðu.

7. Smella `Ferðalagið` eftir valda leið.
   - Vænt: `/ferdalagid` opnast með routeDraft úr sessionStorage, ekki stale route.

8. Kostnaðarcheck í DevTools Network:
   - Á `/vedrid` route-memory picker á ekki að sjást Google Places autocomplete
     kall við val úr pillum.
   - Google má bara koma við sögu þegar farið er í `/ferdalagid` og reiknað
     raunverulegt ferðalag.

Ekki keyra SQL aftur. SQL86 er þegar keyrð. Ekki keyra 82/83/84/85 fyrir þetta
release nema sérstök ákvörðun liggi fyrir.

---

## Release recommendation

Ég myndi **ekki stoppa release vegna tæknilegs blocker** ef markmiðið er að
fara hratt út með route-memory v1 og byrja að safna raunleiðum í hraðskjáinn.

Ég myndi hins vegar ekki kalla þetta fulla "kortaframsetningu". Fyrir release
þarf Stebbi að samþykkja að:

1. v1 er pill-list picker, ekki map-picker.
2. Current location val kemur síðar.
3. Empty state texti má vera aðeins ófullkominn eða lagaður í litlu follow-up.
4. Provider-row ambiguity er þekkt áhætta og leiðir sem voru reiknaðar þegar
   Vegagerðin var unavailable gætu þurft að vera reiknaðar aftur.

