# TODO #5 - Claude Code plan: mobile form zoom fix

**Dagsetning:** 2026-06-09 07:48
**Agent:** Claude Code (plan til Codex-rýni)
**Tengt TODO:** #5 Samræmd mobile app-upplifun
**Hlutverk:** Codex rýnir þennan plan og staðfestir eða lagar áður en Claude Code framkvæmir.

## Yfirlit

iOS Safari zoomar viewport þegar editable form control fær focus og computed
font-size er undir 16px. `text-sm` = 14px í Tailwind. Lausnin er að breyta
öllum editable controls í `text-base sm:text-sm` (16px á mobile, 14px á
sm+ skjám).

Þetta plan lýsir nákvæmlega hvaða skrár þurfa breytingar og hverjar.
**Engar kóðabreytingar hafa verið gerðar enn.**

## Findings úr lestur

### Þegar lagfært ✓

- `components/teskeid/TeskeidLoginForm.tsx`
  - Email input: `text-base sm:text-sm` ✓ (line 127)
  - Code input: `text-xl` ✓ (line 156) — 20px
- `components/loans/LoanDateField.tsx`
  - Hidden input: `fontSize: '16px'` ✓ (style prop)
  - Display span: `text-sm` — ekki editable control, veldur ekki zoom ✓

---

## Scope A — Teskeið authenticated flows (must fix)

### 1. `components/loans/LoanForm.tsx`

**Vandamál:** `inputClass` notar `text-sm`.

```diff
- 'h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10'
+ 'h-10 w-full rounded-xl border border-gray-200 px-3 text-base sm:text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10'
```

Hefur áhrif á: `Hvað var lánað?` (text input) og `Netfang viðtakanda` (email input).

Textarea fyrir `Athugasemd` (line ~158):

```diff
- className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 resize-none"
+ className="w-full rounded-xl border border-gray-200 px-3 py-2 text-base sm:text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 resize-none"
```

---

### 2. `components/loans/AddPartyForm.tsx`

**Vandamál:** `inputClass` notar `text-sm`.

```diff
- 'h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10'
+ 'h-10 w-full rounded-xl border border-gray-200 px-3 text-base sm:text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10'
```

---

### 3. `app/auth-mvp/minn-profill/page.tsx`

**Vandamál:** Tveir inputs með `text-sm`.

Display name input (line ~99):
```diff
- className="h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10"
+ className="h-10 rounded-xl border border-gray-200 px-3 text-base sm:text-sm outline-none focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10"
```

Read-only email (line ~109) — read-only, en má lagfæra fyrir samræmi:
```diff
- className="h-10 rounded-xl border border-gray-100 bg-gray-50 px-3 text-sm text-gray-500 outline-none cursor-default"
+ className="h-10 rounded-xl border border-gray-100 bg-gray-50 px-3 text-base sm:text-sm text-gray-500 outline-none cursor-default"
```

---

## Scope B — Shared component

### 4. `components/ui/Input.tsx`

**Vandamál:** `text-sm` í clsx base class (line ~23).

```diff
- 'h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none ...'
+ 'h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-base sm:text-sm outline-none ...'
```

**Áhrif:** Lagar sjálfkrafa alla staði sem nota `<Input />` component:
- Eldri auth flows (login/signup/reset)
- Child forms
- Contacts/invite code
- Settings display name/phone
- Admin-auth login

**Áhætta:** Aðeins stærri texti á mobile — það er markmiðið.

---

## Scope C — Public landing og legacy flows

### 5. `components/teskeid/SubmissionForm.tsx`

Fjórar textareas + einn select + tveir text/email inputs, öll með `text-sm`.

Hvað er lánað? textarea (line ~81):
```diff
- className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none ..."
+ className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base sm:text-sm focus:outline-none ..."
```

Sama breyting á báðum öðrum textareas (lines ~95 og ~109).

Select (line ~118):
```diff
- className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm ..."
+ className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base sm:text-sm ..."
```

Nafn input (line ~166):
```diff
- className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm ..."
+ className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base sm:text-sm ..."
```

Netfang input (line ~179):
```diff
- className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm ..."
+ className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base sm:text-sm ..."
```

---

### 6. `components/teskeid/FollowForm.tsx`

Email input (line ~41):
```diff
- className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm ..."
+ className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-base sm:text-sm ..."
```

---

### 7. `components/landing/WaitlistForm.tsx`

Email input (line ~50):
```diff
- className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2.5 ..."
+ className="flex-1 text-base sm:text-sm border border-gray-200 rounded-xl px-4 py-2.5 ..."
```

---

### 8. `components/landing/VaktSuggestionForm.tsx`

Textarea (line ~58):
```diff
- className="text-sm border border-gray-200 rounded-xl px-4 py-3 ..."
+ className="text-base sm:text-sm border border-gray-200 rounded-xl px-4 py-3 ..."
```

Email input (line ~66):
```diff
- className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2.5 ..."
+ className="flex-1 text-base sm:text-sm border border-gray-200 rounded-xl px-4 py-2.5 ..."
```

---

### 9. `components/chat/MessageInput.tsx`

Chat input (line ~45):
```diff
- className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm ..."
+ className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-base sm:text-sm ..."
```

Athugið: Chat er legacy (LEGACY_ENABLED gæti verið off). Breytingin er óskaðleg.

---

## Deferred — Admin dense UI

`app/(admin)/admin/page.tsx` notar `text-xs` í mörgum inputs/selects/textareas.
Admin UI er þétt og hannað fyrir desktop. Breyting í `text-base md:text-xs`
gæti skemmt layout á desktop.

**Tillaga:** Deferred. Admin mobile zoom er ekki public user blocker.
Ef Codex er ósammála skal Codex taka afstöðu.

---

## Hvað þarf EKKI breytingar

- Radio inputs í SubmissionForm (checkbox/radio — valda ekki zoom)
- Buttons (ekki editable)
- Labels, spans, static text
- LoanDateField display span (ekki editable control)
- TeskeidLoginForm (þegar lagfært)

---

## Spurningar til Codex

1. Er `text-base sm:text-sm` rétt pattern alls staðar, eða á einhvern stað að
   vera `text-base` án responsive breakpoint (t.d. WaitlistForm sem er alltaf
   full-width)?

2. Ætti `Input.tsx` shared component að nota `text-base sm:text-sm` eða
   `text-base` (án sm breakpoint) til að vera safe á öllum screen sizes?

3. Er ástæða til að lagfæra read-only email í `minn-profill/page.tsx`?
   Read-only input focusar ekki til text editing á iOS, en má lagfæra
   fyrir samræmi.

4. Chat (`MessageInput.tsx`) er legacy. Er ástæða til að hunsa hana?

5. Er einhver skrá sem vantar í þennan lista?

---

## Keyrslur sem Claude Code mun gera eftir framkvæmd

```
npm run type-check
npm run test:run
```

Ef `Input.tsx` breytist (shared component):
```
npm run build
```

---

## Ekkert af þessu hefur verið framkvæmt

Allar ofangreindar breytingar eru **óframkvæmdar**. Þetta er plan til
Codex-rýni. Claude Code bíður eftir samþykki eða leiðréttingum.
