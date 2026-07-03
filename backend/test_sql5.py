from database import get_connection

with get_connection() as conn:
    res = conn.execute("""
        SELECT row_json, JSON_EXTRACT(row_json, '$.\"Taxable Amount\"') as t_amt 
        FROM raw_books_uploads LIMIT 1
    """).fetchone()
    print("row_json:", res["row_json"])
    print("t_amt:", res["t_amt"])
