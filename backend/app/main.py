import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .routers import cards, import_data, progress, streaks

logger = logging.getLogger("kathalu")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Kathalu API", version="0.1.0")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    """Ensure CORS headers are present even on unhandled errors."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    origin = request.headers.get("origin")
    headers: dict[str, str] = {}
    if origin and (origin in origins or "*" in origins):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Vary"] = "Origin"
    return JSONResponse({"detail": f"Internal error: {exc}"}, status_code=500, headers=headers)


app.include_router(cards.router)
app.include_router(progress.router)
app.include_router(streaks.router)
app.include_router(import_data.router)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.environment}
