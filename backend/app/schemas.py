from pydantic import BaseModel, EmailStr
from uuid import UUID

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    role_id: UUID
    organisation_id: UUID

    class Config:
        from_attributes = True
