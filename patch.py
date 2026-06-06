import sys

with open('backend/services/pipeline_service.py', 'r', encoding='utf-8') as f:
    content = f.read()

target1 = 'row_data = matching.iloc[0].to_dict()'
replacement1 = 'row_data = matching.iloc[0].to_dict()\n            safe_row_data = {str(k): v for k, v in row_data.items() if pd.notna(v)}'
content = content.replace(target1, replacement1)

target2 = 'category="VALUE_INCONSISTENCY",\n                affected_rows=ce.affected_rows\n            ))'
replacement2 = 'category="VALUE_INCONSISTENCY",\n                affected_rows=ce.affected_rows,\n                original_row_data=safe_row_data\n            ))'

target2_win = target2.replace('\n', '\r\n')
replacement2_win = replacement2.replace('\n', '\r\n')

content = content.replace(target2_win, replacement2_win)
content = content.replace(target2, replacement2)

with open('backend/services/pipeline_service.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
