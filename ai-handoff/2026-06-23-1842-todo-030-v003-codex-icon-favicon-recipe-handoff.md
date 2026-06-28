# TODO #30 v003 - Icon og favicon uppskrift

**Fra:** Codex
**Til:** Claude Code
**Dagsetning:** 2026-06-23 18:42
**Stada:** Bidur framkvaemdar

## Markmid

Klára #30 út frá nýjustu ákvörðun Stebba:

- Stærra Teskeið-lógóið á að vera með `Allt` fyrir ofan `10` inni í derhúfunni.
- `Allt` á að vera hóflegt, í svipaðri stærð og það er í v002 preview-inu.
- `10` á að vera stærra, skýrara og meira sýnilegt.
- Favicon/app-icon má vera einfalt og sýna bara `10`. Ekki troða `Allt` inn í litla favicon-ið.

## Núverandi staða sem Codex staðfesti

- `components/teskeid/TeskeidLogo.tsx` er canonical production component og sýnir enn `10,5`.
- `app/icon.svg` sýnir enn `10,5` og er líklega Next favicon entry point.
- `public/manifest.json` notar `public/icon-192.png`, `public/icon-512.png` og `public/teskeid-mark.svg`.
- `public/favicon-options/cap-mark-allt-10-preview.svg` var búið til í v002, en þar eru bæði `Allt` og `10` í `font-size="28"`.
- `app/preview/favicons/codex/page.tsx` sýnir preview valkosti.
- `app/preview/teskeid-logo/codex/page.tsx` sýnir canonical production `TeskeidLogo` og 10,5 preview.

## Hvað á að gera

1. Byrjaðu á stuttu audit-i á icon/logo entry points:
   - `components/teskeid/TeskeidLogo.tsx`
   - `app/icon.svg`
   - `public/manifest.json`
   - `public/teskeid-mark.svg`
   - `public/icon-192.png`
   - `public/icon-512.png`
   - `public/favicon-options/*`
   - `app/preview/favicons/codex/page.tsx`
   - `app/preview/teskeid-logo/codex/page.tsx`

2. Uppfærðu stærra production lógóið:
   - Í `components/teskeid/TeskeidLogo.tsx`, skipta `10,5` út fyrir tvær línur:
     - `Allt` fyrir ofan, hóflegt.
     - `10` fyrir neðan, stærra og sjónrænt ríkjandi.
   - Nota sömu liti og núna: grænt `#245a31` og krem `#fbf8f1`.
   - Halda núverandi character/andliti/hlutföllum óbreyttum.
   - Athuga sérstaklega að `showBackground={false}` haldi áfram að virka og valdi ekki óvæntu krem-recti.

3. Uppfærðu actual favicon/app-icon leið:
   - `app/icon.svg` á að sýna bara `10` á derhúfunni, ekki `Allt`.
   - Ef `public/teskeid-mark.svg` er manifest SVG icon og notar enn gamla A&10/10,5 merkingu, uppfæra það líka í bara `10`.
   - Ef til er örugg repo-leið til að endurútbúa `public/icon-192.png` og `public/icon-512.png`, gera það svo PWA/install icon sé líka samræmt.
   - Ef PNG regeneration er ekki tiltæk án nýrra tóla eða handvirks assets export, ekki giska. Skilaðu því skýrt í closeout sem eftirvinnu.

4. Uppfærðu preview/samanburð:
   - `public/favicon-options/cap-mark-allt-10-preview.svg`: halda `Allt` svipað og v002 en stækka `10` verulega og stilla y-gildi þannig að textinn sitji fallega í derhúfunni.
   - Bæta við eða uppfæra preview fyrir einfalt favicon með bara `10`, ef slíkt vantar.
   - `app/preview/favicons/codex/page.tsx` á að greina skýrt á milli:
     - stærra logo/brand preview: `Allt` yfir `10`;
     - favicon/app-icon preview: bara `10`.
   - Ef `app/preview/teskeid-logo/codex/page.tsx` vísar enn sérstaklega í 10,5 sem aðalframtíð, uppfæra textann eða bæta nýju Allt/10 preview við.

5. Hreinsa orðalag og comments:
   - Comments mega ekki segja lengur "replace with 10,5" í skrám sem eru ekki lengur með 10,5.
   - Ekki skilja eftir óljóst hvort `Allt/10` sé ætlað favicon. Það er það ekki. Það er fyrir stærra logo/brand mark.

## Mikilvæg hönnunarforskrift

Ekki stækka `Allt` og `10` jafnt.

Stebbi vill:

```text
Allt   = lítil/hófleg derhúfumerking, svipuð v002
10     = stór, skýr, ber sjónræna þungann
```

Favicon/app-icon:

```text
10
```

bara `10`, miðjað og læsilegt í mjög litlum stærðum.

## Prófanir

Keyra að lágmarki:

```bash
npm run type-check
npm run test:run -- lib/__tests__/teskeid-logo.test.tsx
```

Ef preview eða image imports breytast og það er viðeigandi, keyra einnig nálæg test sem finnast með `rg TeskeidLogo lib/__tests__`.

## Localhost checks for Stebbi

Stebbi keyrir localhost sjálfur.

1. Opna `/preview/teskeid-logo/codex`.
   - Vænt: stærra Teskeið-lógóið sýnir `Allt` yfir `10`.
   - Vænt: `Allt` er hóflegt, `10` er stærra og augljóslega sýnilegra.
   - Passa: textinn fer ekki út úr derhúfunni og skemmir ekki andlitið.

2. Opna `/preview/favicons/codex`.
   - Vænt: favicon/app-icon tillaga með bara `10` er til staðar.
   - Vænt: í 16, 24, 32, 48 og 64 px sést ekki `Allt`; aðeins `10`.
   - Vænt: `10` er læsilegt eða að minnsta kosti greinilega betra en of smá `10,5`.

3. Opna venjulega app-skjái sem nota `TeskeidLogo`, til dæmis `/innskraning` eða `/auth-mvp/heim`.
   - Vænt: logo hefur nýju `Allt` yfir `10` merkinguna.
   - Passa: mobile layout breytist ekki, enginn horizontal scroll og ekkert overlap.

4. Athuga browser tab/favicon.
   - Vænt: favicon sýnir einfalda `10` útgáfu.
   - Athugið: vafrar cache-a favicon mjög fast. Nota incognito, hard refresh eða hreinsa favicon cache áður en niðurstaða er dæmd.

5. Ef PWA/install icon er prófað:
   - Vænt: install icon notar líka `10`-einföldunina.
   - Ekki eyða eða yfirskrifa production assets utan repo-flæðis. Ef PNG icons voru ekki endurgerð, skrá það sem eftirvinnu.

## Ekki gera

- Ekki keyra dev server nema Stebbi biðji sérstaklega um það.
- Ekki breyta SQL, Supabase, auth eða RLS.
- Ekki skipta yfir í nýtt lógókerfi eða endurteikna allan karakterinn.
- Ekki gera `Allt/10` að litlu favicon ef það verður ólæsilegt.
- Ekki gera production favicon og preview ósamræmd án þess að skrá skýra ástæðu.

## Closeout sem Claude á að skila

Skilaðu handoff til Codex með:

- hvaða icon/logo entry points voru staðfestir;
- hvaða skrár voru breyttar;
- hvort `public/icon-192.png` og `public/icon-512.png` voru endurgerð eða ekki;
- hvaða skipanir voru keyrðar og exit codes;
- hvort favicon cache geti truflað manual prófun;
- `Localhost checks for Stebbi` með nákvæmum skrefum;
- hvort #30 sé tilbúið í DONE eða hvort aðeins production PNG/icon export bíði.

## Supabase / SQL

Á ekki við. Ekki keyra SQL og ekki snerta Supabase.
