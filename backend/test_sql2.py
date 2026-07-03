import sqlite3

def run():
    conn = sqlite3.connect(':memory:')
    
    q = """
    SELECT SUM(CAST(REPLACE(REPLACE(IFNULL(JSON_EXTRACT('{"Taxable Value": "₹ 1,234.00"}', '$."Taxable Value"'), '0'), ',', ''), '₹', '') AS REAL))
    """
    res = conn.execute(q).fetchone()
    print("Res 3:", repr(res))

run()
