from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class CardIn(BaseModel):
    telugu: str = Field(..., min_length=1, max_length=200)
    trans: str | None = None
    meaning: str | None = None
    story_idx: int | None = None


class CardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    telugu: str
    trans: str | None
    meaning: str | None
    story_idx: int | None
    interval: int
    ease_factor: float
    repetitions: int
    next_review: date
    added_at: datetime


class CardPatch(BaseModel):
    trans: str | None = None
    meaning: str | None = None


class RateIn(BaseModel):
    quality: int = Field(..., ge=0, le=5)


class StoryProgressIn(BaseModel):
    story_idx: int = Field(..., ge=0)
    best_pct: int = Field(..., ge=0, le=100)


class StoryProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    story_idx: int
    best_pct: int
    last_read_at: datetime


class ReadDayOut(BaseModel):
    day: date


class StreakOut(BaseModel):
    streak: int
    last_read: date | None


class ImportCard(BaseModel):
    telugu: str
    trans: str | None = None
    meaning: str | None = None
    story_idx: int | None = None
    interval: int = 0
    ease_factor: float = 2.5
    repetitions: int = 0
    next_review: date | None = None
    added_at: datetime | None = None


class ImportPayload(BaseModel):
    cards: list[ImportCard] = Field(default_factory=list)
    story_progress: list[StoryProgressIn] = Field(default_factory=list)
    reading_days: list[date] = Field(default_factory=list)


class ImportResult(BaseModel):
    cards_imported: int
    story_progress_imported: int
    reading_days_imported: int


class CardStateSync(BaseModel):
    telugu: str
    trans: str | None = None
    meaning: str | None = None
    story_idx: int | None = None
    interval: int
    ease_factor: float
    repetitions: int
    next_review: date
    last_quality: int | None = Field(default=None, ge=0, le=5)


class CardStateSyncBatch(BaseModel):
    cards: list[CardStateSync]
