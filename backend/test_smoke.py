"""
GST ONE API — Smoke Test
Run: python test_smoke.py  (server must be running on :8000)
"""
import json
import requests

BASE = "http://localhost:8000/api/v1"


def hit(label, method, url, **kwargs):
    try:
        r = getattr(requests, method)(url, **kwargs)
        print(f"\n{'='*55}")
        print(f"  {label}")
        print(f"  {method.upper()} {url}")
        print(f"  Status: {r.status_code}")
        print(json.dumps(r.json(), indent=2, default=str)[:800])  # truncate huge payloads
    except Exception as exc:
        print(f"\n  ERROR: {exc}")


# ── 1. Health ──────────────────────────────────────────────────
hit("Health Check", "get", "http://localhost:8000/health")

# ── 2. Contexts ────────────────────────────────────────────────
hit("List Contexts", "get", f"{BASE}/contexts")

# ── 3. Vendor Search ───────────────────────────────────────────
hit("Vendor Search (q=a, context=ASSAM_GARDENS)", "get", f"{BASE}/vendors/search?q=a&context=ASSAM_GARDENS&limit=3")

# ── 4. Upload a file ───────────────────────────────────────────
# Replace the path below with a real Excel file on your machine
SAMPLE_FILE = r"C:\Users\ashaz\OneDrive\Desktop\GST1\GSTONE\books\BALI 122025.xls"
import os
if os.path.exists(SAMPLE_FILE):
    with open(SAMPLE_FILE, "rb") as f:
        resp = requests.post(f"{BASE}/upload", files={"files": (os.path.basename(SAMPLE_FILE), f)})
    print(f"\n{'='*55}\n  Upload\n  Status: {resp.status_code}")
    print(json.dumps(resp.json(), indent=2, default=str)[:500])

    if resp.ok:
        file_id = resp.json()["data"]["files"][0]["file_id"]
        
        # Get actual sheet name from /sheets endpoint
        sheets_r = requests.get(f"{BASE}/upload/{file_id}/sheets")
        print(f"\n{'='*55}\n  Sheets for {file_id}\n  Status: {sheets_r.status_code}")
        sheets_data = sheets_r.json()
        print(json.dumps(sheets_data, indent=2, default=str))
        
        first_sheet = sheets_data["data"]["sheets"][0] if sheets_data.get("data") and sheets_data["data"].get("sheets") else "Sheet1"
        
        hit(f"Mapping Detect (Sheet: {first_sheet})", "post", f"{BASE}/mapping/detect",
            json={"file_id": file_id, "sheet_name": first_sheet})
else:
    print(f"\n  [SKIP] Upload test — set SAMPLE_FILE to a real .xlsx path in test_smoke.py")

print("\n\n✅ Smoke test complete.")
