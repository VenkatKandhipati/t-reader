from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..db import get_session
from ..models import Card, Review
from ..schemas import CardIn, CardOut, CardPatch, CardStateSyncBatch, RateIn
from ..sm2 import sm2

router = APIRouter(prefix="/cards", tags=["cards"])


@router.get("", response_model=list[CardOut])
async def list_cards(
    due_only: bool = False,
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[Card]:
    stmt = select(Card).where(Card.user_id == user_id)
    if due_only:
        stmt = stmt.where(Card.next_review <= date.today())
    stmt = stmt.order_by(Card.next_review.asc(), Card.added_at.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=CardOut, status_code=status.HTTP_201_CREATED)
async def upsert_card(
    body: CardIn,
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> Card:
    stmt = (
        insert(Card)
        .values(
            user_id=user_id,
            telugu=body.telugu,
            trans=body.trans,
            meaning=body.meaning,
            story_idx=body.story_idx,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "telugu"],
            set_={
                "trans": body.trans,
                "meaning": body.meaning,
                "story_idx": body.story_idx,
            },
        )
        .returning(Card)
    )
    result = await db.execute(stmt)
    card = result.scalar_one()
    await db.commit()
    return card


@router.patch("/{card_id}", response_model=CardOut)
async def patch_card(
    card_id: uuid.UUID,
    body: CardPatch,
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> Card:
    card = await _get_card(db, card_id, user_id)
    if body.trans is not None:
        card.trans = body.trans
    if body.meaning is not None:
        card.meaning = body.meaning
    await db.commit()
    await db.refresh(card)
    return card


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_card(
    card_id: uuid.UUID,
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    card = await _get_card(db, card_id, user_id)
    await db.delete(card)
    await db.commit()


@router.post("/{card_id}/rate", response_model=CardOut)
async def rate_card(
    card_id: uuid.UUID,
    body: RateIn,
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> Card:
    card = await _get_card(db, card_id, user_id)

    result = sm2(
        interval=card.interval,
        ease_factor=card.ease_factor,
        repetitions=card.repetitions,
        quality=body.quality,
    )

    card.interval = result.interval
    card.ease_factor = result.ease_factor
    card.repetitions = result.repetitions
    card.next_review = result.next_review

    db.add(Review(card_id=card.id, user_id=user_id, quality=body.quality))
    await db.commit()
    await db.refresh(card)
    return card


@router.post("/state-sync", status_code=status.HTTP_204_NO_CONTENT)
async def state_sync(
    body: CardStateSyncBatch,
    user_id: uuid.UUID = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    """Accept full local SRS state and upsert. Used by the write-through sync
    layer when the flashcard page mutates vocabCards after a rating."""
    for c in body.cards:
        stmt = (
            insert(Card)
            .values(
                user_id=user_id,
                telugu=c.telugu,
                trans=c.trans,
                meaning=c.meaning,
                story_idx=c.story_idx,
                interval=c.interval,
                ease_factor=c.ease_factor,
                repetitions=c.repetitions,
                next_review=c.next_review,
            )
            .on_conflict_do_update(
                index_elements=["user_id", "telugu"],
                set_={
                    "trans": c.trans,
                    "meaning": c.meaning,
                    "story_idx": c.story_idx,
                    "interval": c.interval,
                    "ease_factor": c.ease_factor,
                    "repetitions": c.repetitions,
                    "next_review": c.next_review,
                },
            )
            .returning(Card.id)
        )
        card_id = (await db.execute(stmt)).scalar_one()
        if c.last_quality is not None:
            db.add(Review(card_id=card_id, user_id=user_id, quality=c.last_quality))
    await db.commit()


async def _get_card(db: AsyncSession, card_id: uuid.UUID, user_id: uuid.UUID) -> Card:
    stmt = select(Card).where(Card.id == card_id, Card.user_id == user_id)
    card = (await db.execute(stmt)).scalar_one_or_none()
    if not card:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    return card
