import sqlite3
conn = sqlite3.connect('C:/Users/ashaz/OneDrive/Desktop/GST1/backend/data/gst_books.db')
conn.row_factory = sqlite3.Row
res = conn.execute("SELECT row_json, JSON_EXTRACT(row_json, '$.\"Taxable Amount\"') as t_amt from raw_books_uploads limit 1").fetchone()
print("Row JSON:", res['row_json'])
print("Extracted Taxable Amount:", res['t_amt'])
