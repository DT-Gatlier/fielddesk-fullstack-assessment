from pydantic import BaseModel, EmailStr
from uuid import UUID
from typing import Literal

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

WorkOrderStatus = Literal["open", "assigned", "in_progress", "on_hold", "completed", "cancelled"]

class WorkOrderBase(BaseModel):
    title: str
    description: str | None = None
    status: WorkOrderStatus = "open"

class WorkOrderCreate(WorkOrderBase):
    pass

class WorkOrderUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: WorkOrderStatus | None = None

class WorkOrderResponse(WorkOrderBase):
    id: UUID
    organisation_id: UUID
    created_at: str | None = None
    
    class Config:
        from_attributes = True

class PaginatedWorkOrders(BaseModel):
    data: list[WorkOrderResponse]
    total: int

