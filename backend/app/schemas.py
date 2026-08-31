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

class WorkOrderBase(BaseModel):
    title: str
    description: str | None = None
    status: str = "open"
    assigned_to: UUID | None = None

class WorkOrderCreate(WorkOrderBase):
    pass

class WorkOrderUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    assigned_to: UUID | None = None

class WorkOrderResponse(WorkOrderBase):
    id: UUID
    organisation_id: UUID
    
    class Config:
        from_attributes = True
