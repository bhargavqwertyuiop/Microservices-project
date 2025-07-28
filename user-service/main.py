from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
import uvicorn
import os
import time
import json
import asyncio
from typing import List, Optional
from prometheus_client import Counter, Histogram, generate_latest
from fastapi.responses import PlainTextResponse
import structlog
import redis.asyncio as redis
import pika
import threading

from database import get_db, engine, Base
from models import User
from schemas import UserCreate, UserResponse, UserUpdate, LoginRequest
from auth import get_password_hash, verify_password, create_access_token, verify_token
from config import settings

# Configure structured logging
logger = structlog.get_logger()

# Prometheus metrics
REQUEST_COUNT = Counter('user_service_requests_total', 'Total requests', ['method', 'endpoint', 'status'])
REQUEST_DURATION = Histogram('user_service_request_duration_seconds', 'Request duration')

# Redis connection
redis_client = None

# RabbitMQ connection
rabbitmq_connection = None
rabbitmq_channel = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global redis_client, rabbitmq_connection, rabbitmq_channel
    
    # Create database tables
    Base.metadata.create_all(bind=engine)
    
    # Initialize Redis
    try:
        redis_client = redis.Redis.from_url(settings.redis_url)
        await redis_client.ping()
        logger.info("Connected to Redis")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
    
    # Initialize RabbitMQ
    try:
        def setup_rabbitmq():
            global rabbitmq_connection, rabbitmq_channel
            rabbitmq_connection = pika.BlockingConnection(
                pika.URLParameters(settings.rabbitmq_url)
            )
            rabbitmq_channel = rabbitmq_connection.channel()
            
            # Declare exchanges and queues
            rabbitmq_channel.exchange_declare(exchange='user_events', exchange_type='topic')
            rabbitmq_channel.queue_declare(queue='user_created', durable=True)
            rabbitmq_channel.queue_declare(queue='user_updated', durable=True)
            rabbitmq_channel.queue_bind(exchange='user_events', queue='user_created', routing_key='user.created')
            rabbitmq_channel.queue_bind(exchange='user_events', queue='user_updated', routing_key='user.updated')
        
        setup_rabbitmq()
        logger.info("Connected to RabbitMQ")
    except Exception as e:
        logger.error(f"Failed to connect to RabbitMQ: {e}")
    
    yield
    
    # Shutdown
    if redis_client:
        await redis_client.close()
    if rabbitmq_connection and not rabbitmq_connection.is_closed:
        rabbitmq_connection.close()

app = FastAPI(
    title="User Service",
    description="Microservice for user management and authentication",
    version="1.0.0",
    lifespan=lifespan
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_hosts
)

security = HTTPBearer()

# Middleware for logging and metrics
@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    start_time = time.time()
    
    response = await call_next(request)
    
    duration = time.time() - start_time
    
    # Metrics
    REQUEST_COUNT.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()
    REQUEST_DURATION.observe(duration)
    
    # Logging
    logger.info(
        "Request processed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration=duration,
        client_ip=request.client.host
    )
    
    return response

def publish_event(routing_key: str, message: dict):
    """Publish event to RabbitMQ"""
    try:
        if rabbitmq_channel:
            rabbitmq_channel.basic_publish(
                exchange='user_events',
                routing_key=routing_key,
                body=json.dumps(message),
                properties=pika.BasicProperties(delivery_mode=2)  # Make message persistent
            )
    except Exception as e:
        logger.error(f"Failed to publish event: {e}")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Get current authenticated user"""
    try:
        payload = verify_token(credentials.credentials)
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        
        return user
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "service": "user-service",
        "version": "1.0.0"
    }

# Metrics endpoint
@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    """Prometheus metrics endpoint"""
    return generate_latest()

# Authentication endpoints
@app.post("/auth/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        hashed_password=hashed_password,
        is_active=True
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Cache user data
    if redis_client:
        try:
            await redis_client.setex(
                f"user:{user.id}",
                3600,  # 1 hour
                json.dumps({
                    "id": user.id,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "is_active": user.is_active
                })
            )
        except Exception as e:
            logger.error(f"Failed to cache user data: {e}")
    
    # Publish event
    publish_event("user.created", {
        "user_id": user.id,
        "email": user.email,
        "timestamp": time.time()
    })
    
    logger.info(f"User registered: {user.email}")
    
    return UserResponse.from_orm(user)

@app.post("/auth/login")
async def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user and return access token"""
    
    user = db.query(User).filter(User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account is disabled")
    
    access_token = create_access_token(data={"sub": str(user.id)})
    
    logger.info(f"User logged in: {user.email}")
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse.from_orm(user)
    }

# User management endpoints
@app.get("/users/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return UserResponse.from_orm(current_user)

@app.put("/users/me", response_model=UserResponse)
async def update_current_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update current user profile"""
    
    # Update user fields
    if user_update.first_name is not None:
        current_user.first_name = user_update.first_name
    if user_update.last_name is not None:
        current_user.last_name = user_update.last_name
    if user_update.email is not None:
        # Check if email is already taken
        existing_user = db.query(User).filter(
            User.email == user_update.email,
            User.id != current_user.id
        ).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already taken")
        current_user.email = user_update.email
    
    db.commit()
    db.refresh(current_user)
    
    # Update cache
    if redis_client:
        try:
            await redis_client.setex(
                f"user:{current_user.id}",
                3600,
                json.dumps({
                    "id": current_user.id,
                    "email": current_user.email,
                    "first_name": current_user.first_name,
                    "last_name": current_user.last_name,
                    "is_active": current_user.is_active
                })
            )
        except Exception as e:
            logger.error(f"Failed to update cache: {e}")
    
    # Publish event
    publish_event("user.updated", {
        "user_id": current_user.id,
        "email": current_user.email,
        "timestamp": time.time()
    })
    
    logger.info(f"User updated: {current_user.email}")
    
    return UserResponse.from_orm(current_user)

@app.get("/users/{user_id}", response_model=UserResponse)
async def get_user_by_id(user_id: int, db: Session = Depends(get_db)):
    """Get user by ID (public endpoint for other services)"""
    
    # Try cache first
    if redis_client:
        try:
            cached_user = await redis_client.get(f"user:{user_id}")
            if cached_user:
                user_data = json.loads(cached_user)
                return UserResponse(**user_data)
        except Exception as e:
            logger.error(f"Cache lookup failed: {e}")
    
    # Fallback to database
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse.from_orm(user)

@app.get("/users", response_model=List[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List users (protected endpoint)"""
    
    users = db.query(User).offset(skip).limit(limit).all()
    return [UserResponse.from_orm(user) for user in users]

@app.delete("/users/me")
async def delete_current_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete current user account"""
    
    # Soft delete by deactivating
    current_user.is_active = False
    db.commit()
    
    # Remove from cache
    if redis_client:
        try:
            await redis_client.delete(f"user:{current_user.id}")
        except Exception as e:
            logger.error(f"Failed to remove from cache: {e}")
    
    # Publish event
    publish_event("user.deleted", {
        "user_id": current_user.id,
        "email": current_user.email,
        "timestamp": time.time()
    })
    
    logger.info(f"User deleted: {current_user.email}")
    
    return {"message": "User account deleted successfully"}

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=os.getenv("DEBUG", "false").lower() == "true"
    )