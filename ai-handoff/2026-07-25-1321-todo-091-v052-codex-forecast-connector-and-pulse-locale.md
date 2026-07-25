# TODO 091 v052 — spáspjaldslína og stöðugt locale

Created: 2026-07-25 13:21  
Timezone: Atlantic/Reykjavik

## Samþykkt umfang

Stebbi samþykkti að Codex lagfærði tengilínu spáspjalda á stóra kortinu og
hydration mismatch á Veðurstofu-/Vegagerðarstöðvaspjöldum.

Enginn commit, push, deploy, migration, Supabase- eða production-aðgerð var
framkvæmd. Dev server var ekki ræstur eða endurræstur.

## Gert

- Tengilína valins spápunkts reiknar nú stysta snertipunkt við raunverulegt
  spáspjald eða staðarheiti.
- Línan miðar ekki lengur á ytri ósýnilegan stack-ramma sem gat innihaldið
  bil fyrir emoji og flex-gap. Það olli sýnilegu bili, meðal annars við
  Vestmannaeyjar.
- Ef punktur lendir inni í target-ramma tengist línan við næstu brún.
- Server pages sækja nú locale með `getLocale()` og senda það sem serialized
  prop í viðkomandi client component.
- Fjarlægðir, dagsetningar og aðrar locale-háðar tölur nota því sama locale í
  SSR og fyrstu client-render.
- Fyrra `suppressHydrationWarning` á dagsetningarhaus var fjarlægt; orsökin er
  nú lagfærð í stað þess að warning sé falinn.

## Breyttar skrár

- `components/weather/RoadMapPrototypeMap.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/page.tsx`
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx`

## Keyrðar skipanir

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/pulseBack.test.ts lib/__tests__/pulseTarget.test.ts lib/__tests__/road-intelligence-road-map-places.test.ts`
  - Exit code 0; 3 test files og 53 próf stóðust.
- `git diff --check`
  - Exit code 0; engin whitespace-villa, aðeins fyrirliggjandi CRLF warnings.

Engin browser automation eða full test suite var keyrð.

## Route intelligence check

Breytingin snertir aðeins korta-UI og stöðuga formatting-inputa. Engin ný
leiða-, vegkafla-, station-matching-, provider- eða persistence-þekking var
bætt við. `IcelandRoadmap.md` og `lib/iceland-routes/` þurftu því ekki breytingu.

## Design.md samræmi

Línan sýnir nú skýrt samband punkts og spáspjalds án þess að skarast á önnur
spjöld. Locale-lagfæringin kemur í veg fyrir hydration-flökt og client
re-render sem gat raskað mobile app-upplifun. Engin ný controls eða overflow
áhætta var kynnt.

## Áhætta / prófunargöt

- Connector geometry er DOM/browser-háð og var ekki sannreynd með browser
  automation. Handvirkt þarf að skoða Vestmannaeyjar og aðrar langt færðar
  staðsetningar.
- Server locale er nú canonical fyrir allan líftíma stöðvaspjaldsins. Þetta er
  rétt fyrir núverandi next-intl routing; runtime tungumálaskipti inni á sömu
  client síðu eru ekki sérstakt feature hér.

## Localhost checks for Stebbi

1. Opnaðu `/auth-mvp/vedrid/road-map-prototype`, farðu í Spákort og hafðu
   Vestmannaeyjar meðal valinna stöðva.
2. Prófaðu mismunandi A−/A+ stærðir og þysjun.
   - Vænt: bláa línan snertir alltaf brún spáspjaldsins eða pilluna með
     staðarheitinu; hún endar ekki úti í loftinu.
3. Athugaðu að spáspjöld skarist ekki og falda-spjalda bannerinn virki áfram.
4. Smelltu á Veðurstofupunkt á stóra Aksturskortinu.
   - Vænt: engin hydration mismatch í console; fjarlægð notar sama kommusnið í
     SSR og client, til dæmis `17,7 km frá`.
5. Endurtaktu með Vegagerðarpunkti og skoðaðu nálæg Veðurstofuspjöld.
6. Prófaðu við 360 px, 530 px og desktop breidd.

Engin Supabase-, auth-, migration-, production- eða deployment-prófun þarf.

## Næsta skref

Stebbi staðfestir sjónrænt línuna og hreina console á localhost. Claude Code
getur síðan tekið breytingarnar með í útgáfurýni. Commit, push og deploy bíða
sérstaks leyfis.
