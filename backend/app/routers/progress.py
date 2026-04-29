from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..db import get_session
from ..models import ReadingDay, StoryProgress
from ..schemas import StoryProgressIn, StoryProgressOut

router = APIRouter(tags=["progress"])


@router.get("/progress", response_model=list[StoryProgressOut])
async def list_progress(
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[StoryProgress]:
    stmt = select(StoryProgress).where(StoryProgress.user_id == user_id)
    return list((await db.execute(stmt)).scalars().all())


@router.post("/progress", response_model=StoryProgressOut)
async def upsert_progress(
    body: StoryProgressIn,
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> StoryProgress:
    existing = (
        await db.execute(
            select(StoryProgress).where(
                StoryProgress.user_id == user_id,
                StoryProgress.story_idx == body.story_idx,
            )
        )
    ).scalar_one_or_none()

    now = datetime.now(tz=timezone.utc)

    if existing is None:
        existing = StoryProgress(
            user_id=user_id,
            story_idx=body.story_idx,
            best_pct=body.best_pct,
            last_read_at=now,
        )
        db.add(existing)
    else:
        if body.best_pct > existing.best_pct:
            existing.best_pct = body.best_pct
        existing.last_read_at = now

    await db.commit()
    await db.refresh(existing)
    return existing


@router.post("/reading-days", status_code=204)
async def record_reading_day(
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    stmt = (
        insert(ReadingDay)
        .values(user_id=user_id, day=date.today())
        .on_conflict_do_nothing(index_elements=["user_id", "day"])
    )
    await db.execute(stmt)
    await db.commit()
