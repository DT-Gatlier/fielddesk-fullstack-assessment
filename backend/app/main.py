from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from . import auth, models, schemas, database, deps

app = FastAPI(title="FieldDesk API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/login", response_model=schemas.Token)
def login(form_data: schemas.UserLogin, db: Session = Depends(deps.get_db)):
    # To log in, we need to find the user. But since we don't know their org yet,
    # we have to bypass RLS. Since login needs to search across orgs to find the user by email,
    # we can do it with a direct query (by default, if app.current_tenant_id is not set, 
    # the query might fail if RLS forces it. Wait! 
    # If RLS is strictly enabled and forces app.current_tenant_id, a query without it will return 0 rows.
    # To solve this, the DB admin or the login function can temporarily use a BYPASSRLS role, 
    # OR we make the users table readable by the backend service role without RLS, and enforce RLS for others.
    # Actually, RLS policies apply only if enabled and if the role isn't a superuser/owner of the table.
    # Usually, the API connects as a role that is NOT the table owner to enforce RLS.
    # But wait, postgres has a way to bypass RLS for the table owner. If the connection user is the owner,
    # RLS is bypassed by default unless FORCE ROW LEVEL SECURITY is used. 
    # Let's assume the DB connection user is the owner for now, so it can query the user.
    # We will enforce it via the tenant variable.
    
    user = db.query(models.User).filter(models.User.email == form_data.email).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": str(user.id), "org_id": str(user.organisation_id), "role": user.role},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(deps.get_current_user)):
    return current_user
