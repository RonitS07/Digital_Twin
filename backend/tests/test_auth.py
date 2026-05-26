import pytest
import os
import json
import base64
from fastapi.testclient import TestClient
from fastapi import status, WebSocketDisconnect
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db.database import Base, get_db
from db.models import User
from db.auth import create_access_token
from core.config import settings
from main import app

from sqlalchemy.pool import StaticPool

# Create a clean temporary in-memory database using StaticPool to share state between all connections
SQLALCHEMY_DATABASE_URL = "sqlite://"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(autouse=True)
def setup_db():
    # Setup database schema
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()

    # Define the superadmin email configuration
    settings.SUPERADMIN_EMAIL = "superadmin@example.com"
    # Ensure any hardlocked sets are re-loaded or dynamically populated
    from security.auth import HARDLOCKED_ADMIN_EMAILS
    HARDLOCKED_ADMIN_EMAILS.clear()
    HARDLOCKED_ADMIN_EMAILS.add("superadmin@example.com")

    # Create test users
    regular_user = User(
        id="user_123",
        email="user@example.com",
        name="Regular User",
        is_admin=False
    )
    db_admin = User(
        id="admin_456",
        email="dbadmin@example.com",
        name="DB Admin User",
        is_admin=True
    )
    superadmin_user = User(
        id="superadmin_789",
        email="superadmin@example.com",
        name="Super Admin User",
        is_admin=False  # DB says false, but hardlock must promote in-memory to True
    )

    db.add(regular_user)
    db.add(db_admin)
    db.add(superadmin_user)
    db.commit()

    yield db

    db.close()
    Base.metadata.drop_all(bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

def test_admin_endpoint_unauthorized():
    # Access an admin endpoint with no auth token
    response = client.get("/admin/mcp/status")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

def test_admin_endpoint_invalid_token():
    # Access an admin endpoint with an invalid format token
    headers = {"Authorization": "Bearer not-a-valid-token"}
    response = client.get("/admin/mcp/status", headers=headers)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

def test_admin_endpoint_forbidden_for_regular_user():
    # Create a valid token for a regular user
    token = create_access_token({"sub": "user_123"})
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.get("/admin/mcp/status", headers=headers)
    assert response.status_code == status.HTTP_403_FORBIDDEN

def test_admin_endpoint_allowed_for_db_admin():
    # Create a valid token for a DB admin
    token = create_access_token({"sub": "admin_456"})
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.get("/admin/mcp/status", headers=headers)
    # If the database connection succeeds, it should not return 401 or 403
    assert response.status_code != status.HTTP_401_UNAUTHORIZED
    assert response.status_code != status.HTTP_403_FORBIDDEN

def test_admin_endpoint_allowed_for_superadmin_hardlock():
    # Create a valid token for the superadmin user (email in settings.SUPERADMIN_EMAIL, is_admin=False in DB)
    token = create_access_token({"sub": "superadmin_789"})
    headers = {"Authorization": f"Bearer {token}"}
    
    response = client.get("/admin/mcp/status", headers=headers)
    # The dynamic _apply_hardlock will promote this user to admin, allowing access
    assert response.status_code != status.HTTP_401_UNAUTHORIZED
    assert response.status_code != status.HTTP_403_FORBIDDEN

def test_websocket_first_frame_auth_success():
    # Connect to the global WebSocket endpoint
    with client.websocket_connect("/twin-chat/ws") as websocket:
        # Create a valid token
        token = create_access_token({"sub": "user_123"})
        
        # Send first frame: auth
        websocket.send_json({
            "event": "auth",
            "token": token
        })
        
        # Expect event: connected
        data = websocket.receive_json()
        assert data.get("event") == "connected"
        assert data.get("user_id") == "user_123"

def test_websocket_first_frame_auth_missing():
    # Connect and send a non-auth frame
    with client.websocket_connect("/twin-chat/ws") as websocket:
        websocket.send_json({
            "event": "ping"
        })
        
        # Expect immediate rejection/close
        data = websocket.receive_json()
        assert data.get("event") == "error"
        assert data.get("code") == "AUTH_REQUIRED"

def test_websocket_first_frame_auth_invalid_token():
    # Connect and send a bad token
    with client.websocket_connect("/twin-chat/ws") as websocket:
        websocket.send_json({
            "event": "auth",
            "token": "bad-token-signature"
        })
        
        # Expect unauthorized rejection
        data = websocket.receive_json()
        assert data.get("event") == "error"
        assert data.get("code") == "UNAUTHORIZED"
