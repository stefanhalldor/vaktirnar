# TODO #49 - Tengsl: loader þegar farið er milli lista og detail

**Frá:** Codex  
**Til:** Claude Code  
**Dagsetning:** 2026-06-22 23:43  
**Staða:** Addendum við Tengsl-lagfæringar, bið um rýni og framkvæmd  

## Samhengi

Stebbi tók eftir að þegar smellt er á tengilið í `/stillingar/tengsl`, eða
þegar farið er til baka úr `/stillingar/tengsl/[id]`, vantar sýnilegan loader á
meðan næsta síða er að opnast.

Þetta er sérstaklega áberandi núna þar sem Tengsl-síður sækja server-side gögn
úr Supabase og geta verið hægar ef verið er að lazy-upserta, merge-a eða sækja
sameiginlega lánavirkni.

## Núverandi mynstur

Það eru þegar til route-level loading screens sem nota `TeskeidLoader`, t.d.:

- `app/auth-mvp/heim/loading.tsx`
- `app/auth-mvp/minn-profill/loading.tsx`
- `app/auth-mvp/lanad-og-skilad/loading.tsx`
- `components/teskeid/TeskeidLoader.tsx`
- `messages/is.json` og `messages/en.json` undir `teskeid.loader`

`/stillingar/tengsl` virðist ekki hafa sambærilegt `loading.tsx` í route
segmentinu.

## Verkefni fyrir Claude Code

1. Bæta við loader fyrir `/stillingar/tengsl` og `/stillingar/tengsl/[id]` þegar
   App Router er að hlaða næstu server-renderuðu síðu.
2. Endurnýta núverandi `TeskeidLoader` og `teskeid.loader` texta ef það passar.
3. Passa að loader birtist bæði:
   - þegar smellt er á tengilið úr listanum
   - þegar smellt er á `← Til baka` úr detail-síðu
4. Forðast sérsmíðaðan spinner ef route-level `loading.tsx` leysir þetta.
5. Ef route-level `loading.tsx` dugir ekki vegna cached/instant navigation eða
   client-side transition hegðunar, skoða þá léttan client-side pending state á
   Link-um. Það ætti þó að vera fallback, ekki fyrsta leið.

## Tillaga að einfaldri útfærslu

Bæta líklega við:

- `app/stillingar/tengsl/loading.tsx`

Ef Next.js segment loading erfist niður í `[id]`, gæti ein skrá dugað fyrir bæði
listann og detail. Ef ekki, bæta einnig við:

- `app/stillingar/tengsl/[id]/loading.tsx`

Nota sama layout og núverandi loader:

- full-screen eða route-screen miðjaður loader
- `bg-[#fbf9f4]` / núverandi background consistency
- `TeskeidLoader` með `ideaTitles={[]}`
- `loadingLabel={t('loadingLabel')}`
- `fallbackIdeaTitle={t('fallbackIdeaTitle')}`

## Acceptance criteria

- Þegar Stebbi smellir á tengilið í `/stillingar/tengsl` sést loader ef næsta
  síða tekur smá tíma að renderast.
- Þegar Stebbi smellir á `← Til baka` úr `/stillingar/tengsl/[id]` sést loader
  ef listinn tekur smá tíma að renderast.
- Loader notar núverandi Teskeið loader, ekki nýtt ósamræmt útlit.
- Enginn hardcoded þýðanlegur texti fer í component.
- Engin breyting á auth, feature flag eða Supabase lógík.
- Loading screen veldur ekki layout flash sem skemmir mobile upplifun á 360-460 px.

## Prófanir sem Claude Code ætti að bæta eða keyra

Lágmarkspróf:

- Static/page test sem staðfestir að `app/stillingar/tengsl/loading.tsx` renderi
  `TeskeidLoader` eða role/status loader.
- Ef `[id]/loading.tsx` er bætt við, sama test fyrir detail loading.

Keyra:

- `npm run test:run -- lib/__tests__/teskeid-loader.test.tsx`
- relevant Tengsl page tests ef til eru, t.d.
  `npm run test:run -- lib/__tests__/tengsl-pages.test.tsx`
- `npm run type-check` ef breytingin snertir TS imports eða route files.

## Localhost checks for Stebbi

Prófa á localhost með innskráðum notanda sem hefur `tengsl` feature access.

1. Opna `/stillingar/tengsl`.
2. Í DevTools, stilla Network á hæga tengingu, t.d. Slow 3G eða Fast 3G.
3. Smella á tengilið.
   - Vænt niðurstaða: Teskeið-loader birtist á meðan detail-síðan opnast.
4. Á detail-síðu, smella á `← Til baka`.
   - Vænt niðurstaða: Teskeið-loader birtist á meðan listinn opnast.
5. Endurtaka á mobile viewport 360-460 px.
   - Vænt niðurstaða: loader er miðjaður, enginn horizontal scroll, ekkert texta-overlap.
6. Slökkva á throttling og prófa aftur.
   - Vænt niðurstaða: navigation má vera mjög hröð, en ekkert brotnar og enginn
     óeðlilegur flash/blank skjár sést.

Þetta snertir ekki Supabase schema eða production gögn. Ekki þarf að keyra SQL
fyrir þetta atriði.
