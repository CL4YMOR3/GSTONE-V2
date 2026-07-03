from database import get_connection
import json
with get_connection() as conn:
    conn.row_factory = None
    res = conn.execute("SELECT row_json FROM reco_match_items LIMIT 1").fetchone()
    if res:
        print(json.loads(res[0]).keys())
    else:
        print("No reco_match_items")
