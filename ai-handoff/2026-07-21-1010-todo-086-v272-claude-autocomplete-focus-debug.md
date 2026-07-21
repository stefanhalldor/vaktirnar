# 2026-07-21 10:10 - todo-086 v272 - Claude autocomplete focus + debug logging

## Rýni á v271

v271 (Codex M3A place resolution hotfix) bætti við `placeSearchBridge.ts` og betri
`resolveBridgePlace` með `selectBestPlaceForQuery` og `", Ísland"` fallback. Þess utan
er fólksins í kóðanum og type-check og build fóru hrein.

Vandinn sem Stebbi sýndi (Skjámynd 2026-07-21 093816):
- Ekkert dropdown birtist.
- "Fann ekki annan staðinn" koma enn þegar smellt er á Reikna.

## Root cause greining

### Vandamál 1: Dropdown birtist ekki

Frá Network tab í skjámynd: `/api/place/search?q=reykja` tekur **1.52 sekúndur**.

Tímalína:
1. Notandi slær inn í Frá, debounce timer (250ms)
2. Fetch hefst
3. Notandi færir sig í Til reit (blur á Frá fires, 150ms blur-timer sett)
4. **150ms** síðar: blur-timer fires → `setFromSuggestions([])` hreinsar suggestions
5. **1.52s** eftir fetch hófst: API svarar → `setFromSuggestions(results)` -- en `fromFocusedRef` var ekki til, svo gamla kóðinn setti suggestions ÞÓTT focus væri á Til reit
6. Dropdown birtist skyndilega á Frá meðan notandinn er í Til reit -- þeir sjá það ekki
7. Notandi smellir Reikna

Gamla kóðinn í `fetchSuggestionsFor` kallaði `setSuggestions` án þess að athuga hvort input væri enn focused. Þetta olli því að dropdown birtist á röngum tíma.

### Vandamál 2: "Fann ekki annan staðinn"

Erfiðara að greina án browser aðgangs. Líklegar orsakir:
- `parsePlaceSearchResults(data)` skilar tómu fylki -- data er í óvæntu formi
- Suggestions eru tómar þegar submit rennur

Til að greina nákvæmlega: `console.log` bætt við í dev mode.

## Hvað var gert

### focus tracking refs

Bætt við `fromFocusedRef` og `toFocusedRef` (`useRef<boolean>(false)`):
- `onFocus`: sett `true`
- `onBlur`: sett `false`

### fetchSuggestionsFor - focusedRef check

Nýr `focusedRef` parameter í `fetchSuggestionsFor`. Eftir API svar:
```typescript
if (focusedRef.current) {
  setSuggestions(results)
}
```
Suggestions birtast **aðeins** ef input er enn focused þegar API svarar. Ef notandi hefur þegar farið í Til reit opnast dropdown Frá ekki aftur.

### formRef + blur logic

Bætt við `formRef = useRef<HTMLFormElement | null>(null)` og `ref={formRef}` á `<form>`.

Blur-timer athugar nú hvort focus er enn í forminu:
```typescript
onBlur={() => {
  fromFocusedRef.current = false
  fromBlurTimerRef.current = setTimeout(() => {
    if (!formRef.current?.contains(document.activeElement)) {
      setFromSuggestions([])
    }
  }, 150)
}}
```

Þetta þýðir: ef notandinn hoppar beint frá Frá í Til (bæði eru í sama formi), hreinsa suggestions Frá EKKI. Þetta gerir kleift að notandinn sjái Frá suggestions ef hann hoppar til baka.

### Til input: hreinsar Frá suggestions við focus

```typescript
// Til onFocus:
setFromSuggestions([])
```

Þegar notandinn fer í Til field: Frá dropdown lokast strax.

### Submit: hreinsar suggestions við sendingu

```typescript
setFromSuggestions([])
setToSuggestions([])
```

Kallað í upphafi submit þannig að suggestions hreinsi sig sjálfkrafa.

### console.log í dev mode

`fetchBridgePlaceResults` (submit-time) loggar nú:
```
[RoadMapPrototype] place search: { query, status, rawData, parsed }
```

`fetchSuggestionsFor` loggar:
```
[RoadMapPrototype] suggest: { query, count, focused, first }
```

Stebbi getur séð í DevTools Console NÁKVÆMLEGA hvað API skilar og hvers vegna `parsePlaceSearchResults` skilar tómu.

## Skrár sem breyttust

- `components/weather/RoadMapPrototypeMap.tsx`
  - `useRef` bætt við: `formRef`, `fromFocusedRef`, `toFocusedRef`
  - `fetchSuggestionsFor`: nýr `focusedRef` param, athugar focus áður en suggestions eru sett
  - `fetchBridgePlaceResults`: dev console.log bætt við
  - Frá input: `onFocus` sett `fromFocusedRef`, `onBlur` athugar `formRef.contains(activeElement)`
  - Til input: `onFocus` hreinsar Frá suggestions, sett `toFocusedRef`, sama blur logic
  - Submit: `setFromSuggestions([])` + `setToSuggestions([])` við upphaf

## Skipanir keyrðar

- `npm run type-check`: exit 0
- `npm run build`: exit 0, engar warnings úr RoadMapPrototype

## Localhost checks fyrir Stebbi

### Aðal proof

1. Opna `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`
2. Opna DevTools → Console tab
3. Slá inn "Reykj" í Frá reit og **bíða** í reitnum
4. Sjá `[RoadMapPrototype] suggest:` í console - hér kemur count og first result
5. Ef count > 0: dropdown á AÐ birtast í Frá reit
6. Ef count = 0: vandinn er í API/provider -- skoðaðu `rawData` í console

### Ef dropdown birtist

7. Velja Reykjavík úr dropdown
8. Slá inn "Akureyri" í Til reit og bíða
9. Velja Akureyri úr dropdown
10. Smella Reikna
11. Ætti að virka

### Ef dropdown birtist ekki eftir focus-fix

12. Slá inn "Reykjavik" í Frá (án akcentar)
13. Bíða í reitnum -- **ekki** fara í Til
14. Dropdown á að birtast (ef API skilar niðurstöðum)
15. Ef dropdown birtist ENNÞÁ EKKI: skoðaðu console log -- er `focused: false` á loggilínunni?

### Console diagnosis

Þegar "Fann ekki" kemur: skoðaðu console log sem er merkt `[RoadMapPrototype] place search:`.
- `rawData`: hvað API skilaði (má vera `null` ef JSON parse brotnaði)
- `parsed`: hvað `parsePlaceSearchResults` skilaði (ætti að vera array)
- Ef `parsed.length === 0` en `rawData.results.length > 0`: bug í `coercePlaceResult`
- Ef `rawData` er `null`: JSON parse brotnaði
- Ef `rawData.results.length === 0`: Google geocoder skilar engum niðurstöðum

## Hvað mistókst / sleppt

- Ég get ekki staðfest í browser hvort þetta lagar vandann 100%
- Console logging er aðaleg leið til að greina root cause á server side
- Ekki var breytt SQL, Supabase, deploy, eða production

## Næsta skref

1. **Stebbi keyrir browser proof og skoðar console**
2. Ef `parsed.length === 0` þegar `rawData.results.length > 0`: Codex eða Claude lagar `coercePlaceResult`
3. Ef `rawData.results.length === 0`: Google Geocoding API skilar engum niðurstöðum fyrir þessa querys -- þarf annað fallback eða provider

Ef allt virkar: M3A-2 (trailerKind select + departure time input) eða M3B (open-data route graph).
