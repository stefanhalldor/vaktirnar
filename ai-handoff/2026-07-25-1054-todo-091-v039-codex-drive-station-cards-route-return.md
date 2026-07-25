# TODO #091 — Akstur station cards and route-preserving return

Created: 2026-07-25 10:54  
Timezone: Atlantic/Reykjavik

## Samþykkt

Stebbi gaf Codex skýrt leyfi til að:

- stækka station-punkta í Aksturskortinu;
- opna rétt Veðurstofu- eða Vegagerðarspjald við smell;
- bæta við „Til baka í akstur“;
- varðveita hvort notandinn var á Korti eða Gögnum;
- varðveita uppsettu leiðina þegar farið er í fullan Veðurpúls og til baka.

Ekki samþykkt: commit, push, deploy, migration, Supabase eða production.

## Hvað var gert

### Marker og station overlay

- Venjulegir route station dots stækkuðu úr 10 px í 14 px.
- Compact dots stækkuðu úr 8 px í 10 px.
- Veðurstofu-marker velur stöð og opnar station-detail overlay með
  `VedurstofanPointCard`.
- Vegagerðar-marker velur stöð og opnar sama overlay með núverandi
  Vegagerðarupplýsingum: stöð, vind/hviða, staða, lofthiti og veghiti.
- Overlay-back segir nú „Til baka í akstur“ og lokar aðeins station detail.
  Undirliggjandi route state og Kort/Gögn view helst óbreytt.

### Öruggt Pulse returnTo

- `resolvePulseBackDestination` þekkir nú exact
  `/auth-mvp/vedrid/road-map-prototype` path með query/hash sem typed
  `drive` destination.
- Lookalike path er áfram hafnað.
- Bæði Veðurstofu- og Vegagerðar-Pulse clients sýna „Til baka í akstur“ fyrir
  `drive`.
- Station cards senda provider-rétta Pulse href með route-aware `returnTo`.

### Session-bundið route restore

Áður en station overlay opnast er vistað ephemeral snapshot í
`sessionStorage`:

- `from`
- `to`
- caution/red vindmörk
- `information` eða `map` view
- `updatedAt`

Snapshot:

- notar lykilinn `teskeid_road_map_route_return_v1`;
- lifir aðeins current browser-tab;
- er samþykkt í mest tvær klukkustundir;
- fer ekki í Supabase eða logs.

Return URL notar:

```text
/auth-mvp/vedrid/road-map-prototype?context=route&view=map&restoreRoute=1
```

eða `view=information`.

Við return:

1. snapshot er validate-að;
2. Frá/Til og vindmörk eru sett aftur;
3. sama route submit flow er keyrt aftur;
4. leiðin er endurreiknuð með ferskum provider-gögnum;
5. requested Kort/Gögn view opnast þegar route calculation verður successful.

Raw Google response er ekki vistað. Aðeins input draft er varðveitt og leiðin
er endurreiknuð.

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/pulseBack.ts`
- `lib/__tests__/pulseBack.test.ts`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx`
- `messages/is.json`
- `messages/en.json`
- Þessi handoff-skrá

## Checks

```text
npm.cmd run test:run -- lib/__tests__/pulseBack.test.ts
Exit code: 0
Test files: 1 passed
Tests: 30 passed

npm.cmd run type-check
Exit code: 0

git diff --check
Exit code: 0

messages/is.json | ConvertFrom-Json
Exit code: 0

messages/en.json | ConvertFrom-Json
Exit code: 0
```

Engin full suite, build eða dev-server aðgerð var keyrð í þessum hraða
localhost-hring. Full suite/build úr v035 þarf að endurkeyra fyrir release
vegna nýrra runtime state-breytinga.

## Öryggi og privacy

- `returnTo` er áfram allowlist-validate-að og external/open-redirect URL eru
  höfnuð.
- Snapshot er sessionStorage-only og TTL-bundið.
- Engin RLS, auth policy, grants, DB eða production-gögn breyttust.
- Snapshot geymir route input names sem geta endurspeglað staði notanda.
  Þau fara ekki milli browser-taba og eru ekki send í nýjan gagnagrunn.

## Design.md

- Punktar eru sýnilegri og auðveldari að hitta á mobile.
- Smellur gefur tafarlaust, sýnilegt station-detail state.
- „Til baka í akstur“ varðveitir navigation context.
- Overlay notar núverandi mobile full-screen/sheet hegðun og veldur ekki
  nýju láréttu overflowi.

## Route intelligence check

- Breytingin snertir Akstursleið, Veðurstofu- og Vegagerðarstöðvar.
- Engin canonical segment, station-matching regla eða provider-cache breyttist.
- Raw Google Routes gögn eru ekki geymd; input draft er endurreiknað með
  núverandi route pipeline.
- `IcelandRoadmap.md` þarf ekki uppfærslu.

## Localhost checks for Stebbi

Slóð:
`/auth-mvp/vedrid/road-map-prototype`

### In-page station cards

1. Setja upp leið og opna Kort.
2. Smella á Veðurstofupunkt.
3. Vænt: stærri punktur er auðveldari að hitta og
   `VedurstofanPointCard` opnast.
4. Smella „Til baka í akstur“.
5. Vænt: sama leið, tími, filter og Kort view er enn til staðar.
6. Smella á Vegagerðarpunkt.
7. Vænt: Vegagerðarspjald opnast með réttum raungildum.
8. Loka.
9. Vænt: sama route map state helst.
10. Endurtaka frá Gögnum ef station detail er opnanlegt þar.
11. Vænt: back skilar í Gögn, ekki Kort.

### Full Veðurpúls return

1. Frá Korti: opna station card og fara áfram í fullan Veðurpúls.
2. Vænt: Pulse header sýnir „Til baka í akstur“.
3. Smella á back.
4. Vænt: Akstur opnast, sama Frá/Til leið endurreiknast og Kort opnast þegar
   calculation lýkur.
5. Endurtaka frá Gögnum.
6. Vænt: leið endurreiknast og Gögn opnast.
7. Prófa bæði Veðurstofu og Vegagerð.
8. Staðfesta að route loader sjáist meðan leið er endurreiknuð og að controls
   virðist ekki dauð.

### Edge cases

1. Eyða `teskeid_road_map_route_return_v1` og opna crafted return URL.
2. Vænt: Akstur opnast í requested view en engin villa eða auto-submit keyrir.
3. Prófa snapshot eldra en tvær klukkustundir.
4. Vænt: snapshot er fjarlægt og ekki endurheimt.
5. Prófa nýjan browser-tab.
6. Vænt: leiðarsnapshot flyst ekki milli taba.

## Release guidance fyrir Claude Code

Þetta handoff kemur á eftir v035–v038. Áður en release fer áfram skal Claude
Code:

1. rýna route restore og provider card rendering;
2. fá localhost-staðfestingu Stebba á báðum providerum og Kort/Gögn return;
3. endurkeyra `npm run type-check`, `npm run test:run` og `npm run build`;
4. stage-a explicit product files og útiloka `.obsidian/workspace.json`;
5. fylgja commit/push/Vercel workflow úr v035.

## Óvissa / þarf að staðfesta

- Route restore endurreiknar default route frá sömu Frá/Til inputs. Ef notandi
  hafði sérstaklega valið aðra surface/route variant er sú variant ekki enn
  snapshot-uð; default route verður endurreiknuð.
- Browserprófun þarf að staðfesta að `requestSubmit()` keyri eftir að route
  form mountast á öllum target browsers.

