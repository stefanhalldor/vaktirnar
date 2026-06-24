# #37 v051 - Ólesið: uppfært plan eftir Codex-rýni v050

**TODO:** #37 - `Nýlegt` sýni öll ólesin events og breytingasamhengi

**Agent:** Claude Code

**Rýnt:** v050 Codex-rýni á v049 plan. Þetta skjal svarar öllum findings Codex og uppfærir planið áður en framkvæmd hefst.

---

## Svar við findings Codex

### 1. Canonical email lookup (Medium)

**Staðfesting:** `loan_invitations` geymir aðeins `recipient_email_normalized`, ekki raw email. Eftir SQL56 er þetta canonical Gmail-form (punktalaust). `lookupUserIdByEmail` notar `admin.auth.admin.getUserByEmail(email)` sem er exact match á `auth.users.email` -- sem er það sem notandinn skrifaði við skráningu og getur verið punktað Gmail.

**Niðurstaða:** Þetta er sömu best-effort takmörkun sem þegar er í kerfinu. `performInvitationSend` notar `lookupUserIdByEmail` með raw email sem kemur úr `reserve_invitation_send` RPC -- þar virkar það vegna þess að RPC skilar original email. Hér hefðum við aðeins canonical form. Ef við leituðum með canonical gmail (t.d. `abgmail.com`) myndi exact lookup missa notanda sem skráði sig sem `a.b@gmail.com`.

**Ákvörðun:** Þetta verður best-effort með þekkta takmörkun fyrir Gmail-notendur með punkta. Það þýðir:
- Flestir notendur (non-Gmail, Gmail sem skrádist með canonical form) fá notification.
- Gmail-notendur með punkta í skráðu netfangi fá ekki notification (sama og ef þeir væru óskráðir).
- Þetta er ekki öryggismál: worst case er að notification berst ekki, ekki að röng notification fari til ótengds notanda.
- Mælt er með að skipta `lookupUserIdByEmail` út fyrir robust canonical lookup í sérstakri útgáfu þegar við höfum SQL-helper sem leitar eftir canonical email.

**Kóðaathugasemd sem bætist við:**
```typescript
// Best-effort: uses recipient_email_normalized (canonical form post-SQL56).
// Gmail users who registered with a dotted address may not be found by this
// exact lookup. This is an accepted limitation — see TODO #37 / sql/56.
```

**Prófanir sem bætast við í `actions.test.ts`:**
- Regular email: pending recipient fær event
- Lookup skilar null: ekkert throw, engin error, actor fær sitt event óbreytt
- (Gmail dot-case: skjalfest sem known limitation, ekki prófað með mock vegna að mock gerir exact lookup)

---

### 2. Timestamp-format (Medium)

**Lausn:** Nota `weekdays` og `months` úr `messages/is.json` (þegar til staðar) í stað `Intl.DateTimeFormat` fyrir íslensk heiti. Island = UTC allan ársins hring (engin sumartíma-breyting), svo tímaútdráttur beint úr UTC ISO timestamp er nákvæmur.

**Fall sem bætist við `heim/page.tsx`:**

```typescript
function formatEventTimestamp(
  isoStr: string,
  weekdays: Record<string, string>,
  months: Record<string, string>,
): string {
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ''
  const weekday = weekdays[String(d.getUTCDay())] ?? ''
  const day = d.getUTCDate()
  const month = months[String(d.getUTCMonth())] ?? ''
  const hh = String(d.getUTCHours())
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${weekday} ${day}. ${month} kl. ${hh}:${mm}`
}
```

**i18n:** Þarf ekkert nýtt messages-lykill -- fæst úr `t('weekdays.N')` og `t('months.N')` sem þegar eru til. Skilagildi er `miðvikudaginn 24. júní kl. 7:40`.

**Í `RecentEventDisplay`:** Bæta `occurredAtLabel: string` (ekki raw `occurredAt`).

**Prófanir:** Próf í `home-page.test.tsx` með fastri dagsetningu:
- `2026-06-24T07:40:00Z` á að gefa `miðvikudaginn 24. júní kl. 7:40`
- Prófað með mock `weekdays`/`months` objektum

**Mobile/UI:** `occurredAtLabel` renderat sem `text-xs text-muted-foreground` undir `event.label` í réðinni. Texti getur myndað línubil á mjóum skjám -- þetta er ásættanlegt og brotnar náttúrulega.

**Orðalag til Stebba:** Format verður `miðvikudaginn 24. júní kl. 7:40` -- með lágstaf á vikudegi. Ef Stebbi vill Hástaf (`Miðvikudaginn`) þarf eitt `charAt(0).toUpperCase() + rest` -- en Claude Code leggur til lágstaf eins og núverandi `weekdays` eru.

---

### 3. `from=heim` scope (Medium)

**Skýr scope-regla:**

| Aðstæður | Back-href |
|---|---|
| Opið úr Ólesið (`viewHref?from=heim`) | `/auth-mvp/heim` |
| Opið beint úr lánalista | `/auth-mvp/lanad-og-skilad` |
| Opið úr edit-síðu (edit → back → detail) | `/auth-mvp/lanad-og-skilad` |

**Edit-flow er out-of-scope:** Edit-síðan (`breyta/[id]/page.tsx`) notar `href={/auth-mvp/lanad-og-skilad/${id}}` sem back-link (á detail). Hún mun EKKI varðveita `?from=heim`. Ef notandi fer: Ólesið → detail(`?from=heim`) → edit → back (til detail) → back -- þá fer hann á `/auth-mvp/lanad-og-skilad`. Þetta er ásættanlegt í fyrstu útgáfu.

**Útfærsla:**
- `heim/page.tsx`: `viewHref = /auth-mvp/lanad-og-skilad/${id}?from=heim`
- `[id]/page.tsx`: tekur `searchParams: Promise<{ from?: string }>`, athugar `from === 'heim'`, velur back-href
- `backToList` i18n-lykill heldur: "← Til baka" -- virkar í báðum tilfellum
- Ef við viljum aðskilin labels (`Til baka í Teskeiðar` vs `Til baka í lista`) þarf nýja lykla. Claude Code mælist til að nota sama `backToList` label í fyrstu útgáfu til að halda scope þröngum.

**Prófanir í `loan-pages.test.tsx`:**
- `from=heim` í searchParams → back-href = `/auth-mvp/heim`
- Engin `from` í searchParams → back-href = `/auth-mvp/lanad-og-skilad`
- `from=annad` (óþekktur gildi) → fallback á `/auth-mvp/lanad-og-skilad`

---

### 4. Uppfærður prófalisti (Medium)

Keyrður eftir framkvæmd:

```
npm run type-check
npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/actions.test.ts lib/__tests__/loan-pages.test.tsx
```

**Ný/uppfærð próf:**

**`home-page.test.tsx`:**
- `loan_updated` með einu `item_name` change → label `Breytt nafn: ...`
- `loan_updated` með einu `note` change → label `Breytt athugasemd: ...`
- `loan_updated` með einu `due_at` change → label `Breyttur skiladagur: ...`
- `loan_updated` með einu `loaned_at` change → label `Breytt lánsdagsetning: ...`
- `loan_updated` með blönduðum breytingum → label `Breytt: ...`
- `occurredAtLabel` birtist í listareð (t.d. `miðvikudaginn 24. júní kl. 7:40`)
- Recipient email birtist ekki í label, drawer eða payload

**`actions.test.ts`:**
- `updateLoan` með pending invitation: `recordRecentEvent` kallað tvisvar (actor + recipient)
- Actor event: `initiallyRead: true`
- Recipient event: engin `initiallyRead` (default = false)
- `lookupUserIdByEmail` skilar null: aðeins actor event skráð, engin throw
- `updateLoan` á loan án invitation: aðeins actor event

**`loan-pages.test.tsx`:**
- `?from=heim` → back-href = `/auth-mvp/heim`
- Engin `from` → back-href = `/auth-mvp/lanad-og-skilad`
- `?from=annad` → fallback á `/auth-mvp/lanad-og-skilad`

---

## Samantekt á breytingum

| Skrá | Breyting |
|---|---|
| `lib/recent-events/types.ts` | Bæta `occurredAtLabel: string` við `RecentEventDisplay` |
| `app/auth-mvp/heim/page.tsx` | `occurredAtLabel`, `pickLoanUpdatedLabelKey`, `formatEventTimestamp`, `viewHref?from=heim`, nýir label-lyklar |
| `app/auth-mvp/heim/RecentSection.tsx` | Birta `occurredAtLabel` sem `text-xs text-muted-foreground` undir label |
| `app/auth-mvp/lanad-og-skilad/[id]/page.tsx` | Lesa `searchParams.from`, velja back-href |
| `lib/loans/actions.ts` | `updateLoan` -- senda best-effort event til pending recipient |
| `messages/is.json` | Nýir event label-lyklar (5 stk) |
| `messages/en.json` | Sömu nýju lyklar á ensku |
| `lib/__tests__/home-page.test.tsx` | Ný próf |
| `lib/__tests__/actions.test.ts` | Ný próf |
| `lib/__tests__/loan-pages.test.tsx` | Ný próf |

**Ekki breytt:**
- SQL, RPC, RLS, grants, auth
- `TODO.md`, `DONE.md`
- Vandamál #3 (edit dagsetningar á accepted loans)

---

## Spurning til Stebba áður en framkvæmd hefst

Tvær ákvarðanir þar sem Stebbi þarf að samþykkja:

1. **Gmail-punktar:** Notification til pending recipient er best-effort -- Gmail-notendur með punkta í skráðu netfangi fá hugsanlega ekki notification. Ásættanlegt?

2. **Timestamp-lágstafur:** `miðvikudaginn 24. júní kl. 7:40` (lágstafur á vikudegi eins og `messages/weekdays` eru) vs. `Miðvikudaginn 24. júní kl. 7:40` (hástafur). Hvað vill Stebbi?

---

## Localhost checks for Stebbi

Eftir framkvæmd:

1. `/auth-mvp/heim` sem innskráður notandi. Staðfesta að timestamp birtist undir heiti events, t.d. `miðvikudaginn 24. júní kl. 7:40`, án lárétts overflow á mobile.
2. Breyta nafni á hlut sem hefur mótaðila. Mótaðili á að sjá `Breytt nafn: ...` -- ekki `Breytt: ...`.
3. Breyta athugasemd. Mótaðili á að sjá `Breytt athugasemd: ...`.
4. Breyta skiladegi á pending boði (viðtakandi hefur ekki smellt "Þekki málið"). Skrá inn sem viðtakandi og staðfesta event í Ólesið.
5. Smella á event í Ólesið → Skoða → Til baka. Á að enda á `/auth-mvp/heim`.
6. Opna loan detail beint úr lánalista → Til baka. Á að enda á `/auth-mvp/lanad-og-skilad`.
7. Regresja: `loan_returned`, `loan_invitation_received` og önnur event labels breytast ekki.
8. Regresja: recipient email birtist hvergi í Ólesið.

---

## Óvissa / þarf að staðfesta

- Gmail-punkta-limitation staðfest -- Stebbi þarf að samþykkja best-effort nálgunina.
- Timestamp-lágstafur vs. hástafur -- Stebbi ákveður.
- Claude Code hefur ekki keyrt prófin enn -- þarf að staðfesta að `loan-pages.test.tsx` prófastrúktúr við `searchParams` virki eins og gert er ráð fyrir.
