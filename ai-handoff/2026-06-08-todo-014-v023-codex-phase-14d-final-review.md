# TODO #14 - V023 Codex review of Claude Code V022

Dagsetning: 2026-06-08
Tengt TODO: #14 - Oryggisforsendur fyrir opna beta
Rynt skjal: `ai-handoff/2026-06-08-todo-014-v022-claude-phase-14d-final-regression-handoff.md`
Stada: Ekki samthykkt enn

## Nidurstaða

Codex samþykkir ekki V022 sem lokafrágang enn.

Kjarnakóðinn í `lib/auth/ip-rate-limit.ts` lítur betur út eftir V022: dynamic
RPC error-code er ekki lengur loggaður og `checkIpRateLimit()` heldur áfram að
fail-open-a án þess að geyma veika IP-hasha. Hins vegar eru tvö blocking atriði
í lokaáfanganum: type-check fellur og verkefnastatus fyrir #14 er ósamræmdur.

## Findings

### High - `npm run type-check` fellur á nýju SQL contract prófunum

Nýju static SQL-prófin í `lib/__tests__/ip-rate-limit.test.ts` nota `s`
regular-expression flagið á nokkrum stöðum:

- `lib/__tests__/ip-rate-limit.test.ts:241`
- `lib/__tests__/ip-rate-limit.test.ts:245`
- `lib/__tests__/ip-rate-limit.test.ts:249`
- `lib/__tests__/ip-rate-limit.test.ts:253`
- `lib/__tests__/ip-rate-limit.test.ts:264`
- `lib/__tests__/ip-rate-limit.test.ts:268`

TypeScript-target verkefnisins leyfir ekki þetta flag og `tsc --noEmit` skilar
TS1501. Þetta blokkar final acceptance, jafnvel þó Vitest sjálft standist.

Mælt lagfæring: breyta þessum regexum þannig að þeir þurfi ekki dotAll `s`,
til dæmis með `[\s\S]*` í stað `.*` yfir línuskil, eða nota litla helper-aðferð
til að normalisera SQL áður en regex er keyrt. Codex mælir ekki með að hækka
`tsconfig` target bara fyrir þessi próf nema Claude Code staðfesti víðari áhrif.

### Medium - #14 er bæði í `TODO.md` og `DONE.md`

`TODO.md:26` hefur enn `#14` kaflann og `TODO.md:29` merkir hann sem
`Lokið - 2026-06-08`, á sama tíma og `DONE.md:110` skráir #14 sem lokið atriði.

Þetta brýtur verkefnisregluna sem Stebbi setti: `TODO.md` á aðeins að innihalda
opin atriði og lokin atriði eiga að færast yfir í `DONE.md`.

Claude Code þarf að velja eina hreina stöðu:

- Ef #14 telst code-complete og Stebbi vill geyma production keyrslu sem
  rollout-skref, þá á að fjarlægja allan #14 kaflann úr `TODO.md` og halda
  `DONE.md` sem sögu.
- Ef #14 telst ekki lokið fyrr en `sql/42_ip_rate_limit.sql`,
  `AUTH_CODE_SECRET` og proxy IP-header hafa verið staðfest í production, þá á
  #14 að vera áfram opið í `TODO.md` og ekki merkt lokið í `DONE.md` strax.

Núverandi ástand gerir of auðvelt að missa sjónar á því að IP/abuse-vörnin er
ekki virk í production fyrr en SQL 42 hefur verið keyrt og production stillingar
hafa verið staðfestar.

### Low - `DONE.md` fullyrðir Codex-staðfestingu fyrir final V022

`DONE.md:113` segir `Staðfest af Codex: já (v017, v021 - eftir Phase 14C og
14B follow-up)`. V017 og V021 staðfestu fyrri áfanga, en ekki final V022
fráganginn. Þar sem þessi V023-rýni hafnar final V022 eins og hún stendur, þarf
þessi lína annað hvort að bíða lokasamþykkis eða orða það nákvæmar sem fyrri
áfangarýni.

## Staðfestingar Codex

Keyrt af Codex:

- `npm run test:run` - exit 0
  - 28 test files passed
  - 813 passed, 22 skipped, 8 todo
- `npm run type-check` - exit 1
  - TS1501 í `lib/__tests__/ip-rate-limit.test.ts` vegna `s` regex-flags

Codex keyrði ekki `npm run build` eftir type-check failure, því build myndi
ekki vera marktækt final green signal fyrr en TypeScript-villan er löguð.

Codex keyrði ekki SQL og snerti ekki Supabase eða production.

## Næsta skref fyrir Claude Code

1. Laga regexana í `lib/__tests__/ip-rate-limit.test.ts` án þess að breyta
   víðara TypeScript-targeti nema sérstaklega rökstutt.
2. Keyra `npm run type-check` og `npm run test:run` aftur.
3. Laga stöðu #14 þannig að `TODO.md` og `DONE.md` séu ekki ósamræmd.
4. Skila nýju handoffi með niðurstöðu prófana og skýrri ákvörðun um hvort
   SQL 42 production keyrsla sé hluti af #14 eða sér rollout-skref fyrir #9.

## Áhætta sem stendur eftir

V022 breytir ekki því að `sql/42_ip_rate_limit.sql` hefur aðeins verið skrifað,
ekki keyrt í production samkvæmt handoffinu. Þar til það hefur verið keyrt og
`AUTH_CODE_SECRET` ásamt IP-headerum hafa verið staðfest, er IP/abuse-rate-limit
ekki raunveruleg production-vörn.
