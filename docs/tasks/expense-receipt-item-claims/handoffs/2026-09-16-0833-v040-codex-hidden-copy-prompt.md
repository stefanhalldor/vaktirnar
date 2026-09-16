# v040 — falinn promptur og einföld afritun

Created: 2026-09-16 08:33 Atlantic/Reykjavik. Writer: Codex.
Task: expense-receipt-item-claims. Candidate:
C:/Users/Lenovo/AppData/Local/Temp/teskeid-task-expense-receipt-item-claims-20260913-v2.

## Plan og niðurstaða

Manual AI-hlutinn sýnir nú aðeins textann „Smelltu á „Afrita“ til þess að líma
texta yfir í gervigreindina þína og límdu svo svarið þaðan aftur inn hér að
neðan.“, sýnilegan `Afrita`-hnapp og JSON-svarreitinn.

Gamla details-skúffan og read-only prompt-textarea voru fjarlægð. Fyrirsögn
svarreitsins er nú „Límdu svarið úr gervigreindinni þinni hér.“ og undir honum
stendur Psst-skýringin um að myndin eigi ekki að fara aftur inn í Teskeið.
Hnappurinn
setur fullan, fyrirliggjandi `manualPromptText` beint á clipboard; notandinn sér
promptinn fyrst í sínu gervigreindarappi. Eftir árangur stendur `Afritað` á
hnappnum. Clipboard-villa sýnir stutta villu og tapar ekki JSON-svari.

## Skoðað og breytt

Skoðað: `WORKFLOW.md`, `AGENTS.md`, `Design.md`, canonical task, v039 handoff,
`SplitImport`, þýðingar og standalone receipt UI-próf.

Breytt:

- `components/receipt-split/SplitImport.tsx`
- `components/receipt-split/__tests__/standalone-receipt-ui.test.tsx`
- `messages/is.json`, `messages/en.json`
- canonical task document og þetta handoff

## Prófanir og evidence

- Focused `standalone-receipt-ui` → 12/12 PASS, exit 0.
- `npm.cmd run type-check` → PASS, exit 0.
- Afmarkað lint á breyttum TSX-skrám → PASS, exit 0; aðeins almenn Next lint
  deprecation notice.

Ekkert SQL var skrifað eða keyrt. Enginn dev server, provider-call, commit,
push, merge eða deploy var framkvæmdur.

## Ákvarðanir og áhætta

Prompturinn er áfram sami þýddi, versioned texti og áður; aðeins framsetning og
afritun breyttust. Clipboard API þarf öruggt localhost/HTTPS context. Ef browser
hafnar clipboard-aðgangi fær notandi villu og getur reynt aftur. Engin fallback-
skúffa er sýnd samkvæmt skýrri ósk Stebba.

Núverandi gate er áfram innskráð localhost-prófun. Engin static blocking finding
er opin.

## Breytingar á verkefnalýsingu

- Bætt við að manual AI-leið sýni aðeins leiðbeiningu, Afrita og svarreit.
- Skráð að fullur prompt sé falinn og fari beint á clipboard.
- Einfaldaður svartexti og myndaskýring færð undir innlímingarreitinn.
- Bætt v040 við breytingasögu; SQL/release-gátt er óbreytt.

## Localhost checks for Stebbi

Á `http://localhost:3004/auth-mvp/splitta-reikningnum`:

1. Staðfestu að engin „Klára með ChatGPT…“ skúffa eða prompt-textarea sjáist.
2. Smelltu á `Afrita`. Hnappurinn á að verða `Afritað`; límdu í eigið
   gervigreindarapp og staðfestu að fulli prompturinn hafi afritast.
3. Límdu JSON-svarið aftur í reitinn og staðfestu að drög verði til án myndar.
   Athugaðu einnig 360–390px breidd án zoom eða lárétts overflow.

Manual copy eitt og sér gerir ekkert provider-kall frá Teskeið og hleður engu
upp. Ekki nota viðkvæma raunmynd í ytra app nema þú hafir sjálfur ákveðið það.
**Ekki keyra SQL.**
