import sys
sys.path.insert(0, r'c:\Users\ashaz\OneDrive\Desktop\GST1\backend')
import database as db

with db.get_connection() as conn:
    tables = [
        'raw_books_uploads',
        'books_run_clean_items',
        'books_run_warning_items',
        'books_run_error_items',
        'books_invoice_facts',
        'books_source_files',
        'books_runs'
    ]
    for table in tables:
        conn.execute(f'DELETE FROM {table}')
    conn.commit()
    print('Completely wiped all ledger pipeline data.')
