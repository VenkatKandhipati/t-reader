from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..db import get_session
from ..models import Card, ReadingDay, StoryProgress
from ..schemas import ImportPayload, ImportResult

router = APIRouter(prefix="/import", tags=["import"])


@router.post("", response_model=ImportResult)
async def import_local(
    payload: ImportPayload,
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ImportResult:
    cards_imported = 0
    if payload.cards:
        rows = [
            {
                "user_id": user_id,
                "telugu": c.telugu,
                "trans": c.trans,
                "meaning": c.meaning,
                "story_idx": c.story_idx,
                "interval": c.interval,
                "ease_factor": c.ease_factor,
                "repetitions": c.repetitions,
                "next_review": c.next_review or date.today(),
                "added_at": c.added_at or datetime.now(tz=timezone.utc),
            }
            for c in payload.cards
        ]
        stmt = (
            insert(Card)
            .values(rows)
            .on_conflict_do_nothing(index_elements=["user_id", "telugu"])
        )
        result = await db.execute(stmt)
        cards_imported = result.rowcount or 0

    sp_imported = 0
    if payload.story_progress:
        sp_rows = [
            {
                "user_id": user_id,
                "story_idx": sp.story_idx,
                "best_pct": sp.best_pct,
            }
            for sp in payload.story_progress
        ]
        stmt = (
            insert(StoryProgress)
            .values(sp_rows)
            .on_conflict_do_nothing(index_elements=["user_id", "story_idx"])
        )
        result = await db.execute(stmt)
        sp_imported = result.rowcount or 0

    rd_imported = 0
    if payload.reading_days:
        rd_rows = [{"user_id": user_id, "day": d} for d in payload.reading_days]
        stmt = (
            insert(ReadingDay)
            .values(rd_rows)
            .on_conflict_do_nothing(index_elements=["user_id", "day"])
        )
        result = await db.execute(stmt)
        rd_imported = result.rowcount or 0

    await db.commit()

    return ImportResult(
        cards_imported=cards_imported,
        story_progress_imported=sp_imported,
        reading_days_imported=rd_imported,
    )
