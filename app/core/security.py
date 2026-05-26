"""
Minimal JWT authentication for admin dashboard.
For local single-user use — not multi-tenant enterprise SSO.
"""
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt as _bcrypt

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.core.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {"sub": subject, "exp": expire, "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        sub: str | None = payload.get("sub")
        if sub is None:
            raise JWTError("missing sub")
        return sub
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def authenticate_admin(username: str, password: str) -> bool:
    """Validates admin credentials from .env config (legacy fallback)."""
    return (
        username == settings.admin_username
        and password == settings.admin_password
    )


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
) -> str:
    return decode_token(token)


async def require_admin(user: Annotated[str, Depends(get_current_user)]) -> str:
    """Dependency: only admin users may call this endpoint."""
    from sqlalchemy import select
    from app.core.db import AsyncSessionLocal
    from app.core.models import User
    # Check DB first; fall back to config admin
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == user))
        db_user = result.scalar_one_or_none()
        if db_user and db_user.role == "admin":
            return user
        if db_user and db_user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin role required")
    # Config-based admin fallback (works before DB user is created)
    if user == settings.admin_username:
        return user
    raise HTTPException(status_code=403, detail="Admin role required")
