import os
import time
import requests

BASE = "http://localhost:8000/api/v1"
FILE_PATH = r"C:\Users\ashaz\OneDrive\Desktop\GST1\GSTONE\books\BALI 122025.xls"
OUTPUT_PATH = r"C:\Users\ashaz\OneDrive\Desktop\GST1\backend\output_workbook.xlsx"

print("🚀 Starting End-to-End Pipeline Execution via API...")

# 1. Upload
print(f"\n[1] Uploading {os.path.basename(FILE_PATH)}...")
with open(FILE_PATH, "rb") as f:
    resp = requests.post(f"{BASE}/upload", files={"files": (os.path.basename(FILE_PATH), f)})

if not resp.ok:
    print("Upload failed:", resp.text)
    exit(1)

file_info = resp.json()["data"]["files"][0]
file_id = file_info["file_id"]
garden_name = file_info.get("garden_name", "Unknown")
print(f"    ✅ Uploaded successfully. File ID: {file_id}, Garden: {garden_name}")

# 2. Get Sheets
sheets_r = requests.get(f"{BASE}/upload/{file_id}/sheets")
sheets = sheets_r.json()["data"]["sheets"]
target_sheet = sheets[0]
print(f"\n[2] Selected sheet: '{target_sheet}'")

# 3. Pipeline Run
print("\n[3] Triggering Pipeline Run...")
run_payload = {
    "file_ids": [file_id],
    "garden_assignments": [
        {
            "file_id": file_id,
            "sheet_name": target_sheet,
            "garden_name": garden_name
        }
    ],
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

run_r = requests.post(f"{BASE}/pipeline/run", json=run_payload)
if not run_r.ok:
    print("Run failed:", run_r.text)
    exit(1)

run_id = run_r.json()["data"]["run_id"]
print(f"    ✅ Pipeline running. Run ID: {run_id}")

# 4. Poll Status
print("\n[4] Polling for completion...")
while True:
    status_r = requests.get(f"{BASE}/pipeline/{run_id}/status")
    data = status_r.json()["data"]
    status = data["status"]
    
    if status == "complete":
        print(f"    ✅ Pipeline logic complete!")
        print(f"       Original rows: {data['summary']['original_rows']}")
        print(f"       Valid rows: {data['summary']['valid_invoices']}")
        print(f"       Identity errors: {data['summary']['identity_error_count']}")
        break
    elif status == "failed":
        print(f"    ❌ Pipeline failed: {data.get('error')}")
        exit(1)
        
    print(f"       Status: {status} (polling...)")
    time.sleep(0.5)

# 5. Export
print("\n[5] Generating Export Workbook...")
export_r = requests.post(f"{BASE}/pipeline/{run_id}/export", json={"approved_fixes": []})
if not export_r.ok:
    print("Export failed:", export_r.text)
    exit(1)
    
export_id = export_r.json()["data"]["export_id"]
print(f"    ✅ Export generated. Export ID: {export_id}")

# 6. Download
print("\n[6] Downloading workbook...")
download_r = requests.get(f"{BASE}/export/{export_id}/download")
if not download_r.ok:
    print("Download failed:", download_r.text)
    exit(1)

with open(OUTPUT_PATH, "wb") as f:
    f.write(download_r.content)

print(f"\n🎉 ALL DONE! Generated output saved to:")
print(f"   {OUTPUT_PATH}")
