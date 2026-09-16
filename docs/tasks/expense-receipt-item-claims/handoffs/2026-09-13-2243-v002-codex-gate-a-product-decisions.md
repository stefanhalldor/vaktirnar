# Gate A — núverandi samningar kortlagðir, vöru- og öryggisákvarðanir nauðsynlegar

**Created:** 2026-09-13 22:43 Atlantic/Reykjavik  
**Task:** `expense-receipt-item-claims`  
**Writer:** Codex  
**Candidate worktree:** `C:\Users\Lenovo\AppData\Local\Temp\teskeid-task-expense-receipt-item-claims-20260913`  
**Requested base / HEAD:** `7fdabefbbc51d2fc5d7574c71e7446fa0cc88238`

## Mannamál

Markmiðið er framkvæmanlegt, en núverandi kerfi hefur hvorki samning fyrir undirliði og gagnkvæm claims né samþykktan samning um hvert kvittunarmynd fer. Ekki er öruggt að byrja á UI eða app-kóða fyrr en Stebbi hefur tekið eina sameinaða ákvörðun um aðgang, merkingu „fyrir annan“, rounding og provider/retention. Lausnin þarf einnig nýjan gagnagrunnssamning; hún er ekki app-only.

## Findings

- Participant shared drafts eru read-only og publication party shape hefur aðeins aggregate `paid_minor` og `share_minor`.
- `ExpenseDraftPayloadSchema` og SQL159 normalizer eru strict og hafna receipt fields.
- Bookkeeping attachment storage er entity-owner scoped og no-delete; aðeins tæknimynstrið er endurnýtanlegt.
- Provider/privacy, „fyrir annan“, rounding og participant authority voru raunverulegar product-gáttir.
- Requested `7fdabef...` base var eldri en þáverandi local `origin/main`; engin implementation hófst á stale grunni.

## Localhost checks for Stebbi

Engin localhost-prófun átti við; ekkert UI eða runtime breyttist.
