with open(r'c:\Users\ashaz\OneDrive\Desktop\GST1\backend\database.py', 'r', encoding='utf-8') as f:
    content = f.read()

broken_part = """def get_ledger_reco_data(
    entity_id: str,
    filter_type: str = "monthly",
    year: Optional[str] = None,
    quarter: Optional[int] = None,
    period: Optional[str] = None,
    offset = (page - 1) * limit
    with get_connection() as connection:"""

fixed_part = """def get_ledger_reco_data(
    entity_id: str,
    filter_type: str = "monthly",
    year: Optional[str] = None,
    quarter: Optional[int] = None,
    period: Optional[str] = None,
    statuses: Optional[List[str]] = None,
    garden_name: Optional[str] = None,
    page: int = 1,
    limit: int = 500,
) -> Dict[str, Any]:
    pc, pp = _build_period_clause(filter_type, year, quarter, period, "rmi.return_period")
    where = "rmi.entity_id = ?"
    params: List[Any] = [entity_id]
    if pc:
        where += f" AND {pc}"
        params.extend(pp)
    if statuses:
        where += f" AND rmi.match_status IN ({','.join('?'*len(statuses))})"
        params.extend(statuses)
    if garden_name:
        where += " AND (JSON_EXTRACT(rmi.row_json, '$.garden_name') = ? OR rmi.match_status = 'MISSING_IN_BOOKS')"
        params.append(garden_name)
    offset = (page - 1) * limit
    with get_connection() as connection:"""

content = content.replace(broken_part, fixed_part)
with open(r'c:\Users\ashaz\OneDrive\Desktop\GST1\backend\database.py', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
