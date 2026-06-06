import os
import requests
import time

BASE = "http://localhost:8000/api/v1"
FILES_TO_UPLOAD = [
    r"C:\Users\ashaz\OneDrive\Desktop\GST1\GSTONE\books\BALI 122025.xls",
    r"C:\Users\ashaz\OneDrive\Desktop\GST1\GSTONE\books\DEA 122025.xls",
    r"C:\Users\ashaz\OneDrive\Desktop\GST1\GSTONE\books\THOW 122025.xls",
    r"C:\Users\ashaz\OneDrive\Desktop\GST1\GSTONE\books\ZALO 122025.xls"
]

print("🚀 Starting 4-GARDEN End-to-End Pipeline Execution via API...\n")

uploaded_files = []

# 1. Upload
print("[1] Uploading files...")
for fpath in FILES_TO_UPLOAD:
    fname = os.path.basename(fpath)
    with open(fpath, "rb") as f:
        resp = requests.post(f"{BASE}/upload", files={"files": (fname, f, "application/vnd.ms-excel")})
        
    if resp.status_code != 200:
        print(f"❌ Upload failed for {fname}:", resp.text)
        exit(1)
    
    file_info = resp.json()["data"]["files"][0]
    file_id = file_info["file_id"]
    garden_name = file_info.get("garden_name", "Unknown")
    print(f"    ✅ {fname} uploaded. File ID: {file_id}, Garden: {garden_name}")
    
    # 2. Get Sheets
    sheets_r = requests.get(f"{BASE}/upload/{file_id}/sheets")
    if sheets_r.status_code != 200:
        print(f"❌ Get sheets failed: {sheets_r.text}")
        exit(1)
        
    sheets = sheets_r.json()["data"]["sheets"]
    target_sheet = sheets[0]
    print(f"    ✅ Selected sheet: '{target_sheet}'")
    
    uploaded_files.append({
        "file_id": file_id,
        "sheet_name": target_sheet,
        "garden_name": garden_name
    })

# 3. Pipeline Run
print("\n[3] Triggering Multi-Garden Pipeline Run...")
file_ids = [uf["file_id"] for uf in uploaded_files]

run_payload = {
    "file_ids": file_ids,
    "garden_assignments": uploaded_files,
    "col_map": {
        "vendor_name": "Account",
        "gstin": "TIN/GSTIN No.",
        "invoice_number": "Purchase Bill No",
        "invoice_date": "Purchase Bill Date",
        "taxable_value": "Taxable Amount",
        "igst_amount": "Igst Amount",
        "cgst_amount": "Cgst Amount",
        "sgst_amount": "Sgst Amount",
        "ugst_amount": "Ugst Amount",
        "total_invoice_value": "Bill Amount"
    },
    "business_context": "ASSAM_GARDENS",
    "company_gstins": ["18AADCD2743H7ZL", "19AADCD2743H1ZP"],
    "fix_actions": []
}

r2 = requests.post(f"{BASE}/pipeline/run", json=run_payload)
if r2.status_code != 200:
    print("❌ Pipeline Start failed:", r2.text)
    exit(1)

run_id = r2.json()["data"]["run_id"]
print(f"    ✅ Pipeline running. Run ID: {run_id}")

# 4. Polling Status
print("\n[4] Polling Pipeline Status...")
while True:
    r3 = requests.get(f"{BASE}/pipeline/{run_id}/status")
    data = r3.json()["data"]
    status = data["status"]
    if status == "complete":
        print("    ✅ Pipeline processing complete!")
        print("    📊 Summary:", data.get("summary"))
        print("    🌳 Garden Stats:", data.get("garden_stats"))
        break
    elif status == "failed":
        print("    ❌ Pipeline failed:", data.get("error"))
        exit(1)
    
    print(f"    ⏳ Status: {status}...")
    time.sleep(1)

# 5. Export
print("\n[5] Generating Multi-Garden Export Workbook...")
r4 = requests.post(f"{BASE}/pipeline/{run_id}/export", json={"approved_fixes": []})
if r4.status_code != 200:
    print("❌ Export failed:", r4.text)
    exit(1)

export_id = r4.json()["data"]["export_id"]
size = r4.json()["data"]["file_size_bytes"]
print(f"    ✅ Export generated. Export ID: {export_id} (Size: {size} bytes)")

# 6. Download
print("\n[6] Downloading Output Workbook...")
r5 = requests.get(f"{BASE}/export/{export_id}/download")
if r5.status_code == 200:
    with open("multi_garden_output.xlsx", "wb") as f:
        f.write(r5.content)
    print("    🎉 Success! Downloaded as 'multi_garden_output.xlsx'.")
else:
    print("❌ Download failed:", r5.text)
