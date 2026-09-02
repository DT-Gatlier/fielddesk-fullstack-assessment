import os
os.add_dll_directory(r'C:\Program Files\PostgreSQL\17\bin')

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

user = os.getenv('POSTGRES_USER', 'postgres')
password = os.getenv('POSTGRES_PASSWORD', 'postgres')

try:
    conn = psycopg2.connect(dbname='postgres', user=user, password=password, host='localhost', port=5432)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    
    cur.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'fielddesk'")
    if not cur.fetchone():
        cur.execute('CREATE DATABASE fielddesk')
        print('Created fielddesk db')
        
    cur.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'fielddesk_test'")
    if not cur.fetchone():
        cur.execute('CREATE DATABASE fielddesk_test')
        print('Created fielddesk_test db')
        
    cur.close()
    conn.close()
except Exception as e:
    print('Error:', e)
