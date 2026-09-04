import socketio
from jose import jwt, JWTError
from urllib.parse import parse_qs
from .auth import SECRET_KEY, ALGORITHM

sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=[]
)
sio_app = socketio.ASGIApp(sio)

@sio.on('connect')
async def connect(sid, environ, auth_data):
    token = None
    if isinstance(auth_data, dict):
        token = auth_data.get('token')
    
    if not token:
        query = environ.get('QUERY_STRING', '')
        qs = parse_qs(query)
        token = qs.get('token', [None])[0]
        
    if not token:
        # Try headers
        headers = dict(environ.get('headers', []))
        auth_header = headers.get(b'authorization', b'').decode('utf-8')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]

    if not token:
        raise socketio.exceptions.ConnectionRefusedError('authentication failed')

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        org_id = payload.get("org_id")
        if not org_id:
            raise socketio.exceptions.ConnectionRefusedError('invalid token')
        sio.enter_room(sid, f"org_{org_id}")
        
        # Save session data if needed
        async with sio.session(sid) as session:
            session['org_id'] = org_id
            
    except JWTError:
        raise socketio.exceptions.ConnectionRefusedError('authentication failed')
