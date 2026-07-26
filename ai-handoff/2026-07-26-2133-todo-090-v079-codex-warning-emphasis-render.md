# TODO-090 v079 — feitletraður áherslutexti í leiðavarúð

**Created:** 2026-07-26 21:33  
**Timezone:** Atlantic/Reykjavik  
**Fyrra handoff:** `2026-07-26-2129-todo-090-v078-codex-public-route-smoke-fixes.md`

## Niðurstaða

V078 endurheimti canonical varúðartextana, en route-bannerinn renderaði aðeins fyrri message-lykilinn. Fyrirliggjandi `roadMapPrototypeRouteWarningBannerEmphasis` er nú birtur neðst sem sér málsgrein með `font-semibold`, bæði á íslensku og ensku eftir locale.

## Skrá breytt

- `components/weather/RoadMapPrototypeMap.tsx`
- þetta handoff

Enginn þýðingatexti, SQL, Supabase, auth, middleware, dev server, commit, push eða deploy breyttist í þessari viðbót.

## Athuganir

- `git diff --check` — exit 0; aðeins fyrirliggjandi LF/CRLF warnings.
- Línuleit staðfesti að bæði aðal- og áherslulykill séu nú renderaðir og til í `messages/is.json` og `messages/en.json`.
- Prófum/type-check/build er áfram frestað til sameiginlegrar lokakeyrslu samkvæmt ósk Stebba.

## Localhost checks for Stebbi

Opna `/vedrid` → `Akstur`. Vænt: fullur canonical varúðartexti og síðan feitletruð málsgrein neðst:

**Þið getið áfram notað lausnina eins og hún er, en gerið það með sérstakri varúð þangað til að þessi skilaboð eru fjarlægð.**
