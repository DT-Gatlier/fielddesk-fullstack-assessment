from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import timedelta

from . import auth, models, schemas, database, deps
from .socket import sio, sio_app
import socketio

app = FastAPI(title="FieldDesk API")

async def emit_work_order_update(org_id: str):
    await sio.emit('work_order_updated', room=f"org_{org_id}")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/login", response_model=schemas.Token)
def login(form_data: schemas.UserLogin, db: Session = Depends(deps.get_db)):
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
        data={"sub": str(user.id), "org_id": str(user.organisation_id), "role_id": str(user.role_id)},
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
    for key, value in update_data.items():
        setattr(db_work_order, key, value)
        
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
def upload_attachment(
    file: UploadFile = File(...),
    work_order_id: Optional[str] = Form(None),
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    file_id = str(uuid.uuid4())
    disk_path = os.path.join(UPLOAD_DIR, file_id)
    
    with open(disk_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    file_size = os.path.getsize(disk_path)
            
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
    db.commit()
    db.refresh(db_attachment)
    
    return schemas.AttachmentResponse.model_validate(db_attachment)

@app.get("/attachments", response_model=List[schemas.AttachmentResponse])
def list_attachments(
    work_order_id: Optional[str] = None,
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    query = db.query(models.Attachment)
    if work_order_id:
        query = query.filter(models.Attachment.work_order_id == work_order_id)
    else:
        query = query.filter(models.Attachment.organisation_id == current_user.organisation_id)
        
    return query.all()

@app.get("/attachments/{attachment_id}")
def get_attachment_info(
    attachment_id: str,
    db: Session = Depends(deps.get_rls_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    attachment = db.query(models.Attachment).filter(models.Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return schemas.AttachmentResponse.model_validate(attachment)

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

app.mount('/socket.io', socketio.ASGIApp(sio, socketio_path=''))

