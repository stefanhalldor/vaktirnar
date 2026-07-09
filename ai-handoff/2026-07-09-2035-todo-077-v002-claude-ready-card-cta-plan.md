# Handoff: TODO #77 v002 - ReadyTeskeidCard CTA plan

Created: 2026-07-09 20:35
Timezone: Atlantic/Reykjavik
Stada: Plan/handoff -- ekki framkvæmt

---

## Samhengi

Stebbi vill að kortið sem innskráðir notendur sjá á heimasíðunni (`ReadyTeskeidCard`) sé líka sýnt á public hugmyndasíðunum fyrir óinnskráða notendur. Smella á kortið → `/innskraning`. Á innskráningarsíðunni bætist við "Aðgangurinn er ókeypis" label.

---

## Breytingar sem þarf að framkvæma

### 1. `app/hugmyndir/[slug]/page.tsx`

**Fjarlægja** núverandi einfalda takkaútfærslu (bætt við í v001):

```tsx
{showFreeAccessCta && (
  <div className="mb-8">
    <Link href="/innskraning" className="inline-flex w-full sm:w-auto ...">
      {t('ideas.freeAccountCta')}
    </Link>
  </div>
)}
```

**Setja í staðinn** `ReadyTeskeidCard` með "Tilbúið" label, hærra á síðunni (eftir title/category, fyrir short_description):

```tsx
import { ReadyTeskeidCard } from '@/components/teskeid/ReadyTeskeidCard'

// Eftir <p className="... mb-6">{idea.category}</p> og fyrir short_description:
{showFreeAccessCta && (
  <div className="mb-6">
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
      {t('ideas.readyFrameLabel')}
    </p>
    <ReadyTeskeidCard
      idea={idea}
      href="/innskraning"
      openLabel={t('ideas.freeAccountCta')}
    />
  </div>
)}

// Eftir kortið kemur short_description eins og áður
```

`showFreeAccessCta = idea.status === 'launched' && !user` -- óbreytt frá v001.

Kortið notar núverandi `SLUG_COLORS` og icon per slug (vedrid = CloudSun, ljós-blár bakgrunnur). `href="/innskraning"` sendir notanda þangað við smelli.

### 2. `app/innskraning/page.tsx`

Bæta við "Aðgangurinn er ókeypis" label milli `<PublicTopNav />` og `<TeskeidLoginForm />`:

```tsx
import { getTranslations } from 'next-intl/server'

export default async function InnskraningPage() {
  // ... existing auth check ...
  const t = await getTranslations('teskeid')
  return (
    <>
      <PublicTopNav />
      <p className="text-center text-sm text-emerald-700 font-medium py-3">
        {t('login.freeAccessLabel')}
      </p>
      <TeskeidLoginForm logoHref="/" />
    </>
  )
}
```

Eða setja label inni í einhvern wrapper ef það lítur betur út -- nákvæm staðsetning er opið fyrir Codex að meta.

### 3. `messages/is.json`

Bæta við tveimur nýjum lyklum:

```json
"ideas": {
  ...
  "readyFrameLabel": "Tilbúið",
  ...
}
```

Og nýr `login` hluti undir `teskeid`:

```json
"teskeid": {
  ...
  "login": {
    "freeAccessLabel": "Aðgangurinn er ókeypis"
  }
}
```

### 4. `messages/en.json`

```json
"ideas": {
  ...
  "readyFrameLabel": "Ready",
  ...
}
"login": {
  "freeAccessLabel": "Access is free"
}
```

---

## Þess vegna þetta skipulag

- `ReadyTeskeidCard` er þegar til og rétt útfært -- engin ástæða til að búa til nýjan component
- `href` prop passar fullkomlega fyrir `/innskraning` þegar óinnskráður
- "Tilbúið" label gefur samhengi -- notandinn skilur að þetta er tiltækt
- Kortið ofar á síðunni (fyrir short_description) gefur betri synlighet á mobile

---

## Óvissuatriði til Codex

1. **Staðsetning label á innskráningarsíðu**: Á "Aðgangurinn er ókeypis" vera ofan við form eða undir logo? Þarf að meta með TeskeidLoginForm útlit.
2. **`freeAccountCta` lykillinn** (`"Fáðu þér ókeypis aðgang"`) -- á hann að vera `openLabel` á kortinu eða einhver styttri texti? Núverandi `openLabel` á heimasíðunni er `t('readyTeskeidOpen')` sem er "Opna". Kannski betri að nota "Opna" á kortið og halda "Fáðu þér ókeypis aðgang" sem auka-texta annarsstaðar?
3. **Fjarlægja `freeAccountCta` translation key?** Ef kortið kemur í staðinn fyrir takkann, á `ideas.freeAccountCta` að haldast (til backup) eða vera eytt?

---

## Skrár sem breytast

- `app/hugmyndir/[slug]/page.tsx`
- `app/innskraning/page.tsx`
- `messages/is.json`
- `messages/en.json`

---

## Eftir framkvæmd

```bash
npm run type-check
npm run test:run
```

Localhost checks:
1. Opna `/hugmyndir/vedrid` í private glugga -- sjá ReadyTeskeidCard með "Tilbúið" label hærra á síðunni
2. Smella á kortið -- fer á `/innskraning`
3. Á `/innskraning` -- sjá "Aðgangurinn er ókeypis" texta
4. Innskráður notandi -- kortið sést EKKI á hugmyndasíðunni
5. Hugmynd ekki launched -- kortið sést EKKI
