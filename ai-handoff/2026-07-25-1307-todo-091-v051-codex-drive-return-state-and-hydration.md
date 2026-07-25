# TODO 091 v051 — Akstursleið endurheimt og hydration-villa

Created: 2026-07-25 13:07  
Timezone: Atlantic/Reykjavik

## Samþykkt umfang

Stebbi gaf Codex leyfi til að laga að Akstursleið týndist þegar farið var úr
stóra kortinu í Veðurstofu- eða Vegagerðarstöðvaspjald og til baka, bæði með
„Til baka í akstur“ og innbyggðu til-baka í síma/browser. Einnig var
console-villa á stöðvaspjaldinu skoðuð og lagfærð.

Enginn commit, push, deploy, migration, Supabase- eða production-aðgerð var
framkvæmd og dev server var ekki ræstur eða endurræstur.

## Orsök og breyting

- Route snapshot geymdi áður texta og mörk en ekki staðfest hnit.
- Restore kallaði `requestSubmit()` í zero-timeout áður en React hafði renderað
  nýju Frá/Til gildin. Það gat skilað „Settu inn bæði frá og til“ þótt textinn
  sæist augnabliki síðar.
- Snapshot geymir nú staðfest `origin` og `destination` hnit og setur þau aftur
  í resolved state.
- Restore-submit er nú keyrt úr effect eftir að React-state fyrir Frá/Til er
  raunverulega komið inn.
- Rétt áður en stöðvaspjald er opnað er núverandi history-færsla uppfærð með
  `context=route&view=...&restoreRoute=1`. Því lenda bæði stöðvaspjaldshnappur
  og innbyggt browser/síma-back í sama restore-flæði.
- Þetta gildir jafnt fyrir Veðurstofu- og Vegagerðarpunkta.
- Rauða React console-villan var hydration mismatch í dagsetningarhaus þar
  sem SSR og client fengu mismunandi locale-render. Dagsetningarhausarnir á
  báðum stöðvaspjöldum leyfa nú client locale að taka við án hydration-villu.

## Console-færslur

- React hydration mismatch skipti máli og var lagfært.
- `public/manifest.json` var lesið og parse-að sem gilt JSON. Einangraða
  `Manifest: syntax error` færslan er því líklega tímabundin localhost/cache
  færsla frá fyrri servertruflun.
- CSS preload skilaboðin eru development warnings og hafa ekki áhrif á
  Akstursleiðina eða stöðvaspjöldin.

## Breyttar skrár

- `components/weather/RoadMapPrototypeMap.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `app/auth-mvp/vedrid/puls/vegagerdin/stod/[stationId]/VegagerdinPulsClient.tsx`

Fyrirliggjandi dirty-worktree breytingar voru varðveittar.

## Keyrðar skipanir

- `npm.cmd run type-check`
  - Exit code 0.
- `npm.cmd run test:run -- lib/__tests__/pulseBack.test.ts lib/__tests__/pulseTarget.test.ts lib/__tests__/road-intelligence-road-map-places.test.ts`
  - Exit code 0; 3 skrár og 53 próf stóðust.
- Parse á `public/manifest.json`
  - Gilt JSON.
- `git diff --check`
  - Exit code 0; engin whitespace-villa, aðeins fyrirliggjandi CRLF warnings.

Engin browser automation eða full test suite var keyrð.

## Route intelligence check

Breytingin bætir enga nýja leiða-, vegkafla- eða provider-þekkingu við. Hún
varðveitir aðeins ephemeral route input og staðfest hnit í session storage í
allt að tvær klukkustundir og endurreiknar leiðina með núverandi provider.
Engin raw route geometry, persónuleg ferð eða ný gögn eru vistuð varanlega.
Því þurfti hvorki `IcelandRoadmap.md` né `lib/iceland-routes/` breytingu.

## Design.md samræmi

Lausnin varðveitir mobile navigation context og kemur í veg fyrir að
innbyggt back virðist eyða vinnu notanda. Engin ný controls, overflow- eða
mobile zoom áhætta var kynnt. Sýnilegt route loading state er áfram notað við
endurútreikning.

## Áhætta / prófunargöt

- Leiðin er endurreiknuð þegar komið er til baka; raw provider-niðurstaða er
  ekki vistuð. Ef provider er tímabundið niðri getur restore því mistekist.
- Restore varðveitir Frá/Til, hnit, thresholds og hvort notandi var í Korti eða
  Gögnum. Það endurreiknar leiðina og endurheimtir ekki nákvæma MapLibre
  camera-pixla eða opið popup.
- `suppressHydrationWarning` er afmarkað við locale-háðan dagsetningarhaus.
  Undirliggjandi ástæða þess að dev SSR sýndi enskt locale en client íslenskt
  ætti að fylgjast með ef mismatch birtist annars staðar.

## Localhost checks for Stebbi

Slóð: `/auth-mvp/vedrid/road-map-prototype`.

1. Reiknaðu leið, farðu í `Kort` og smelltu á Veðurstofupunkt.
2. Smelltu á „Til baka í akstur“.
   - Vænt: Akstur opnast aftur í Korti, Frá/Til og mörk haldast og sama leið er
     endurreiknuð sjálfkrafa án „Settu inn bæði frá og til“.
3. Opnaðu punkt aftur og notaðu innbyggt back í browser/síma.
   - Vænt: sama restore-hegðun og með hnappnum.
4. Endurtaktu bæði flæði með Vegagerðarpunkti.
5. Reiknaðu með gömlu vistuðu hnitavali, til dæmis Melás 8.
   - Vænt: hnitin varðveitast yfir stöðvaspjald og til baka; staðurinn þarf ekki
     að finnast aftur með textaleit.
6. Skoðaðu console á Veðurstofu- og Vegagerðarspjöldum.
   - Vænt: engin React hydration mismatch á dagsetningarhaus.
   - CSS preload warnings mega enn sjást í dev og eru ekki blocking.
7. Prófaðu bæði við 360 px og 530 px og staðfestu að leiðarloader sjáist meðan
   endurútreikningur fer fram.

Ekki þarf migration, Supabase-, auth-, production- eða deployment-prófun.

## Næsta skref

Stebbi staðfestir flæðin á localhost. Claude Code getur tekið handoffið inn í
útgáfurýni. Commit, push og deploy bíða sérstaks leyfis.
