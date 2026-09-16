"""Parse artifacts only. Never connects to a database or executes SQL."""
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / '.tmp/receipt-sql-parser'))
from pglast import parse_sql
from pglast.parser import parse_plpgsql_json
from pglast.stream import RawStream

root = pathlib.Path(__file__).resolve().parents[1]
for name in ['sql/184_receipt_split_v2.sql',
             'sql/validation/184-receipt-split-v2/preflight.sql',
             'sql/validation/184-receipt-split-v2/postflight.sql']:
    sql = (root / name).read_text(encoding='utf-8')
    statements = parse_sql(sql)
    bodies = 0
    for statement in statements:
        if type(statement.stmt).__name__ in ['CreateFunctionStmt', 'DoStmt']:
            parse_plpgsql_json(RawStream()(statement))
            bodies += 1
    print(f'{name}: {len(statements)} SQL statements, {bodies} PL/pgSQL bodies parsed; no execution')
