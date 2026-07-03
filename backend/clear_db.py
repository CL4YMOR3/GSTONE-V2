import sqlite3
import sys

conn = sqlite3.connect('data/gst_one_forensic.db')
tables = [t[0] for t in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
keep = {'system_entities', 'garden_registry', 'sqlite_sequence'}

for t in tables:
    if t not in keep:
        print(f'Deleting rows from {t}')
        conn.execute(f'DELETE FROM {t}')

conn.commit()
print('DB Cleared')
