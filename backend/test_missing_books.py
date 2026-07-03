import sqlite3
import json

conn = sqlite3.connect(r'C:\Users\ashaz\OneDrive\Desktop\GST1\backend\data\gst_one_forensic.db')
cursor = conn.execute("SELECT row_json FROM reco_match_items WHERE match_status='MISSING_IN_BOOKS' LIMIT 1")
row = cursor.fetchone()
if row:
    print(row[0])
else:
    print("No MISSING_IN_BOOKS rows found")
