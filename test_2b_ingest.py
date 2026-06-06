import asyncio
import os
import sys

# Add backend and GSTONE to path
sys.path.insert(0, os.path.abspath('backend'))
sys.path.insert(0, os.path.abspath('GSTONE'))

from backend.services import reco_service
import backend.session_store as store

async def test_reco():
    # 1. create dummy reco session
    reco_id = "TEST_RECO_123"
    store.recos[reco_id] = store.RecoSession(
        reco_id=reco_id,
        parent_run_id="DUMMY_RUN",
        status="ingesting",
        declared_gstin="22AAAAA0000A1Z5",
        declared_period="12-2023",
        upload_ids=["U1"]
    )
    
    # 2. provide a test 2b file path
    # let's look for a test 2b file
    test_file = r"C:\Users\ashaz\OneDrive\Desktop\GST1\GSTONE\2B_jsons\2B_1.json"
    if not os.path.exists(test_file):
        print(f"File not found: {test_file}")
        return
        
    print(f"Testing ingestion for {test_file}...")
    try:
        await reco_service.ingest_2b_files(
            reco_id=reco_id,
            file_paths=[test_file],
            declared_gstin="22AAAAA0000A1Z5",
            declared_period="12-2023"
        )
        print("Ingestion completed successfully!")
        
        reco = store.get_reco(reco_id)
        print("Status:", reco.status)
        print("Stats:", reco.canonical_stats)
    except Exception as e:
        print("Error during ingestion:", e)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_reco())
