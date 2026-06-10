# TODO #8 - Codex handoff plan for Teskeið loader

**Dagsetning:** 2026-06-09 06:52
**Agent:** Codex
**Tengt TODO:** #8 Teskeið-loader með hugmyndaheitum úr hugmyndabankanum
**Hlutverk:** Claude Code er framkvæmdaaðilinn. Codex er aðeins að skila plani og rýni.

## Stutt niðurstaða

Claude Code skal búa til standalone preview fyrir Teskeið-loaderinn, ekki tengja hann strax inn í almenna navigation eða raunverulegar loading states.

Mælt slóð:

```txt
/preview/teskeid-loader
```

Loaderinn á að:

- nota núverandi canonical `TeskeidLogo`
- birta eitt public hugmyndaheiti í einu
- skipta um hugmyndaheiti á um 1 sekúndu fresti
- stoppa eða milda hreyfingu fyrir `prefers-reduced-motion`
- hafa öruggt fallback ef public hugmyndir finnast ekki eða Supabase query mistekst
- ekki tefja raunverulega navigation eða gagnabirtingu

## Það sem Codex skoðaði

Codex skoðaði read-only:

- `TODO.md`
- `components/teskeid/TeskeidLogo.tsx`
- `components/teskeid/teskeidLogoPaths.ts`
- `app/page.tsx`
- `lib/teskeid/types.ts`
- `components/teskeid/PersonalizedIdeaGrid.tsx`
- `app/preview/teskeid-logo/codex/page.tsx`
- `messages/is.json`
- `tailwind.config.js`
- `vitest.config.ts`
- `lib/__tests__/teskeid-logo.test.tsx`

Codex gerði engar loader-kóðabreytingar.

## Fyrsta skref Claude Code

Áður en Claude Code breytir skrám:

```powershell
git status --short
```

Ef `components/teskeid/TeskeidLogo.tsx`, `messages/is.json`, `messages/en.json`, `app/page.tsx`, `app/preview/*`, `TODO.md` eða `DONE.md` eru með óskýr concurrent breytingar, skal lesa diff og stoppa ef hætta er á árekstri.

## Mæltar skrár

Claude Code ætti helst að bæta við:

```txt
components/teskeid/TeskeidLoader.tsx
app/preview/teskeid-loader/page.tsx
lib/__tests__/teskeid-loader.test.tsx
```

Og breyta:

```txt
messages/is.json
messages/en.json
```

Ekki breyta SQL, Supabase migrations, RLS, grants, auth eða middleware í þessu verki.

## Component plan

Búa til `components/teskeid/TeskeidLoader.tsx` sem client component.

Mælt props:

```ts
interface TeskeidLoaderProps {
  ideaTitles: string[]
  loadingLabel: string
  fallbackIdeaTitle: string
  intervalMs?: number
  className?: string
}
```

Mælt hegðun:

1. Trimma titla.
2. Henda út tómum strengjum.
3. Deduplicate-a titla.
4. Takmarka við fyrstu 8-10 titla svo loaderinn verði ekki hávær.
5. Ef enginn titill er til, nota `fallbackIdeaTitle`.
6. Byrja á fyrsta titli.
7. Skipta um titil með `setInterval` á `intervalMs`, default `1000`.
8. Ef `prefers-reduced-motion: reduce` er virkt, ekki cycle-a titlum og ekki nota pulse/float animation.
9. Ef aðeins einn titill er til, ekki setja interval.

Mælt aðgengi:

- Root element: `role="status"` og `aria-label={loadingLabel}`.
- `TeskeidLogo` skal vera `decorative`, því status-label sér um skjálesara.
- Cycling hugmyndaheiti má vera `aria-hidden="true"` svo skjálesari lesi ekki nýjan titil á hverri sekúndu.
- Halda sýnilegum texta í föstum hæðarramma svo layout shift verði ekki.

Mælt visual:

- Fullscreen/min-height preview miðjað á `bg-[#fbf9f4]`.
- Lógó í stöðugri stærð, t.d. 156-180 px á mobile og aðeins stærra á desktop.
- Mjög mild hreyfing: pulse eða örlítið float.
- Engar gradient-orbs, bokeh, video eða þung media.
- Ekki setja UI í stórt floating card. Preview page má hafa einfaldar full-width sections, en loaderinn sjálfur á að líta út eins og raunverulegt loading state.

## Preview route plan

Búa til `app/preview/teskeid-loader/page.tsx`.

Mælt server query:

```ts
const { data: ideas } = await supabase
  .from('ideas')
  .select('title')
  .eq('is_public', true)
  .order('is_featured', { ascending: false })
  .order('votes_count', { ascending: false })
  .limit(8)
```

Ástæða:

- `app/page.tsx` notar nú þegar public hugmyndir með `.eq('is_public', true)`.
- Loaderinn þarf aðeins `title`; ekki nota `select('*')`.
- Drög, falin atriði, admin-gögn og óútgefnar hugmyndir mega ekki birtast.

Preview page skal:

1. Setja `metadata.robots = 'noindex'`.
2. Nota `PreviewBanner` eins og núverandi preview pages.
3. Sýna aðal-loader með live public titles.
4. Sýna fallback útgáfu með tómum `ideaTitles` svo Stebbi sjái hegðun þegar gögn vantar.
5. Ekki setja loaderinn inn í app-wide `loading.tsx`, `layout.tsx` eða route transitions ennþá.

## Messages

Bæta við textum í bæði `messages/is.json` og `messages/en.json`, líklega undir `teskeid.loader`.

Tillaga íslenska:

```json
"loader": {
  "loadingLabel": "Hleður Teskeið",
  "fallbackIdeaTitle": "Allt í Teskeið",
  "previewTitle": "Teskeið-loader",
  "previewDescription": "Róleg loading-staða með lógóinu og birtum hugmyndum úr hugmyndabankanum.",
  "livePreview": "Með birtum hugmyndum",
  "fallbackPreview": "Fallback ef hugmyndir finnast ekki"
}
```

Tillaga enska:

```json
"loader": {
  "loadingLabel": "Loading Teskeið",
  "fallbackIdeaTitle": "Everything in Teskeið",
  "previewTitle": "Teskeið loader",
  "previewDescription": "A calm loading state with the logo and published ideas from the idea bank.",
  "livePreview": "With published ideas",
  "fallbackPreview": "Fallback when no ideas are available"
}
```

Preview textar mega vera einfaldir, en halda þeim samt í messages til að fylgja repo-reglu.

## Tests

Bæta við `lib/__tests__/teskeid-loader.test.tsx`.

Lágmarkspróf:

1. Renderar `role="status"` með `loadingLabel`.
2. Renderar canonical lógó sem decorative, ekki sem sérstakt `img` role.
3. Sýnir fyrsta hreina hugmyndaheitið.
4. Trim/deduplicate/tómir strengir virka.
5. Fallback birtist þegar `ideaTitles` er tómt eða aðeins whitespace.
6. Titill cycle-ar eftir `intervalMs` þegar `prefers-reduced-motion` er ekki virkt.
7. Titill cycle-ar ekki þegar `prefers-reduced-motion: reduce` er virkt.

Í Vitest þarf líklega að mocka `window.matchMedia`.

## Prófanir sem Claude Code skal keyra

```powershell
npm run type-check
npm run test:run
```

Ef Next route eða server component breytist, keyra líka:

```powershell
npm run build
```

Ekki ræsa dev server; Stebbi sér um localhost samkvæmt vinnulagi.

## Handpróf fyrir Stebba

Stebbi opnar:

```txt
/preview/teskeid-loader
```

Athuga:

1. Lógóið er miðjað, rólegt og notar `10,5` merkinguna.
2. Hugmyndaheiti birtast eitt í einu.
3. Skiptingin er ekki of hröð, hávær eða layout-shifty.
4. Mobile 360-460 px lítur snyrtilega út.
5. Desktop lítur ekki út eins og landing page heldur preview/loading state.
6. Ef Supabase/gögn vantar sést rólegt fallback.

## Stoppskilyrði

Claude Code skal stoppa og skila handoff ef:

1. Það þarf SQL, migration, RLS eða grants.
2. Public idea query virkar ekki án breiðari gagnagrunnsaðgangs.
3. Loaderinn þarf að fara strax í production navigation/loading states.
4. Nauðsynlegt reynist að breyta `TeskeidLogo` sjálfu eða canonical SVG paths.
5. Tests krefjast stórra test setup breytinga.
6. Það kemur upp ágreiningur milli preview og production lógó assets.

## Sérstök áhætta

- Gagnaleki: aðeins `ideas.title` með `is_public = true`.
- Motion: virða `prefers-reduced-motion`.
- UX: ekki tefja raunverulegt app til að animation fái að klárast.
- Scope creep: ekki breyta #17 eða setja hugmyndir á `/heim` í þessu verki.
- Scope creep: ekki setja loaderinn global fyrr en Stebbi hefur samþykkt preview.

## Handoff frá Claude Code eftir framkvæmd

Claude Code skal skila:

1. Hvað var gert.
2. Breyttar skrár.
3. Keyrðar skipanir og exit codes.
4. Hvort SQL var skrifað eða keyrt. Vænt svar: nei.
5. Hvort loaderinn er aðeins preview eða kominn í production flow.
6. Slóð fyrir Stebba til að skoða.
7. Opin atriði fyrir Codex rýni.

