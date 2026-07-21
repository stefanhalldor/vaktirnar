# 2026-07-21 15:45 - todo-086 v287 - Claude: Vegagerðin density + pill labels

Created: 2026-07-21 15:45
Timezone: Atlantic/Reykjavik

## Samþykki / Umfang

Stebbi gaf framkvæmdaleyfi til að rýna v286 og fara beint í næsta framkvæmdaskref.

Enginn commit, push, deploy, SQL keyrsla eða production aðgerð var gerð.

## Rýni á v286

Engin blockerar fundust. Allt rétt útfært:

- `createRouteWindLabelElement` shared helper er skýr og rétt notaður af báðum providers.
- Veðurstofan label density sorted by `routeFraction` → true first/last route anchors eru réttar.
- De-duplcation með Map + `stationId:routePointId` lykli er robust.
- Bottom-left time badge er innan `absolute bottom-9 left-3` container, stakkast yfir road legend, overlap við attribution er ekki til staðar.
- `bg-background/85` og `max-w-[calc(100vw-1.5rem)]` eru rétt á mobile.
- type-check, tests, build: allt grœnt.

**Vandinn sem var eftir:**

Vegagerðin labels höfðu engar density reglur. Á löngum leiðum (t.d. Reykjavík → Akureyri) gætu Vegagerðin stöðvar einnig gefið of margar labels samhliða Veðurstofan labels.

Einnig: báðar label-tegundir voru rectangular boxes (ekkert `border-radius`), sem lítur ekki eins vel út og pill-shaped UI annars staðar á síðunni.

## Hvað var gert

### 1. Constants renamed to provider-neutral

`VEDURSTOFAN_LABEL_ALWAYS_STATUSES` → `ROUTE_LABEL_ALWAYS_STATUSES`
`VEDURSTOFAN_LABEL_DENSITY_THRESHOLD` → `ROUTE_LABEL_DENSITY_THRESHOLD`

Skiptaðar með `replace_all` í öllum tilvísunum. Comment uppfærður:

> Route station DOM label density rules (applied to both providers).

### 2. Pill border-radius + slightly wider padding

Í `createRouteWindLabelElement` cssText:

```
'border-radius:99px',
```

`padding:2px 5px` → `padding:2px 6px` (eitt pixell víðara til að fara vel með rounded shape).

Þetta lætur báðar provider labels líta eins og pill-shaped chips, samræmt toggle buttons og legend pills í UI.

### 3. Density rules applied to Vegagerðin too

Í `renderVegagerdinStations`, identical pattern as Veðurstofan:

```ts
let pointsToLabel: typeof validPoints
if (validPoints.length <= ROUTE_LABEL_DENSITY_THRESHOLD) {
  pointsToLabel = validPoints
} else {
  const vegaOrderedPoints = [...validPoints].sort(...)
  // Map dedup: first + last + all ROUTE_LABEL_ALWAYS_STATUSES
  pointsToLabel = [...pointsByKey.values()].sort(by route order)
}
```

`VegagerdinRouteLayerPoint` hefur bæði `routeFraction` og `distanceFromOriginM` — sama sort key og Veðurstofan notar.

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`

## Skipanir keyrðar

- `npm run type-check`
  - Exit code: 0

## Localhost checks for Stebbi

Slóð: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

**Próf 1: Pill-shaped labels**

1. Reikna hvaða sem er leið með Vegagerðin eða Veðurstofan stöðvar.
2. Skoða labels á kortinu.

Vænt: Labels eru rounded-pill í stað rectangular boxes.

**Próf 2: Vegagerðin density á löngum leið**

1. Reikna Reykjavík → Akureyri eða aðra langa leið.
2. Skoða Vegagerðin label count á kortinu.

Vænt:
- Rauðar/gullinrauðar Vegagerðin stöðvar fá alltaf label.
- Ef ≤ 6 Vegagerðin stöðvar: allar fá label.
- Ef > 6: aðeins fyrsta og síðasta stöð fá label ef þær eru grœnar, ásamt öllum rauðum/gullinrauðum.

**Próf 3: Veðurstofan density óbreytt**

Sama uppsetning, sama hegðun og v285/v286.

**Próf 4: Filter regression**

Labels og circle markers fara saman þegar status pills eru smellt.

## Ákvarðanir

- `border-radius:99px` í stað `4px` eða `8px` — gerir labels í fullkomið pill shape án þess að breyta stærð þeirra við mismunandi textalengd.
- Vegagerðin density loop er nákvæmt copy af Veðurstofan loopunni, ekki abstrakt helper. Þetta er rétt — þær eru eins og gengar en provider-specific (Veðurstofan hefur `entry`, Vegagerðin hefur `point`). Ef þriðji provider bætist við, þá má abstrakt.
- `padding:2px 6px` — eitt pixell víðara en áður (5px) til að gefa lítið eitt meira "breathing room" í pill shape.

## Supabase / SQL / Auth / Production

Engar Supabase breytingar. Engin SQL. Engin auth/deploy breyting.

## Tillaga að næsta skrefi

Nú þegar báðir providers nota sömu density reglur og pill-shaped labels er UI nokkuð consistent.

Næstu valkostir í forgangsröð:

1. **Browser-sannprófun (Stebbi)**: Eina sem getur staðfest visual density og pill-shape er Stebbi í localhost. Frekari kóðabreytingar á density/styling eiga að bíða eftir feedback.

2. **Commit og PR**: Mikil vinna hefur safnast frá c1dab54 (v283–v287). Sé Stebbi sátt á visuelt, er tímabært að búa til commit og opna PR.

3. **Route geometry follow-up**: Routes fylgja ekki veginum 100% á sumum leiðum. Þetta krefst stærra graph-native routing fasa og er langtímamarkmið.
