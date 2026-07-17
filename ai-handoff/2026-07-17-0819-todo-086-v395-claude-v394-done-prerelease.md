# 2026-07-17 08:19 - TODO-086 v395 - Claude: v394 done + regression fix, prerelease

Created: 2026-07-17 08:19
Timezone: Atlantic/Reykjavik

Source: `2026-07-17-0811-todo-086-v394-codex-v393-prerelease-review`

## Skilningur á samþykki

Stebbi samþykkti framkvæmd v394 Codex review (Workflow sérregla). Codex hafði engar blockers.
Einn low finding: bæta við unit test fyrir production guard á unverified route-control sections.

Stebbi staðfesti síðan regression (Skjámynd 2026-07-17 081439) og gaf framkvæmdarleyfi til að
leiðrétta hana.

## Hvað var gert

### 1. v394 low finding: Production guard test bætt við

`lib/__tests__/routeControlPoints.test.ts` — nýr `describe` blokk:

```ts
describe('production guard — verified: false sections', () => {
  it('skips unverified sections in production (NODE_ENV=production)', ...)
  it('applies unverified sections in dev/test (NODE_ENV != production)', ...)
})
```

Notaðar `vi.stubEnv` / `vi.unstubAllEnvs()` í stað beinnar `process.env.NODE_ENV = ...`
(sem er read-only í TypeScript — myndi valda type-check villu).

### 2. Regression: "Til að sleppa við Öxi" sýndi Öxi-viðvörun

**Vandamál:** v393 breyting (display/validation cautions split) olli regression.
`displayCautions` var reiknað með fullri greiningu (corridorPoints + evidencePoints).
10 km corridorPoint fyrir Öxi fires á coastal leið í gegnum Reyðarfjörður — þannig að
curated leiðin fékk Öxi-viðvörun þótt hún fari ekki á Road 939.

**Leiðrétting** (`lib/weather/google.server.ts` `fetchCuratedRoute`):

Fyrir `avoid-oxi-via-reydarfjordur`: `displayCautions` og suppression validation nota bæði
`evidencePointsOnly: true`. 1.5 km Öxi-stöðvar evidencePoint greinir rétt á milli Road 939
og coastal leiðarinnar. Aðrar reglur nota full detection (óbreytt).

Gamla skipulag (tvær `matchRouteCautions` kallningar):
```ts
const displayCautions = matchRouteCautions(allPoints, from, to)
const validationCautions = rule.id === 'avoid-oxi-via-reydarfjordur'
  ? matchRouteCautions(allPoints, from, to, { evidencePointsOnly: true })
  : displayCautions
```

Nýtt skipulag (ein kall, per-rule policy):
```ts
const evidenceOnly = rule.id === 'avoid-oxi-via-reydarfjordur'
const displayCautions = matchRouteCautions(
  allPoints, from, to,
  evidenceOnly ? { evidencePointsOnly: true } : undefined,
)
```

## Niðurstöður

```
npm run type-check  → pass
npm run test:run -- [6 test files]  → 6/6 pass, 207/207 tests
```

(207 tests = 205 úr v393 + 2 nýir production guard tests)

## Skrár sem breyttust

- `lib/__tests__/routeControlPoints.test.ts` — vi import, vi.stubEnv, production guard describe blokk
- `lib/weather/google.server.ts` — evidenceOnly per-rule policy, ein matchRouteCautions kall

## Eftirstandandi

### Localhost staðfesting

1. `Höfn → Egilsstaðir`:
   - "Varasamt með eftirvagna" á fljótlegustu leið (fer um Öxi)
   - "Til að sleppa við Öxi" birtist — AN caution (eða önnur caution ef við á, en EKKI Öxi)
   - Ef curated leið fer samt um Öxi: suppressed, ekki sýnd

2. `Egilsstaðir → Höfn`: sama í reverse

3. `Reykjavík → Egilsstaðir` (localhost/dev):
   - Vík/Skeiðflötur route-control points virka (unverified section active í dev)

4. `Selfoss → Þorlákshöfn`: engin false positive

5. Eftir localhost staðfestingu á `ring-road-vik-skeidflotur`:
   - Claude Code setur `verified: true` í `lib/weather/routeControlPoints.ts`

## Ekki gert

- Engin commit, push, deploy eða migration
