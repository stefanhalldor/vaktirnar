# Mobile proportion and status production release

Date: 2026-09-16 21:37
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-mobile-proportion-status
GoLive issue: `f0b0c3fd-e5b7-486c-937d-0a29c35fca25`

## Plan áfangans

Laga tvö staðfest mobile-vandamál: gera prósentu og brot innslegin með number
pad án þess að slá inn tákn, og samræma stöðupillur, hálfskipta liði og sýndar
fjárhæðir. Gefa afmarkaða breytingu beint út eftir græn gates.

## Hvað var raunverulega gert

- Hlutfall fékk val milli `Prósenta` og `Brot`.
- Prósenta notar decimal number pad og fast `%`; brot notar tvo numeric reiti
  með föstu `/` á milli.
- Báðar stöðupillur byrja óvaldar og má velja eða afvelja sjálfstætt.
- `Afgreitt` inniheldur tekna hluta hálfskiptra liða og sýnir fjárhæð þess hluta.
- `Útistandandi` sýnir ótekinn hluta og fjárhæð hans. Báðar valdar eða hvorug
  valin sýna allan liðinn einu sinni.
- User-based `Ekki mitt` heldur liðum í sérskúffu meðan eitthvað er útistandandi.
- Commit `b334906` var push-að fast-forward á `main`.
- Vercel production deployment `dpl_J59fm3L9GkkrY4qzshH6uAQ8UqEt` varð
  `Ready` og fékk `www.teskeid.is` alias.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`, sameiginlegt workflow og viðeigandi mobile/form/filter kaflar
  í `Design.md`.
- `SplitBoardV2`, quantity parser, summary logic, canonical pill filter,
  focused tests og íslensk/ensk skilaboð.

## Skrár sem voru breyttar

- `components/receipt-split/SplitBoardV2.tsx`
- `components/receipt-split/__tests__/standalone-receipt-v2-ui.test.tsx`
- `messages/is.json`
- `messages/en.json`
- Canonical verkefnalýsing
- Þetta handoff

## Skipanir og niðurstöður

- 3 focused test files, 21/21 tests: PASS.
- `npm.cmd run type-check`: PASS.
- Scoped ESLint: PASS.
- Locale JSON parse og `git diff --check`: PASS.
- `npm.cmd run build`: PASS; aðeins fyrirliggjandi warnings utan scope.
- `git push origin HEAD:main`: fast-forward `e277cd2..b334906`, success.
- Vercel inspect: `dpl_J59fm3L9GkkrY4qzshH6uAQ8UqEt`, production `Ready`.
- Production smoke: HTTP 200, væntur inngangstexti, `private, no-store` og
  `noindex, nofollow, noarchive` staðfest.

## Hvað mistókst eða var sleppt

Hreina worktree-ið hafði ekki `node_modules`. Fyrsta tilraun til að nota binary
úr öðru worktree leysti ekki module imports. Tímabundið, staðfest junction var
því búið til að fyrirliggjandi dependencies, gates keyrð og tengipunkturinn
fjarlægður án þess að target-mappan breyttist. Engin SQL-keyrsla eða
authenticated production-mutation var framkvæmd.

## Ákvarðanir

- Notandi slær aldrei inn `%` eða `/`; táknin eru stöðug framsetning.
- Status síar hluta liða. Hálfskiptur liður tilheyrir bæði útistandandi og
  afgreiddu sjónarhorni, með mismunandi sýndri fjárhæð.
- Hvorug valin pilla er canonical upphafsstaða og merkir allan reikninginn.
- Lausnin fylgir `Design.md`: 16 px input, minnst 40 px touch targets, engin
  lárétt overflow-háð control og mobile number-pad input modes.

## Áhætta sem er enn til staðar

Raunverulegt Safari/iOS keyboard og innskráð sjónræn production-yfirferð voru
ekki sjálfvirkt prófuð. DOM-próf staðfesta input modes, toggle-hegðun,
hálfskipta liði og réttar hlutfjárhæðir.

## Næsta skref og workflow-stopp

Release er lokið. Stebbi getur staðfest mobile-upplifun á raun; engin SQL-gátt
eða önnur eigendaaðgerð er nauðsynleg.

## Spurningar fyrir rýni

Engin blocking spurning.

## Supabase-áhrif

Engin schema-, RLS-, auth-, function- eða gagnabreyting. Ekkert SQL var skrifað
eða keyrt. Breytingin er eingöngu client-framsetning á fyrirliggjandi claim-gögnum.

## Breytingar á verkefnalýsingu

Canonical skjal skráir nú mobile innsláttarsamninginn, óvalda upphafsstöðu
pillna og part-based merkingu `Útistandandi` og `Afgreitt`.

## Localhost checks for Stebbi

Engin frekari localhost-gátt er nauðsynleg fyrir þessa útgáfu. Fyrir stutta
mobile production-yfirferð:

1. Opna hálfskiptan lið á `https://www.teskeid.is` í síma og opna `Annað magn`.
2. Velja `Prósenta`; staðfesta number pad, slá `10` og sjá fast `%`.
3. Velja `Brot`; staðfesta tvo number-pad reiti, slá `1` og `7` og vista `1/7`.
4. Endurhlaða: hvorug stöðupilla á að vera valin. Velja og afvelja hvora pillu.
5. Undir `Afgreitt` á hálfskiptur liður að sjást með tekinni fjárhæð; undir
   `Útistandandi` með fjárhæðinni sem er eftir.

Notið synthetic reikning; vistun magns er raunveruleg claim-mutation og sést
öðrum þátttakendum.

## Óvissa / þarf að staðfesta

Confidence er hátt á kóða, build og production deployment. Eftirstandandi
óvissa er aðeins raunveruleg keyboard-framsetning í tilteknu símtæki.
