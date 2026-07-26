# TODO 091 v069 — Localhost SSR/dev-cache greining

Created: 2026-07-25 20:37  
Timezone: Atlantic/Reykjavik

## Niðurstaða

Stebbi fékk við smell á Veðurstofupunkt á stóra kortinu:

`Switched to client rendering because the server rendering errored: Cannot read properties of undefined (reading 'call')`

Back navigation og route restore virkuðu samt.

Miðað við stack trace og staðfestingar er líklegasta orsökin úreltur eða
ósamræmdur Next.js development module graph/HMR cache eftir margar breytingar
á page/layout skrám meðan sami dev server hefur verið í gangi.

Þetta er ekki samþykkt sem harmless release-warning. Flæðið þarf að standast
eftir hreina dev-endurhleðslu áður en localhost-prófun heldur áfram.

## Vísbendingar

- Villan kemur úr `.next/server/webpack-runtime.js`, áður en hún bendir á
  application-línu.
- React/Next féll yfir í client rendering og síðan birtist.
- Stöðvasíðan hefur engin ný dynamic/SSR import-mynstur sem skýra villuna.
- `public/manifest.json` er gilt JSON, þótt browser hafi einnig sýnt
  `Manifest: syntax error`; það styður að dev server/browser hafi fengið
  ósamræmt eða rangt tímabundið response.
- Full Vitest suite, type-check og production `next build` eru græn eftir
  promotion-breytingarnar.
- Parent layouts voru nýstofnuð og nested layout eytt á meðan localhost var
  keyrandi; það er dæmigert tilfelli þar sem langlíft HMR state getur orðið
  ósamræmt.

## Næsta próf fyrir Stebba

1. Gera fyrst hard refresh á síðunni (`Ctrl+Shift+R`).
2. Hreinsa Console.
3. Fara aftur á `/auth-mvp/vedrid`, reikna sömu leið og smella sama
   Veðurstofupunkti.
4. Ef villan kemur aftur: stoppa og ræsa localhost/dev serverinn sjálfur.
5. Prófa sama flæði aftur með hreinum Console.
6. Ef webpack-villan lifir áfram eftir restart þarf að stoppa prófun og senda:
   - fyrstu server-terminal villuna, ekki aðeins client stack;
   - fyrstu rauðu Console-villuna;
   - Network status/content-type fyrir page request og `/manifest.json`.

Ef venjulegt restart hreinsar ekki vandann er næsta greiningarskref að fjarlægja
aðeins generated `.next` cache meðan dev server er stopp og ræsa aftur. Codex
framkvæmir það ekki án sérstakrar beiðni; `.next` er endurgeranlegt build/dev
artifact en aðgerðin er samt filesystem-eyðing.

## Localhost checks for Stebbi

Eftir hreina dev-endurhleðslu:

1. Opna reiknaða leið í stóra kortinu.
2. Smella Veðurstofupunkti.
3. Vænt:
   - stöðvasíðan SSR-renderast án client-render fallback;
   - engin webpack runtime villa;
   - engin manifest syntax villa;
   - `Til baka í akstur` virkar;
   - sama leið og map view endurheimtist.
4. Endurtaka fyrir Vegagerðarpunkt.
5. Endurtaka með browser/device back.

## Framkvæmdarstaða

Engum runtime-, test-, config- eða cache-skrám var breytt. Dev server var ekki
ræstur, stöðvaður eða endurræstur. Ekkert commit, push, deploy eða production-
inngrip var gert.

