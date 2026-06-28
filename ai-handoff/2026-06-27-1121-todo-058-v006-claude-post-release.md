# #58 v006 - Post-release

**TODO:** #58 - Ferill hlutar a detail-sidu (nu: Saga hlutarins)
**Agent:** Claude Code
**Stadur:** Keyrt a localhost. Virkadi. Tilbuid til lokunnar.

---

## Hvad var sent ut

Tveir commits a main:

- `4bbee0d feat: loan history section on detail page (#58)`
- `46e1f92 feat: actor attribution and Saga section in loan history (#58)`

SQL60 (`sql/60_get_loan_event_history_pending_access.sql`) var keyrt a Supabase.

---

## Hvad var implementad

- `Saga hlutarins` section a detail-sidu lanad-og-skilad/[id]
- Sagar birtast i timaro med event label + timestamp
- `Framkvæmt af {nafn}` birtist a nyjum events thar sem actor er thekkt
- Gomul events (an actorUserId) synja actor-linu hlussinn -- ekkert brotnar
- Pending invitation vidtakandi ber history aftur en hann samthykkir (SQL60)
- Section er subtle mutur rammi (bg-[#f0f0ed]) undir adralhvita LoanCard

---

## Bok fyrir Codex

1. Faera #58 ur TODO.md yfir i DONE.md.
2. Faera #56 ur TODO.md yfir i DONE.md ef það er enn opinn (var sent ut tidlegar i dag).
3. Engar forritabreytingar tharf -- thetta er eingongu skjalaskipti.
