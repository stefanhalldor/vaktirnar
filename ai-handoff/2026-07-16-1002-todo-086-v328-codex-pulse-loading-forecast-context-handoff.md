---
title: "v328 Codex handoff - Veðurpúls loading state og spá í fullum púlsglugga"
created: 2026-07-16 10:02
timezone: Atlantic/Reykjavik
todo: todo-086
agent: codex
type: implementation-handoff
---

## Samhengi

Stebbi prófaði útgefna stöðu eftir `2026-07-16-0953-todo-086-v327-claude-v326-done-prerelease`.

Ný athugasemd:

- Það vantar loading state eftir að notandi smellir á `Sjá fleiri...` / `Sjá fleiri skilaboð eða segja frá aðstæðum` og fullur púlsgluggi er að opnast.
- Það vantar líka loading state inni í fulla púlsglugganum meðan verið er að sækja skilaboðin.
- Fulli púlsglugginn vantar veðurspána sjálfa. Þar á að sýna:
  - hvenær spáin var gefin út
  - nýjustu þrjú spágildi fyrir þessa veðurstöð
  - möguleika á að sjá öll spágildi stöðvarinnar

Þetta er næsta afmarkaða verkefni fyrir Claude Code.

## Skoðað af Codex

- `WORKFLOW.md`
- `Design.md`
- `ai-handoff/README.md`
- `ai-handoff/2026-07-16-0953-todo-086-v327-claude-v326-done-prerelease.md`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx`
- `app/auth-mvp/vedrid/puls/stod/[stationId]/VedurstofanPulsClient.tsx`
- `components/chat/ScopedChatPanel.tsx`
- `components/weather/VedurstofanPulseInline.tsx`
- `components/weather/VedurstofanPointCard.tsx`
- `app/auth-mvp/vedrid/elta-vedrid/VedurstofanStationExplorerClient.tsx`
- `lib/weather/providers/vedurstofanStationExplorer.ts`
- `lib/weather/providers/vedurstofanBlend.ts`

## Findings

### P1 - Fullur púlsgluggi sýnir tómt svæði meðan skilaboð eru sótt

Í `components/chat/ScopedChatPanel.tsx` er initial message load með `initialLoadDone`, en renderið er:

```tsx
{!initialLoadDone ? null : messages.length === 0 ? (...) : (...)}
```

Þetta þýðir að eftir að `threadId` er komið og `ScopedChatPanel` birtist, þá getur skilaboðasvæðið verið tómt meðan `transport.loadMessages()` er enn í gangi.

Þetta er ekki Veðurpúls-sértækt vandamál. Þetta er generic chat-core vandamál og þarf að laga þannig að endurnýtanlegi chat-kjarninn geti sýnt loading state.

### P2 - CTA/linkur sem opnar fullan púls gefur ekki nægilegt pending feedback

Inline Veðurpúlsinn notar link yfir í:

```txt
/auth-mvp/vedrid/puls/stod/[stationId]?returnTo=...
```

Það er route-level `loading.tsx` í fulla púlsglugganum, en Stebbi upplifir samt að eftir smell á `Sjá fleiri...` vanti skýrt feedback. Það þarf að bæta við pending state á link/CTA sjálfan svo notandi sjái strax að smellurinn hafi tekið.

Þetta þarf að gera án þess að brjóta `returnTo` og helst án þess að eyðileggja venjulegt link-hegðunarmynstur eins og opnun í nýjum tab ef það er mikilvægt.

### P2 - Fullur púlsgluggi missir veðurspárcontextið

`app/auth-mvp/vedrid/puls/stod/[stationId]/page.tsx` finnur bara stöðvarheiti úr `VEDURSTOFAN_STATIONS_REGISTRY` og sendir það í `VedurstofanPulsClient`.

Fulli púlsglugginn veit því ekki:

- hvaða spá er virk fyrir stöðina
- `atimeIso` / hvenær spáin var gefin út
- forecast rows stöðvarinnar

Þetta er veikara en inline Veðurstofuspjöldin þar sem notandi sér spágildi og samhengi við stöðina.

### P2 - Ekki afrita forecast-row rendering milli staða

Við höfum ítrekað reynt að halda Veðurstofuspjöldum samnýttum. Þessi breyting má ekki búa til þriðju útgáfu af forecast row formatting.

Ef fulli púlsglugginn á að sýna nýjustu þrjú spágildi og möguleika á öll gildi, þá þarf að endurnýta eða draga út sameiginlegt row-rendering úr núverandi Veðurstofu UI.

## Tillaga að útfærslu

### 1. Bæta generic loading-label við `ScopedChatPanel`

Halda `ScopedChatPanel` product-agnostic.

Legg til:

```ts
interface ScopedChatPanelLabels {
  empty: string
  loading: string
  inputPlaceholder: string
  send: string
  sendError: string
  deleted: string
  loadOlder: string
  kindLabels?: Partial<Record<ChatMessageKind, string>>
}
```

Síðan rendera loading state í stað `null`:

```tsx
{!initialLoadDone ? (
  <p className="text-xs text-muted-foreground">{labels.loading}</p>
) : messages.length === 0 ? (
  ...
) : (
  ...
)}
```

Ef Claude Code vill forðast að breyta öllum callers í einu má gera `loading?: string` og fallbacka í `empty` eða fastan neutral fallback, en betra er að uppfæra alla callers sem nota componentinn svo contractið sé skýrt.

Mikilvægt: Textinn á að fara í `messages/is.json` og `messages/en.json`, ekki hardcode.

### 2. Loading state á linkinn sem opnar fullan púls

Bæta við pending feedback á Veðurpúls CTA sem opnar fullan púls.

Mögulegar leiðir:

- Litill reusable client component, t.d. `PulseFullLink` / `PendingPulseLink`, sem:
  - tekur `href`, label og pending label
  - setur local pending state á click
  - sýnir `Opna púls...` / `Sæki púls...` eða sambærilegt
  - setur `aria-busy="true"` og daufar linkinn/takkann
- Eða nota `router.push` með `useTransition`, en passa þá sérstaklega upp á `returnTo` og accessibility.

Ég myndi velja lítinn reusable link component ef hann nýtist bæði:

- inline Veðurstofuspjaldi í `/vedrid`
- `elta-vedrid` stöðvarspjaldi
- mögulega fullri púlssíðu síðar

Passa að það komi ekki tvöfaldur CTA aftur. Í fyrri hringjum kom upp tvöfaldur linkur (`Sjá fleiri skilaboð...` og `Sjá fleiri skilaboð eða segja frá aðstæðum`). Það þarf að halda aðeins einum CTA.

### 3. Sýna veðurspárcontext í fullum púlsglugga

Fulli púlsglugginn ætti að sýna compact veðurstöðvarcontext fyrir ofan chat panel:

- stöðvarheiti
- `Veðurpúls`
- `Spá gefin út kl. HH:mm`
- þrjú næstu/nýjustu forecast rows
- control/link: `Sjá öll spágildi`

Mælt val á 3 rows:

1. Sorta `forecastRows` eftir `forecastTimeIso` hækkandi.
2. Velja fyrstu þrjú gildi þar sem `forecastTimeIso >= now`.
3. Ef engin future/current rows eru til, fallbacka í fyrstu þrjú úr röðinni.

Þetta er betra en að sýna bara fyrstu þrjú raw rows ef user opnar púls seint í forecast cycle.

Ef stöðin er ekki með forecast rows:

- Ekki fela chat.
- Sýna compact muted texta, t.d. `Engin virk spágildi fundust fyrir þessa stöð.`

### 4. Hvar á að sækja forecast gögnin?

`page.tsx` fyrir fulla púlsgluggann er server component og er góður staður til að sækja stöðvarcontext áður en client chat renderast.

Mögulegar leiðir:

- Endurnýta helper sem notar `vedurstofan_forecasts_latest` / station explorer data.
- Ef núverandi `getVedurstofanStationExplorer` les allar stöðvarnar, skoða hvort einfalt sé að búa til narrow helper fyrir eina stöð:
  - input: `stationId`
  - output: `{ atimeIso, fetchedAtIso, forecastRows }`

Ekki sækja þetta úr client með service-role leyndarmáli. Ef ný API route þarf að verða til, þá á hún að nota server-side auth/guard og skila aðeins nauðsynlegum public-ish station forecast fields.

Það þarf ekki SQL breytingu fyrir þetta ef gögnin eru nú þegar í `vedurstofan_forecasts_latest` / history/latest helpers.

### 5. Endurnýta forecast row UI

Forðast nýja handskrifaða row-útgáfu.

Leið sem mér líst vel á:

- Draga forecast row presentation úr `components/weather/VedurstofanPointCard.tsx` í lítinn shared component, t.d.
  - `components/weather/VedurstofanForecastRows.tsx`
  - props: `rows`, `limit?`, `showAll?`, `usedForecastTimeIso?`, `emptyLabel?`
- Nota sama component í:
  - `VedurstofanPointCard`
  - fulla Veðurpúls station page
  - mögulega `elta-vedrid` stöðvardetail ef það passar án stórs refactors

Ekki gera stórt UI refactor ef það tefur, en ekki búa til duplicate row-formatting.

### 6. Design og mobile

Samkvæmt `Design.md`:

- Þetta er app-flow, ekki stór hero.
- Forecast context má vera compact og scan-friendly.
- Ekki setja kort inni í kort að óþörfu.
- Compose box má vera aðeins stærra í fullum púlsglugga en placeholder og send takki mega ekki flæða eða vera úr skala við rest.
- Input/textarea þarf minnst 16px á mobile ef það er native input til að forðast iOS zoom.
- Enginn horizontal overflow við 360/390/460px.

## Áhættur / edge cases

- Ef `ScopedChatPanelLabels` verður breaking contract þarf að uppfæra alla callers og próf.
- Ef full pulse page sækir allar 280 stöðvar í hvert skipti gæti það verið óþarflega dýrt. Athuga hvort hægt sé að sækja eina stöð eða cache-a helperinn.
- Ef forecast rows eru úr `latest` en notandi er að skoða eldri pulse message context er það samt í lagi fyrir MVP: fullur púlsgluggi sýnir núverandi stöðu/spá stöðvarinnar, ekki historical snapshot.
- Ef realtime/polling kemur með skilaboð á meðan loading state er sýndur má ekki tvísýna eða tapa optimistic messages.
- `returnTo` má ekki brotna. Þetta hefur verið viðkvæmt í síðustu hringjum.

## Próf sem Claude Code ætti að keyra

Lágmark:

```bash
npx tsc --noEmit
npx vitest run components/chat
npx vitest run lib/__tests__/travelAuditMap.helpers.test.ts
```

Ef það eru ekki til chat component tests, bæta við focused test eða keyra næsta viðeigandi test suite. Ekki gera stór test-suite refactor í þessu skrefi.

## Localhost checks for Stebbi

### A. Loading eftir smell á fullan púls

1. Opna `/vedrid`.
2. Reikna leið sem sýnir Veðurstofustöðvar.
3. Smella á `Sjá fleiri skilaboð eða segja frá aðstæðum` á Veðurstofuspjaldi.
4. Vænt:
   - linkurinn/takkinn gefur strax pending feedback
   - user upplifir ekki dauðan smell
   - fullur púlsgluggi opnast á réttri stöð

### B. Loading inni í fullum púlsglugga

1. Opna fullan púlsglugga fyrir stöð með nokkrum skilaboðum.
2. Prófa helst með network throttling ef hægt.
3. Vænt:
   - meðan skilaboðin eru sótt sést texti á borð við `Sæki skilaboð...`
   - ekki tómt svæði
   - þegar skilaboð koma inn hverfur loading textinn

### C. Spá í fullum púlsglugga

1. Opna fullan púls fyrir stöð sem er með Veðurstofuspá.
2. Vænt:
   - sést hvenær spáin var gefin út
   - sjást þrjú næstu/nýjustu spágildi
   - `Sjá öll spágildi` sýnir öll gildi án þess að opna óvænta síðu
   - texti og töflur passa á mobile án horizontal overflow

### D. Return-to regression

1. Opna fullan púls út frá `/vedrid` ferðaniðurstöðu.
2. Smella á tilbaka/ferðalagshlekkinn.
3. Vænt:
   - notandi lendir aftur í sama ferðalagssamhengi, ekki á `/elta-vedrid` nema það hafi verið uppruninn

### E. Public vs authenticated

1. Prófa sem public notandi.
2. Prófa sem innskráður notandi.
3. Vænt:
   - public má sjá preview ef skilaboð eru til, en compose/opnun fulls púls krefst login samkvæmt núverandi reglum
   - innskráður má sjá og skrifa í púls þar sem Veðurstofan er sýnileg

## Ekki gera í þessu skrefi

- Ekki breyta SQL.
- Ekki breyta env flaggum.
- Ekki breyta Veðurstofu calculation/blending.
- Ekki færa Púls yfir á Vegagerðina í þessu skrefi.
- Ekki gera AI samantekt úr púlsskilaboðum núna.

## Tillaga að næsta skrefi fyrir Claude Code

Claude Code ætti að framkvæma þessa þrjá hluti í einu litlu skrefi:

1. Bæta generic initial-loading label við `ScopedChatPanel`.
2. Bæta pending state við CTA sem opnar fullan Veðurpúls.
3. Bæta forecast context í fulla púlsgluggann og endurnýta forecast-row rendering eins mikið og hægt er.

Síðan skila prerelease handoff með nákvæmum skrám, prófum og `Localhost checks for Stebbi`.

