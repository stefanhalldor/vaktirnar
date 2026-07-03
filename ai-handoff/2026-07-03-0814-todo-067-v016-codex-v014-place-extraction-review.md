# TODO #67 Vedrid - Codex review of Claude place extraction fix

**Dagsetning:** 2026-07-03 08:14  
**Fra:** Codex  
**Til:** Stebbi og Claude Code  
**Samhengi:** Review a `2026-07-03-0810-todo-067-v014-claude-place-extraction-fix.md`.

## Verdict

Samþykkt fyrir localhost/dev áframhald. Ég fann engan blocker í `mosó` fixinu.

Fixið leysir v013 blockerinn: `mosó`, `Mósó` og `moso` eiga nú öll að route-a á Mosfellsbær áður en forecast er sótt.

## Findings

Engin blocker findings.

### Low - handoff version numbering skarast

Claude handoffið heitir v014, en Codex hafði þegar búið til v014 og v015 fyrir sama TODO. Þetta er ekki code-vandamál, bara workflow ruglingshætta. Næsta Claude handoff ætti að nota næsta lausa númer, líklega v017 ef þetta review er v016.

### Low - `PLACE_PATTERNS` er enn sérheimild við hlið `places.ts`

Nýja `lib/weather/question.ts` lagar accent-normalization vel, en heldur áfram með `PLACE_PATTERNS` lista sem þarf að vera samstilltur við `lib/weather/places.ts`.

Þetta er ekki blocker fyrir `mosó` fixið. Fyrir næsta `route_travel` / Apavatn fasa væri samt betra að færa í sameiginlegan resolver/search helper svo nýir staðir þurfi ekki að vera skráðir á tveimur stöðum.

## Staðfestingar

### Implementation

- `lib/weather/question.ts` bætir við exported helpers:
  - `detectIntent`
  - `extractPlace`
  - `parseTimeWindow`
- `extractPlace()` normaliserar bæði question og patterns áður en `includes()` er notað.
- `app/api/teskeid/weather/ask/route.ts` notar nú nýju helperana.
- `lib/__tests__/weather-question.test.ts` bætir við regression coverage fyrir `mosó`, `Mósó`, `moso`.

### Prófanir keyrðar af Codex

```text
npm run type-check
Exit code: 0

npm run test:run
Exit code: 0
Test Files: 48 passed (48)
Tests: 1509 passed, 22 skipped, 8 todo (1539)
```

Engar migrations voru keyrðar af Codex. Engar Supabase, Vercel, production, env eða billing breytingar voru gerðar.

## Localhost checks for Stebbi

1. Regression sem átti að laga:
   - spyrja `Er grillveður í mosó í kvöld?`
   - vænt: svar fyrir Mosfellsbær, ekki unknown-place villa.

2. Accent/alias regressions:
   - spyrja `Er grillveður í Mósó í kvöld?`
   - spyrja `Er grillveður í moso í kvöld?`
   - vænt: bæði virka áfram.

3. Existing happy path:
   - spyrja `Er grillveður í Reykjavík á morgun?`
   - vænt: Reykjavík svar eins og áður.

4. Unknown place:
   - spyrja `Er grillveður á Tunglinu í kvöld?`
   - vænt: falleg unknown-place villa.

5. Feature gate:
   - allowlisted user sér Veðrið og fær svar.
   - non-allowlisted user sér ekki Veðrið / kemst ekki inn á route.

Ekki keyra production SQL, setja Vercel env, deploya eða snerta production `feature_access` án sérstöku leyfis.

## Næsta skref

Halda áfram með v015 scope:

- `towable_trailer` flokkur fyrir tjaldvagn/fellihýsi/hjólhýsi/hestakerru
- Apavatn support
- `route_travel` deterministic tool
- varfærin wording, ekki absolute safety

En þegar það er implementað þarf að forðast að bæta Apavatni bara í `places.ts`; það þarf líka að virka í question extraction eða nýjum sameiginlegum place-search helper.
