# Claude Code Prompt: Vaktirnar redesign

Keyra í Claude Code í rót vaktirnar verkefnisins. Lestu þetta allt áður en þú byrjar.

---

## Samhengi

Vaktirnar er lítið studio í Reykjavík sem byggir einföld verkfæri fyrir íslenskar fjölskyldur. Fyrsta varan er **Krakkavaktin** — spjall milli forsjáraðila um eitt: getur barnið þitt leikið?

Núverandi forsíða og Krakkavaktin landing page þurfa endurhönnun. Markmiðin eru:

1. **Forsíðan** skal virka sem "studio" síða — kynna hugmyndina, byggja traust, beina notanda að Krakkavaktinni sem aðalvöru
2. **Krakkavaktin landing** skal selja vöruhugmyndina með lausnina fyrst, sýnilegum UI-dæmum, og biðlista-CTA (ekki prófun — varan er ekki tilbúin)
3. **Vöru-mockups** skal vera á aðskildum routes sem sýna hvernig varan mun virka. Þessir eru "coming soon" forskoðun, ekki virkur hugbúnaður

---

## Tæknilegt

Haltu þig við núverandi stack: Next.js 14 App Router, Tailwind, Supabase ef þarf.

**Reglur:**
- Engin gradientar í texta eða á stórum flötum (það er ein af villunum sem á að laga)
- Flatt, hreint, einfalt — skoðaðu Linear.app eða Basecamp fyrir innblástur
- Íslenska alls staðar í UI
- Accessibility: allir litir í nægilegri birtuskil, öll interactive element með focus state
- Mobile-first — þetta er PWA ecosystem, flestir lesa í símum
- Engar emoji nema í tilvitnunum/dæmum úr spjalli
- Engir drop-shadows eða blur effects á cards — bara 0.5px border og flatar bakgrunnir

**Litapaletta:**
- Hlutlaus bakgrunnur (`#FAFAFA` eða álíka, og white cards ofan á)
- Accent litur: fjólublár sem er nú þegar í notkun — má halda en ekki sem gradient risa-titli
- Semantic litir fyrir badges: amber (í þróun), green (virk), gray (læst/í hönnun), blue (verified/info)

---

## Hluti 1: Forsíðan (`/` eða `app/page.tsx`)

### Uppbygging, ofan frá niður:

**1. Hero**
- Lítil wordmark "VAKTIRNAR" efst (lítill caps, letter-spacing, secondary gray)
- H1: **"Einföld verkfæri fyrir íslenskar fjölskyldur"** (~28-32px, weight 500, ekki gradient)
- Paragraph undir: *"Lítið studio í Reykjavík sem byggir öpp sem leysa eitt, og gera það vel. Engar áskriftir sem ryðja sér inn í hvert horn lífsins."*
- Tvö CTA:
  - Primary (dark button): **"Skoða Krakkavaktina"** → `/krakkavaktin`
  - Secondary (outline): **"Um okkur"** → scrollar á `#um-okkur` sektion

**2. Vörurnar okkar**
- Lítil section heading: "VÖRURNAR OKKAR"
- Þrjú cards, stacked vertically á mobile, í grid á desktop:

  **Card 1 — Krakkavaktin (áberandi):**
  - Badge: amber `Í ÞRÓUN`
  - Titill: "Krakkavaktin"
  - Undirtitill: "Spjall milli forsjáraðila um eitt: getur barnið leikið?"
  - CTA: "Sjá nánar →" → `/krakkavaktin`
  - Border-secondary (aðeins sterkara border en hin)

  **Card 2 — Þriðja vaktin (læst):**
  - Badge: gray `Í hönnun`
  - Titill: "Þriðja vaktin"
  - Undirtitill: "Verkefni í þróun. Meira síðar á árinu."
  - opacity: 0.7, border-tertiary, engin CTA

  **Card 3 — Sjoppuvaktin (læst):**
  - Sama og #2 en með "Sjoppuvaktin" sem titil

**3. Um okkur (`#um-okkur`)**
- Section heading: "Á BAK VIÐ VAKTIRNAR"
- Avatar hringur + nafn + lýsing í horizontal layout:
  - Stebbi
  - *"Forritari, faðir og trúbador í Reykjavík. Ég byggi verkfæri sem ég hefði sjálfur viljað eiga — lítil, íslensk og einföld."*
- Pláss fyrir mynd seinna (nota initial "S" avatar í millitíð)

### Fjarlægja

- Stóra gradient "Vaktirnar" titilinn
- "Snjallar lausnir á hverri vakt" (vague tagline)
- Allar "Kemur fljótlega" merkingar — skipta út fyrir "Í hönnun" sem er heiðarlegra

---

## Hluti 2: Krakkavaktin landing (`/krakkavaktin`)

### Uppbygging, ofan frá niður:

**1. Hero**
- Badge: amber `Í ÞRÓUN`
- H1: **"Krakkavaktin er spjall um eitt: getur barnið þitt leikið?"** (~28-32px, weight 500)
- Paragraph: *"Engar tilkynningar um allt mögulegt, engin „séð" merki, engin yfirlit. Bara já, nei, hvenær og hvar."*

**2. Spjall-demo (stórt UI-dæmi)**
- Embed-að "fake" spjall sem sýnir vöruna í notkun
- Haus: avatar-stack með þremur skörandi hringum (S, J, H), titill "Siggi, Jóna & Hófí", undirtitill "4 forsjáraðilar · hjá Stebba", labeli "LEIKVAKT" til hægri
- Dagsetningar-divider: "miðvikudagur · 14:02"
- Skilaboð (í þessari röð):
  1. Anna (f. Jónu, verified ✓): "Getur Siggi leikið við Jónu eftir skóla í dag?"
  2. Stebbi (f. Sigga, verified ✓): "Já! Til 17. Hjá okkur?"
  3. Anna: "Frábært, kem með hana um 15 👍"
  4. System divider: "16:05 · Hófí bættist í leikvaktina"
  5. System message card sem sýnir að Stebbi bætti við Hófí (5 ára) og forsjáraðilum hennar (Bergur & Kristjana, báðir verified ✓)
  6. Stebbi: "Hófí datt inn líka 🙂 Sæki allar þrjár á sama tíma, 17?"
  7. Kristjana (f. Hófíar, verified ✓): "Takk fyrir! Hentar okkur fullkomlega 🙏"
- Footer í spjallinu: "Smelltu á nafn til að sjá staðfestan prófíl · spjall eyðist þegar leikvakt er lokið"

**Mikilvæg UI-regla í spjallinu:** nafn forsjáraðila er alltaf sýnt með barninu í samhengi. Dæmi: "Anna · forsj. Jónu" fyrir ofan skilaboðin. Verified checkmark kemur strax á eftir nafninu í blue.

**3. Messenger samanburður (stutt málsgrein)**
- *"Messenger virkar — en er fullt af öllu hinu sem þú vilt ekki pæla í þegar þú ert bara að reyna að skipuleggja leik. Krakkavaktin er lítill, rólegur staður fyrir þetta eina samtal."*

**4. "Hvers vegna virkar þetta" grid**
- 4 cards í 2x2 grid (stacked á mobile):
  1. **Bara spjall, ekkert fleira** — "Ein spurning, eitt svar. Engin yfirlit."
  2. **Barnið í fókus** — "Samtalið snýst um Sigga, aldrei foreldrana."
  3. **Spjall eyðist** — "Þegar leik er lokið er þetta farið."
  4. **Enginn kvíði** — "Engar „séð" merkingar, engir innsláttarvísar."

**5. Waitlist CTA (card, centered)**
- Titill: **"Láttu vita þegar Krakkavaktin opnar"**
- Paragraph: *"Við erum að leggja síðustu hönd á hana. Þú færð eitt tölvupóstskilaboð þegar hún er tilbúin — ekkert annað."*
- Email input + "Láta vita" hnappur
- Form skal posta á `/api/waitlist` (Supabase table `waitlist_krakkavaktin` með columns: `id`, `email`, `created_at`). Ef varðveislan er ekki tilbúin, log-aðu í console og sýndu success state.

---

## Hluti 3: Vöru-mockups (aðskilin routes)

Þessar síður eru **forskoðun** sem Stebbi notar til að sýna áhugasömum hvernig varan mun virka. Þær eru ekki virkur hugbúnaður, bara UI-mockups með fake data. Haltu þeim nhh-index-að (`robots: noindex` í metadata).

Bættu "Forskoðun · ekki virk ennþá" banner efst á öllum þessum síðum (lítill, amber background, 100% width).

### `/preview/chat` — Leikvakt-spjall (full view)

Sama spjall og í hero-demo-inu á landing, en sem full síða. Smellanlegt á nöfn → `/preview/profile/[name]`. Smellanlegt á barn í hausnum → `/preview/child/jona`.

### `/preview/profile/anna` — Forsjáraðila-prófíll

Card layout:

**Haus:**
- Avatar (stór, 72px, initial "A")
- Nafn: "Anna Sigurðardóttir" + verified ✓
- Undirtitill: "Forsjáraðili Jónu (5 ára)"

**Tengdir prófílar section:**
- Facebook logo (blár kassi) + "Tengdur síðan 2011 · 340+ vinir" + verified ✓
- Instagram logo (bleikur kassi) + "@anna.sigurdar · 180+ fylgjendur" + verified ✓
- Símanúmer táknmynd + "+354 ••• ••42" + verified ✓

**Um Jónu section:**
- Leikskóli: Árborg
- Ofnæmi: Hnetur
- Aðrir forsj.: Helgi (pabbi) ✓

**Sameiginlegt section:**
- *"Jóna og Siggi eru saman í Árborg leikskóla. Þið hafið átt 3 leikvaktir áður."*

**Footer:**
- *"Upplýsingar um barnið eru aðeins sýnilegar forsjáraðilum sem Jóna hefur leikvakt með."*

### `/preview/child/jona` — Barna-teymi (mikilvægasta mockup-ið)

Card layout:

**Haus:**
- Avatar (72px, initial "J", amber bakgrunnur)
- Nafn: "Jóna"
- Undirtitill: "5 ára · Árborg leikskóli"

**Lykilupplýsingar:**
- Ofnæmi: Hnetur
- Læknir: Heilsugæsla Selfoss
- Neyðartengill: Anna ✓

**Forsjáraðilar & teymi section:**
- Heading með counter: "FORSJÁRAÐILAR & TEYMI" + "5 manns"
- Listi af teymis-meðlimum (hver í sínum secondary-bg row):

  1. **Anna Sigurðardóttir** ✓ · Mamma · badge `FULL FORSJÁ` (blue) · "Má sækja · má samþykkja"
  2. **Helgi Jónsson** ✓ · Pabbi · badge `FULL FORSJÁ` (blue) · "Má sækja · má samþykkja"
  3. **Guðrún Helgadóttir** ✓ · Amma (í föðurætt) · badge `UMSJÓN` (green) · "Má sækja · má samþykkja"
  4. **Hulda Önnudóttir** ✓ · Frænka · systir Önnu · badge `AÐSTOÐ` (gray) · "Má sækja"
  5. **Magnús Helgason** (ekki tengdur — engin ✓, grár avatar) · Stóri bróðir · 16 ára · badge `AÐSTOÐ` (gray) · "Má sækja"

- Neðst: dashed-border button "+ Bæta við í teymið"

**Footer:**
- *"Aðeins forsjáraðilar með fulla forsjá geta breytt teyminu."*

### Heimildakerfi (þrepi) — útfærsla

Bættu við TypeScript enum í `lib/types.ts`:

```typescript
export type GuardianRole = 'FULL_FORSJA' | 'UMSJON' | 'ADSTOD';

export const ROLE_PERMISSIONS = {
  FULL_FORSJA: {
    label: 'Full forsjá',
    color: 'blue',
    canPickup: true,
    canApprove: true,
    canEditTeam: true,
    description: 'Má sækja · má samþykkja'
  },
  UMSJON: {
    label: 'Umsjón',
    color: 'green',
    canPickup: true,
    canApprove: true,
    canEditTeam: false,
    description: 'Má sækja · má samþykkja'
  },
  ADSTOD: {
    label: 'Aðstoð',
    color: 'gray',
    canPickup: true,
    canApprove: false,
    canEditTeam: false,
    description: 'Má sækja'
  }
} as const;
```

---

## Hluti 4: Shared components

Búðu til þessi í `components/` til að endurnýta:

- `<Badge variant="warning|success|info|gray">` — fyrir "Í ÞRÓUN", "FULL FORSJÁ" o.fl.
- `<VerifiedCheck size="sm|md">` — blá tvöfalda check-icon (CSS shape, ekki emoji)
- `<Avatar initial="A" color="amber|blue|green|danger|gray" size="sm|md|lg">`
- `<ChatBubble direction="left|right" variant="default|info">` — spjall-bubble
- `<ChatSystemMessage>` — system divider með línum beggja megin

---

## Hluti 5: Copy-reglur

- **Notaðu "forsjáraðili" alls staðar í UI og vöruumræðu**. Orðið "foreldri" má bara koma fyrir í markaðstexta þar sem þú ert að ávarpa lesandann beint ("ávarp foreldris: takk fyrir að skoða")
- **Engin mid-sentence bolding**. Bold er bara fyrir headings og labels
- **Sentence case** í öllum titlum — ekki "Hvers Vegna Virkar Þetta", heldur "Hvers vegna virkar þetta"
- **Lágstafir í small caps labels** (VÖRURNAR OKKAR, FORSJÁRAÐILAR & TEYMI) — en bara í þeim. Annars sentence case

---

## Vinnuröð

1. Fyrst: Búðu til shared components í `components/` (Badge, VerifiedCheck, Avatar, ChatBubble)
2. Svo: Endurskrifaðu `app/page.tsx` (forsíðan)
3. Svo: Endurskrifaðu `app/krakkavaktin/page.tsx`
4. Svo: Búðu til `app/preview/chat/page.tsx`
5. Svo: `app/preview/profile/anna/page.tsx`
6. Svo: `app/preview/child/jona/page.tsx`
7. Í lokin: API route fyrir waitlist + Supabase table

**Eftir hvert skref:** Keyrðu `npm run dev` og confirmaðu að síðan byggist án villna áður en þú heldur áfram. Ekki breyta mörgum síðum í einu — commit eftir hverja síðu.

**Commit skilaboð:** Notaðu íslensku fyrir commit messages, stíll: `feat(forsida): ný hero með studio-tagline` eða `refactor(krakkavaktin): bæti við spjall-demo`.

---

## Í lokin

Eftir að þetta er allt klárt, opnaðu `http://localhost:3008/` og `http://localhost:3008/krakkavaktin` og skoðaðu. Confirmaðu að:

- [ ] Engar gradientar í stórum titlum
- [ ] "Skoða Krakkavaktina" CTA virkar á forsíðu
- [ ] Waitlist form á /krakkavaktin postar á API og sýnir success state
- [ ] Öll preview routes eru noindex
- [ ] Öll UI er á íslensku
- [ ] Mobile layout er ekki brotið (sérstaklega spjall-demo-ið)

Ef eitthvað er óljóst — spurðu áður en þú býrð til. Betra að hætta og spyrja en gera ranga ákvörðun í 6 skrám.
