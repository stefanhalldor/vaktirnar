# TODO 090 — Breyta leið úr Akstur-header

Created: 2026-07-26 09:19  
Timezone: Atlantic/Reykjavik  
Agent: Codex

## Samþykkt og niðurstaða

Stebbi samþykkti að Codex bætti edit-penna í canonical Akstur-headerinn á
`/vedrid`. Lucide `Pencil` birtist nú milli route title og status badge þegar
niðurstaða er til staðar.

Smellur á „Breyta leið“:

- fer aftur í route-formið;
- hreinsar gömlu niðurstöðuna og route map layers;
- varðveitir frá/til texta og resolved hnit;
- heldur panelnum opnum og setur active field aftur á „Frá“.

Núverandi `handleClearRoute` og „hreinsa leið“ hegðun helst óbreytt fyrir
notanda sem vill eyða stöðunum alveg.

## Breyttar skrár

- `components/weather/RoadMapPrototypeMap.tsx`
- `messages/is.json`
- `messages/en.json`

## Design.md check

- Lucide icon, 40×40 px touch target, `aria-label`, tooltip og focus-visible.
- Header heldur einum lágværum icon-action og núverandi status badge.
- Enginn nýr skjár eða navigation route.
- Texti er í báðum locale skrám.

## Prófanir

- `npm run test:run`: exit 0; 3.674 passed, 28 skipped, 8 todo.
- `npm run build`: exit 0.
- `npm run type-check` eftir build: exit 0.
- Locale JSON parse: exit 0.
- `git diff --check`: exit 0; aðeins CRLF/LF warnings.

## Localhost checks for Stebbi

1. Opna `http://localhost:3004/auth-mvp/vedrid` og reikna leið í Akstur.
2. Penninn á að birtast hægra megin við `Frá → Til`, fyrir framan status badge.
3. Smella pennanum. Route-formið á að birtast strax með báðum stöðum útfylltum.
4. Breyta aðeins öðrum staðnum og reikna aftur; ný leið á að nota nýja staðinn.
5. Smella pennanum aftur án breytinga og reikna; resolved staðir eiga að
   endurnýtast án þess að textinn hverfi.
6. Prófa 360/390/460 px: title truncates ef þarf, penni og badge skarast ekki,
   touch target og focus ring sjást.

## Ekki gert

Enginn dev server, commit, push, deploy, Vercel/production env, Supabase, SQL
eða migration.

## Óvissa / þarf að staðfesta

Confidence er high fyrir state-varðveislu, build og próf. Sjónræn browserprófun
á mobile header er næsta staðfesting Stebba.
