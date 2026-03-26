from fastapi import APIRouter, HTTPException, Request, Query
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.config import settings
from app.db.supabase import get_supabase
import httpx
import hashlib
import json
from datetime import datetime, timedelta

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs"
CACHE_TTL_HOURS = 24

def cache_key(query: str, location: str, page: int) -> str:
    raw = f"{query}:{location}:{page}"
    return hashlib.md5(raw.encode()).hexdigest()

@router.get("/search")
@limiter.limit("30/minute")
async def search_jobs(
    request: Request,
    q: str = Query(..., min_length=2, max_length=100),
    location: str = Query("uk", max_length=50),
    page: int = Query(1, ge=1, le=10),
):
    """
    Search jobs via Adzuna API with 24hr caching.
    Results cached in Supabase to preserve free tier quota.
    """
    sb = get_supabase()
    ck = cache_key(q, location, page)

    # Check cache first
    try:
        cached = sb.table("adzuna_cache") \
            .select("*") \
            .eq("cache_key", ck) \
            .gt("expires_at", datetime.utcnow().isoformat()) \
            .execute()

        if cached.data:
            return {"source": "cache", "results": json.loads(cached.data[0]["results"])}
    except Exception:
        pass  # Cache miss — continue to API

    # Call Adzuna API
    url = f"{ADZUNA_BASE}/{location}/search/{page}"
    params = {
        "app_id": settings.ADZUNA_APP_ID,
        "app_key": settings.ADZUNA_API_KEY,
        "what": q,
        "results_per_page": 10,
        "content-type": "application/json",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=502, detail="Adzuna API error")
        except Exception:
            raise HTTPException(status_code=503, detail="Job search temporarily unavailable")

    # Normalise results — only keep what we need, no bloat
    results = []
    for job in data.get("results", []):
        results.append({
            "adzuna_id":    job.get("id", ""),
            "title":        job.get("title", ""),
            "company":      job.get("company", {}).get("display_name", ""),
            "location":     job.get("location", {}).get("display_name", ""),
            "country":      location.upper(),
            "salary_min":   job.get("salary_min"),
            "salary_max":   job.get("salary_max"),
            "posted":       job.get("created", ""),
            "url":          job.get("redirect_url", ""),
            "description":  job.get("description", "")[:300],
        })

    # Store in cache
    try:
        expires = (datetime.utcnow() + timedelta(hours=CACHE_TTL_HOURS)).isoformat()
        sb.table("adzuna_cache").upsert({
            "cache_key":  ck,
            "results":    json.dumps(results),
            "expires_at": expires,
        }).execute()
    except Exception:
        pass  # Cache write failure is non-fatal

    return {"source": "api", "total": data.get("count", 0), "results": results}
