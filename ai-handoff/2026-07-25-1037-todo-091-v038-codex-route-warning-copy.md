# TODO #091 — Akstur route-warning copy

Created: 2026-07-25 10:37  
Timezone: Atlantic/Reykjavik

## Samþykkt

Stebbi gaf Codex skýrt leyfi til að uppfæra viðvörunartextann í Akstri og
feitletra lokasetninguna.

Ekki samþykkt: commit, push, deploy, migration eða production.

## Hvað var gert

- Íslenski textinn nefnir nú `Google Maps`, segir að óöruggar leiðir komi
  stundum upp og útskýrir að Teskeið sé að byggja eigið leiðakerfi í stað þess
  að byggja áfram ofan á Google Maps niðurstöður.
- Lokasetningin um sérstaka varúð þar til skilaboðin eru fjarlægð er í sér
  `<strong>` blokk.
- Samsvarandi náttúrulegur enskur texti var uppfærður.
- Allur notendatexti er áfram í `messages/is.json` og `messages/en.json`.

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- Þessi handoff-skrá

## Checks

```text
git diff --check
Exit code: 0

messages/is.json | ConvertFrom-Json
Exit code: 0

messages/en.json | ConvertFrom-Json
Exit code: 0
```

Engin test suite, build eða dev-server aðgerð var keyrð fyrir texta/class
breytinguna. Full release checks eru skráð í v035 og síðari afmörkuð checks í
v036–v037.

## Design.md

Viðvörunin heldur núverandi amber banner, stuttum textastíl og mobile layouti.
Lokaorðin fá skýra áherslu án nýs controls eða navigation.

## Localhost checks for Stebbi

Á `/auth-mvp/vedrid/road-map-prototype`:

1. Opna Akstur.
2. Vænt: nýr Google Maps texti birtist í amber viðvörunarborðanum.
3. Vænt: síðasta setningin byrjar á nýrri línu og er feitletruð.
4. Prófa mjóan mobile skjá.
5. Vænt: textinn wrappar eðlilega án horizontal overflow eða overlap.
6. Skipta tímabundið yfir í ensku ef það er auðvelt.
7. Vænt: enski textinn og feitletrunin eru samstæð íslensku útgáfunni.

## Release guidance fyrir Claude Code

Þetta handoff kemur á eftir v035–v037 og breytingarnar skulu fylgja sama
release candidate. Claude Code skal áfram útiloka `.obsidian/workspace.json`
og fylgja commit/push/Vercel workflow úr v035.

## Route intelligence check

Copy-ið skýrir product-stefnu Teskeiðar um eigið leiðakerfi en bætir ekki við
canonical leið, segmenti, station matching eða provider-lógík.
`IcelandRoadmap.md` þarf ekki uppfærslu.

