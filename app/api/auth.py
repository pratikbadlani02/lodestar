"""Auth routes — login and token endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.models import User
from app.core.schemas import TokenResponse
from app.core.security import (
    authenticate_admin, create_access_token, get_current_user, verify_password,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    # Try DB users first
    result = await db.execute(select(User).where(User.username == form.username, User.is_active == True))
    db_user = result.scalar_one_or_none()
    if db_user:
        if not verify_password(form.password, db_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        token = create_access_token(subject=db_user.username)
        return TokenResponse(access_token=token)

    # Fallback: config-based admin
    if not authenticate_admin(form.username, form.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(subject=form.username)
    return TokenResponse(access_token=token)


@router.get("/me")
async def me(
    user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(User).where(User.username == user))
    db_user = result.scalar_one_or_none()
    role = db_user.role if db_user else "admin"  # config admin is always admin
    return {"username": user, "role": role}
