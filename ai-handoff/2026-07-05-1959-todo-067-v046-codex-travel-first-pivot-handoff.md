# TODO #67 Vedrid - Travel-first pivot handoff

Created: 2026-07-05 19:59
Timezone: Atlantic/Reykjavik
From: Codex
To: Stebbi og Claude Code
Status: Planning handoff. Engar kóðabreytingar, SQL, env breytingar, commit, push, deploy eða production breytingar gerðar.

## Context

Stebbi vill breyta stefnu áður en lengra er farið í ChatGPT-líkt Veðrið-spjall.

Ný meginhugmynd:

- Veðrið á ekki að vera opið chat input sem fær notanda til að hugsa “af hverju nota ég ekki bara ChatGPT?”
- Veðrið á að vera guided Teskeið-tool.
- Fyrsti og mikilvægasti flokkurinn er **Ferðalagið**.
- Grill og Golf mega bíða sem seinni flokkar eða vera falin. Núna skiptir Ferðalagið öllu máli.

Þetta handoff kemur eftir:

- v043 Codex review: type-check blocker, route geocoding án staðfestingar, hardcoded textar, non-strict caps.
- v045 Codex decision: velja B, route from/to confirmation, ekki giska á fyrsta Google candidate.
- Nýja product ákvörðun Stebba: byrja á Ferðalaginu og færa UX úr chat yfir í structured spurningar.

## Product Direction

Veðrið opnast fyrst á **Ferðalagið**.

Ekki byggja aðalupplifunina sem textasvæði þar sem notandi skrifar frjálsa spurningu. Notandi á að fara í rólegt, mobile-first skrefaflæði sem safnar upplýsingum og skilar deterministic niðurstöðu byggðri á veðurgögnum.

AI er ekki decision engine.

Leyfileg AI notkun síðar:

- orða deterministic niðurstöðu á mannamáli,
- hjálpa við follow-up spurningar,
- útskýra niðurstöðu með sama source-of-truth.

Ekki leyfilegt:

- AI ákveður hvort ferð sé í lagi,
- AI býr til veðurgögn,
- AI velur stað, leið eða ráðleggingu án deterministic gagna,
- AI keyrir án þess að structured result sé til.

Fyrstu prófanir skulu nota `WEATHER_AI_ENABLED=false`.

## Ferðalagið MVP

Fyrsti áfangi á að styðja: **notandi veit hvert hann er að fara**.

Ekki byggja “finndu góðan stað fyrir mig” strax. Það er seinni vara.

### Spurningar sem flæðið safnar

1. Hvaðan ertu að ferðast?
2. Hvert ertu að fara?
3. Hvenær ætlarðu að leggja af stað?
4. Hvenær ætlarðu heim?
5. Hvenær þarftu síðast að vera komin/kominn heim?
6. Ertu með eftirvagn?
7. Ef já: hvaða tegund?
   - tjaldvagn
   - fellihýsi
   - hjólhýsi
   - hestakerra
   - annar eftirvagn
8. Ertu að gista?
9. Ef já: hvernig?
   - tjald
   - tjaldvagn
   - fellihýsi
   - hjólhýsi
   - hótel eða inni-gisting
   - annað

### Structured result sem MVP á að skila

Ferðalagið á að meta að minnsta kosti:

- leið út: frá → til við brottför,
- veður á áfangastað á ferðatíma/gistingu ef við á,
- heimleið ef heimferðartími er gefinn,
- sérstaklega vind/hviður ef eftirvagn er valinn,
- skýra stöðu: grænt / gult / rautt,
- hvaða þáttur réði verstu stöðu,
- hversu marga veðurpunkta var skoðað á leið,
- disclaimer: veðurmat, ekki umferðar- eða farartrygging.

## Reuse From Current Work

Ekki henda öllu sem komið er. Þetta nýtist áfram:

- `lib/weather/metno.server.ts` og cache pattern.
- `lib/weather/forecast.ts` parsing/filtering.
- `lib/weather/thresholds.ts`, sérstaklega caravan/trailer thresholds.
- `lib/weather/provider.types.ts`, Google provider og route geometry hugmyndin.
- `validateIcelandicCoords`.
- `places.ts` curated-first nálgun.
- Route sampling/worst-case concept.
- Map/Places confirmation concept.
- Feature gating: `WEATHER_ENABLED`, `WEATHER_FLAG`, `WEATHER_AI_ENABLED`.

En ekki halda áfram að pússa gamla chat UI sem lokaform.

## Current Blockers Still Apply

Þótt UX stefnan breytist, má ekki gleyma v043:

1. `googleMaps.client.ts` notar rangan loader API fyrir `@googlemaps/js-api-loader` v2. Það þarf `setOptions()` + `importLibrary()`, ekki `new Loader`.
2. Route weather má ekki taka fyrsta Google geocoding candidate án notendastaðfestingar.
3. User-facing texti í nýjum weather components á að fara í `messages/is.json` og `messages/en.json`.
4. Route/weather sampling caps eiga að vera strict.
5. `npm run type-check` þarf að vera grænt áður en handoff fer í pre-release.

## Proposed Technical Shape

### API

Ekki neyða nýtt Ferðalagið-flæði í gamla `question` texta API sem aðal contract.

Leggja til nýjan structured endpoint eða skýrt mode innan núverandi endpoint:

- `POST /api/teskeid/weather/travel`

eða:

- `POST /api/teskeid/weather/ask` með `mode: 'travel'` og structured payload.

Codex mælir með sér endpoint ef breytingin verður stór, því það heldur gamla grill/golf/chat legacy aðskildu frá nýja ferðalaginu.

Payload ætti að vera typed, t.d.:

```ts
type TravelWeatherRequest = {
  origin?: ConfirmedPlace
  destination?: ConfirmedPlace
  departureAt?: string
  returnDepartureAt?: string
  latestHomeBy?: string
  trailerKind?: 'none' | 'tent_trailer' | 'folding_camper' | 'caravan' | 'horse_trailer' | 'generic_trailer'
  lodgingKind?: 'none' | 'tent' | 'tent_trailer' | 'folding_camper' | 'caravan' | 'indoor' | 'other'
}
```

Server validate-ar öll coords og tímagildi. Client texti er label, ekki source of truth.

### UI

`/auth-mvp/vedrid` á fyrst að sýna Ferðalagið-flæði.

Design.md kröfur:

- mobile-first,
- `max-w-lg` eða þrengra,
- 16px inputs,
- enginn horizontal overflow,
- enginn óvæntur mobile zoom,
- sýnileg labels, placeholder kemur ekki í stað label,
- pending/loading states á async aðgerðum,
- ekki card inni í card,
- allur texti í messages,
- controls með stöðugar stærðir,
- keyboard/focus má ekki ýta mikilvægum controls út af skjánum.

UI má vera wizard eða step form. Codex mælir með step form:

1. Staðir: Frá / Til
2. Tímar: Brottför / Heimferð / Síðast heima
3. Farartæki: Eftirvagn eða ekki
4. Gisting: Gistir þú og hvernig
5. Staðfesting: sýna frá/til og lykilstillingar
6. Niðurstaða

### Place Confirmation

Route confirmation B úr v045 gildir áfram:

- Ekki giska á Google top candidate.
- Ef staður er curated má forfylla hann og merkja sem staðfestan.
- Ef staður er óljós eða kemur úr Google þarf notandi að velja/staðfesta.
- Ferðalagið má ekki keyra route weather fyrr en bæði `origin` og `destination` eru staðfest.

Fyrsta útfærsla þarf ekki stórt interactive route map. Það má byrja með:

- staðaleit fyrir frá,
- staðaleit fyrir til,
- static map/label confirmation ef lyklar eru til,
- skýrt “Staðfesta” / “Breyta” mynstur.

## Non-Goals Now

Ekki gera núna:

- “Finndu góðan stað innan X km” leit.
- Grill UI.
- Golf UI.
- Fullt AI conversational flow.
- Supabase admin provider toggle.
- Production deploy.
- Commit/push.
- Google key/env setup.
- Capacitor app-store work.

Þetta getur komið seinna, en Ferðalagið þarf fyrst að verða gott.

## Suggested Next Step For Claude Code

Claude Code á ekki að framkvæma stóran rewrite strax.

Næsta svar frá Claude ætti að vera nýtt implementation plan sem:

1. staðfestir hvað verður endurnýtt úr 2A1-2A3,
2. leggur til hvernig gamla chat UI verður falið/sett til hliðar,
3. skilgreinir nýtt Ferðalagið data model,
4. skilgreinir route endpoint confirmation UI,
5. listar nákvæmar skrár sem breytast,
6. tekur sérstaklega fram hvort nýtt endpoint eða núverandi endpoint verður notað,
7. inniheldur test plan,
8. inniheldur Localhost checks for Stebbi,
9. stoppar áður en framkvæmd hefst nema Stebbi gefi skýrt leyfi.

## Suggested Message To Claude Code

```text
Claude Code, rýndu v046 áður en þú framkvæmir meira í TODO #67.

Stefnubreyting:
- Við byrjum bara á Ferðalaginu.
- Veðrið á ekki að vera opið ChatGPT-líkt spjall sem aðalupplifun.
- Ferðalagið verður guided structured tool.
- Grill/Golf mega bíða eða vera falin.
- AI skal ekki vera decision engine; WEATHER_AI_ENABLED=false í fyrstu prófunum.

Útbúðu nýtt implementation plan, ekki kóða strax.

Planið þarf að taka á:
1. Hvaða núverandi weather/provider/met.no/route logic má endurnýta.
2. Hvernig /auth-mvp/vedrid verður Ferðalagið-first UI.
3. Hvort við búum til nýtt structured endpoint, t.d. /api/teskeid/weather/travel.
4. Hvernig frá/til staðfesting virkar áður en route weather keyrir.
5. Hvaða structured fields Ferðalagið safnar: frá, til, brottför, heimferð, síðast heima, eftirvagn, gistimáti.
6. Hvernig niðurstaðan er deterministic og hvaða role AI má eða má ekki hafa.
7. Hvernig v043 blockers verða leystir samhliða: googleMaps.client.ts loader, hardcoded textar, strict caps, type-check.
8. Hvaða skrár verða breyttar.
9. Hvaða tests þarf.
10. Localhost checks for Stebbi.

Ekki commit-a, push-a, deploya, breyta production env eða merkja 2A4 lokið.
```

## Localhost Checks For Stebbi

Þetta er planning handoff, svo ekkert nýtt er tilbúið til localhost prófunar enn.

Þegar Claude skilar implementation eða nýju plani fyrir Ferðalagið, ætti Stebbi að prófa eftir útfærslu:

1. Opna `/auth-mvp/vedrid`.
   - Expected: Ferðalagið flæði sé fyrsta upplifun, ekki opið chat prompt.

2. Mobile 360, 390 og 460 px.
   - Expected: enginn horizontal overflow, enginn iOS zoom, inputs minnst 16px, primary action alltaf reachable.

3. Staðir.
   - Slá inn/velja frá og til.
   - Expected: ekki keyrt route weather fyrr en báðir staðir eru staðfestir.

4. Ambiguous staðir.
   - Prófa `Suðurgata` sem frá eða til.
   - Expected: notandi þarf að staðfesta réttan stað, kerfið má ekki giska á fyrsta Google candidate.

5. Tímar.
   - Setja brottför, heimferð og síðasta heimkomutíma.
   - Expected: niðurstaða tekur tillit til útleiðar og heimleiðar ef heimferð er gefin.

6. Eftirvagn.
   - Velja hjólhýsi eða hestakerru.
   - Expected: strangari vind/hviðu threshold og caveat fyrir hestakerru ef við á.

7. Gisting.
   - Velja tjald vs inni-gisting.
   - Expected: tjald/gisting úti hefur meiri veðurviðkvæmni en hótel/inni-gisting, ef þessi regla er komin í scope.

8. Án Google lykla.
   - Expected: appið crashar ekki; sýnir skýr provider/config skilaboð þar sem Google þarf.

9. Með Google lykla síðar.
   - Expected: `GOOGLE_MAPS_SERVER_KEY` sést aldrei í DevTools Network; browser key má sjást í Maps/Places/Static requests.

10. Regression.
   - Ef grill/golf eru enn aðgengileg í einhverri mynd: þau mega ekki brjóta Ferðalagið.
   - Ef þau eru falin: heimaskjár/flæði má ekki sýna dauða controls.

Ekki prófa production, high-volume Google calls, billing-heavy loops eða AI-on flow fyrr en Stebbi hefur sérstaklega samþykkt það.
