from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager

from app.routers import auth, tracker, sightings, pulse, adzuna
from app.db.supabase import init_supabase
from app.config import settings

limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_supabase()
    yield

app = FastAPI(
    title="TopListers API",
    description="Privacy-first job market intelligence platform",
    version="1.0.0",
    docs_url="/api/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "https://toplisters.xyz", "https://www.toplisters.xyz"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/api/auth",      tags=["auth"])
app.include_router(tracker.router,   prefix="/api/tracker",   tags=["tracker"])
app.include_router(sightings.router, prefix="/api/sightings", tags=["sightings"])
app.include_router(pulse.router,     prefix="/api/pulse",     tags=["pulse"])
app.include_router(adzuna.router,    prefix="/api/adzuna",    tags=["adzuna"])

@app.get("/api/health")
async def health():
    return {"status": "ok", "project": "TopListers", "version": "1.0.0"}
