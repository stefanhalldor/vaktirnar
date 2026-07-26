# TODO-091 v077 — eldri spár í hornreit spátöflunnar

**Created:** 2026-07-26 21:18  
**Timezone:** Atlantic/Reykjavik  
**Fyrra handoff:** `2026-07-26-2102-todo-091-v076-codex-pending-forecast-cell-state.md`

## Samþykki og umfang

Stebbi bað Codex skýrt um að færa aðgerðina fyrir eldri spár inn vinstra megin við dagsetningar töflunnar. Leyfið náði til afmarkaðrar UI-, þýðinga-, regression-prófs- og handoff-breytingar. Engin SQL-, Supabase-, dev-server-, commit-, push-, deploy- eða production-aðgerð var framkvæmd.

## Hvað var gert

- Við fjórar eða fleiri valdar stöðvar er stóri `Skoða eldri spár` reiturinn fjarlægður fyrir ofan töfluna.
- Í staðinn birtist nett **`← Eldri spár`** í sticky efra-vinstra hornreitnum, beint vinstra megin við dagsetningarnar.
- Allur hornreiturinn er smellanlegur og heldur minnst 40 px snertiflöt.
- Loading-state í hornreitnum er stytt í **`Sæki…`** og breytir ekki breidd töflunnar.
- Ef history-beiðni mistekst birtist **`Reyna aftur`** í sama hornreit, með fullri villulýsingu í `aria-label` og `title`.
- Þegar engar eldri spár eða history-staða eru til er hornreiturinn raunverulega auður.
- Við eina til þrjár stöðvar notar samanburðurinn annað layout án dagsetningarhornreits. Þar helst aðgerðin sem nett ghost-control fyrir ofan samanburðinn, án fyrri stóra cardsins.
- Ensk gildi eru `Older forecasts` og `Fetching…`.
- Regression-prófi var bætt við til að staðfesta að aðgerðin sé innan hornreitsins þegar fjórar stöðvar virkja töflulayoutið.

## Skrár breyttar

- `components/weather/WeatherChasePanel.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/weather-chase-panel-hydration.test.tsx`
- þetta handoff

Fyrirliggjandi ócommittaðar prerelease-breytingar í þessum skrám voru varðveittar.

## Athuganir í þessum áfanga

Samkvæmt ósk Stebba voru hvorki próf, type-check né build keyrð eftir þetta smáatriði; þau verða keyrð saman í lok prerelease-smoke.

- JSON parse `messages/is.json` — exit 0.
- JSON parse `messages/en.json` — exit 0.
- `git diff --check` — exit 0; aðeins fyrirliggjandi LF/CRLF warnings.

Nýja regression-prófið hefur verið skrifað en er **ókeyrt** þar til sameiginlega lokakeyrslan fer fram.

## Design.md

Lausnin minnkar lóðrétt pláss á mobile, tengir history-aðgerðina sjónrænt við dagsetningarásinn og notar ghost-control í stað þungs cards. Sticky hornreiturinn varðveitir töfluskroll, focus-visible, aðgengilegt loading/error state og almenna 40 px touch-target reglu. Enginn input-, keyboard-, route-navigation- eða page-level overflow-kóði breyttist.

## Localhost checks for Stebbi

**Slóð:** `/vedrid` eða `/auth-mvp/vedrid`, með fjórar eða fleiri stöðvar og eldri spár tiltækar.

1. Staðfesta að `← Eldri spár` sé í efra-vinstra hornreitnum en ekki í stóru boxi fyrir ofan töfluna.
2. Smella hornreitinn.
   - Vænt: `Sæki…` birtist án layout-hökts og taflan fer síðan að elsta retained degi.
3. Skruna töflunni lárétt.
   - Vænt: hornreiturinn helst sticky vinstra megin og dagsetningar halda röð.
4. Með 1–3 stöðvar.
   - Vænt: nett `← Eldri spár` action er fyrir ofan compact samanburðinn; enginn auður hornreitur er til í því layouti.
5. Ef history-villa kemur náttúrulega fram, staðfesta `Reyna aftur`; ekki breyta gögnum eða provider-configi til að framkalla hana.

## Næsti stóri smoke-pakki — public console og manifest

**Forsenda:** signed out/incognito og local env með public weather virkt.

1. Opna `/vedrid` og smoke-prófa `Spágögn`, `Kort` og `Akstur` fyrir Reykjavík → Ísafjörður.
2. Í `Spágögn`, staðfesta nýja history-hornreitinn, blandað provider-val og að raunveruleg/pending/vöntunargildi hegði sér eins og í auth-sýn.
3. Í Console/Network mega engar væntanlegar rauðar 401/404/503 villur koma frá forecast, history eða road-intelligence lestri.
4. Public notandi má ekki senda Teskeið candidate request.
5. Opna `/manifest.json` beint.
   - Vænt: gilt JSON, ekki auth HTML eða syntax error.

Ef þessi pakki er grænn er næsti stóri pakki OTP/innskráning; heildarpróf, type-check og production-build bíða þar til browser-smoke-pakkarnir eru kláraðir.

## Óvissa / þarf að staðfesta

Raunútlit, sticky-hegðun og textabreidd hafa ekki verið browser-prófuð af Codex. Confidence á kóðauppsetningu er hátt, en nýja regression-prófið og TypeScript hafa vísvitandi ekki verið keyrð enn samkvæmt prófunarósk Stebba.
