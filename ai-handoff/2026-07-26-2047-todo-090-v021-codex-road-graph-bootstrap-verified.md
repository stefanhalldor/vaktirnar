# TODO-090 v021 — road graph bootstrap og deployment-skref #4 staðfest

**Created:** 2026-07-26 20:47  
**Timezone:** Atlantic/Reykjavik  
**Implementation handoff:** `2026-07-26-2041-todo-090-v020-codex-connectivity-gate-implementation.md`

## Niðurstaða

Deployment-skref #4 úr v072 er **grænt**.

Stebbi endurkeyrði admin refresh eftir v020. Endpoint skilaði:

- HTTP 200;
- `status = skipped`;
- `reason = unchanged`;
- gilt `activeSnapshotId`.

`unchanged` leiðin sannreynir að active metadata sé til og að immutable private Storage payload sé lesanlegt og parse-anlegt áður en hún sleppir rebuild.

Read-only SQL staðfesti síðan:

| Check | Niðurstaða |
|---|---:|
| `active_count` | 1 |
| `building_count` | 0 |
| `active_golden_route_pass_count` | 20 |
| `active_golden_route_total_count` | 20 |
| `active_storage_object_exists` | true |

Private bucket hafði áður verið staðfestur `public = false`. Snapshot bootstrap/LKG forsendan er því uppfyllt.

## Öryggi og gögn

- Engin RLS, grants, auth eða notendagögn breyttust í þessari staðfestingu.
- Snapshot inniheldur provider-level opin vegagögn, ekki notendaleiðir eða heimilisföng.
- Fyrri failed validation-row var ekki eytt og er áfram gagnleg audit-saga.
- Codex keyrði ekkert SQL eða external write; Stebbi keyrði admin endpoint og read-only verification.

## Næsta skref

Áður en commit/push/deploy er samþykkt skal Claude Code gera óháða loka prerelease diff-rýni á v020/v021 og sameinaða ócommittaða release-pakkann. Ef enginn blocker finnst getur Stebbi síðan gefið sérstakt leyfi fyrir commit, push og deploy. Engin frekari SQL 92/bootstrap keyrsla þarf fyrir óbreyttan kóða.

## Localhost checks for Stebbi

Bootstrap-infrastructure er staðfest. Eftir loka diff-rýni og áður en útgáfa er víkkuð:

1. Prófa einn `teskeid-routing-v1` notanda með global candidate flag virkt.
2. Reikna Reykjavík → Akureyri og eina Vestfjarðaleið.
3. Vænt: Google er áfram fyrst/sjálfvalið; Teskeið candidate birtist aðeins flaggaða notandanum.
4. Endurtaka sömu leið og staðfesta warm/LKG endurnýtingu án live source-sóknar á user request path.
5. Slökkva annað gate-ið og staðfesta að candidate hverfi en Google haldi áfram.

Ekki breyta production flags eða víkka per-user rollout kæruleysislega. Commit, push og deploy krefjast áfram sérstakrar heimildar Stebba.
