# TODO-090 — Live-location prufu-CTA hotfix

Created: 2026-07-28 12:36
Timezone: Atlantic/Reykjavik

## Plan áfangans

1. Staðfesta auth-routing og endurheimt leiðar án þess að veikja aðgangsstýringu.
2. Sýna public prufu-CTA, prufumerkingu fyrir innskráða og sýnilega follow-stöðu á kortinu.
3. Tryggja að geolocation sé áfram innskráningarvarið, explicit opt-in og privacy-safe.
4. Keyra targeted próf, type-check, lint, fulla Vitest-suite og clean-room production build.
5. Commit-a afmarkað, push-a á `main`, fylgjast með Vercel og smoke-prófa production.

## Hvað var gert

- Public notandi með virka leið í `Vegagerðin / Núna` fær compact CTA með `Í prófun` og innskráningarhlekk.
- CTA vistar aðeins núverandi leiðar-input í fyrirliggjandi TTL-varða `sessionStorage` snapshotinu og kemur aftur á stóra route-kortið eftir innskráningu.
- Geolocation-aðgerðin sjálf er áfram aðeins renderuð fyrir innskráða og handlerinn heldur auth defense-in-depth.
- Innskráðir sjá `Í prófun` og skýran privacy-texta við controlin. Textinn lofar ekki að kortaflísabeiðnir séu staðsetningarlausar; hann afmarkar að Teskeið visti ekki live staðsetninguna.
- Kortið sýnir compact stöðu meðan það finnur eða eltir staðsetningu. Þegar notandi færir kortið sjálfur er `Elta mig aftur` áfram 44 px aðgerð og ber sömu prufumerkingu.
- Engin breyting var gerð á middleware eða auth: núverandi middleware canonicalizar þegar innskráða `/vedrid` notendur yfir á `/auth-mvp/vedrid` og varðveitir query-string.
- Engin live hnit, heading, hraði eða saga eru sett í URL, storage, logs eða fetch með þessari breytingu.

## Design.md samræmi

- Lausnin er mobile-first fyrir 360–460 px, wrappar texta, notar max-width á map-overlay og létt border-top section í stað nested card til að forðast lárétt og lóðrétt overflow.
- CTA og recenter eru minnst 40–44 px há og hafa `focus-visible`.
- Passive map-status er `aria-hidden`; fyrirliggjandi `aria-live` staða heldur skjálesaratilkynningu án tvítekningar.
- Engin input eða keyboard-hegðun breyttist.

## Skrár skoðaðar

- `WORKFLOW.md`
- `Design.md`
- `middleware.ts`
- `app/vedrid/page.tsx`
- `app/auth-mvp/vedrid/page.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/roadMapNavigation.ts`
- auth/login-next og route-restore próf og helpers

## Skrár breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/weather/roadMapNavigation.ts`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/road-map-navigation.test.ts`
- `lib/__tests__/road-map-vegagerdin-live-ui.test.ts`
- þessi handoff-skrá

## Skipanir og niðurstöður

- Targeted Vitest, fyrsta keyrsla: exit `1` vegna úreltrar source-assertion sem leitaði að gamla JSX `isAuthenticated &&` forminu. Assertion var afmörkuð að nýju auth/public branch formi; engin runtime-villa fannst.
- Targeted Vitest, endurkeyrsla: exit `0`, 5 skrár og 109 próf græn. Fyrsta skipunin vísaði óvart í `login-next.test.ts`, sem Vitest hunsaði þar sem raunheitið er `loginNext.test.ts`.
- `loginNext.test.ts`, rétt afmörkuð endurkeyrsla: exit `0`, 23 próf græn.
- `npm run type-check`: exit `0`.
- `npm.cmd run lint`: exit `0`; aðeins fyrirliggjandi warnings utan hotfix-scope.
- `npm.cmd run test:run`: exit `0`; 197 skrár grænar, 1 skipped; 4238 próf græn, 28 skipped og 8 todo.
- Fyrsta clean-room build: exit `1`, eingöngu netsandbox/EACCES við að sækja Inter font.
- Sama clean-room build utan netsandbox, með `.env*` útilokað og placeholder public Supabase-gildum: exit `0`; 118 síður generated.
- `git diff --check`: exit `0` (eingöngu line-ending warnings).

## Slept / ekki gert

- Engin SQL eða migration var skrifuð eða keyrð.
- Ekkert Supabase gagnalestur eða gagnaskrif var gert.
- Engin `.env.local`, secret eða environment variable var lesin eða breytt.
- Dev server og port 3004 voru ekki snert.
- `.obsidian/workspace.json` og eldri ótrackuð handoff eru utan scope og skulu ekki fara í commit.

## Ákvarðanir og áhætta

- Sérstakur sign-in helper notar `/auth-mvp/vedrid?context=route&view=map&restoreRoute=1`; eldri generic sign-in helper er óbreyttur.
- Route snapshot getur endurreiknað leiðina eftir innskráningu en geymir ekki live-location gögn.
- Sjálfvirk browserpróf geta ekki veitt raunverulegt mobile GPS-leyfi. Handvirkt mobile production-próf er því áfram nauðsynlegt.
- Route intelligence check: engin route-domain þekking, provider eða canonical segment breyttist; `IcelandRoadmap.md` þarf því ekki uppfærslu.

## Localhost checks for Stebbi

1. Opnaðu public `http://localhost:3004/vedrid`, reiknaðu leið og veldu stóra kortið, `Vegagerðin` og `Núna`.
2. Vænt: `Núverandi staðsetning`, `Í prófun`, stuttur privacy-texti og `Skrá inn og prófa`; enginn location permission-gluggi birtist public.
3. Ýttu á CTA, skráðu þig inn og staðfestu að leiðin sé endurreiknuð og stóra kortið opnist aftur.
4. Vænt innskráð: controlið sýnir `Í prófun`. Ýttu á `Sýna núverandi staðsetningu` og veittu leyfi.
5. Vænt: map-overlay sýnir fyrst `Finn staðsetningu...` og síðan `Kortið eltir þig`; blár directional puck sést.
6. Færðu/þysjaðu kortið handvirkt. Vænt: `Elta mig aftur · Í prófun`; location uppfærist en camera eltir ekki fyrr en ýtt er á takkann.
7. Prófaðu 360, 390 og 460 px: enginn láréttur overflow, CTA og recenter eru auðsnertanleg og neðri controls hyljast ekki af browser chrome.
8. Staðfestu ensku með ensku locale: sömu states og enginn óþýddur lykill.

Ekki setja raunveruleg staðsetningargögn í skjámyndir, logs eða handoff. Engin Supabase/SQL prófun á við um þetta hotfix.

## Næsta skref

Ef scoped diff-review er án blocker: stage-a aðeins sjö skrárnar hér að ofan, commit-a, push-a á `main`, fylgjast með Vercel til `Ready`, smoke-prófa public/auth-fail-closed og senda Stebba self-delivery Gmail með mobile prófunarskrefum.
