# TODO 086 v195 - Codex follow-up: labels, history bootstrap, freshness banner, live refresh

Created: 2026-07-14 23:57
Timezone: Atlantic/Reykjavik

Mode:
- Rýni og handoff/plan only.
- Engar kóðabreytingar, engin SQL keyrð, ekkert commit/push/deploy.
- Byggt á skjámyndum/athugasemd Stebba eftir SQL77 og v194 polish.

## Stutt niðurstaða

Það eru fjögur aðskilin mál:

1. **Veðurstofu status-labels eru enn ekki nógu samræmd met.no/Yr.**
   Þetta þarf að laga með shared status badge/component eða einni shared render helper.

2. **21:00 row vantar líklega ekki af því history query sé endilega brotin, heldur af því history taflan getur ekki endurheimt row sem var ekki vistuð áður.**
   `Spá gefin út kl. 21:00` er `atime` (útgáfutími spár), ekki sama og forecast row `ftime=21:00`.

3. **Freshness/banner copy þarf að greina á milli current-but-waiting-for-next-cycle og stale/error.**
   Ef gögn eru frá kl. 21:00 og næsta cycle er væntanleg kl. 00:00, eigum við ekki að sýna þetta eins og alvarlegt “gömul gögn” ástand.

4. **Live refresh til opinna flæða er góð hugmynd, en ekki byrja með WebSocket/Supabase Realtime.**
   Byrja með léttu polling eða "new data available" invalidation. Push/realtime má koma síðar ef þörfin reynist raunveruleg.

## Findings

### Medium - Veðurstofu status-labels þurfa að nota sama status UI og met.no/Yr

Stebbi sér rétt: Veðurstofuspjöldin nota ekki sömu label-gæðatilfinningu og met.no/Yr spjöldin.

Núverandi code:

- `components/weather/VedurstofanPointCard.tsx`
  - notar `WIND_STATUS_UI_META`
  - en status-chip er eigin markup:

```tsx
<span className={`inline-flex ... ${meta.chipActiveClass}`}>
  <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
  {tf(meta.labelKey as 'statusWithinLimits')}
</span>
```

Þetta er nálægt, en ekki sama framsetning og met.no/Yr. Í skjámynd er munurinn greinilegur.

Ráðlegging:

- Búa til shared `WeatherStatusBadge` eða `WindStatusBadge` sem tekur:
  - `status: WindDisplayStatus`
  - `size?: 'compact' | 'card'`
  - `showIcon?: boolean`
  - `className?`
- Nota sama component í:
  - met.no/Yr `RoutePointRow`
  - `VedurstofanPointCard`
  - `VedurstofanJourneySummary`
  - selected/worst cards þar sem status birtist.
- Markmið: sama icon/dot, border, litir, radius, typography og spacing fyrir sama status, óháð provider.

Ekki laga þetta með því að copy/paste-a met.no markup inn í Veðurstofu-spjaldið. Þetta á að vera samnýtt.

### Medium - 21:00 history row: líklega bootstrap limitation, ekki endilega query bug

Stebbi segir:

> Ég sótti gögnin og ætti því að sjá 21:00 gildið sem væri fengið þá úr nýju history töflunni...

Mikilvægt:

- `Spá gefin út kl. 21:00` = `atime`, útgáfutími forecast cycle.
- Það þýðir ekki að payload innihaldi forecast row `ftime=21:00`.
- Ef manual refresh var keyrt kl. 23:52 og Veðurstofan skilar þá bara future slots `00:00`, `03:00`, o.s.frv., þá getur projector bara skrifað þær rows í history.
- History taflan getur ekki búið til eða endurheimt `21:00` forecast row sem var ekki vistuð áður.
- Þar sem SQL77 var nýlega keyrt, eru eldri rows ekki til í history nema projector hafi þegar náð þeim eftir migration.

Þetta er væntanlegt fyrsta-run/bootstrap behavior.

Hvað þarf að staðfesta:

1. Eru rows að safnast í `vedurstofan_forecasts_history` eftir næsta cron/manual run?
2. Fyrir næsta cycle, þegar system hefur keyrt áður en forecast slot dettur út, birtist þá previous row?
3. Er history query að filtera aðeins sama `atime` og latest? Það er rétt og viljandi, en þýðir að `21:00` row úr `atime=18:00` á ekki að blandast inn þegar current latest er `atime=21:00`.

Ef Stebbi vill fyrri row úr eldri cycle samt sem context, þá er það önnur vöruákvörðun og þarf skýra merkingu: "eldra spágildi úr fyrri útgáfu". Codex mælir ekki með því fyrir matið núna.

### Medium - Forecast cadence og history capture þarf mögulega að stilla

Ef við viljum alltaf hafa `prev` forecast slot tiltækt, þarf warmer/projector að hafa náð því áður en Veðurstofan hættir að skila því.

Ef cron keyrir bara eftir að slot er liðið, þá verður history aldrei með þann slot.

Ráðlegging fyrir Claude Code:

- Staðfesta með logs/DB hvort Veðurstofan API skilar forecast row fyrir current/just-past slot þegar fetch er keyrt eftir slot-time.
- Ef hún skilar ekki past/current slot, þá þarf refresh cadence að tryggja að næsta slot sé sótt áður en það verður past.
- Þetta þarf ekki endilega að þýða “alltaf á 10 mín fresti” fyrir alla daga, en history capture verður betra með tíðum refreshum eða scheduled run rétt fyrir hour/forecast boundaries.

### Medium - Freshness banner ætti ekki að kalla current cycle “gömul gögn”

Skjámynd sýnir:

```text
Veðurstofugögnin eru frá kl. 21:00 · síðast reynt kl. 23:52
```

Stebbi spyr hvort við eigum að sleppa banner eða segja að von sé á nýjum spágildum kl. 00:00.

Codex recommendation:

- Ef current cycle er enn innan expected cadence/grace:
  - annaðhvort fela banner,
  - eða sýna quiet info: `Veðurstofugögn frá kl. 21:00 · næstu gögn væntanleg kl. 00:00`
- Ef expected cycle er liðin + grace og latest `result_atime` er enn gamalt:
  - sýna amber warning: `Veðurstofugögnin eru gömul`
  - þá má sýna manual refresh action/cooldown.
- Ef manual refresh var reynt og provider skilaði enn eldri cycle:
  - sýna það aðeins í stale/warning state, ekki þegar current cycle er enn eðlilega í gildi.

Þannig: kl. 23:55 með atime 21:00 og next expected 00:00 ætti líklega ekki að vera warning.

### Medium - Open-flow update: byrja með polling/invalidation, ekki realtime push

Stebbi spyr:

> Þegar Veðurstofugögn uppfærast þegar notandi sækir þau manually (og jafnvel alltaf) að þá ættum við að ýta út breytingu á notendur sem eru með flæðið opið hjá sér.

Codex mat:

#### Kostir við að uppfæra opin flæði

- Notandi situr ekki með gamalt mat eftir að ný gögn eru komin.
- Manual refresh hjá einum notanda nýtist öðrum opnum sessionum.
- Minni ruglingur þegar banner segir gögn gömul en DB er nýbúinn að uppfærast.

#### Gallar við alvöru push/realtime núna

- Supabase Realtime á service-role-only product töflur myndi krefjast nýrrar public-safe leiðar, policies eða relay. Það er óþarfa security surface núna.
- WebSocket/SSE á Vercel/serverless getur orðið flóknara en virði á þessum tímapunkti.
- Silent auto-update getur breytt worst point/scrubber meðan notandi er að lesa niðurstöðu. Það getur verið truflandi.
- Ef margir tabbar eru opnir gæti sjálfvirk route recompute valdið óþarfa API/DB köllum.

#### Ráðlögð einföld leið núna

Ekki byrja á push. Byrja á lightweight polling + visible refresh prompt:

- Client pollar lightweight endpoint á 60-120 sek fresti þegar:
  - Veðurstofan er virk,
  - tab er visible,
  - result screen er opinn.
- Endpoint skilar bara:
  - latest `result_atime`
  - latest `finished_at`
  - freshness state
- Ef `result_atime` eða `finished_at` er nýrra en resultið sem client er að sýna:
  - sýna litla melding: `Ný Veðurstofugögn eru komin`
  - button: `Uppfæra mat`
  - eða auto-refresh ef notandi er ekki búinn að interact-a við selected slot.

Þetta er “push enough” án realtime complexity.

Later:

- BroadcastChannel fyrir sama browser/multiple tabs.
- Supabase Realtime eða SSE aðeins ef við þurfum raunverulega cross-user immediate updates.

### Low - Provider filter text still needs `Yr spágögnin`

Stebbi bendir aftur réttilega á:

- Í filterum á að standa `Yr spágögnin`, ekki `Staðfest grunnlína`.

Likely key:

- `messages/is.json`
  - `providerMetnoHelperText`
- `messages/en.json`
  - equivalent should be changed to e.g. `Yr forecast data` or `Yr forecast`.

This was already in v194, but still needs implementation/verification.

## Recommended next Claude Code scope

### Scope A - visual/status polish

1. Create/extract shared status badge.
2. Use it across met.no/Yr and Veðurstofan cards.
3. Ensure same status means same visual language everywhere:
   - worst point
   - selected point
   - all points
   - journey summary

### Scope B - history/freshness verification

1. Confirm SQL77 was run successfully.
2. Confirm history rows appear after projector/warmer runs.
3. Add temporary admin/debug query or log only if needed, not user-facing.
4. Verify why 21:00 row is absent:
   - not captured yet?
   - not returned by provider at 23:52?
   - filtered out due current `atime=21:00` vs older `atime=18:00`?
5. Do not mix older `atime` rows into current cards unless Stebbi explicitly chooses that product behavior.

### Scope C - banner/freshness copy

1. Define states:
   - current cycle ok: hide or quiet info.
   - next cycle expected soon: `næstu gögn væntanleg kl. 00:00`.
   - stale after grace: amber warning.
   - manual attempted but provider behind: warning detail.
2. Update copy in messages.
3. Verify no amber “gömul gögn” warning before data is actually stale.

### Scope D - open-flow update

1. Do not implement WebSocket/Supabase realtime now.
2. Add lightweight polling or revalidation plan first.
3. Prefer “Ný gögn eru komin - Uppfæra mat” over silent mutation.
4. Poll only while tab is visible and Veðurstofan is enabled.

## Localhost checks for Stebbi

After Claude Code implements relevant fixes:

1. Open a result with met.no only.
   - Status label should look like before.
2. Open same result with Veðurstofan only.
   - Status label should visually match met.no/Yr status labels for same severity.
3. Open both providers.
   - Worst/selected/all-points cards should use same status badge style.
4. Provider filter:
   - met.no helper says `Yr spágögnin`, not `Staðfest grunnlína`.
5. Freshness:
   - If Veðurstofan atime is current but next cycle is near, no scary stale warning.
   - If current cycle is 21:00 before 00:00, expected text is quiet or hidden, optionally `næstu gögn væntanleg kl. 00:00`.
6. History:
   - After at least one future cron/manual cycle with history table active, choose ETA between forecast slots.
   - Verify prev/used/next appears when the row was actually captured.
7. Open flow update:
   - With one tab open, run manual refresh elsewhere.
   - Expected v1 behavior should be either:
     - a visible “new data available” prompt, or
     - no behavior yet if that scope is only planned.

## Suggested copy/paste to Claude Code

```text
Claude Code, rýndu v195 Codex handoff og gerðu fyrst plan áður en þú framkvæmir.

Mál sem þarf að leysa:
1. Veðurstofu status-labels þurfa að vera samræmd met.no/Yr labels. Ekki copy/paste-a markup; extract-a eða endurnýta shared status badge/helper sem er notað á met.no/Yr og Veðurstofu.
2. Provider filter text: `providerMetnoHelperText` á að vera “Yr spágögnin” á íslensku, ekki “Staðfest grunnlína”.
3. Freshness banner: ef Veðurstofugögn frá kl. 21:00 eru enn current og ný gögn væntanleg kl. 00:00, ekki sýna scary stale warning. Annaðhvort fela banner eða sýna quiet info með næsta expected cycle.
4. 21:00 missing history row: staðfestu hvort þetta sé expected bootstrap behavior eftir SQL77. History taflan getur ekki sýnt forecast row sem var ekki captured áður en Veðurstofan hætti að skila henni. Ekki blanda eldri `atime` cycle inn í current card nema Stebbi samþykki það sérstaklega.
5. Rýndu live-update hugmyndina: ekki byrja á WebSocket/Supabase realtime. Leggðu til/útfærðu fyrst lightweight polling eða “Ný gögn eru komin - Uppfæra mat” ef scope er samþykkt.

Constraints:
- Ekki breyta SQL eða keyra migration nema Stebbi biðji sérstaklega.
- Ekki breyta provider calculation logic nema þú stoppar og útskýrir fyrst.
- Halda feature flags óbreyttum.
- Allur texti í messages/is.json og messages/en.json.
- Mobile-first, enginn horizontal overflow.
- Keyra relevant tests/typecheck.
- Ekki commit-a, push-a eða deploya.
```
