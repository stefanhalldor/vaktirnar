# TODO #30 v004 - Icon og favicon closeout

**Fra:** Claude Code
**Til:** Codex
**Dagsetning:** 2026-06-23 18:55
**Commit:** a4ff05a
**Stada:** Lokid ad mati Claude. #30 tilbuid til DONE nema PNG endurgerd bidi.

---

## Stadfesting a entry points

| Skra | Stada | Breytingar |
|---|---|---|
| `components/teskeid/TeskeidLogo.tsx` | Uppfaerd | Allt (18px) yfir 10 (44px) |
| `app/icon.svg` | Uppfaerd | Bara 10 (56px), midjad |
| `public/teskeid-mark.svg` | Óbreytt | Er oval/stroke SVG, ekki cap -- engin texti, engar breytingar thurftu |
| `public/manifest.json` | Óbreytt | Vísur í icon-192.png, icon-512.png, teskeid-mark.svg -- engar breytingar |
| `public/icon-192.png` | Óbreytt | PNG -- sja nedst |
| `public/icon-512.png` | Óbreytt | PNG -- sja nedst |
| `public/favicon-options/cap-mark-allt-10-preview.svg` | Uppfaerd | Allt 18px, 10 44px (var badi 28px) |
| `public/favicon-options/cap-mark-10-only-preview.svg` | Ny skra | Bara 10 (56px), favicon preview |
| `app/preview/favicons/codex/page.tsx` | Uppfaerd | Greining a milli logo-preview og favicon-preview |
| `app/preview/teskeid-logo/codex/page.tsx` | Uppfaerd | "10,5 forskoðun" hluti skiptist ut fyrir "Allt/10 canonical" |

---

## Skipanir keyrdar

```bash
npm run type-check   --> 0 errors (exit 0)
npm run test:run -- lib/__tests__/teskeid-logo.test.tsx  --> 14/14 pass (exit 0)
```

---

## Hvad var gert

### TeskeidLogo.tsx

- Fjarlaeging: eitt `<text>` element med "10,5" (fontSize=46, y=260)
- Vidbot: tvo `<text>` element:
  - `Allt` -- fontSize=18, y=233, dominant-baseline="middle"
  - `10` -- fontSize=44, y=267, dominant-baseline="middle", letterSpacing="-1"
- Comment uppfaerdur (tvisvar "replace with 10,5" var fjarlaeght)
- `showBackground=false` virkar enn: cap cover rect er gaett a `showBackground` eftir sem adur
- Tests: oll 14 testar enn i lagi (engin testud textagildi)

### app/icon.svg

- Eitt `<text>` "10,5" (font-size=46) skiptist ut fyrir "10" (font-size=56)
- letter-spacing="-1" haldist
- viewBox haldist: "400 135 420 420"

### public/favicon-options/

- `cap-mark-allt-10-preview.svg`: Allt 18px, y=234; 10 44px, y=267
- `cap-mark-10-only-preview.svg` (ny): bara "10" (56px, y=257), sama cap-mark viewBox

### app/preview/favicons/codex/page.tsx

Gamli "Allt/10 derhúfa (forskoðun — tveggja lína leturstafur)" entry skiptist:
- `cap-mark-allt-10-preview.svg` -- merkt sem "stærra lógó/brand mark"
- `cap-mark-10-only-preview.svg` -- merkt sem "favicon/app-icon (app/icon.svg)"

### app/preview/teskeid-logo/codex/page.tsx

"10,5 forskoðun" hlutinn (sem notadi `/teskeid-logo-10-5-preview.svg`) var skipttur
ut fyrir einfaldan "Allt/10 canonical" hluta sem synir `TeskeidLogo` med ny hlutfall.

---

## PNG icons -- eftirvinnsla

`public/icon-192.png` og `public/icon-512.png` eru binary PNG skrar sem voru ekki
endurgerdar. Engin tol eru til i repo til ad endurskapa them. Thear syna enn gamla
A&10 merkinguna (eda eldri).

Til ad uppfaera them tharf Stebbi (eda Codex med tol) ad:
1. Render `app/icon.svg` i 192x192 og 512x512 raster.
2. Vista sem `public/icon-192.png` og `public/icon-512.png`.

Thad er fyrst eftir thessar uppfaerslur sem PWA install icon er samraemd.

---

## Favicon cache vaering

Vafrar cache-a favicon mjog fast. Til ad sjá nyjustu breytingarnar:
- Nota incognito glugga.
- Hard refresh (Ctrl+Shift+R / Cmd+Shift+R).
- Hreinsa browser cache serstaklega ef favicon kemur ekki uppfaerd.

---

## Localhost checks for Stebbi

### 1. Production logo

Fara a `/preview/teskeid-logo/codex` eda `/innskraning` eda `/auth-mvp/heim`.
- Vaent: derhúfan synir `Allt` (litid) yfir `10` (stórt, greinileg rikjandi).
- Passa: texti fer ekki ut ur derhúfunni, andlit og hlutfall breytast ekki.
- Passa: `showBackground={false}` (transparent bakgrunnur i preview) -- ekkert krem-rect.

### 2. Favicon

Opna venjulegan browser tab (incognito eda hard refresh):
- Vaent: favicon synir `10` eitt og ser.
- Athugid: cache -- nota incognito ef favicon kemur sem gamall A&10.

### 3. Favicon preview sida

Fara a `/preview/favicons/codex`:
- Vaent: 7 valmoguleikar.
- Vaent: "Allt/10 derhúfa -- stærra lógó/brand mark" og "10 derhúfa -- favicon/app-icon" eru adgreind.
- Athuga hvort badi eru lasileg i smar staedum.

---

## Er #30 tilbuid til DONE?

Ja -- nema ef PNG uppfaersla er skilgreind sem hluti af #30. Ef Stebbi telur
PNG endurgerd hluta af #30 ber ad skra thessar skrar sem eftirvinnslu adur en
lokunin fari i DONE.

Ef PNG er ekki hluti af #30 skilgreiningunni, er #30 tilbuid til DONE.
