# TODO 086 v188 - Claude Code: Arkitektúrgreining á history-töflu og Vegagerðarsamþættingu

Created: 2026-07-14 23:30
Timezone: Atlantic/Reykjavik

Mode:
- Greining og handoff only. Engar kóðabreytingar.
- Svar við spurningu Stebba um hvort söguleg tafla gæti geymt gögn frá Vegagerðinni líka.

---

## Spurningin

Má sögulega taflan geyma gildi frá Vegagerðinni í framtíðinni, eða þarf aðra history töflu?
Og mætti nota sameinuð sögulegu gögn til að gera betri spá um hvort von sé á vondu veðri?

---

## Stutt svar

**Veðurstofan og Vegagerðin eiga EKKI að deila sömu history-töflu.**

Gögn þessara tveggja eru í grundvallaratriðum ólík -- Veðurstofan gefur **veðurspár** (forecast_time, vindur, hiti, úrkoma) og Vegagerðin gefur **vegastöðu-mælingar** (sleipur vegur, meðferð, mælingartími á ákveðnum veglengdum). Þau hafa mismunandi primary keys, mismunandi dálka og mismunandi hlutverkaskilgreiningar.

Að þröngva þessum gögnum í sömu töflu væri gallað skema -- mikið JSONB eða fjöldi nullable dálka, og erfiðara að tryggja gæði og tegundaöryggi.

**Rétt leið er þrjár aðskildar töflur:**

```
vedurstofan_forecasts_history     -- veðurspár, forecast_time-based, atime-keyed
vegagerdin_conditions_history     -- vegastöður, observation_time-based, segment-keyed
weather_route_assessments_history -- sameinuð greining per leiðarhluta (síðar, ef við viljum ML)
```

---

## Nákvæmur samanburður á gagnategundum

### Veðurstofan forecasts

- **Tegund**: veðurspá (forecast)
- **Tímasetning**: `forecast_time` (þegar spáin á við) + `atime` (þegar spáin var gefin út)
- **Staðsetning**: veðurstöð á GPS-punkt (lat/lon), fjarlægð frá veginum
- **Dálkar**: vindur m/s, vindátt, hiti °C, úrkoma mm/klst, veðurtexti
- **Primary key**: `(station_id, atime, forecast_time)`
- **Notkun**: "hvernig verður veðrið kl. 23:00 á Hellisheiði skv. spánni sem gefin var út kl. 18:00?"

### Vegagerðin road conditions

- **Tegund**: vegastöðu-mæling (observation/reading)
- **Tímasetning**: `observation_time` (þegar mælt)
- **Staðsetning**: veglengd/segment (road_id + chainage, eða lat/lon range)
- **Dálkar**: vegafar (þurrt/blautt/snjóað/ísing), meðferð (salt/sandur), hitastig vegborðs, mælingaraðferð
- **Primary key**: `(segment_id, observation_time)` eða `(road_id, chainage, observation_time)`
- **Notkun**: "hvernig voru vegar á Hellisheiðarvegi kl. 22:00 í kvöld?"

Þessi gögn deila engum dálki nema tíma og nálægum staðsetningu. Að sameina þau í eina töflu myndi kalla á JSONB payload eða 15+ nullable dálka -- hvort tveggja er slæmt skema.

---

## ML-hugmyndin: sameinuð söguleg greining

Stebbi bendir réttilega á að með söguleg gögn frá báðum veitum gæti kerfið gert betri spár. Hugmyndin er:

> "Við vitum hvað Veðurstofan spáir kl. 18:00 fyrir 23:00. Við vitum líka hvað Vegagerðin mældi á þessum vegi kl. 22:30. Hvort sýnir betri samsvörun við raunveruleg akstursöskurð?"

Þetta er grunngögn fyrir ML/statistical model sem gæti:
- Lagt saman Veðurstofan veðurspár við Vegagerðar vegastöðumælingar
- Fundið tengsl milli vindmælingum og ísing/snjó á vegum
- Gert betri scoring á "líkur á vondu veðri á leiðinni" byggt á sögulegu gögnum

**En þetta þarf sérstaka aggregation-töflu, ekki blöndu af source-töflunum.**

Hugmyndin að þriðju töflunni:

```sql
-- Síðar, ef við viljum gera ML/analytics layer:
CREATE TABLE public.weather_route_assessments_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assessment_time timestamptz NOT NULL,       -- þegar mat var gert
  route_pair_hash text NOT NULL,              -- fingerprint leiðarinnar
  route_point_lat numeric NOT NULL,
  route_point_lon numeric NOT NULL,
  distance_from_origin_m integer,
  vedurstofan_station_id text REFERENCES vedurstofan_stations(station_id),
  vedurstofan_atime timestamptz,
  vedurstofan_forecast_time timestamptz,
  vedurstofan_wind_speed_ms numeric,
  vedurstofan_weather_text text,
  vegagerdin_segment_id text,
  vegagerdin_observation_time timestamptz,
  vegagerdin_road_condition text,
  combined_status text,                       -- t.d. 'bad', 'caution', 'ok'
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Þetta er þó lengra í framtíðinni -- við þurfum fyrst:
1. Veðurstofan history töflu (v187)
2. Vegagerðin ingestion og conditions_history (enn ekki komin)
3. Aggregation/assessment layer (ML use case, kemur síðar)

---

## Ráðlögð skrefasetning

### Skref 1 — Núna (TODO 086)

Búa til `vedurstofan_forecasts_history`:
- Leysir "prev row" vandann í UI
- Styður future Vegagerðin samanburð (atime + forecast_time keys eru hreinar)
- Engin blanda við Vegagerðin á þessum tímapunkti

### Skref 2 — Þegar Vegagerðin er komin (síðar TODO)

Búa til `vegagerdin_conditions_history`:
- Eign tafla fyrir vegastöðu-mælingar
- Eign primary key (segment/road + observation_time)
- Eign RLS og retention

### Skref 3 — Þegar ML-layer er tilbúinn (langt í framtíðinni)

Búa til `weather_route_assessments_history` eða analytics view:
- Tengir saman Veðurstofan og Vegagerðin gögn per leiðarhluta og tíma
- Byggir á history-töflunum tveimur sem source-of-truth
- Gæti notað `routePairFingerprint` sem við höfum þegar

---

## Samantekt

| Spurning | Svar |
|----------|------|
| Má sama tafla geyma Veðurstofan og Vegagerðin? | Nei -- of ólík gagnategundir |
| Hvernig tengjum við þær? | Analytics-layer töflu/view síðar |
| Er ML-hugmyndin góð? | Já, en þarf tvær source-history töflur fyrst |
| Hvað á að gera núna? | Eingöngu `vedurstofan_forecasts_history` |
| Þarf Stebbi leyfi að gefa? | Já -- migration leyfi áður en við skrifum eða keyrum SQL 77 |

---

## Næsta skref

Þegar Stebbi staðfestir að við eigum að fara í gang með `vedurstofan_forecasts_history`:

1. Claude Code skrifar `sql/77_vedurstofan_forecasts_history.sql` (tafla, RLS, indexes, retention).
2. Claude Code uppfærir projector, reader og travel API.
3. Stebbi keyrir migration í Supabase þegar hann er tilbúinn.
4. Vegagerðin og ML-lag koma í sér TODO þegar tíminn er réttur.
