# Design Brief — Teskeið

## Markmið hönnunar

Við erum að hanna innskráða upplifun fyrir Teskeið. Notandi stofnar aðgang og prófíl og fær þaðan aðgang að fyrstu teskeiðunum, sem eru lítil, nothæf verkfæri fyrir hversdagslegar þarfir. Þetta er app-upplifun fyrir innskráðan notanda, ekki markaðssíða.

---

## Heildarupplifun

Heimaskjár eftir innskráningu sýnir:

- **Prófíll notanda** efst, nafn og myndi/upphafsstafir
- **"Teskeiðarnar mínar"** hlutinn, kort eða listi yfir virkar teskeiðar sem notandi hefur virkjað
- **Nýleg atriði** á milli teskeiðanna, t.d. hlutir í láni eða ógreidd útgjöld
- **Opin atriði** sem þarf að klára, t.d. gjaldfallnar skil eða ógreiddar skuldir
- **Fljótleg leið til að bæta við færslu**, sýnileg "Bæta við" aðgerð sem er alltaf aðgengileg

Kortastíll er notaður fyrir teskeiðar og einstaka færslur. Tóm staða sýnir skýrar leiðbeiningar þegar engar færslur eru til.

---

## Aðgangur og prófíll

Flæðið sem þarf að hanna:

- **Nýskráning** — nafn, netfang, lykilorð, staðfesting
- **Innskráning** — netfang og lykilorð, gleymdu lykilorð tenill
- **Stofnun prófíls** eftir nýskráningu — nafn, tungumál, myndataka eða upphafsstafir
- **Breytingar á prófíl** — breyta nafni, mynd, tungumáli, stillingar
- **Einfaldar stillingar** — tilkynningar, tungumál, skrá út

Prófíll geymir:

- Nafn
- Netfang
- Prófílmynd eða upphafsstafir
- Tungumál (IS/EN)
- Stillingar
- Síðar: tengdir einstaklingar (maki, vinur eða fjölskyldumeðlimur)

---

## Teskeið 1: Lánað og skilað

**Tilgangur:** Halda utan um hluti sem maður lánar öðrum eða fær lánað frá öðrum.

### Hanna þarf

- Lista yfir hluti í láni (inn og út)
- Bæta við hlut:
  - Heiti hlutar
  - Val: "Ég lánaði" eða "Ég fékk lánað"
  - Skrá hinn aðilann (nafn eða tengill við mann í prófíl)
  - Dagsetning láns
  - Skiladag eða áminning
- Staða hvers hlutar: í láni, skilað, seint
- Detail view fyrir hvern hlut
- Aðgerð til að merkja sem skilað

### Microcopy

- "Ég lánaði"
- "Ég fékk lánað"
- "Hver er með þetta?"
- "Hvenær á að skila?"
- "Merkja sem skilað"

---

## Teskeið 2: Maki/kæró

**Tilgangur:** Lítið sambandstól fyrir par. Praktískt, hlýtt og létt. Ekki væmið og ekki meðferðar-app.

### Hanna þarf

- Tengja maka eða kæró við prófíl (boð sent á netfang eða tengill)
- Sameiginlegur heimaskjár fyrir parið
- Lista yfir sameiginleg atriði
- Áminningar og plön
- Smáverk sem þarf að vinna
- "Muna eftir" atriðalisti
- Möguleiki á léttu check-in seinna (ekki hluti af v1)

### Mögulegar einingar

- "Við þurfum að muna"
- "Plön"
- "Smáverk"
- "Gott að vita"
- "Næst saman"

### Tónn

- Hlýtt og létt
- Gagnlegt, ekki klístrað
- Ekki corporate productivity tool

---

## Teskeið 3: Útlagt og endurgreitt

**Tilgangur:** Halda utan um þegar einn leggur út fyrir annan og það þarf að endurgreiða.

### Hanna þarf

- Lista yfir útgjöld
- Bæta við útgjald:
  - Upphæð
  - Lýsing
  - Hver lagði út
  - Fyrir hvern
  - Dagsetning
- Staða hvers útgjalds: ógreitt, greitt
- Heildarstaða: hver skuldar hverjum hvað
- Aðgerð til að merkja sem greitt

### Microcopy

- "Ég lagði út"
- "Fyrir hvern?"
- "Hvað kostaði þetta?"
- "Ógreitt"
- "Greitt"
- "Merkja sem greitt"

---

## Tónn og karakter

Teskeið á að vera dálítið lífleg, ekki bara hlutlægur gagnagrunnur. Hugmyndin er að vera "með allt í teskeið" og appið á að gefa þá tilfinningu. Notandanum á að líða vel þegar hann notar það, eins og hann sé að ná utan um lífið án þess að það verði þungt.

**Tónninn er:**

- Léttur og hlýr
- Smá leikandi, án þess að verða barnalegur
- Mannlegur og praktískur
- Skýr, ekki of krúttlegur
- Hvetjandi án þess að vera yfirdrifinn

**Í hönnuninni þýðir þetta:**

- Lítil karakterpunktar í tómum stöðum, t.d. stuttur texti sem brosir aðeins
- Mjúkar hreyfingar þar sem við á, ekki of margar
- Hlýr microcopy, t.d. "Engar skuldir, flott!" í stað "Engar færslur til"
- Nothæfni fyrst og fremst, karakter kemur ofan á

---

## Hönnunarstefna

- **Mobile-first** — allt hannað fyrst fyrir síma
- **Bjart, rólegt, hlýtt og traust** — ekki of lifandi, ekki kalt
- **App, ekki landing page** — engar stórar kynningarmyndir, enginn marketing texti
- **Ekki of mikið skraut** og ekki enterprise dashboard stemning
- **Stuttir íslenskir textar** og skýr form
- **Listar, tabs, segmented controls og kort** eru grunnmynstrin
- **Kort** fyrir teskeiðar og einstaka færslur
- **Skýr tóm staða** þegar engar færslur eru til, með leiðbeiningum
- **"Bæta við" aðgerð alltaf sýnileg**, t.d. neðst á skjá eða í header

---

## Leiðir

```
/                                   — hugmyndabanki / opin forsíða
/(auth)/login                       — innskráning
/(auth)/signup                      — nýskráning
/(app)/                             — heimaskjár eftir innskráningu
/(app)/profile                      — prófíll og stillingar
/(app)/teskeidar                    — yfirlit yfir allar teskeiðar
/(app)/teskeidar/lanad-og-skilad    — Lánað og skilað
/(app)/teskeidar/maki-kaero         — Maki/kæró
/(app)/teskeidar/utlagt-og-endurgreitt — Útlagt og endurgreitt
```

---

## Tæknilegt samhengi

Verkefnið notar:

- **Next.js 15** App Router
- **React 18**
- **TypeScript**
- **Supabase** — auth, database, RLS
- **Tailwind CSS**
- **Radix UI**
- **next-intl** — tungumálaval (IS/EN)
- **Vitest + Testing Library**

---

## App-stefna til framtíðar

Teskeið er vefapp fyrst, en hönnunin þarf að vera tilbúin fyrir native app eða PWA þegar sú tími kemur.

Mikilvægt að hugsa snemma um:

- **Mobile-first upplifun** — allt flæði hannað fyrst fyrir síma
- **Einfalt navigation** — fáar skjástöður, skýr stigveldi
- **Skýr heimaskjámynd** — yfirsýn yfir allt sem þarf athygli
- **Fljótlegar aðgerðir** — bæta við færslu á eins fáum skrefum og mögulegt er
- **Tilkynningar og áminningar** — t.d. skiladagar, ógreiddar skuldir
- **Notendagögn sem fylgja milli tækja** — allt geymt í Supabase, engar lokaðar geymslustaðir

---

## Öryggi og gögn

- Gögn notanda eru alltaf private, má ekki verða public
- Öll gögn tengjast réttum `user_id` eða `profile_id`
- Sameiginleg gögn (Maki/kæró) þurfa skýra tengingu milli notenda og skýra aðild að hvaða gögnum
- RLS reglur í Supabase má ekki veikja eða sleppa
