# TODO-090 prerelease: dormant Samvinna runner + live-location follow

**Dagsetning:** 2026-07-28 11:41 (Atlantic/Reykjavik)
**Agent:** Codex
**Staða:** Prerelease-gates græn; ócommittað þegar þetta handoff var skrifað

## Findings fyrst

1. **Enginn release-blocker fannst í samþykktu code-scope.** Targeted próf,
   raunverulegt synthetic Windows DPAPI roundtrip, type-check, lint, full Vitest
   og clean-room production build kláruðust með exit `0`.
2. **Samvinna er áfram viljandi dormant/fail-closed.** Engin environment
   variable var lesin eða breytt, SQL95 var hvorki breytt né keyrð og Supabase
   var ekki snert. Positive Samvinna-flow verður því ekki virkjað með þessum
   kóðarollout einum.
3. **Handvirkt Windows private-beta gate er eftir.** Scheduled Task
   registration/start/stop/uninstall og ACL á raunskrá voru viljandi ekki
   framkvæmd. Unit/integration próf og raunverulegt in-memory DPAPI seal/open
   eru græn, en fyrsta raunuppsetning runner þarf síðar stjórnað manual smoke.
4. **Handvirkt mobile GPS gate er eftir.** Browser GPS, hreyfing og MapLibre
   gestures er ekki hægt að sannreyna end-to-end í headless prófi. Pure
   follow/free reducer, watch cleanup, privacy og source contracts eru prófuð.
5. **Lint hefur aðeins fyrirliggjandi warnings.** Engin lint-villa eða ný
   warning sem tengist þessum breytingum kom fram.
6. Fyrsta clean-room build-tilraun stoppaði eingöngu af því að sandbox bannaði
   opinbera `next/font` Inter-beiðni. Sama einangraða build var endurkeyrt með
   afmörkuðum netaðgangi og varð grænt. Báðar temp-möppur voru fjarlægðar.

## Plan áfangans

1. Laga DPAPI assembly-load vandamálið fail-closed.
2. Verja live-location gegn synchronous `watchPosition` throw án leka.
3. Endurkeyra raunverulegt DPAPI roundtrip og targeted regression-próf.
4. Gera sjálfstæða security/privacy/mobile diff-rýni og loka findings.
5. Keyra type-check, lint, full Vitest og clean-room production build.
6. Gera nákvæman tveggja-commit scope-audit fyrir dormant runner og live
   location.

## Hvað var raunverulega gert

### Dormant, provider-neutral Samvinna runner

- Bætt við provider-neutral adapter contract og explicit registry; Codex er
  eini innbyggði adapterinn og server-gildi getur ekki valið arbitrary
  executable.
- Dedicated Codex session er varðveitt yfir background restart sem opaque
  `conversationId -> providerSessionId` mapping.
- Windows background lifecycle er til fyrir `install`, `start`, `status`,
  `stop` og `uninstall`, án þess að task sé skráð eða ræst sjálfkrafa af
  þessari framkvæmd.
- Hidden VBS launcher bíður eftir child-processi og Scheduled Task keyrir sem
  per-user `LIMITED` task við innskráningu.
- Install neitar að yfirskrifa fyrirliggjandi task/profile og rollback er
  afmarkað og transactional.
- Connector bearer, metadata og opaque session IDs eru geymd í
  DPAPI `CurrentUser` private state með explicit current-user ACL.
- Pairing code, prompts, replies, raw provider events, provider/API secrets og
  `.env` gildi eru hvorki vistuð né logguð.
- DPAPI PowerShell script hleður nú `System.Security` assembly explicit áður
  en `ProtectedData` er notað.
- 401 eða local expiry hreinsar credential og session mappings. `stop`
  varðveitir protected state; local uninstall eyðir aðeins fasta taskinu og
  nákvæmu AgentRunner möppunni. Server revoke er áfram Teskeið-owned action.
- Safe logger notar aðeins fasta event/category/status allowlista.

### Live location í Vegagerðin/Núna

- Virknin er eingöngu fyrir innskráðan notanda, virka leið, route-map view,
  `Vegagerðin/Núna` og explicit opt-in.
- `watchPosition` notar high accuracy og stöðvast við opt-out, route/mode/view
  exit, chat-open, hidden document og unmount.
- Synchronous `SecurityError` verður `permission_denied`; önnur synchronous
  throw verða `position_unavailable`. Engin exception-smáatriði fara í log.
- Browser course-over-ground er aðeins treyst meðan notandi er á hreyfingu og
  accuracy/speed eru innan marka. Annars er stefna reiknuð varlega milli
  marktækra staðsetningarpunkta með noise-, distance-, time-, speed- og
  0/360-wrap vörnum.
- Programmatic camera movement heldur follow state. Handvirkt
  pan/zoom/rotate/pitch færir í free state og sýnir compact 44 px
  `Elta mig aftur`.
- Recenter endurvirkjar follow. Follow zoom er integer 10-18, step 1, default
  14. Aðeins þetta bounded zoom preference fer í localStorage.
- Í follow state tekur zoom gildi strax; í free state bíður það næsta
  recenter.
- Camera bearing fylgir gildri landfræðilegri stefnu og puck notar
  `heading - map bearing`, þannig að hann helst réttur þegar kortinu er snúið.
- `prefers-reduced-motion` slekkur á animation/transitions.
- Ógild/non-finite browser accuracy er nú `null` og UI segir
  `nákvæmni óþekkt` í stað rangrar `±0 m` fullyrðingar.
- Follow/free ákvörðun var færð í pure reducer og er prófuð hegðunarlega, ekki
  aðeins með source-textaleit.
- IS/EN textar og mobile-first focus/touch framsetning voru uppfærð.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`
- `Design.md` (viðeigandi mobile/map/navigation/privacy kaflar)
- `ai-handoff/README.md`
- `ai-handoff/2026-07-28-1034-todo-090-v116-codex-agent-collaboration-dormant-rollout-db-blocker.md`
- `ai-handoff/2026-07-28-1117-todo-090-v117-codex-dpapi-stop-gate.md`
- Allar breyttar/nýjar runner- og live-location skrár taldar upp hér að neðan

## Skrár sem voru breyttar

### Commit 1 scope: dormant Samvinna/runner

- `tools/teskeid-agent-runner/PROTOCOL.md`
- `tools/teskeid-agent-runner/README.md`
- `tools/teskeid-agent-runner/package.json`
- `tools/teskeid-agent-runner/src/adapters/codex.mjs`
- `tools/teskeid-agent-runner/src/adapters/contract.mjs`
- `tools/teskeid-agent-runner/src/adapters/registry.mjs`
- `tools/teskeid-agent-runner/src/background/profile-store.mjs`
- `tools/teskeid-agent-runner/src/background/service.mjs`
- `tools/teskeid-agent-runner/src/background/windows-dpapi.mjs`
- `tools/teskeid-agent-runner/src/background/windows-task.mjs`
- `tools/teskeid-agent-runner/src/bridge-client.mjs`
- `tools/teskeid-agent-runner/src/cli-options.mjs`
- `tools/teskeid-agent-runner/src/cli.mjs`
- `tools/teskeid-agent-runner/src/runner.mjs`
- `tools/teskeid-agent-runner/src/safe-log.mjs`
- `tools/teskeid-agent-runner/src/session-store.mjs`
- `tools/teskeid-agent-runner/test/adapter-registry.test.mjs`
- `tools/teskeid-agent-runner/test/background.test.mjs`
- `tools/teskeid-agent-runner/test/bridge-client.test.mjs`
- `tools/teskeid-agent-runner/test/codex-adapter.test.mjs`
- `tools/teskeid-agent-runner/test/runner.test.mjs`
- `ai-handoff/2026-07-28-1034-todo-090-v116-codex-agent-collaboration-dormant-rollout-db-blocker.md`

### Commit 2 scope: live location + prerelease handoff

- `components/weather/RoadMapPrototypeMap.tsx`
- `lib/places/liveLocation.client.ts`
- `lib/__tests__/live-location-client.test.ts`
- `lib/__tests__/road-map-vegagerdin-live-ui.test.ts`
- `messages/is.json`
- `messages/en.json`
- `ai-handoff/2026-07-28-1141-todo-090-v118-codex-agent-collaboration-live-location-prerelease.md`

## Skipanir og niðurstöður

- `npm.cmd test --prefix tools/teskeid-agent-runner`: exit `0`, 53/53.
- Raunverulegt synthetic DPAPI `seal -> open` með Windows PowerShell/DPAPI:
  exit `0`, `dpapi-roundtrip-ok`.
- Targeted Vitest fyrir live-location client + map UI contracts: exit `0`,
  26/26 eftir loka-audit.
- `git diff --check` fyrir báða scoped pakka: exit `0`.
- `npm.cmd run type-check`: exit `0`.
- `npm.cmd run lint`: exit `0`, aðeins fyrirliggjandi warnings.
- `npm.cmd run test:run`: exit `0`; 197 test files passed, 1 skipped;
  4.235 tests passed, 28 skipped, 8 todo.
- Fyrsta clean-room build í net-sandbox: exit `1` aðeins vegna bannaðrar
  `next/font` Inter-beiðni; temp staðfest fjarlægt.
- Sama clean-room production build með afmörkuðum opinberum font-netaðgangi:
  exit `0`; compile, lint/type validation, 118 static pages og traces græn;
  `cleanRoomExists=False`.

## Hvað var sleppt

- Engin `.env.local` eða önnur `.env*` skrá var lesin eða breytt.
- Engin secrets eða environment variable gildi voru lesin eða breytt.
- Engin SQL/migration var breytt eða keyrð.
- Supabase var hvorki lesið né skrifað.
- Engin feature access var veitt.
- `AGENT_COLLABORATION_ENABLED` var ekki virkjað eða skoðað.
- Dev server og port 3004 voru ekki snert.
- Engin Windows Scheduled Task, runner profile eða credential var stofnað.
- `.obsidian/workspace.json`, v117 og öll eldri ótrackuð handoff eru utan
  commit-scope.

## Ákvarðanir

- DPAPI bilun er fail-closed; ekkert plaintext fallback er til.
- Runner background persistence er explicit Windows-only exception frá
  memory-only interactive mode og er skýrt skjalfest.
- `installed_paired` fullyrðir ekki process-liveness.
- Offline queue er áfram server-side; runner vistar aldrei prompt/reply queue.
- Live GPS er browser-local. Hnit, heading, hraði og saga fara aldrei í fetch,
  Supabase, analytics, logs, handoff, screenshots eða storage.
- Óþekkt accuracy er sýnd sem óþekkt, ekki falskt núll.

## Design.md samræmi

- Controls eru mobile-first, compact og án lárétts overflow.
- Recenter er 44 px touch target; zoom controls eru 40 px og með
  `focus-visible`, disabled-state og localized accessible labels.
- Engin ný route-transition eða síða var búin til, svo ekki þarf nýtt
  `loading.tsx`.
- Reduced-motion er virt og map control feedback er strax sýnilegt.

## SQL, Supabase, auth og production

- SQL95 er áfram ókeyrð og Stebbi-owned.
- Engin schema-, RLS-, grants-, auth-, policy-, function- eða production-data
  áhrif urðu í þessum áfanga.
- Samvinna positive flow má ekki virkja fyrr en Stebbi hefur sjálfur tekið
  næsta Supabase/activation gate.
- Live location notar núverandi authenticated UI boundary en skrifar engin
  notendagögn.

## Eftirstandandi áhætta

- Actual Scheduled Task og actual ACL-on-file þurfa manual private-beta smoke
  áður en background runner er talinn operational.
- `status` er vísvitandi configuration/credential status, ekki heartbeat.
- Local uninstall getur ekki revoke-a server credential; revoke skal fyrst
  gera í Teskeið þegar Samvinna verður virk.
- Browser/device heading-gæði eru mismunandi; derived fallback er því
  conservative og directional puck getur tímabundið verið falinn.
- Real mobile GPS og gesture samspil þarf handvirka production-prófun.

## Næsta skref

1. Stofna tvö nákvæm scoped commits samkvæmt skráarlistanum.
2. Push-a `main` og fylgjast með Vercel til `Ready`.
3. Smoke-prófa production read-only: Samvinna áfram fail-closed/404, núverandi
   public/auth grunnsíður óbreyttar og Veðrið svarar.
4. Stebbi prófar live location á raunverulegum mobile browser.
5. Samvinna activation, SQL95 og runner manual install bíða sérstöku
   Stebbi-owned gate.

## Spurningar fyrir næstu rýni

- Virkar follow/free/recenter/zoom á iOS og Android eins og vænst er við
  raunverulega hreyfingu?
- Er conservative heading nógu stöðugt eða þarf síðar hraðaháð smoothing?
- Á `background status` síðar að fá sérstakt heartbeat í protocol v2, án þess
  að veikja privacy?

## Localhost checks for Stebbi

Stebbi keyrir dev server sjálfur. Codex ræsti hvorki né endurræsti hann.

### Live location

1. Opnaðu núverandi localhost Veðrið, skráðu þig inn og reiknaðu leið.
2. Opnaðu route-map view, veldu `Vegagerðin` og `Núna` og ýttu á
   `Sýna núverandi staðsetningu`.
3. Samþykktu native staðsetningarleyfi. Vænt: punktur birtist, kortið eltir og
   status segir accuracy eða heiðarlega `nákvæmni óþekkt`.
4. Hreyfðu tækið ef mögulegt er. Vænt: gild stefna snýr camera/puck rétt og
   puck helst landfræðilega réttur þegar kortinu er snúið.
5. Dragðu, þysjaðu eða snúðu kortinu handvirkt. Vænt: tracking heldur áfram en
   kortið fer í free state og `Elta mig aftur` birtist sýnilega.
6. Breyttu +/- zoom í free state og ýttu síðan á `Elta mig aftur`. Vænt:
   nýja zoom-gildið tekur fyrst gildi við recenter. Í follow state tekur +/-
   gildi strax. Gildi fer aldrei undir 10 eða yfir 18.
7. Skiptu í forecast, information view, annað app/tab eða feldu live location.
   Vænt: watch og marker stöðvast/hverfur og engin tracking heldur áfram.
8. Endurtaktu á 360, 390 og 460 px breidd. Passaðu sérstaklega overflow,
   overlap, 40-44 px touch targets og focus/keyboard state.

### Dormant Samvinna

- Ekki keyra background `install` eða pairing enn. Án Stebbi-owned SQL95 og
  activation á Samvinna síða/API að vera fail-closed og enginn runner positive
  flow er ætlaður í þessum prerelease.
- Þegar næsta activation gate hefur verið samþykkt eru nákvæm Windows skref í
  `tools/teskeid-agent-runner/README.md`; pairing code á alltaf að fara um
  stdin og aldrei í shell history eða Teskeið logs.

### Öryggisvarúð

- Ekki setja API-lykla, pairing code eða önnur secrets í Teskeiðarspjall,
  screenshots, handoff eða logs.
- Ekki keyra SQL95 eða veita feature access sem hluta af localhost-prófun nema
  Stebbi taki það sem sérstakt production/data gate.
