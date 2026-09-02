import os
os.add_dll_directory(r'C:\Program Files\PostgreSQL\17\bin')
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

admin_user = os.getenv('POSTGRES_USER', 'postgres')
admin_password = os.getenv('POSTGRES_PASSWORD', 'postgres')

conn = psycopg2.connect(dbname='postgres', user=admin_user, password=admin_password, host='localhost', port=5432)
conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
cur = conn.cursor()

try:
    cur.execute("CREATE USER fielddesk WITH PASSWORD 'securepassword';")
    print('Created user fielddesk')
except Exception as e:
    print('Error creating user:', e)

try:
    cur.execute("ALTER USER fielddesk CREATEDB;")
    cur.execute("GRANT ALL PRIVILEGES ON DATABASE fielddesk TO fielddesk;")
    cur.execute("GRANT ALL PRIVILEGES ON DATABASE fielddesk_test TO fielddesk;")
    cur.execute("ALTER DATABASE fielddesk OWNER TO fielddesk;")
    cur.execute("ALTER DATABASE fielddesk_test OWNER TO fielddesk;")
    print('Granted privileges')
except Exception as e:
    print('Error granting privileges:', e)

cur.close()
conn.close()
