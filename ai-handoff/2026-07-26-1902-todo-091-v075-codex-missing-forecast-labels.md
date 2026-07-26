# TODO-091 v075 — skýr textagildi þegar spá vantar

**Created:** 2026-07-26 19:02  
**Timezone:** Atlantic/Reykjavik  
**Fyrra handoff:** `2026-07-26-1848-todo-091-v074-codex-localhost-metno-history-status.md`

## Samþykki

Stebbi bað Codex skýrt um að framkvæma textabreytinguna. Leyfið náði til afmarkaðra kóða-, þýðinga-, prófa- og handoff-breytinga, en ekki SQL, Supabase, commit, push, deploy eða production.

## Hvað var gert

- Tómt strik í forecast-reit var skipt út fyrir merkingarbært empty state.
- Fyrir liðinn `targetIso` birtist **„Sögugildi vantar“**.
- Fyrir núverandi eða framtíðar `targetIso` birtist **„Spá vantar“**.
- Sama regla gildir sjálfkrafa fyrir Veðurstofuna og met.no.
- Ensk gildi eru **“History missing”** og **“Forecast missing”**.
- Textinn notar þétt 10 px/leading-tight útlit sem passar í mjóa mobile-töfludálka.
- Regression-próf staðfestir bæði fortíðar- og framtíðarmerkingu.

## Skrár breyttar

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`
- þetta handoff

Skrárnar báru þegar ócommittaðar prerelease-breytingar. Codex varðveitti þær og breytti aðeins afmörkuðum hlutum innan þeirra.

## Prófanir

- `npm run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx` — exit 0, 15/15 próf stóðust.
- `npm run type-check` — exit 0.
- `git diff --check` — exit 0; aðeins fyrirliggjandi LF/CRLF warnings.

Fyrsta markpróf féll vegna þess að test-fixture spread-aði label-proxy og missti þannig óskyld hnappanöfn. DOM sýndi báða nýju textana rétt. Fixture-prófið var þrengt að samþykktri hegðun og lokakeyrsla fór græn.

## Design.md

Lausnin fylgir mobile-first og empty-state reglum `Design.md`: stutt raunveruleg merking kemur í stað óskýrs tákns, textinn er afmarkaður innan láréttu töflunnar og loading/error states halda sinni sérstöku merkingu. Engin navigation, input, keyboard eða page-level overflow hegðun breyttist.

## Deployment-staða og næsta skref

Stebbi staðfesti að deployment-skref #3 í v072, admin road-graph bootstrap, væri lokið. Næst er read-only skref #4:

1. nákvæmlega eitt `active` snapshot;
2. ekkert `building` snapshot;
3. `golden_route_pass_count = golden_route_total_count`;
4. bucket `teskeid-road-graph-snapshots` er private og active `storage_path` á samsvarandi object.

Enginn deploy, commit eða push var framkvæmdur.

## Localhost checks for Stebbi

**Slóð:** `/auth-mvp/vedrid`, með blöndu af Veðurstofu- og Yr/met.no-stöðum.

1. Velja liðinn dag/tíma þar sem gildi var ekki vistað.
   - Vænt: `Sögugildi vantar`, ekki `–`.
2. Velja núverandi/framtíðardag þar sem provider á ekkert gildi.
   - Vænt: `Spá vantar`, ekki `–`.
3. Staðfesta að raunveruleg veðurgildi, `Sæki spá...`, villa og retry séu óbreytt.
4. Prófa 360, 390 og 460 px breidd.
   - Vænt: textinn má brotna þétt innan reits; enginn page-level overflow eða overlap.

Þessi localhost-prófun snertir ekki Supabase-gögn. Ekki breyta production env, keyra migration eða eyða history-gögnum til að búa til empty states.
