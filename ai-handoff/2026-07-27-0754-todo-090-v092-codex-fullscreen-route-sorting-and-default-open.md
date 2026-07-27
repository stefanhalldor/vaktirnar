# TODO #90 — Fullscreen route sorting and default open

Created: 2026-07-27 07:54
Timezone: Atlantic/Reykjavik

## Samþykkt

Stebbi samþykkti næsta fullscreen route-choice UI-áfanga og bætti við að stóra
kortið ætti að opnast sjálfkrafa, sýnilegt X ætti að fara og apply ætti ekki að
reikna veður aftur fyrir sömu applied leið.

Leyfið náði ekki til commit, push, deploy, migration, Supabase eða production.

## Hvað var gert

- Fullscreen route cards voru gerð compact að fyrirmynd summary-spjaldanna.
- Sameiginlegur `RouteComparisonCompactCard` component og canonical
  `RouteComparisonMiniMapItem` view-model bera nú:
  - provider/heiti og stöðugan leiðarlit;
  - vegalengd;
  - tíma og duration-rank;
  - caution, gravel og `Best veður núna` badges;
  - slitlagsstiku og bundið/möl/óvíst samantekt.
- Bætti stable röðun við fullscreen:
  - `Sjálfgefið`;
  - `Aksturstíma`;
  - `Veðri núna`.
- Weather sorting notar sama deterministic Vegagerðar-score og núverandi
  `Best veður núna` badge. Hún er disabled ef complete score vantar fyrir
  einhverja leið.
- Röðun breytir ekki selected route eða route color.
- Fullscreen opnast sjálfkrafa einu sinni fyrir hverja route-run þegar fyrsta
  applied weather result og að minnsta kosti tvær comparison-leiðir eru til.
- Nýjar alternatives sem bætast síðar opna modalinn ekki aftur.
- Sýnilega X-ið var fjarlægt. Escape lokar áfram fyrir keyboard-aðgengi.
- CTA lokar fullscreen. Ef valda route ID er sama og applied route ID er
  ekkert nýtt weather API-call ræst; ef leiðin er önnur fer hún í núverandi
  attested envelope/refetch flæði.

## Skrár breyttar í UI-áfanganum

- `components/weather/RouteComparisonMiniMap.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/route-comparison-mini-map.test.tsx`
- þessi handoff-skrá

Skrárnar voru þegar í dirty route/performance worktree og fyrirliggjandi vinna
var varðveitt.

## Prófanir og skipanir

- `npm run test:run -- lib/__tests__/route-comparison-mini-map.test.tsx lib/__tests__/road-graph-candidate.test.ts lib/__tests__/weather-route-cautions.test.ts lib/__tests__/weather-google.test.ts`
  — exit 0; 4 files, 152/152 tests passed.
- `npm run type-check` — exit 0.
- Message JSON parse fyrir `is.json` og `en.json` — exit 0.
- `git diff --check` — exit 0; aðeins fyrirliggjandi LF/CRLF warnings.

## Test coverage

- Sort helper prófar default, duration og weather ordering.
- Component-próf smellir á duration/weather controls og sannreynir DOM-röð.
- Selected route heldur `aria-pressed=true` eftir röðun.
- Alternatives loading/completed og compact facts/badges eru áfram prófuð.
- Sjálfvirk one-shot opnun og same-route no-refetch eru ekki unit-prófuð beint
  vegna þess að orchestration er inni í stóra `RoadMapPrototypeMap`; þau þurfa
  localhost browserpróf.

## Design.md samræmi

- Compact cards minnka card-hæð og sýna samanburð án nested detail-card.
- Sort control hefur þrjá gagnkvæma valkosti og einn active state.
- Touch targets eru minnst 40 px.
- Status er ekki miðlað með lit einum.
- Disabled weather-sort er sýnilegt og keyboard-safe.
- Primary CTA er eina sýnilega loka-/framhaldsaðgerðin; Escape varðveitir
  accessibility.
- Safe-area padding og bounded scroll eru áfram til staðar.

## Route intelligence check

- Snertir aðeins client-side framsetningu/röðun á provider-neutral RouteOptions.
- Weather score kemur úr existing provider-station matching og thresholds.
- Engin ný route persistence, geometry storage eða provider-specific regla.
- Engin privacy-, Supabase-, auth- eða RLS áhrif.

## Localhost checks for Stebbi

1. Opna `/auth-mvp/vedrid` sem innskráður notandi með Veðrið-aðgang.
2. Reikna leið sem skilar Google- og Teskeiðarleiðum.
3. Vænt: fullscreen `Veldu leið á korti` opnast sjálfkrafa þegar fyrsta
   weather-resultið og minnst tvær leiðir eru tilbúnar.
4. Vænt: ekkert X er í header; Escape lokar á desktop.
5. Skoða compact cards við 360, 390, 460 px og desktop.
6. Vænt: cards líkjast summary-spjöldunum, sýna km, tíma-rank, badges og
   slitlagsstiku án overlap eða óþarfa hæðar.
7. Velja `Aksturstíma`.
8. Vænt: stysta áætlaða leið birtist fyrst; leiðarlitir og selected card breytast
   ekki.
9. Velja `Veðri núna`.
10. Vænt: leið með lægsta current deterministic weather severity kemur fyrst.
    Ef complete Vegagerðar-score vantar er control disabled.
11. Velja aðra leið á korti og í card-lista. Vænt: bæði halda sama selection.
12. Velja aftur þá leið sem veðurupplýsingarnar undir kortinu byggja þegar á og
    smella CTA.
13. Vænt: fullscreen lokast strax og ekkert nýtt `/travel/route` request fer í
    Network/console.
14. Opna aftur, velja aðra leið og smella CTA.
15. Vænt: eitt nýtt route/weather request fer af stað, pending feedback birtist
    og ný valin leið verður applied.
16. Láta alternatives bætast við eftir að modal hefur verið lokað.
17. Vænt: modal opnast ekki sjálfkrafa aftur í sömu route-run.
18. Keyra nýtt Frá/Til submit.
19. Vænt: fullscreen má opnast sjálfkrafa einu sinni fyrir nýju keyrsluna.

Engin migration, env-, Supabase-, auth-, RLS- eða production-aðgerð þarf fyrir
þessi próf.

## Óvissa / eftirstandandi áhætta

- Confidence: high fyrir compact cards og sorting; 152 targeted tests og types
  eru græn.
- Confidence: medium-high fyrir auto-open/no-refetch þar til Stebbi staðfestir
  Network-hegðun í browser.
- Weather sorting er `Veður núna`, ekki forecast-at-arrival. Það er vísvitandi
  og labelið segir það skýrt.
- Summary markup notar enn eldri inline rendering þótt fullscreen og summary
  sæki nú sömu canonical gögn/labels. Ef fullkomin component-level sameining er
  enn æskileg má gera það sem lítinn cleanup eftir sjónræna staðfestingu, án
  breytingar á hegðun.
