# Opinber forsíðubirting

Date: 2026-09-16 19:15
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive follow-up: `fa8b49d9-3d10-4e1c-977d-4454d86b36a5`

## Plan áfangans

Laga localhost-frávik þar sem óinnskráður notandi sá ekki „Splitta reikningnum“
á opinberu forsíðunni.

## Hvað var raunverulega gert

- Opinber ready-listi er ekki lengur háður því að gagnagrunnsfærsla fyrir
  `splitta-reikningnum` sé til og merkt `launched`.
- Fyrirliggjandi færsla er endurnýtt án tvítekningar; annars er canonical kort
  búið til úr þýðingum.
- Ef færsla er til en hefur eldri stöðu er hún tekin úr hugmyndalistanum og sýnd
  einu sinni sem tilbúin Teskeið.
- Kortið heldur áfram í innskráningu með `next=/auth-mvp/splitta-reikningnum`.

## Skrár sem voru skoðaðar

- `app/page.tsx`
- `ReadyTeskeidCard`, Teskeið types og launcher/rollout reglur
- Forsíðu- og public-routing próf

## Skrár sem voru breyttar

- `app/page.tsx`
- `lib/teskeid/public-ready.ts`
- `lib/__tests__/public-ready-teskeidar.test.ts`
- Canonical verkefnalýsing og þetta handoff

## Skipanir og niðurstöður

- `npm.cmd run type-check`: PASS, exit 0.
- Tvær focused Vitest skrár: 18/18 PASS, exit 0.
- Scoped ESLint: PASS, exit 0.
- GoLive update: HTTP 200, exit 0.

## Hvað mistókst eða var sleppt

Ekkert mistókst. Server var ekki ræstur eða endurræstur af Codex. Engin SQL-
keyrsla, commit, push eða deploy var framkvæmd.

## Ákvarðanir

Birting tilbúinnar Teskeiðar er product-regla í kóða og ekki háð mutable idea-
stöðu eða `EXPENSE_RECEIPT_AI_ENABLED`. Innbyggð AI getur verið óvirk en manual
AI-leiðin gerir Teskeiðina áfram nothæfa.

## Áhætta sem er enn til staðar

Actual hot-reload/forsíðubirting og innskráningartengill bíða sjónrænnar
staðfestingar Stebba. Aðrar v059 localhost-gáttir eru enn óprófaðar.

## Næsta skref og workflow-stopp

Stebbi endurhleður `http://localhost:3004/` óinnskráður og staðfestir kortið.
Síðan heldur v059 multi-user/mobile checklist áfram.

## Spurningar fyrir rýni

Engin opin implementation-spurning.

## Supabase-áhrif

Engin. SQL186 helst exact uppsett og engin gagnagrunnsfærsla er skrifuð.

## Breytingar á verkefnalýsingu

Skýrt var að opinber birting sé tryggð í kóða og óháð idea-status/AI env.
Localhost-gáttin er áfram opin.

## Localhost checks for Stebbi

1. Endurhlaða `http://localhost:3004/` í óinnskráðum glugga.
2. Staðfesta „Splitta reikningnum“ undir „Tilbúnar Teskeiðar“, án tvítekningar.
3. Smella kortið og staðfesta innskráningarsíðu.
4. Skrá inn og staðfesta að leiðin opni `/auth-mvp/splitta-reikningnum`.
5. Athuga 360px breidd og að kortið valdi ekki overflow eða zoom.

## Óvissa / þarf að staðfesta

Actual browser-birting eftir hot reload er óstaðfest.
