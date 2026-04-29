from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..db import get_session
from ..models import Card, ReadingDay, Review
from ..schemas import StreakOut

router = APIRouter(tags=["stats"])


@router.get("/streak", response_model=StreakOut)
async def get_streak(
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> StreakOut:
    stmt = (
        select(ReadingDay.day)
        .where(ReadingDay.user_id == user_id)
        .order_by(ReadingDay.day.desc())
    )
    days = [d for (d,) in (await db.execute(stmt)).all()]
    if not days:
        return StreakOut(streak=0, last_read=None)

    today = date.today()
    first = days[0]
    if (today - first).days > 1:
        return StreakOut(streak=0, last_read=first)

    streak = 1
    for prev, curr in zip(days, days[1:]):
        if (prev - curr).days == 1:
            streak += 1
        else:
            break
    return StreakOut(streak=streak, last_read=first)


@router.get("/stats")
async def get_stats(
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    total_cards = (
        await db.execute(select(func.count()).select_from(Card).where(Card.user_id == user_id))
    ).scalar_one()

    due_today = (
        await db.execute(
            select(func.count())
            .select_from(Card)
            .where(Card.user_id == user_id, Card.next_review <= date.today())
        )
    ).scalar_one()

    since = date.today() - timedelta(days=30)
    reviews_30d = (
        await db.execute(
            select(func.count())
            .select_from(Review)
            .where(Review.user_id == user_id, Review.reviewed_at >= since)
        )
    ).scalar_one()

    return {
        "total_cards": total_cards,
        "due_today": due_today,
        "reviews_30d": reviews_30d,
    }
