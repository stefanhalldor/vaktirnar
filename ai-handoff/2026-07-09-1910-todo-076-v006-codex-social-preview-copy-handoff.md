# TODO 076 - Social preview description copy update

Created: 2026-07-09 19:10  
Timezone: Atlantic/Reykjavik  
Agent: Codex  
Status: Handoff only, no implementation by Codex

## Context

The Facebook/Open Graph preview now shows the correct new Allt/10 badge image. Stebbi wants to update the preview description copy from:

```text
Litlar hversdagslausnir á einum stað, einni í einu.
```

to:

```text
Margar litlar hversdagslausnir á einum stað. Einn aðgangur.
```

This is a small user-facing copy/metadata update connected to the social thumbnail work.

## Recommended implementation

Claude Code should update all Icelandic metadata/manifest descriptions that currently use the old tagline:

1. `messages/is.json`
   - root meta description:
     - current location observed: line 4
   - `teskeid.meta.description`:
     - current location observed: line 228

2. `public/manifest.json`
   - `description`

Replace the old sentence with exactly:

```text
Margar litlar hversdagslausnir á einum stað. Einn aðgangur.
```

## English locale

Codex did not inspect the current English copy deeply beyond confirming `messages/en.json` has corresponding `meta` blocks. Claude Code should check whether the English locale currently mirrors the same concept and either:

- leave it unchanged if the English text is already acceptable and not used in the Icelandic Facebook preview, or
- update it to a natural equivalent if the project convention is to keep `is.json` and `en.json` aligned.

Suggested English if needed:

```text
Many small everyday tools in one place. One account.
```

Do not hardcode this in components; keep translated/user-facing text in message files.

## Files likely changed

Expected:
- `messages/is.json`
- `public/manifest.json`

Possible, if Claude Code decides locale parity is required:
- `messages/en.json`

No expected changes:
- SQL
- Supabase
- RLS/auth
- Vercel env vars
- app logic
- `public/opengraph-image.png`

## Risk / review notes

- This is copy-only, but it affects social previews and install/PWA metadata.
- Facebook/Messenger may cache the old description. After deploy, use Facebook Sharing Debugger and scrape again.
- Keep punctuation exactly as requested: two sentences, period between them.
- The phrase is intentionally singular on access: `Einn aðgangur.`
- Do not change the OG title `Allt í Teskeið` unless Stebbi asks.
- Do not touch the already-corrected OG image asset unless separately requested.

## Suggested verification

Run:

```bash
npm run type-check
npm run build
```

Build may still show existing unrelated warnings; those are not blockers for this copy-only change unless new warnings/errors appear.

## Localhost checks for Stebbi

With Stebbi's dev server already running:

1. Open the home page:
   - `http://localhost:3004/`
   - Use the correct port if different.

2. Inspect page metadata in browser devtools or page source:
   - `description`
   - `og:description`
   - `twitter:description`

3. Expected text:

```text
Margar litlar hversdagslausnir á einum stað. Einn aðgangur.
```

4. Optional PWA/manifest check:
   - Open `http://localhost:3004/manifest.json`
   - Confirm `description` has the same Icelandic text.

5. After deploy:
   - Run Facebook Sharing Debugger for `https://www.teskeid.is/`
   - Click scrape again.
   - Confirm preview description updates. If it still shows the old text, assume cache first and scrape again before debugging code.

Safety notes:
- No migration should be run.
- No Supabase/auth/RLS testing is needed.
- No Vercel env vars should be changed.
- Do not deploy unless Stebbi explicitly tells Claude Code to deploy.
