# TODO-091 v076 — pending-texti í spátöflureitum

**Created:** 2026-07-26 21:02  
**Timezone:** Atlantic/Reykjavik  
**Fyrra handoff:** `2026-07-26-1902-todo-091-v075-codex-missing-forecast-labels.md`

## Samþykki og umfang

Stebbi bað Codex skýrt um að framkvæma pending-textabreytinguna í spátöflunni. Leyfið náði til afmarkaðrar component-, prófa- og handoff-breytingar. Engin SQL-, Supabase-, dev-server-, commit-, push-, deploy- eða production-aðgerð var framkvæmd.

## Hvað var gert

- Auður spátöflureitur sýnir nú **„Sæki spá...“** meðan gagnabeiðni viðkomandi stöðvar er virk.
- Fyrirliggjandi raunveruleg gildi haldast sýnileg meðan önnur gildi eða provider eru enn að hlaðast.
- Þegar beiðninni lýkur hverfur pending-textinn:
  - raunverulegt gildi birtist ef það barst;
  - annars birtist **„Sögugildi vantar“** fyrir liðinn tíma eða **„Spá vantar“** fyrir núverandi/framtíðartíma.
- Sama regla er notuð í báðum töfluútfærslum og fyrir bæði met.no og Veðurstofuna.
- Engum nýjum notendatexta var bætt við; núverandi þýðingarlykill `stillLoading` er endurnýttur.

## Skrár breyttar í þessum áfanga

- `components/weather/WeatherChasePanel.tsx`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`
- þetta handoff

Skrárnar innihéldu fyrirliggjandi ócommittaðar prerelease-breytingar. Þær voru varðveittar og engin ótengd breyting afturkölluð.

## Prófun

- `npm run test:run -- lib/__tests__/weather-chase-panel-hydration.test.tsx` — exit 0, 15/15 próf stóðust.
- `npm run type-check` — exit 0.
- `git diff --check` — exit 0; aðeins fyrirliggjandi LF/CRLF warnings.
- `npm run test:run` — exit 0, 160 test files passed, 1 skipped; 3.808 próf stóðust, 28 skipped og 8 todo.
- `npm run build` — exit 0; production-build kláraðist. Fyrirliggjandi lint warnings birtust í ótengdum skrám.

Regression-prófin staðfesta sérstaklega að pending-texti birtist bæði í auðum reit og stöðvarstöðu meðan met.no history-beiðni er ókláruð, að vöntunartexti birtist ekki of snemma og að pending-textinn hverfi þegar gildi berst. Þau staðfesta einnig progressive rendering þegar einn provider hefur gögn en annar er enn að hlaða.

## Design.md

Breytingin fylgir leiðbeiningum um skýr loading- og empty states og varðveitir mobile-first töfluhegðun. Textinn notar sama þétta reitastíl og vöntunartextarnir; engin navigation-, input-, focus-, keyboard- eða page-level overflow-hegðun breyttist.

## Áhætta og staða

- Þetta er aðeins UI-state breyting; engin gagnageymsla, RLS, auth eða provider-köll breyttust.
- Stöðvarhausinn getur áfram sýnt eitt almennt **„Sæki spá...“** á sama tíma og auðir reitir sýna sama texta. Það er vísvitandi: hausinn segir að stöðin sé að hlaða og reitirnir koma í veg fyrir ótímabæran vöntunartexta.
- TODO-091 prerelease localhost-listinn er ekki fullkláraður. Þessi breyting þarf staðfestingu í Phase 1 áður en haldið er áfram.

## Localhost checks for Stebbi

**Slóð:** `/auth-mvp/vedrid`, innskráður, með blöndu af Veðurstofu- og Yr/met.no-stöðum.

1. Opna síðuna með DevTools Network throttling stillt tímabundið á hæga tengingu eða gera venjulega harða endurhleðslu.
   - Vænt: auðir reitir sem enn er verið að sækja sýna `Sæki spá...`.
   - Vænt: þeir sýna ekki `Sögugildi vantar` eða `Spá vantar` áður en beiðninni lýkur.
2. Bíða þar til allar spá- og history-beiðnir klárast.
   - Vænt: `Sæki spá...` hverfur úr reitunum.
   - Vænt: raunveruleg gildi birtast þar sem þau bárust; annars `Sögugildi vantar` eða `Spá vantar` eftir tíma.
3. Staðfesta progressive rendering.
   - Vænt: gögn sem þegar eru komin haldast sýnileg þótt önnur stöð eða provider sé enn að hlaða.
4. Prófa 360, 390 og 460 px breidd og færa töfluna lárétt.
   - Vænt: textinn brotnar þétt innan reits; enginn overlap eða page-level láréttur overflow.
5. Ef hægt er að framkalla provider-villu án breytinga á gögnum, staðfesta að error/retry-state birtist og að pending-textinn festist ekki.

Þessi localhost-prófun á að vera read-only gagnvart Supabase. Ekki eyða history-gögnum, breyta production env eða keyra migration til að búa til vöntunarstöðu.

## Næsta skref

Stebbi staðfestir ofangreinda Phase 1 hegðun á localhost. Að þeirri staðfestingu lokinni skal halda áfram eftir leiðréttu röðinni í `2026-07-26-2049-todo-090-091-v022-codex-localhost-checks-corrected-order.md`; ekki telja allan v072 localhost-listann lokinn fyrr en hvert viðeigandi atriði hefur verið prófað.
