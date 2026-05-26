"""User management — admin-only CRUD for platform users."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.models import User
from app.core.schemas import UserCreate, UserRead
from app.core.security import hash_password, require_admin

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=list[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(require_admin),
) -> list[User]:
    result = await db.execute(select(User).order_by(User.created_at.asc()))
    return list(result.scalars().all())


@router.post("", response_model=UserRead, status_code=201)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(require_admin),
) -> User:
    existing = await db.execute(select(User).where(User.username == payload.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")
    user = User(
        username=payload.username,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.patch("/{user_id}/role", response_model=UserRead)
async def update_role(
    user_id: UUID,
    role: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(require_admin),
) -> User:
    if role not in ("admin", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be admin or viewer")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = role
    await db.flush()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    actor: str = Depends(require_admin),
) -> None:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.username == actor:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    await db.delete(user)
    await db.flush()
