from database import get_ledger_kpis

try:
    res = get_ledger_kpis("ASSAM_GARDENS", "all", None, None, None, "HO")
    print("SUCCESS")
except Exception as e:
    print("ERROR:", e)
