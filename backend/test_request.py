import requests

BASE = "http://localhost:8000/api/v1"

# Upload
print("Testing upload...")
try:
    with open("BALI 122025.xls", "rb") as f:
        r = requests.post(f"{BASE}/upload", files={"files": ("BALI 122025.xls", f, "application/vnd.ms-excel")})
        print("Upload status:", r.status_code)
        print("Upload response:", r.json())
        
        file_id = r.json().get("data", {}).get("files", [{}])[0].get("file_id")
        
        if file_id:
            # Sheets
            print(f"\nTesting get_sheets for {file_id}...")
            r_s = requests.get(f"{BASE}/upload/{file_id}/sheets")
            print("Sheets status:", r_s.status_code)
            print("Sheets response:", r_s.json())
except Exception as e:
    print("Error:", e)
