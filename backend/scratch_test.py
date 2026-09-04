import psycopg2
import uuid

conn = psycopg2.connect('postgresql://postgres:7591achu@localhost:5432/fielddesk')
conn.autocommit = True
cur = conn.cursor()
try:
    cur.execute("SELECT id FROM organisations LIMIT 1")
    row = cur.fetchone()
    if row:
        org_id = row[0]
        wo_id = str(uuid.uuid4())
        cur.execute("INSERT INTO work_orders (id, organisation_id, title, status) VALUES (%s, %s, 'Test WO', 'open')", (wo_id, org_id))
        print('Inserted work order.')
    else:
        print('No orgs found')
except Exception as e:
    print('Insert error:', e)
