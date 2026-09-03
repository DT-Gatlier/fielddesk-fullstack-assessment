from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import timedelta

from . import auth, models, schemas, database, deps
from .socket import sio, sio_app
import socketio

import logging
import structlog
from asgi_correlation_id import CorrelationIdMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request


structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
)
logger = structlog.get_logger()

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="FieldDesk API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.on_event("startup")
async def startup_event():
    logger.info("application_startup")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("application_shutdown")
    database.engine.dispose()

async def emit_work_order_update(org_id: str):
    await sio.emit('work_order_updated', room=f"org_{org_id}")

app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/login", response_model=schemas.Token)
@limiter.limit("5/minute")
def login(request: Request, form_data: schemas.UserLogin, db: Session = Depends(deps.get_db)):
    logger.info("login_attempt", email=form_data.email)
    # To log in, we must query the user by email without knowing their org_id.
    # Since FORCE RLS is on, we bypass RLS for this specific transaction.
    db.execute(text("SET LOCAL row_security = OFF"))
    
    user = db.query(models.User).filter(models.User.email == form_data.email).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    # Note: user.role is now a Role object. We extract its name or ID.
    access_token = auth.create_access_token(
        data={"sub": str(user.id), "org_id": str(user.organisation_id), "role_id": str(user.role_id), "role": user.role.name},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from typing import List

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={"error": "Validation error", "detail": exc.errors()},
    )

@app.get("/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(deps.get_current_user)):
    return current_user

from typing import List, Optional


import csv
import io
from fastapi.responses import StreamingResponse

def sanitize_csv_field(value):
    if value is None:
        return ""
    val_str = str(value)
    if val_str.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + val_str
    return val_str

from jose import jwt, JWTError
from .auth import SECRET_KEY, ALGORITHM

def get_user_id(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return get_remote_address(request)
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub") or get_remote_address(request)
    except JWTError:
        return get_remote_address(request)

@app.get("/work-orders/export")
@limiter.limit("4/minute", key_func=get_user_id)
def export_work_orders(
    request: Request,
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_owner_user)
):
    def iter_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "Title", "Description", "Status", "Technician ID", "Created At", "Updated At", "Scheduled Range"])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        query = db.query(models.WorkOrder).execution_options(stream_results=True).yield_per(100)
        for wo in query:
            writer.writerow([
                sanitize_csv_field(wo.id),
                sanitize_csv_field(wo.title),
                sanitize_csv_field(wo.description),
                sanitize_csv_field(wo.status),
                sanitize_csv_field(wo.technician_id),
                sanitize_csv_field(wo.created_at.isoformat() if wo.created_at else ""),
                sanitize_csv_field(wo.updated_at.isoformat() if wo.updated_at else ""),
                sanitize_csv_field(str(wo.scheduled_range) if wo.scheduled_range else "")
            ])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    headers = {
        "Content-Disposition": "attachment; filename=work_orders.csv",
        "Content-Type": "text/csv"
    }
    return StreamingResponse(iter_csv(), headers=headers)

@app.get("/work-orders", response_model=schemas.PaginatedWorkOrders)

def get_work_orders(
    current: int = 1, pageSize: int = 10,
    status: Optional[str] = None,
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_dispatcher_user)
):
    skip = (current - 1) * pageSize
    query = db.query(models.WorkOrder)
    if status:
        query = query.filter(models.WorkOrder.status == status)
    
    total = query.count()
    data = query.offset(skip).limit(pageSize).all()
    parsed_data = [schemas.WorkOrderResponse.model_validate(wo) for wo in data]
    return {"data": parsed_data, "total": total}

@app.get("/work-orders/{work_order_id}", response_model=schemas.WorkOrderResponse)
def get_work_order(
    work_order_id: str,
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_dispatcher_user)
):
    db_work_order = db.query(models.WorkOrder).filter(models.WorkOrder.id == work_order_id).first()
    if not db_work_order:
        raise HTTPException(status_code=404, detail="Work order not found")
    return schemas.WorkOrderResponse.model_validate(db_work_order)

@app.post("/work-orders", response_model=schemas.WorkOrderResponse, status_code=201)
def create_work_order(
    work_order: schemas.WorkOrderCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_dispatcher_user)
):
    db_work_order = models.WorkOrder(**work_order.model_dump(), organisation_id=current_user.organisation_id)
    db.add(db_work_order)
    db.flush()
    audit_log = models.AuditEntry(
        organisation_id=current_user.organisation_id,
        user_id=current_user.id,
        action="create_work_order",
        entity_type="work_order",
        entity_id=db_work_order.id,
        details=work_order.model_dump()
    )
    db.add(audit_log)
    db.commit()
    db.refresh(db_work_order)
    background_tasks.add_task(emit_work_order_update, str(current_user.organisation_id))
    return schemas.WorkOrderResponse.model_validate(db_work_order)

@app.patch("/work-orders/{work_order_id}", response_model=schemas.WorkOrderResponse)
def update_work_order(
    work_order_id: str,
    work_order_update: schemas.WorkOrderUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_dispatcher_user)
):
    db_work_order = db.query(models.WorkOrder).filter(models.WorkOrder.id == work_order_id).first()
    if not db_work_order:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    if db_work_order.status in ["completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Cannot modify a terminal work order")
        
    update_data = work_order_update.model_dump(exclude_unset=True)
    
    if "status" in update_data:
        status_from = db_work_order.status
        status_to = update_data["status"]
        audit_details = {"status_from": status_from, "status_to": status_to, "updates": update_data}
        audit_action = "status_change"
    else:
        audit_details = {"updates": update_data}
        audit_action = "update_work_order"
        
    for key, value in update_data.items():
        setattr(db_work_order, key, value)
        
    db.flush()
    if update_data:
        audit_entry = models.AuditEntry(
            organisation_id=current_user.organisation_id,
            user_id=current_user.id,
            action=audit_action,
            entity_type="work_order",
            entity_id=db_work_order.id,
            details=audit_details
        )
        db.add(audit_entry)
        
    db.commit()
    db.refresh(db_work_order)
    background_tasks.add_task(emit_work_order_update, str(current_user.organisation_id))
    return schemas.WorkOrderResponse.model_validate(db_work_order)

@app.delete("/work-orders/{work_order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_order(
    work_order_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_dispatcher_user)
):
    db_work_order = db.query(models.WorkOrder).filter(models.WorkOrder.id == work_order_id).first()
    if not db_work_order:
        raise HTTPException(status_code=404, detail="Work order not found")
    
    db.delete(db_work_order)
    db.commit()
    background_tasks.add_task(emit_work_order_update, str(current_user.organisation_id))
    return None

@app.get("/technicians", response_model=List[schemas.UserResponse])
def get_technicians(
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_dispatcher_user)
):
    # Get the technician role id for the org
    tech_role = db.query(models.Role).filter(
        models.Role.organisation_id == current_user.organisation_id,
        models.Role.name == "technician"
    ).first()
    
    if not tech_role:
        return []
        
    technicians = db.query(models.User).filter(
        models.User.organisation_id == current_user.organisation_id,
        models.User.role_id == tech_role.id
    ).all()
    
    return technicians

from sqlalchemy.exc import IntegrityError
from psycopg2.extras import DateTimeTZRange

from .worker import send_assignment_notification

@app.post("/work-orders/{work_order_id}/assign", response_model=schemas.WorkOrderResponse)
def assign_work_order(
    work_order_id: str,
    assignment: schemas.WorkOrderAssign,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_dispatcher_user)
):
    db_work_order = db.query(models.WorkOrder).filter(models.WorkOrder.id == work_order_id).first()
    if not db_work_order:
        raise HTTPException(status_code=404, detail="Work order not found")
        
    if db_work_order.status in ["completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Cannot modify a terminal work order")

    # verify technician exists and is in same org
    tech = db.query(models.User).filter(
        models.User.id == assignment.technician_id,
        models.User.organisation_id == current_user.organisation_id
    ).first()
    if not tech:
        raise HTTPException(status_code=404, detail="Technician not found in your organisation")

    start_dt = assignment.scheduled_start
    end_dt = assignment.scheduled_end
    
    if start_dt >= end_dt:
        raise HTTPException(status_code=400, detail="Start time must be before end time")

    db_work_order.technician_id = assignment.technician_id
    db_work_order.scheduled_range = DateTimeTZRange(start_dt, end_dt, '[)')
    db_work_order.status = "assigned"

    try:
        db.flush()
        audit_log = models.AuditEntry(
            organisation_id=current_user.organisation_id,
            user_id=current_user.id,
            action="assign_work_order",
            entity_type="work_order",
            entity_id=db_work_order.id,
            details={"technician_id": str(assignment.technician_id), "scheduled_start": assignment.scheduled_start.isoformat(), "scheduled_end": assignment.scheduled_end.isoformat()}
        )
        db.add(audit_log)
        db.commit()
        db.refresh(db_work_order)
        
        # Prevent duplicate notifications
        existing_notification = db.query(models.Notification).filter(
            models.Notification.work_order_id == db_work_order.id,
            models.Notification.technician_id == db_work_order.technician_id,
            models.Notification.status.in_(["pending", "sent"])
        ).first()
        
        if not existing_notification:
            notification = models.Notification(
                work_order_id=db_work_order.id,
                technician_id=db_work_order.technician_id
            )
            db.add(notification)
            try:
                db.commit()
                db.refresh(notification)
                send_assignment_notification.delay(str(notification.id))
            except IntegrityError as e:
                db.rollback()
                if 'uq_notification_work_order_tech' not in str(e):
                    raise e
            
    except IntegrityError as e:
        db.rollback()
        # Check if it's the exclusion constraint
        if 'no_overlapping_assignments' in str(e):
            raise HTTPException(status_code=409, detail="Technician is already assigned to another work order during this scheduled range")
        raise e

    background_tasks.add_task(emit_work_order_update, str(current_user.organisation_id))
    return schemas.WorkOrderResponse.model_validate(db_work_order)
@app.post("/work-orders/{work_order_id}/progress", response_model=schemas.ProgressEventResponse)
def submit_progress_event(
    work_order_id: str,
    event: schemas.ProgressEventCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_technician_user)
):
    # Idempotency check FIRST
    existing_event = db.query(models.ProgressEvent).filter(models.ProgressEvent.event_id == event.event_id).first()
    if existing_event:
        return schemas.ProgressEventResponse.model_validate(existing_event)
        
    db_work_order = db.query(models.WorkOrder).filter(models.WorkOrder.id == work_order_id).first()
    if not db_work_order:
        raise HTTPException(status_code=404, detail="Work order not found")
        
    if current_user.id != db_work_order.technician_id:
        raise HTTPException(status_code=403, detail="Not assigned to this work order")
        
    valid_transitions = {
        "assigned": ["in_progress", "cancelled"],
        "in_progress": ["on_hold", "completed", "cancelled"],
        "on_hold": ["in_progress", "cancelled"]
    }
    
    if event.status_to not in valid_transitions.get(db_work_order.status, []):
        raise HTTPException(status_code=400, detail=f"Cannot transition from {db_work_order.status} to {event.status_to}")

    new_event = models.ProgressEvent(
        event_id=event.event_id,
        work_order_id=db_work_order.id,
        status_from=db_work_order.status,
        status_to=event.status_to,
        technician_id=current_user.id
    )
    
    db_work_order.status = event.status_to
    
    db.add(new_event)
    try:
        db.flush()
        audit_log = models.AuditEntry(
            organisation_id=current_user.organisation_id,
            user_id=current_user.id,
            action="status_change",
            entity_type="work_order",
            entity_id=db_work_order.id,
            details={"status_from": db_work_order.status, "status_to": event.status_to, "event_id": event.event_id}
        )
        db.add(audit_log)
        db.commit()
        db.refresh(new_event)
    except IntegrityError as e:
        db.rollback()
        # In case of concurrent submission with same event_id
        if "ix_progress_events_event_id" in str(e) or "progress_events_event_id_key" in str(e):
            existing_event = db.query(models.ProgressEvent).filter(models.ProgressEvent.event_id == event.event_id).first()
            if existing_event:
                return schemas.ProgressEventResponse.model_validate(existing_event)
        raise e
        
    background_tasks.add_task(emit_work_order_update, str(current_user.organisation_id))
    return schemas.ProgressEventResponse.model_validate(new_event)

from fastapi import UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy import update
import os
import uuid
import shutil

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/attachments", response_model=schemas.AttachmentResponse, status_code=201)
async def upload_attachment(
    file: UploadFile = File(...),
    work_order_id: Optional[uuid.UUID] = Form(None),
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    org = db.query(models.Organisation).filter(models.Organisation.id == current_user.organisation_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")
        
    remaining_quota = org.storage_quota_bytes - org.storage_used_bytes
    if remaining_quota <= 0:
        raise HTTPException(status_code=400, detail="Storage quota exceeded")

    file_id = str(uuid.uuid4())
    disk_path = os.path.join(UPLOAD_DIR, file_id)
    
    file_size = 0
    try:
        with open(disk_path, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                file_size += len(chunk)
                if file_size > remaining_quota:
                    raise HTTPException(status_code=400, detail="Storage quota exceeded")
                buffer.write(chunk)
    except Exception as e:
        if os.path.exists(disk_path):
            os.remove(disk_path)
        raise e
            
    # Atomic quota check and increment
    stmt = (
        update(models.Organisation)
        .where(
            models.Organisation.id == current_user.organisation_id,
            models.Organisation.storage_used_bytes + file_size <= models.Organisation.storage_quota_bytes
        )
        .values(storage_used_bytes=models.Organisation.storage_used_bytes + file_size)
        .returning(models.Organisation.id)
    )
    result = db.execute(stmt).scalar()
    
    if not result:
        if os.path.exists(disk_path):
            os.remove(disk_path)
        raise HTTPException(status_code=400, detail="Storage quota exceeded")
        
    db_attachment = models.Attachment(
        id=file_id,
        organisation_id=current_user.organisation_id,
        work_order_id=work_order_id,
        file_name=file.filename or "unnamed",
        file_path=file_id,
        file_size=file_size,
        content_type=file.content_type or "application/octet-stream"
    )
    db.add(db_attachment)
    try:
        db.commit()
        db.refresh(db_attachment)
    except Exception as e:
        db.rollback()
        if os.path.exists(disk_path):
            os.remove(disk_path)
        # Attempt to rollback the quota increment
        rollback_stmt = (
            update(models.Organisation)
            .where(models.Organisation.id == current_user.organisation_id)
            .values(storage_used_bytes=models.Organisation.storage_used_bytes - file_size)
        )
        db.execute(rollback_stmt)
        db.commit()
        raise e
    
    return schemas.AttachmentResponse.model_validate(db_attachment)

@app.get("/attachments", response_model=List[schemas.AttachmentResponse])
def list_attachments(
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    query = db.query(models.Attachment).filter(models.Attachment.organisation_id == current_user.organisation_id)
    return query.all()

@app.get("/attachments/{attachment_id}/download")
def download_attachment(
    attachment_id: str,
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    attachment = db.query(models.Attachment).filter(models.Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
        
    disk_path = os.path.join(UPLOAD_DIR, attachment.file_path)
    if not os.path.exists(disk_path):
        raise HTTPException(status_code=404, detail="File missing on disk")
        
    return FileResponse(
        path=disk_path,
        filename=attachment.file_name,
        media_type=attachment.content_type
    )

@app.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    attachment_id: str,
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    attachment = db.query(models.Attachment).filter(models.Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    file_size = attachment.file_size
    disk_path = os.path.join(UPLOAD_DIR, attachment.file_path)

    db.delete(attachment)
    try:
        # Decrement quota atomically
        stmt = (
            update(models.Organisation)
            .where(models.Organisation.id == current_user.organisation_id)
            .values(storage_used_bytes=models.Organisation.storage_used_bytes - file_size)
        )
        db.execute(stmt)
        db.commit()
    except Exception as e:
        db.rollback()
        raise e

    if os.path.exists(disk_path):
        os.remove(disk_path)

    return None

@app.get("/organisation/quota", response_model=schemas.QuotaResponse)
def get_quota(db: Session = Depends(deps.get_rls_db), current_user: models.User = Depends(deps.get_owner_user)):
    org = db.query(models.Organisation).filter(models.Organisation.id == current_user.organisation_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")
    return schemas.QuotaResponse(storage_used_bytes=org.storage_used_bytes, storage_quota_bytes=org.storage_quota_bytes)


@app.get("/users", response_model=List[schemas.UserWithRoleResponse])
def get_users(db: Session = Depends(deps.get_rls_db), current_user: models.User = Depends(deps.get_owner_user)):
    users = db.query(models.User).filter(models.User.organisation_id == current_user.organisation_id).all()
    result = []
    for user in users:
        role_name = user.role.name if user.role else "unknown"
        result.append(schemas.UserWithRoleResponse(id=user.id, email=user.email, role=role_name))
    return result

from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@app.post("/users")
def invite_user(invite: schemas.UserInvite, db: Session = Depends(deps.get_rls_db), current_user: models.User = Depends(deps.get_owner_user)):
    # Find role
    role = db.query(models.Role).filter(models.Role.organisation_id == current_user.organisation_id, models.Role.name == invite.role).first()
    if not role:
        raise HTTPException(status_code=400, detail="Role not found")
    
    existing = db.query(models.User).filter(models.User.email == invite.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    hashed_pw = pwd_context.hash("password123")
    new_user = models.User(
        id=uuid.uuid4(),
        organisation_id=current_user.organisation_id,
        email=invite.email,
        hashed_password=hashed_pw,
        role_id=role.id,
        created_at=datetime.utcnow()
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"status": "ok", "id": str(new_user.id)}

@app.patch("/users/{user_id}")
def update_user_role(user_id: str, update_data: schemas.UserRoleUpdate, db: Session = Depends(deps.get_rls_db), current_user: models.User = Depends(deps.get_owner_user)):
    user = db.query(models.User).filter(models.User.id == user_id, models.User.organisation_id == current_user.organisation_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    role = db.query(models.Role).filter(models.Role.organisation_id == current_user.organisation_id, models.Role.name == update_data.role).first()
    if not role:
        raise HTTPException(status_code=400, detail="Role not found")
        
    user.role_id = role.id
    db.commit()
    return {"status": "ok"}

app.mount('/socket.io', socketio.ASGIApp(sio, socketio_path=''))

