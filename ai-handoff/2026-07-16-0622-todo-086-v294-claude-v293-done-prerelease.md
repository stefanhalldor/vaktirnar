# 2026-07-16 06:22 - TODO-086 v294 - Claude: v293 composer visual polish done

Created: 2026-07-16 06:22
Timezone: Atlantic/Reykjavik

Narrow UI polish pass. No logic changes, no new endpoints, no SQL.

## Vandinn

Inline composer var of stór og yfirþyrmandi í þjöppuðum Veðurstofuspjöldum — `min-h-10` hæð og `rounded-lg` þunga stíll passaði ekki við spálínur og stöðuchips umhverfis.

## Breytingar

### `components/weather/VedurstofanPulseInline.tsx` — composer styling

**Input:**

| Breyting | Áður | Eftir |
|----------|------|-------|
| Hæð | `min-h-10` | `min-h-10 sm:min-h-8` |
| Padding | `px-2.5 py-1.5` | `px-2 py-1` |
| Border radius | `rounded-lg` | `rounded-md` |
| Border | `border-border` | `border-border/60` |
| Bakgrunnur | `bg-background` | `bg-transparent` |
| Focus ring | `focus:ring-ring` | `focus:ring-ring/60` |
| Placeholder opacity | `/60` | `/50` |
| Placeholder texti | `pulseInputPlaceholder` (langur) | `pulseInputPlaceholderCompact` (stuttur) |

**Senda takki:**

| Breyting | Áður | Eftir |
|----------|------|-------|
| Textastærð | `text-sm` | `text-sm sm:text-xs` |
| Hæð | `min-h-10` | `min-h-10 sm:min-h-8` |
| Padding | `px-3` | `px-2.5 sm:px-2` |
| Border radius | `rounded-lg` | `rounded-md` |
| Border | `border-border` | `border-border/60` |
| Litur | `text-foreground hover:bg-muted` | `text-muted-foreground hover:text-foreground hover:bg-muted/60` |

**Helstu áhrif:**
- Mobile (< sm): enn `text-base min-h-10` — engin iOS zoom, öruggt touch target
- Desktop/tablet (≥ sm): `text-sm min-h-8 text-xs` á takka — passar við kortið
- Takki lítur út eins og inline action, ekki primary form CTA
- `bg-transparent` á input fellur betur inn í kort bakgrunn

### `messages/is.json` + `messages/en.json`

Nýr lykill `pulseInputPlaceholderCompact`:
- IS: `"Hvernig eru aðstæður?"`
- EN: `"How are conditions?"`

Langur lykill `pulseInputPlaceholder` er eftir til notkunar á full pulse route ef þörf krefur.

## Skrár breyttar

- `components/weather/VedurstofanPulseInline.tsx` — composer styling
- `messages/is.json` — nýr `pulseInputPlaceholderCompact` lykill
- `messages/en.json` — nýr `pulseInputPlaceholderCompact` lykill

## Type-check

```
npm run type-check: exit 0, no errors
```

## Localhost checks fyrir Stebbi

1. Fara á `/auth-mvp/vedrid`, velja ferð með Veðurstofastöð
2. Smella á versta punkt — VedurstofanPointCard opnast
3. **Búist við:**
   - Composer sést neðst á kortinu — placeholder: "Hvernig eru aðstæður?"
   - Input og takki eru þjöppuð og falla inn í kortið
   - Senda takki lítur út eins og inline action (ekki primary CTA)
   - Forecast línur og stöðuchips eru enn greinilegar
4. Fara á `/auth-mvp/vedrid/elta-vedrid`, velja stöð
5. **Búist við:** Sömu þjöppuð útlit á composer
6. Fara í mobile viewport (< 640px)
7. Smella á input
8. **Búist við:** Síðan zoomaði EKKI inn — `text-base min-h-10` á mobile
9. Senduhnappur er enn þéglegt touch target (40px)

## Pending

- Stebbi gerir localhost checks
- Stebbi gefur commit-leyfi
- Low (v290): unit tests fyrir `/access` endpoint
- Low (v291): extract reusable ChatPreviewWithComposer core (deferred)
- "Sjá fleiri skilaboð" á travel route cards þegar route state er URL-backed
- Deferred (Phase 4B.2): station/weather context á full pulse route
