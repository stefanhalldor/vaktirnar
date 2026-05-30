# AGENTS.md — Vaktirnar

This file defines rules and context for AI agents (Codex, Claude, etc.) working in this repository.

## Project overview

**Vaktirnar** is a Next.js 15 (App Router) web app built with TypeScript, Supabase, Tailwind CSS, and next-intl.

The primary product is **Krakkavaktin** — a playdate coordination tool for Icelandic parents. Other "shifts" (vaktir) will be added over time as separate experiences within the same app.

**Tech stack:**
- Next.js 15, React 18, TypeScript
- Supabase (auth + database + RLS)
- Tailwind CSS + Radix UI
- next-intl (Icelandic `is` and English `en`)
- web-push for push notifications
- Vitest + Testing Library

**Key routes:**
- `/krakkavaktin` — Landing/marketing page for Krakkavaktin
- `/(app)/` — Authenticated app shell (home, chat, children, contacts, settings)
- `/s/[sessionId]` — Shared session page (playdate tracker, partially public)
- `/dashboard` — Internal stats dashboard
- `/(auth)/` — Login, signup, password reset

**Key directories:**
- `app/` — Next.js pages
- `components/landing/` — Landing page components
- `components/ui/` — Shared UI primitives
- `components/chat/`, `components/children/`, `components/contacts/` — Feature components
- `lib/` — Types, utils, Supabase clients
- `messages/` — i18n strings (`is.json`, `en.json`)
- `sql/` — SQL migrations and schema changes

---

## General rules for all agents

- Keep changes small and focused. Do not modify unrelated files.
- If asked to review, do not edit files unless explicitly told to.
- If asked to implement, summarize the plan first and wait for approval.
- After making edits, summarize exactly which files changed and what commands to run (lint, build, test).

---

## Supabase and database rules

- **Never weaken RLS policies.** When in doubt, make policies more restrictive, not less.
- **Never expose private user data.** Check that queries do not accidentally return data across user/guardian boundaries.
- Do not assume public schema tables are accessible through the API unless explicit grants and RLS policies allow it.
- Prefer explicit grants and explicit policies over broad defaults.
- SQL migrations live in `sql/`. They must be **idempotent where possible** — use `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, or `CREATE OR REPLACE`.
- Be careful with schema changes. Do not rename or drop columns without confirming it won't break existing queries.
- The `/s/[sessionId]` route has a public view mode and a private edit mode (protected by `editKey`). Never allow unauthenticated access to the edit path.

---

## Icelandic copy rules

- User-facing copy in Icelandic must be natural, short, and human — not formal or AI-generated sounding.
- Avoid long em-dashes (—). Use commas, periods, or short sentences instead.
- All user-facing strings live in `messages/is.json` and `messages/en.json`. Do not hardcode copy in components.
- Match the tone already present in the codebase — friendly, direct, informal.

---

## Workflow

This repo uses a **Claude builds, Codex reviews** workflow:

1. Claude Code makes changes.
2. Developer reviews the diff.
3. Codex reviews the changes (see prompts below).
4. Claude applies any safe fixes Codex recommends.
5. Run lint/build/test as needed.
6. Commit.

Do not have multiple agents editing the same files simultaneously.

---

## Codex review prompt

Use this when Claude has made changes and you want Codex to review before committing:

```
Review the current uncommitted changes in this repo.

Focus especially on:
- SQL migration safety
- Supabase RLS policies — could this weaken access control?
- Whether this could accidentally expose user data publicly
- Whether migrations are idempotent
- Whether anything could break existing Vaktirnar functionality
- Any TypeScript type safety issues introduced

Do not make changes yet. Explain the risks and recommended fixes first.
```

## Codex fix prompt

Use this after Codex has reviewed and you want it to apply minimal safe fixes:

```
Apply only the minimal safe fixes you recommended in your review.

Do not rename tables or columns.
Do not change user-facing copy or translations.
Do not alter unrelated files.
After changes, summarize exactly what changed and why.
```
