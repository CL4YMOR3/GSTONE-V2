import sqlite3

def run():
    conn = sqlite3.connect(':memory:')
    
    # Test 1: JSON_EXTRACT with space in key
    q = """
    SELECT JSON_EXTRACT('{"Taxable Value": "₹ 1,234.00"}', '$.\"Taxable Value\"')
    """
    res = conn.execute(q).fetchone()
    print("Res 1:", res)
    
    # Test 2: Invalid path
    try:
        q = """
        SELECT JSON_EXTRACT('{"Taxable Value": "₹ 1,234.00"}', '$.Taxable Value')
        """
        res = conn.execute(q).fetchone()
        print("Res 2:", res)
    except Exception as e:
        print("Error 2:", e)

    # Test 3: SUM CAST
    q = """
    SELECT SUM(CAST(REPLACE(REPLACE(IFNULL(JSON_EXTRACT('{"Taxable Value": "₹ 1,234.00"}', '$.\"Taxable Value\"'), '0'), ',', ''), '₹', '') AS REAL))
    """
    res = conn.execute(q).fetchone()
    print("Res 3:", res)

run()
