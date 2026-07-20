# Release handoff: v239-v243 — hvað er í útgáfunni

Created: 2026-07-20 16:45
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Relevant TODO: 086
Type: Release handoff — manual QA guide
Commit: bbaffe6

---

## Hvað er í útgáfunni

Þrjár óháðar breytingar:

### 1. WeatherWatchers samanburður — extractaður component (Phase C)

`WeatherWatchersComparison.tsx` er nýr component sem var áður inline í `FerdalagidClient.tsx`.

**Hvað breytist fyrir þig:** Ekkert sjáanlegt — þetta er refactor. Samanburðurinn á `/vedrid/ferdalagid` á að líta nákvæmlega eins út og áður.

**Þar sem þú prófar:** `/vedrid/ferdalagid` (þarft að vera innskráður)

### 2. InfoWindow link-litur (Phase D)

`Nánar` linkurinn í popup þegar þú smellir á veðurstöð á kortinu á `/vedrid` var áður harðkóðaður blár (`#2563eb`). Hann notar nú Teskeið primary green úr CSS variable.

**Hvað breytist fyrir þig:** Linkurinn á að vera grænn, ekki blár.

**Þar sem þú prófar:** `/vedrid` (eða `/auth-mvp/vedrid`)

### 3. Public status-mode login-save fix (Phase A)

Þegar óinnskráður notandi smellir á `Nánar` eða `Einfalt` á `/vedrid` og skráir sig svo inn, á stillingin að vistast í DB.

**Vandamálið áður:** Notandinn var sendur á `/vedrid` eftir innskráningu (public síða) og stillingin vistast aldrei í DB — aðeins í localStorage.

**Nú:** Notandinn fer á `/auth-mvp/vedrid?saveStatusFilterMode=detailed` (eða `simple`) eftir innskráningu og stillingin vistast rétt í DB.

**Þar sem þú prófar:** `/vedrid` (óinnskráður)

---

## Prófunarskref

### Test 1: InfoWindow link-litur

1. Fara á `/vedrid` (getur verið óinnskráður).
2. Smella á hvaða veðurstöð sem er á kortinu.
3. Popup opnast — staðfesta að `Nánar` linkurinn er **grænn** (primary green), ekki blár.

**Pass:** Grænn linkur.
**Fail:** Blár linkur eða engin litur.

---

### Test 2: WeatherWatchers samanburður

1. Fara á `/vedrid/ferdalagid` (þarft að vera innskráður).
2. Fylla út `Frá` og `Til` og reikna leið sem skilar niðurstöðum.
3. Í niðurstöðuhlutanum — staðfesta að `Fyrir þá sem eru að elta veðrið` samanburðurinn birtist.
4. Smella á `Skoða samanburð nánar` — drawer á að opnast.
5. Skipta á milli `Kl. 12`, `Morgunn`, `3h` — dálkar uppfærast.
6. Loka drawer (smella utan við eða á `Loka`).

**Pass:** Samanburður birtist, drawer virkar, preset-skipti virka.
**Fail:** Ekkert birtist, drawer opnast ekki, villa í console.

---

### Test 3: Public status-mode login-save

**Þetta prófar þú sem óinnskráður notandi.**

1. Ganga úr skugga um að þú sért útskráður (eða nota private/incognito glugga).
2. Fara á `/vedrid`.
3. Smella á `Nánar` (eða `Einfalt` ef `Nánar` er þegar valið).
4. **Búist við:** Fara á innskráningarsíðuna. Athuga URL — `next` parametrinn á að innihalda `/auth-mvp/vedrid?saveStatusFilterMode=detailed` (eða `simple`).
5. Skrá þig inn.
6. **Búist við:** Lenda á `/auth-mvp/vedrid` (authenticated), ekki `/vedrid` (public). Stillingin sem þú valdir á að vera virk.
7. Endurhlaða síðuna.
8. **Búist við:** Stillingin varðveitist (kemur úr DB, ekki bara localStorage).
9. Athuga Network tab — leita að PUT á `/api/teskeid/weather/preferences/thresholds` — á að hafa tekist (200).

**Pass:** Rétt lent á authenticated síðu, stilling virk eftir reload, PUT tókst.
**Fail:** Lent á `/vedrid` (public) eftir login, eða stilling glatast eftir reload, eða 500 á preferences API.

**Aukaathugun:** Ganga úr skugga um að `Vista sem sjálfgefin vindmörk` virki enn (vindmarka-flowið á ekki að hafa breyst).

---

## Hvað er EKKI í útgáfunni

- **Viðkomustaður (waypoint)** — frestað, kemur seinna sem advanced feature
- **Road Intelligence** — frestað, þarf sérstakt samþykki og feature flag plan
- **WeatherWatchers á /vedrid** — frestað, þarf ForecastDrawerRow converter

---

## SQL athugasemd

`sql/88_weather_user_preferences_status_filter_mode.sql` var keyrð af Stebba 2026-07-20. Test 3 (DB persistence) krefst þess að þessi migration sé til staðar í production — hún bætir `status_filter_mode` dálki við `weather_user_preferences` töfluna. Ef hún er ekki til staðar í production mun threshold-save virka en mode-save skilar 200 án þess að vista í DB.
