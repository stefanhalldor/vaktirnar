# TODO-091 v021 — Highlight á virku Spá/Akstur samhengi

## Plan áfangans

1. Láta virka aðalhaminn vera jafn skýran og virka undirvalið.
2. Nota sömu hegðun fyrir Spá og Akstur.
3. Halda vistaða samhenginu muted þegar Skilaboð eru virk.

## Hvað var gert

- Aðalhluti expanded navigation-group fær nú `bg-primary` og
  `text-primary-foreground` þegar samhengið er virkt.
- `Spá` og valið `Upplýsingar`/`Kort` mynda því saman grænt virkt svæði.
- Sama gildir um `Akstur`.
- Þegar Skilaboð eru virk er síðasta Spá/Akstur group áfram stækkað en
  aðalhamurinn er ekki grænn; aðeins vistað undirval er sýnt muted.
- Engri state-hegðun var breytt.

## Skrár sem voru skoðaðar

- `components/weather/RoadMapPrototypeMap.tsx`
- Skjámynd Stebba af nýju navigation.

## Skrár sem voru breyttar

- `components/weather/RoadMapPrototypeMap.tsx`
- `ai-handoff/2026-07-24-2250-todo-091-v021-codex-highlight-active-navigation-context.md`

## Skipanir og niðurstöður

- `npm.cmd run type-check`
  - Exit code 0.
- `git diff --check`
  - Exit code 0; engar whitespace-villur, aðeins line-ending viðvaranir.

## Hvað var sleppt

- Build var ekki endurkeyrt fyrir þessa einu className-breytingu. Build v020
  stóðst og type-check v021 stóðst.
- Dev server/browser var ekki ræstur.

## Ákvarðanir og áhætta

- Notaðir eru sömu Teskeið primary tokens og á virku undirvali.
- Virkur aðalhamur og undirval geta litið út sem eitt samfellt grænt svæði;
  divider heldur merkingarlegum aðskilnaði.
- Meta þarf sjónrænt hvort divider sé hæfilega greinilegur yfir primary-lit.
- Lausnin fylgir `Design.md` og breytir hvorki stærð né touch targets.

## Supabase, SQL og production

- Engin áhrif á Supabase, SQL, auth, secrets, billing eða notendagögn.
- Ekkert var committað, push-að eða deployað.

## Tillaga að næsta skrefi

Staðfesta contrast og hvort aðalhamur + undirval lesist rétt sem stigskipt
navigation á mobile.

## Atriði sem Codex ætti að rýna

- Contrast divider yfir grænum bakgrunni.
- Að Skilaboð sýni aðeins eitt virkt aðalval.

## Localhost checks for Stebbi

1. Opnaðu `/auth-mvp/vedrid/road-map-prototype`.
2. Í `Spá → Upplýsingar`:
   - Vænt: bæði `Spá` og `Upplýsingar` eru græn.
3. Veldu `Spá → Kort`:
   - Vænt: `Spá` og `Kort` eru græn; `Upplýsingar` ekki.
4. Veldu `Akstur → Upplýsingar` og síðan `Akstur → Kort`.
   - Vænt: `Akstur` og viðkomandi undirval eru græn.
5. Opnaðu Skilaboð.
   - Vænt: aðeins Skilaboð eru græn sem virkt aðalval.
   - Síðasta expanded group er áfram sýnilegt með muted vistað undirval.
6. Prófaðu 360, 390 og 460 px og keyboard focus.
   - Vænt: enginn overflow og focus-ring áfram sýnileg.

Engin Supabase- eða production-gögn eru snert við prófun.
