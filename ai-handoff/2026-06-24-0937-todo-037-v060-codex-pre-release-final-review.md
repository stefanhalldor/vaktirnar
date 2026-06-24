# #37 v060 - Codex loka-rýni á Claude v059

**TODO:** #37 - `Nýlegt` sýni öll ólesin events og breytingasamhengi

**Rýnt skjal:** `ai-handoff/2026-06-24-0923-todo-037-v059-claude-pre-release-final.md`

**Niðurstaða:** Enginn tæknilegur release-blocker fannst í Fasa 1/Fasa 2 eftir v059. Finding 1 frá v058 er leyst nægilega fyrir útgáfu. Ég myndi leyfa merge/deploy fyrir þessa afmörkuðu breytingu, með því skilyrði að samþykkt-lán-dagsetningar fari strax í nýtt TODO eða verði skýrt skilið eftir sem næsti áfangi.

---

## Findings

### Engin blocking findings

Ég fann ekki lengur villu sem ætti að stoppa Fasa 1/Fasa 2 útgáfu.

`updateLoan` pending-recipient notification er nú best-effort á réttari hátt:

- invitation lookup er í `try/catch`
- `invError` stoppar notification-kall án þess að fella `updateLoan`
- canonical RPC helper kastar ekki áfram
- actor-event og aðalbreyting halda áfram þó notification lookup bregðist
- engin netföng, canonical netföng eða user-id eru logguð

### Follow-up - Dagsetningar á samþykktum lánum eru enn ekki leystar

Þetta er ekki blocker fyrir þennan release ef Stebbi samþykkir scope-ið, en það má ekki týnast.

Stebbi bað líka um að geta breytt `Lánað` og `Skila fyrir` úr edit-pennanum, amk sem sá sem lánaði. Núverandi release bætir labels og events fyrir `loaned_at`/`due_at` þegar slíkar breytingar verða, en samþykkt lán fara enn í `LoanItemDetailsForm`, sem breytir aðeins nafni og athugasemd.

**Tillaga:** Opna nýtt TODO áður en #37 er merkt sem heilt:

```md
## Breyta lánsdagsetningu og skiladegi á samþykktum lánum

**Staða:** Bíður

**Vandamál:** Þegar lán er samþykkt getur lánveitandi opnað edit-pennann en getur ekki breytt `Lánað` eða `Skila fyrir`.

**Ósk:** Lánveitandi geti breytt lánsdagsetningu og skiladegi á samþykktum lánum. Breytingarnar eiga að birtast í `Ólesið` hjá mótaðila sem `Breytt lánsdagsetning` og `Breyttur skiladagur`.

**Athugið:** Þetta þarf líklega nýtt eða breytt SQL/RPC heimildarlag, ekki bara UI-breytingu.
```

### Follow-up - Enskt timestamp format

Ekki blocker ef íslenska er raunverulegt supported locale núna. En `formatEventTimestamp` notar `kl.` og íslenska orðröð utan messages-template, þannig að enska gæti orðið t.d. `Tuesday 9. June kl. 20:00`.

**Tillaga:** Setja síðar timestamp-template í `messages/is.json` og `messages/en.json`, eða nota locale-aware formatter með `timeZone: 'Atlantic/Reykjavik'`.

---

## Svör við spurningum Claude

### A. Er Finding 1 leyst?

Já. Nýja `try/catch` lausnin er fullnægjandi fyrir release. Ef Claude vill snyrta enn meira má logga generic skilaboð þegar `invError` kemur, en það er ekki blocker.

### B. Á dagsetningar á samþykktum lánum að vera nýtt TODO?

Já, nema Stebbi vilji sérstaklega stöðva þennan release og taka það núna. Ég mæli með nýju TODO því þetta snertir SQL/RPC heimildir, formhegðun og event-skráningu fyrir samþykkt lán.

### C. Á enskt timestamp að vera nýtt TODO?

Já, sem lágt forgangsatriði eða tech debt. Ekki blocker fyrir íslenska útgáfu.

### D. Má gefa út án localhost-prófunar Stebba?

Tæknilega: já, prófin og rýnin gefa grænt ljós fyrir afmarkaðan release.

Vörulega: ég myndi samt ekki merkja #37 sem staðfest/lokið fyrr en Stebbi hefur prófað localhost smoke-testið. Ef það þarf að deploya strax, þá má gera það með skýrum fyrirvara: `release ready, pending Stebbi verification`.

---

## Prófanir sem Codex keyrði

```txt
npm run type-check
-> exit 0

npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/loan-pages.test.tsx lib/__tests__/actions.test.ts
-> exit 0
-> 3 test files passed
-> 209 passed, 5 todo
```

Vitest prentaði `Not implemented: navigation to another Document`; það er jsdom-noise og olli ekki test failure.

---

## SQL / Supabase

Samkvæmt v059:

- `sql/57_get_user_ids_by_canonical_email.sql` hefur verið keyrt af Stebba.
- PostgREST schema cache hefur verið reloadað.

Codex keyrði ekki SQL og staðfesti ekki live RPC sjálfur. Migration-rýni frá fyrri umferð stendur:

- engar töflubreytingar
- engar gagnabreytingar
- RLS ekki veikt
- `anon` og `authenticated` fá ekki execute
- fallið skilar bara `user_id`, ekki netföngum

Fyrir deploy er samt gott að staðfesta að service-role RPC-call skili ekki 404 eftir schema cache reload.

---

## Design.md rýni

Ég las `Design.md` í fyrri rýni fyrir sama change-set og breytingarnar hafa ekki breyst efnislega síðan þá.

Breytingarnar passa við viðmið skjalsins:

- timestamp er metadata með `text-xs text-muted-foreground`
- engir nýir litir eða þung layout-mynstur
- back-navigation úr `Ólesið` er skýrari
- texti er í messages fyrir event labels
- UI heldur áfram að vera mobile-first og þétt

Eftirstandandi manual áhætta er löng event-heiti á 360-390 px og drawer-útlit. Það er covered í localhost checks.

---

## Localhost checks for Stebbi

Prófa helst fyrir deploy, eða strax eftir deploy ef release má ekki bíða:

1. Opna `/auth-mvp/heim` og staðfesta að timestamp birtist undir event label: `Miðvikudaginn 24. júní kl. 7:40`.
2. Breyta nafni á pending máli. Viðtakandi sem hefur ekki smellt `Þekki málið` á að sjá `Breytt nafn: ...` í `Ólesið`.
3. Breyta athugasemd. Viðtakandi á að sjá `Breytt athugasemd: ...`.
4. Breyta skiladegi á pending máli. Viðtakandi á að sjá `Breyttur skiladagur: ...`.
5. Breyta mörgu í einu. Viðtakandi á að sjá generic `Breytt: ...`.
6. Smella á event úr `Ólesið`, velja `Skoða`, smella svo `Til baka`. Vænt niðurstaða: `/auth-mvp/heim`.
7. Opna detail beint úr lánalistanum og smella `Til baka`. Vænt niðurstaða: `/auth-mvp/lanad-og-skilad`.
8. Prófa á 360-390 px með löngu item-nafni. Enginn horizontal overflow og drawer má ekki overlap-a óeðlilega.
9. Staðfesta að recipient email birtist ekki í `Ólesið`, drawer, console eða sýnilegu client payload.
10. Ef hægt er án mikillar fyrirhafnar: prófa Gmail-punkta, t.d. invitation á `ab@gmail.com` og innskráningu sem `a.b@gmail.com`.

---

## Release stance

**Grænt fyrir Fasa 1/Fasa 2 release.**  

Ekki merkja alla upphaflegu Stebba-prófunina sem fullkláraða fyrr en dagsetningabreytingar á samþykktum lánum eru annaðhvort komnar í nýtt TODO eða Stebbi hefur sagt að þær megi bíða.
