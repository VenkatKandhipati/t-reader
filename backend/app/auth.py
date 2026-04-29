import uuid

from fastapi import Header, HTTPException, status
from jose import JWTError, jwt

from .config import settings


async def current_user(authorization: str | None = Header(default=None)) -> uuid.UUID:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()
    try:
        claims = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience=settings.supabase_jwt_audience,
        )
    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing sub")

    try:
        return uuid.UUID(sub)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sub is not a uuid") from exc
