# AI Handoff

This folder stores larger handoff, review, planning, and risk-analysis notes
for collaboration between Stebbi, Codex, and Claude Code.

## Rules

- Use one file per handoff or review.
- Do not overwrite older handoff or review files.
- Use filenames in this format:
  `YYYY-MM-DD-HHMM-todo-XYZ-vNNN-agent-description.md`
- `HHMM` is 24-hour local time when the file is created.
- Do not use `#` in filenames.
- `todo-XYZ` should match the relevant TODO item number, zero-padded to three
  digits where practical.
- `vNNN` should be the next version number for the same TODO item.
- `agent` should be `codex` or `claude`.
- Mention the relevant TODO item near the beginning of the file.
- Treat Markdown handoff/review files like production code review: be critical,
  check sequencing, auth, RLS, Supabase, migrations, production data, and edge
  cases.
- Every implementation plan, handoff, and review MUST include a
  "Localhost checks for Stebbi" section from v001 onward. This is required even
  when the technical work feels obvious, because Stebbi uses these checks to
  understand the change through the product. If there is truly nothing
  user-visible to test, the section must still exist and say why it does not
  apply.
- "Localhost checks for Stebbi" must describe what Stebbi should manually test
  before release: exact page or flow, setup/auth/data state, steps to perform,
  expected result, and the most important regressions to watch for. For
  Supabase, auth, RLS, deployment, billing, secrets, or user-data work, it must
  also mention what must not be tested casually and what requires explicit
  approval.
