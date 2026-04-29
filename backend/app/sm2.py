from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class Sm2Result:
    interval: int
    ease_factor: float
    repetitions: int
    next_review: date


def sm2(
    *,
    interval: int,
    ease_factor: float,
    repetitions: int,
    quality: int,
    today: date | None = None,
) -> Sm2Result:
    if quality < 0 or quality > 5:
        raise ValueError("quality must be in [0, 5]")

    today = today or date.today()

    if quality < 3:
        return Sm2Result(
            interval=1,
            ease_factor=max(1.3, ease_factor),
            repetitions=0,
            next_review=today + timedelta(days=1),
        )

    if repetitions == 0:
        new_interval = 1
    elif repetitions == 1:
        new_interval = 6
    else:
        new_interval = round(interval * ease_factor)

    new_ef = max(
        1.3,
        ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
    )

    return Sm2Result(
        interval=new_interval,
        ease_factor=new_ef,
        repetitions=repetitions + 1,
        next_review=today + timedelta(days=new_interval),
    )
