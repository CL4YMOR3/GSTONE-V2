import sqlite3
import json
conn = sqlite3.connect('C:/Users/ashaz/OneDrive/Desktop/GST1/GSTONE/gst_database.db')
conn.row_factory = sqlite3.Row

q = """
SELECT 
    row_json, 
    JSON_EXTRACT(row_json, '$.\"Taxable Amount\"') as t_amt,
    JSON_EXTRACT(row_json, '$.\"Taxable Value\"') as t_val
FROM raw_books_uploads 
LIMIT 1
"""
res = conn.execute(q).fetchone()
print("Row JSON:", res['row_json'])
print("Taxable Amount:", res['t_amt'])
print("Taxable Value:", res['t_val'])
