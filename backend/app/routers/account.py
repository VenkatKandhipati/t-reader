from __future__ import annotations

import uuid
from datetime import date, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..config import settings
from ..db import get_session
from ..models import Card, ReadingDay, ReadingSession, Review, StoryProgress
from ..schemas import HeatmapOut, HeatmapPoint, PasswordChangeIn, ReadingSessionIn

router = APIRouter(prefix="/account", tags=["account"])


# ── Reading sessions ────────────────────────────────────────────────────────

@router.post("/sessions", status_code=status.HTTP_204_NO_CONTENT)
async def record_session(
    body: ReadingSessionIn,
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    db.add(ReadingSession(user_id=user_id, story_idx=body.story_idx, pct=body.pct))
    await db.commit()


# ── Stats bundle ────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict:
    today = date.today()

    streak = await _compute_streaks(db, user_id, today)
    stories = await _compute_story_stats(db, user_id)
    vocab = await _compute_vocab_stats(db, user_id, today)
    reviews = await _compute_review_stats(db, user_id, today)
    weekday_hour = await _compute_weekday_hour(db, user_id)
    hardest = await _compute_hardest_words(db, user_id)
    forecast = await _compute_due_forecast(db, user_id, today)

    return {
        "streak": streak,
        "stories": stories,
        "vocab": vocab,
        "reviews": reviews,
        "weekday_hour": weekday_hour,
        "hardest_words": hardest,
        "forecast": forecast,
    }


# ── Heatmap ────────────────────────────────────────────────────────────────

@router.get("/heatmap", response_model=HeatmapOut)
async def get_heatmap(
    range: str = Query("year", pattern="^(week|month|year)$"),
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> HeatmapOut:
    today = date.today()
    if range == "week":
        start = today - timedelta(days=6)
    elif range == "month":
        start = today - timedelta(days=29)
    else:
        start = today - timedelta(days=364)

    counts: dict[date, int] = {}

    review_rows = await db.execute(
        select(
            func.date_trunc("day", Review.reviewed_at).label("day"),
            func.count().label("n"),
        )
        .where(Review.user_id == user_id, Review.reviewed_at >= start)
        .group_by(text("day"))
    )
    for d, n in review_rows.all():
        if d is None:
            continue
        counts[d.date() if hasattr(d, "date") else d] = counts.get(d, 0) + n

    session_rows = await db.execute(
        select(
            func.date_trunc("day", ReadingSession.started_at).label("day"),
            func.count().label("n"),
        )
        .where(ReadingSession.user_id == user_id, ReadingSession.started_at >= start)
        .group_by(text("day"))
    )
    for d, n in session_rows.all():
        if d is None:
            continue
        key = d.date() if hasattr(d, "date") else d
        counts[key] = counts.get(key, 0) + n

    day_rows = await db.execute(
        select(ReadingDay.day).where(
            ReadingDay.user_id == user_id, ReadingDay.day >= start
        )
    )
    for (d,) in day_rows.all():
        counts.setdefault(d, 0)
        if counts[d] == 0:
            counts[d] = 1

    days = [HeatmapPoint(day=d, count=c) for d, c in sorted(counts.items())]
    return HeatmapOut(range=range, start=start, end=today, days=days)


# ── Account ─────────────────────────────────────────────────────────────────

@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: PasswordChangeIn,
    user_id: uuid.UUID = Depends(current_user),
) -> None:
    base, key = _admin_creds()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.put(
            f"{base}/auth/v1/admin/users/{user_id}",
            headers={"Authorization": f"Bearer {key}", "apikey": key},
            json={"password": body.new_password},
        )
    if resp.status_code >= 400:
        raise HTTPException(resp.status_code, f"Auth admin error: {resp.text}")


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    user_id: uuid.UUID = Depends(current_user),
) -> None:
    base, key = _admin_creds()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.delete(
            f"{base}/auth/v1/admin/users/{user_id}",
            headers={"Authorization": f"Bearer {key}", "apikey": key},
        )
    if resp.status_code >= 400 and resp.status_code != 404:
        raise HTTPException(resp.status_code, f"Auth admin error: {resp.text}")


# ── Helpers ─────────────────────────────────────────────────────────────────

def _admin_creds() -> tuple[str, str]:
    base = settings.supabase_url.rstrip("/") if settings.supabase_url else ""
    key = settings.supabase_service_role_key
    if not base or not key:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Admin operations require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
        )
    return base, key


async def _compute_streaks(
    db: AsyncSession, user_id: uuid.UUID, today: date
) -> dict:
    rows = (
        await db.execute(
            select(ReadingDay.day)
            .where(ReadingDay.user_id == user_id)
            .order_by(ReadingDay.day.asc())
        )
    ).all()
    days = [d for (d,) in rows]
    total = len(days)
    if not days:
        return {
            "current": 0,
            "longest": 0,
            "total_days": 0,
            "first_read": None,
            "last_read": None,
        }

    longest = 1
    run = 1
    for prev, curr in zip(days, days[1:]):
        if (curr - prev).days == 1:
            run += 1
            longest = max(longest, run)
        else:
            run = 1

    current = 0
    last = days[-1]
    if (today - last).days <= 1:
        current = 1
        for prev, curr in zip(reversed(days), list(reversed(days))[1:]):
            if (prev - curr).days == 1:
                current += 1
            else:
                break

    return {
        "current": current,
        "longest": longest,
        "total_days": total,
        "first_read": days[0].isoformat(),
        "last_read": last.isoformat(),
    }


async def _compute_story_stats(db: AsyncSession, user_id: uuid.UUID) -> dict:
    rows = (
        await db.execute(
            select(StoryProgress.story_idx, StoryProgress.best_pct).where(
                StoryProgress.user_id == user_id
            )
        )
    ).all()
    started = len(rows)
    if not started:
        return {
            "started": 0,
            "completed": 0,
            "mastered": 0,
            "avg_proficiency": 0,
            "per_story": [],
        }

    completed = sum(1 for _, p in rows if p >= 80)
    mastered = sum(1 for _, p in rows if p >= 100)
    avg = round(sum(p for _, p in rows) / started)

    per_story = [
        {"story_idx": int(idx), "best_pct": int(p)} for idx, p in rows
    ]
    per_story.sort(key=lambda x: x["story_idx"])
    return {
        "started": started,
        "completed": completed,
        "mastered": mastered,
        "avg_proficiency": avg,
        "per_story": per_story,
    }


async def _compute_vocab_stats(
    db: AsyncSession, user_id: uuid.UUID, today: date
) -> dict:
    learning = case((Card.repetitions < 2, 1), else_=0)
    young = case(
        (Card.repetitions >= 2, case((Card.interval < 21, 1), else_=0)), else_=0
    )
    mature = case((Card.interval >= 21, 1), else_=0)
    mastered = case((Card.interval >= 90, 1), else_=0)
    due_today = case((Card.next_review <= today, 1), else_=0)

    row = (
        await db.execute(
            select(
                func.count().label("total"),
                func.coalesce(func.sum(learning), 0).label("learning"),
                func.coalesce(func.sum(young), 0).label("young"),
                func.coalesce(func.sum(mature), 0).label("mature"),
                func.coalesce(func.sum(mastered), 0).label("mastered"),
                func.coalesce(func.sum(due_today), 0).label("due_today"),
                func.coalesce(func.avg(Card.ease_factor), 0.0).label("avg_ease"),
            ).where(Card.user_id == user_id)
        )
    ).one()

    return {
        "total": int(row.total),
        "learning": int(row.learning),
        "young": int(row.young),
        "mature": int(row.mature),
        "mastered": int(row.mastered),
        "due_today": int(row.due_today),
        "avg_ease": round(float(row.avg_ease), 2),
    }


async def _compute_review_stats(
    db: AsyncSession, user_id: uuid.UUID, today: date
) -> dict:
    since_30 = today - timedelta(days=30)
    since_7 = today - timedelta(days=7)
    correct = case((Review.quality >= 3, 1), else_=0)
    in_7d = case((Review.reviewed_at >= since_7, 1), else_=0)
    in_30d = case((Review.reviewed_at >= since_30, 1), else_=0)
    correct_30d = case(
        (and_(Review.reviewed_at >= since_30, Review.quality >= 3), 1), else_=0
    )

    row = (
        await db.execute(
            select(
                func.count().label("total"),
                func.coalesce(func.sum(in_7d), 0).label("last_7d"),
                func.coalesce(func.sum(in_30d), 0).label("last_30d"),
                func.coalesce(func.sum(correct), 0).label("correct_total"),
                func.coalesce(func.sum(correct_30d), 0).label("correct_30d"),
            ).where(Review.user_id == user_id)
        )
    ).one()

    total = int(row.total)
    correct_total = int(row.correct_total)
    last_30 = int(row.last_30d)
    correct_30 = int(row.correct_30d)

    quality_rows = (
        await db.execute(
            select(Review.quality, func.count())
            .where(Review.user_id == user_id)
            .group_by(Review.quality)
        )
    ).all()
    quality_dist = {str(q): int(c) for q, c in quality_rows}
    for q in range(6):
        quality_dist.setdefault(str(q), 0)

    return {
        "total": total,
        "last_7d": int(row.last_7d),
        "last_30d": last_30,
        "accuracy_overall": round(correct_total / total, 3) if total else 0.0,
        "accuracy_30d": round(correct_30 / last_30, 3) if last_30 else 0.0,
        "quality_dist": quality_dist,
    }


async def _compute_weekday_hour(db: AsyncSession, user_id: uuid.UUID) -> list:
    rows = (
        await db.execute(
            select(
                func.extract("dow", Review.reviewed_at).label("wd"),
                func.extract("hour", Review.reviewed_at).label("hr"),
                func.count(),
            )
            .where(Review.user_id == user_id)
            .group_by(text("wd"), text("hr"))
        )
    ).all()
    return [[int(w), int(h), int(c)] for w, h, c in rows]


async def _compute_hardest_words(db: AsyncSession, user_id: uuid.UUID) -> list:
    rows = (
        await db.execute(
            select(Card.telugu, Card.trans, Card.ease_factor, Card.repetitions)
            .where(Card.user_id == user_id, Card.repetitions >= 2)
            .order_by(Card.ease_factor.asc())
            .limit(10)
        )
    ).all()
    return [
        {
            "telugu": t,
            "trans": tr,
            "ease_factor": round(float(ef), 2),
            "repetitions": int(r),
        }
        for t, tr, ef, r in rows
    ]


async def _compute_due_forecast(
    db: AsyncSession, user_id: uuid.UUID, today: date
) -> dict:
    end = today + timedelta(days=30)
    rows = (
        await db.execute(
            select(Card.next_review, func.count())
            .where(
                Card.user_id == user_id,
                Card.next_review >= today,
                Card.next_review <= end,
            )
            .group_by(Card.next_review)
        )
    ).all()
    by_day = {d.isoformat(): int(c) for d, c in rows}
    return {"by_day": by_day}
