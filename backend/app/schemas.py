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

from datetime import datetime

class WorkOrderAssign(BaseModel):
    technician_id: UUID
    scheduled_start: datetime
    scheduled_end: datetime

class WorkOrderResponse(WorkOrderBase):
    id: UUID
    organisation_id: UUID
    created_at: datetime | None = None
    technician_id: UUID | None = None
    scheduled_time: tuple[datetime, datetime] | None = None
    
    @classmethod
    def model_validate(cls, obj, *args, **kwargs):
        # Handle psycopg2 DateTimeTZRange
        if hasattr(obj, 'scheduled_time') and obj.scheduled_time:
            # Create a dictionary from the ORM object to mutate
            data = {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
            data['scheduled_time'] = (obj.scheduled_time.lower, obj.scheduled_time.upper)
            return super().model_validate(data, *args, **kwargs)
        return super().model_validate(obj, *args, **kwargs)

    class Config:
        from_attributes = True

class PaginatedWorkOrders(BaseModel):
    data: list[WorkOrderResponse]
    total: int

