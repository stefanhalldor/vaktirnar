# TODO-086 - Handoff: Nav icons, virkt val, tímasamstilla, neðri ræma

Created: 2026-07-23 23:28
Timezone: Atlantic/Reykjavik

## Skilningur a samþykki

Stebbi gaf framkvæmdarleyfi: "Framkvæmdu þetta og ég prófa á localhost."

Ekki samþykkt og ekki gert: SQL, migration, Supabase, auth, secrets, billing, deploy utan push.

## Hvað var beðið um

1. **Virkt val sýnilegra + emoji icon** - Nav-takkar í topbar og mobile panel-hausum eiga að sýna skýran active state. Dæmi: veðurlogo við "Mitt veður".

2. **"Tímar í töflu" orðalag** - Breyta í "Tímar í samanburðartöflu og á korti" og stýra scrubbernum á kortinu (þ.e. þegar notandi velur klukku í Mitt veður-spjaldinu á kortið að uppfærast).

3. **Neðri ræma (bottom strip) aðeins í akstri** - Kassinn neðst á kortinu (WeatherSourceTimeSelector + Einfalt/Nánar + statusfilter) á ekki við nema notandi sé í Akstur-ham. Fjarlægja þegar notandi er ekki í akstri.

## Hvað var gert

### 1. Emoji icon og active styling - allar nav-hnappastillingar

**Skrár:** `components/weather/RoadMapPrototypeMap.tsx`

Fjórir staðir uppfærðir: topbar, Mitt veður mobile header, Skilaboð mobile header, Akstur mobile header.

| Panel | Emoji |
|-------|-------|
| Mitt veður | 🌦️ |
| Akstur | 🚗 |
| Skilaboð | 💬 |

**Áður:** Takkarnir notuðu `style={{ color: '#16a34a' }}` þegar virkir - lítið sem ekkert sýnilegt.

**Eftir:** Takkarnir nota conditional className:
```tsx
className={`... ${isActive
  ? 'border-primary bg-primary/10 text-primary'
  : 'border-border/70 bg-background text-foreground hover:bg-muted'}`}
```
`style`-prop alfarið fjarlægður. Emoji bætt við í texta takkans með `gap-1` á flex container.

Kort-takkinn (til baka á kortið) fékk enga emoji - hann er navigation, ekki panel.

### 2. Tímar -> scrubber samstilling

**Skrár:** `components/weather/WeatherChasePanel.tsx`, `components/weather/RoadMapPrototypeMap.tsx`

**WeatherChasePanel.tsx:**
- Bætt við `onHourSelect?: (hour: number) => void` í `Props` type
- `onHourSelect` bætt í destructuring
- `toggleVisibleHour` uppfært: ef klukkutími er bættur við (ekki fjarlægður), kallar á `onHourSelect?.(hour)`

```tsx
function toggleVisibleHour(hour: WeatherChaseVisibleHour) {
  const isAdding = !visibleHours.includes(hour)
  setVisibleHours(prev => { ... })
  if (isAdding) onHourSelect?.(hour)
}
```

**RoadMapPrototypeMap.tsx:**
- `onHourSelect` prop skilgreint á `<WeatherChasePanel>`:
```tsx
onHourSelect={(hour) => {
  const slot = overviewForecastSlots.find(ms => new Date(ms).getUTCHours() === hour)
  if (slot !== undefined) handleOverviewModeChange(slot)
}}
```
Iceland = UTC+0 alla daga, svo `getUTCHours()` gefur rétta klukkutíma.

### 3. Neðri ræma aðeins í aksturi

**Skrá:** `components/weather/RoadMapPrototypeMap.tsx`

Heill `<div className="absolute bottom-0 left-0 right-0 z-10 ...">` (og allt innihald hans) pakkaður inn í `{isPanelOpen && (...)}`.

Inniheldur: loading-state, routeBridgeSummary scrubber, og default overview (WeatherSourceTimeSelector + Einfalt/Nánar + WindStatusFilterPills).

### 4. i18n

| Skrá | Lykill | Áður | Eftir |
|------|--------|------|-------|
| `messages/is.json` (x2) | `roadMapPrototypeWeatherChaseVisibleHoursLabel` | "Tímar í töflu" | "Tímar í samanburðartöflu og á korti" |
| `messages/en.json` | `roadMapPrototypeWeatherChaseVisibleHoursLabel` | "Times in table" | "Times in table and map" |

Athugasemd: is.json hafði tvöfaldan lykil (línu 1139 og 1157) - báðar uppfærðar.

## Skrár breyttar

- `components/weather/WeatherChasePanel.tsx`
- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## Skipanir og niðurstöður

1. `npm run type-check` - exit code 0

## Localhost checks fyrir Stebbi

Síða: `http://localhost:3004/auth-mvp/vedrid/road-map-prototype`

1. Topbar: staðfestu 🌦️/🚗/💬 á öllum þremur tökkum.
2. Smelltu á 🌦️ Mitt veður - takkinn a að verda granngraenn (bg-primary/10) og hafa graenan border. Hinar tvaer aettu ad vera litlausir.
3. Smelltu a 🚗 Akstur - sami active-statur. Neðri ræman a ad koma fram med WeatherSourceTimeSelector og Einfalt/Nanar.
4. Smelltu a 💬 Skilaboð - sami active-statur. Neðri ræman a ad hverfa.
5. Fara a kortid (engin panel opin) - neðri ræman a ekki ad sjast.
6. Opna Mitt veður. Scrolladu niður ad "Tímar í samanburðartöflu og á korti". Smelltu a "12" (ef ekki nú þegar valinn) - kortid a ad uppfærast í 12:00 spaagildi.
7. Smelltu a annan tima, t.d. "15" - kortid a ad hoppa yfir á 15:00 slot.
8. Klukkutimi sem er nú þegar valinn (og er eini valinn) - smellur a hann a ad gera ekkert (minst einn verður alltaf valinn).

## Ovist

- Tímar-hnapparnir eru multi-select (margar dálkar sýnilegar í töflu). `onHourSelect` kallar aðeins þegar klukkutími er BÆTTUR VIÐ, ekki þegar hann er fjarlægður. Kortið hoppar í síðasta valinn tíma.
- Ef notandi velur t.d. bæði 12 og 15 í töflunni, er kortið á 15 (síðast valinn). Þetta er eðlilegt.
- `sm:top-14` á floating desktop-spjöld gildir enn - 56px frá efsta kantinum á map-area. Óbreytt.
