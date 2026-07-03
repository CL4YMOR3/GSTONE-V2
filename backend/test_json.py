import sqlite3
import json
conn = sqlite3.connect('data/gst_one_forensic.db')
conn.execute('''
    INSERT INTO reco_match_items (reco_id, entity_id, return_period, row_json, created_at)
    VALUES (?, ?, ?, ?, ?)
''', ('test_reco', 'test_entity', '2023-04', json.dumps({'garden_name': 'Assam Estate'}), '2023-01-01'))
conn.commit()
res = conn.execute("SELECT * FROM reco_match_items WHERE JSON_EXTRACT(row_json, '$.garden_name') = 'Assam Estate'").fetchall()
print('Found:', len(res))
conn.execute("DELETE FROM reco_match_items WHERE reco_id = 'test_reco'")
conn.commit()
