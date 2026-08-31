# Provides reusable helpers for the route
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from . import auth, models, database

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        user_id: str = payload.get("sub")
        org_id: str = payload.get("org_id")
        if user_id is None or org_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    db.execute(text("SET LOCAL app.current_organisation_id = :org_id"), {"org_id": org_id})
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user

def get_rls_db(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db

def get_dispatcher_user(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    role = db.query(models.Role).filter(models.Role.id == current_user.role_id).first()
    if not role or role.name not in ["dispatcher", "owner"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user

def get_technician_user(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    role = db.query(models.Role).filter(models.Role.id == current_user.role_id).first()
    if not role or role.name != "technician":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user
