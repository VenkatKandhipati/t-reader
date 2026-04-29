import time
import uuid

import httpx
from fastapi import Header, HTTPException, status
from jose import JWTError, jwt

from .config import settings

_JWKS_TTL = 3600
_jwks_cache: dict[str, object] = {"keys": None, "fetched_at": 0.0}


async def _jwks() -> dict:
    if (
        _jwks_cache["keys"]
        and time.time() - float(_jwks_cache["fetched_at"]) < _JWKS_TTL
    ):
        return _jwks_cache["keys"]  # type: ignore[return-value]

    base = settings.supabase_url.rstrip("/") if settings.supabase_url else None
    if not base:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "SUPABASE_URL is not configured",
        )

    url = f"{base}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(url)
    resp.raise_for_status()
    _jwks_cache["keys"] = resp.json()
    _jwks_cache["fetched_at"] = time.time()
    return _jwks_cache["keys"]  # type: ignore[return-value]


async def current_user(authorization: str | None = Header(default=None)) -> uuid.UUID:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()

    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Bad token header: {exc}") from exc

    alg = unverified_header.get("alg")

    try:
        if alg == "HS256":
            if not settings.supabase_jwt_secret:
                raise HTTPException(
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "Token is HS256 but SUPABASE_JWT_SECRET is not configured",
                )
            claims = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience=settings.supabase_jwt_audience,
            )
        elif alg in ("ES256", "RS256"):
            jwks = await _jwks()
            claims = jwt.decode(
                token,
                jwks,
                algorithms=[alg],
                audience=settings.supabase_jwt_audience,
            )
        else:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Unsupported alg: {alg}")
    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing sub")

    try:
        return uuid.UUID(sub)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "sub is not a uuid") from exc
