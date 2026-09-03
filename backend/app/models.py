from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, UniqueConstraint, BigInteger
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from .database import Base

class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size = Column(BigInteger, nullable=False)
    content_type = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    organisation = relationship("Organisation")

class Organisation(Base):
    __tablename__ = "organisations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    storage_used_bytes = Column(BigInteger, default=0, nullable=False)
    storage_quota_bytes = Column(BigInteger, default=104857600, nullable=False)

    users = relationship("User", back_populates="organisation")
    roles = relationship("Role", back_populates="organisation")

class Role(Base):
    __tablename__ = "roles"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=False)
    name = Column(String, nullable=False)  # owner, dispatcher, technician
    
    organisation = relationship("Organisation", back_populates="roles")
    users = relationship("User", back_populates="role")

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    organisation = relationship("Organisation", back_populates="users")
    role = relationship("Role", back_populates="users")

class WorkOrder(Base):
    __tablename__ = "work_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    location = Column(String, nullable=True)
    status = Column(String, nullable=False, default="open")  # open, assigned, in_progress, on_hold, completed, cancelled
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    technician_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    scheduled_range = Column(postgresql.TSTZRANGE, nullable=True)

    organisation = relationship("Organisation")
    technician = relationship("User", foreign_keys=[technician_id])

class ProgressEvent(Base):
    __tablename__ = "progress_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(String, unique=True, index=True, nullable=False)
    work_order_id = Column(UUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False)
    status_from = Column(String, nullable=False)
    status_to = Column(String, nullable=False)
    technician_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    work_order = relationship("WorkOrder")
    technician = relationship("User")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    work_order_id = Column(UUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False)
    technician_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending, sent, failed
    attempts = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('work_order_id', 'technician_id', name='uq_notification_work_order_tech'),
    )

    work_order = relationship("WorkOrder")
    technician = relationship("User")

class AuditEntry(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organisation_id = Column(UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    details = Column(postgresql.JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    organisation = relationship("Organisation")
    user = relationship("User")
