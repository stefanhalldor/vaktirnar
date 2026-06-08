# AI Handoff

This folder stores larger handoff, review, planning, and risk-analysis notes
for collaboration between Stebbi, Codex, and Claude Code.

## Rules

- Use one file per handoff or review.
- Do not overwrite older handoff or review files.
- Use filenames in this format:
  `YYYY-MM-DD-todo-XYZ-vNNN-agent-description.md`
- Do not use `#` in filenames.
- `todo-XYZ` should match the relevant TODO item number, zero-padded to three
  digits where practical.
- `vNNN` should be the next version number for the same TODO item.
- `agent` should be `codex` or `claude`.
- Mention the relevant TODO item near the beginning of the file.
- Treat Markdown handoff/review files like production code review: be critical,
  check sequencing, auth, RLS, Supabase, migrations, production data, and edge
  cases.

