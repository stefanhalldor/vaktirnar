# TODO #16 / morning TODO bundle - Codex handoff plan

**Dagsetning:** 2026-06-08 23:46
**Agent:** Codex
**Tengd TODO:** #16, #18, #15, #12, #20, #21
**Tilgangur:** Velja hvað Claude Code getur tekið saman í fyrramálið hratt og örugglega eftir að opnunin var gefin út.

## Stutt niðurstaða

Codex mælir með litlum morgunpakka sem sameinar aðeins lágáhættu UI/copy/i18n breytingar:

1. Hreinsa TODO stöðu fyrir #21.
2. Klára #16 með stuttri mobile-first beta væntingastýringu.
3. Klára #18 með persónulegri headerkveðju.
4. Klára #15 með íslenskari dagsetningum á lánaspjöldum.
5. Taka #12 aðeins ef fyrstu þrjú virka hreinlega og próf haldast græn.

Ekki blanda #23, #22, #7, #13, #17, #8 eða #10 inn í sama pakka. Þau eru annað hvort auth/RLS/routing næm, þurfa betri ákvörðun frá Stebba, eða eru einfaldlega stærri en þau líta út fyrir að vera.

## Af hverju þessi pakki

Þessi atriði snerta aðallega texta, formattera og litla UI hegðun. Þau ættu ekki að þurfa SQL, Supabase breytingar, RLS breytingar, deployment stillingar eða nýja auth hegðun.

Það gerir þau hentug fyrir morgunvinnu eftir útgáfu: Claude Code getur haldið breytingunum afmörkuðum, keyrt venjuleg próf og skilað Codex rýni áður en Stebbi fer í næstu stærri opnun.

## Mjög mikilvægt áður en byrjað er

Claude Code má ekki breyta sömu skrám og Codex ef Codex er enn með opna breytingu. Athuga fyrst:

```powershell
git status --short
```

Ef `TODO.md`, `DONE.md`, `messages/is.json`, `messages/en.json`, `app/auth-mvp/heim/page.tsx` eða `components/loans/LoanCard.tsx` eru þegar breytt af Stebba eða öðrum agent, skal lesa diff áður en haldið er áfram.

## Skref 1 - TODO hygiene fyrir #21

**Markmið:** `TODO.md` innihaldi aðeins opin atriði.

Codex sá að #21 er í `DONE.md` en virðist enn vera í `TODO.md` sem lokið atriði og líklega líka í forgangstöflu.

Claude Code skal:

1. Fjarlægja #21 úr forgangstöflu í `TODO.md`.
2. Fjarlægja #21 kaflann úr `TODO.md`.
3. Ekki fjarlægja tengt orðalag inni í #8 ef það lýsir enn Teskeið-loader/merkingarhugmyndum.
4. Ekki breyta `DONE.md` nema það vanti raunverulega færslu þar.

**Áhætta:** Lág. Þetta er project-status hreinsun, ekki runtime breyting.

## Skref 2 - TODO #16: mobile-first beta væntingastýring

**Markmið:** Stebbi vill að beta upplifunin segi skýrt, en stutt, að Teskeið sé mobile-first og best prófuð í síma.

Tillaga að nálgun:

1. Finna réttan stað í núverandi innskráningar- eða heimaflæði, líklega þar sem beta/aðgangstextar eru nú þegar sýndir.
2. Bæta við einum stuttum texta, ekki nýjum stórum section.
3. Setja texta í `messages/is.json` og `messages/en.json`.
4. Forðast að setja þetta í modal, toast eða banner sem truflar venjulega notkun.

Tillaga að íslenskum texta:

> Teskeið er mobile-first beta og virkar best í síma eins og staðan er núna.

Enska má vera einföld, t.d.:

> Teskeið is a mobile-first beta and currently works best on a phone.

**Ekki gera:** Ekki fela desktop, ekki breyta routing, ekki setja beta label á öll tól. Stebbi sagði sérstaklega að "Lánað og skilað" sé eina raunverulega virka teskeiðin sem þarf að opna núna.

**Áhætta:** Lág ef þetta er bara copy/i18n.

## Skref 3 - TODO #18: persónulegri headerkveðja

**Markmið:** Gera `/auth-mvp/heim` persónulegri án þess að bæta við nýrri profile- eða auth-flækju.

Núverandi staða sem Codex sá:

- `app/auth-mvp/heim/page.tsx` sækir `displayName`.
- `messages/is.json` er með `teskeid.home.greeting = "Góðan dag, {displayName}"`.
- `messages/en.json` er með `teskeid.home.greeting = "Hello, {displayName}"`.

Tillaga:

1. Derive-a `firstName` úr `displayName` með einfaldri trimming/splitting virkni:
   - `displayName.trim().split(/\s+/)[0]`
   - Ef tómt, nota fallback.
2. Uppfæra greeting texta án þess að breyta profile schema eða Supabase query.
3. Halda fallback til staðar fyrir notendur án nafns.

Tillaga að íslenskum texta:

> {firstName}, þú ert með allt í teskeið!

Enska:

> {firstName}, you have everything in one teaspoon!

Ef enska orðalagið hljómar of skrýtið má hafa það einfaldara:

> {firstName}, everything is in one place.

**Áhætta:** Lág. Þetta er presentation-only. Passa samt að notandanafn sé ekki renderað í raw HTML og að test mock gögn haldist í takt.

## Skref 4 - TODO #15: íslenskar dagsetningar á lánaspjöldum

**Markmið:** Dagsetningar á lánaspjöldum verði náttúrulegri á íslensku, sérstaklega fyrir lánað/skilað dagsetningar.

Núverandi staða sem Codex sá:

- `components/loans/LoanCard.tsx` er með local `formatDate` og `formatLoanedAt`.
- `formatLoanedAt` notar `weekday` helper og fullan mánaðarnafnastíl.
- `due_at` notar styttri `day/month/year` formatter.
- `returned_at` virðist ekki birt sem dagsetning á kortinu núna.

Tillaga:

1. Halda breytingunni í `LoanCard` eða litlum helper ef það minnkar tvítekningu.
2. Nota locale-aware formatter, ekki handskrifa mánaðarnöfn.
3. Fyrir date-only gildi eins og `loaned_at`, parse-a `YYYY-MM-DD` sem local date eins og núverandi kóði gerir til að forðast timezone dagavillur.
4. Fyrir `returned_at` ef það er timestamp, formatta með `is-IS` og `Atlantic/Reykjavik` ef það á við.
5. Bæta við eða uppfæra test fyrir íslenskan texta.

Mikilvægt: #19 snýst um að lesnir hlutir birtist ekki aftur sem `Nýlegt`. Ekki reyna að laga #19 í þessu skrefi nema það reynist mjög afmarkað. #19 er UX/state semantics og má ekki blandast inn í date formatting nema próf eða einföld athugun sýni augljósa regression.

**Áhætta:** Lág til miðlungs. Date formatting getur brotnað á timezone edge cases, sérstaklega ef timestamp og date-only eru meðhöndluð eins.

## Skref 5 - TODO #12: skýrari kosningatakki, aðeins ef tími er eftir

**Markmið:** Gera kosningatakka skýrari án þess að breyta voting logic.

Núverandi staða sem Codex sá:

- `components/teskeid/VoteButton.tsx` er með hardcoded íslenska texta:
  - `Kjósa þessa hugmynd`
  - `Kosið`
  - `Kjósa`
  - `{count} atkvæði`

Tillaga:

1. Færa texta í `messages/is.json` og `messages/en.json`.
2. Halda mutation/vote logic alveg óbreyttri.
3. Gera primary/full button skýrari, t.d.:
   - `Ég vil sjá þetta í Teskeið`
   - eða styttra: `Vil fá þetta`
4. Halda compact/icon variant þröngum fyrir mobile.
5. Prófa að texti brotni ekki illa í mobile.

**Áhætta:** Lág ef aðeins texti og i18n. Miðlungs ef byrjað er að breyta layout eða vote state. Ef það gerist, stoppa og skila sérstöku handoff.

## Atriði sem á ekki að taka í þessum morgunpakka

### TODO #23 - breyta nafni á lánaða hlutnum

Ekki taka með. Þetta getur snert réttindi, RPC, `update_loan`, eiganda/skráningaraðila/lánveitanda og mögulega RLS/security boundary. Þetta þarf sérstaka rýni.

### TODO #22 - hreinsa sýnilegar `/auth-mvp/` slóðir

Ekki taka með. Claude Code ráðlagði þegar að geyma þetta. Þetta getur haft áhrif á deep links, redirects, middleware, callback slóðir og bookmarks.

### TODO #20 - bottom bar innskráning þarf stundum tvísmell

Ekki taka með nema aðeins sem rannsókn. Þetta þarf líklega mobile repro. Ef Claude Code skoðar þetta, þá skal skila stuttri niðurstöðu, ekki breyta routing/nav vítt án staðfestingar.

### TODO #7 og #13

Ekki taka með. Þetta snertir auth/session/admin aðgang og á að fá sér plan.

### TODO #17, #8 og #10

Ekki taka með. Þetta eru stærri product/UX verkefni eða þurfa betri ákvörðun um gögn og opnun.

## Prófanir

Claude Code skal keyra að lágmarki:

```powershell
npm run type-check
npm run test:run
```

Ef breytingar snerta Next rendering, messages eða route behavior, keyra líka:

```powershell
npm run build
```

Stebbi keyrir sjálfur localhost/dev server. Ekki ræsa dev server nema Stebbi biðji sérstaklega um það.

## Handpróf fyrir Stebba

Eftir breytingar ætti Stebbi að opna:

1. `/innskraning` á mobile breidd og staðfesta að beta/mobile-first texti sé skýr en ekki fyrirferðarmikill.
2. `/auth-mvp/heim` og staðfesta að kveðjan noti eiginnafn þegar nafn er til staðar.
3. `/auth-mvp/lanad-og-skilad` og staðfesta að dagsetningar séu eðlilegar á íslensku.
4. Ef #12 var tekið: hugmyndasvæði þar sem kosningatakki birtist og staðfesta að takkinn sé skýr á mobile.

## Stoppskilyrði

Claude Code skal stoppa og skila Codex handoff ef eitthvað af þessu gerist:

1. Þarf SQL migration eða Supabase breytingu.
2. Þarf að breyta RLS, grants, auth eða middleware.
3. #23 reynist nauðsynlegt til að klára önnur atriði.
4. Tests krefjast víðtækrar refactor breytingar.
5. `git status` sýnir óskýr conflict við breytingar frá Stebba eða Codex.

## Handoff frá Claude Code eftir vinnu

Claude Code skal skila:

1. Hvaða TODO voru kláruð.
2. Hvaða TODO voru ekki tekin og af hverju.
3. Breyttar skrár.
4. Keyrðar skipanir og exit codes.
5. Hvort SQL var skrifað eða keyrt. Vænt svar fyrir þennan pakka: nei.
6. Hvaða handpróf Stebbi þarf að gera.
7. Hvort eitthvað eigi að færast úr `TODO.md` í `DONE.md`.

