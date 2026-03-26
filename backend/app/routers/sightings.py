from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.models.schemas import SightingCreate
from app.db.supabase import get_supabase

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

@router.post("/")
@limiter.limit("10/hour")
async def submit_sighting(request: Request, body: SightingCreate):
    """
    Anonymous job sighting submission.
    GDPR compliant — no PII stored, no IP logged, no user tracking.
    Only: job_title, company_name, city, country, month, year.
    """
    sb = get_supabase()

    # Check for duplicate in same month
    existing = sb.table("job_sightings") \
        .select("id") \
        .eq("job_title", body.job_title) \
        .eq("company_name", body.company_name) \
        .eq("city", body.city) \
        .eq("month", body.month) \
        .eq("year", body.year) \
        .execute()

    if existing.data:
        # Upvote instead of duplicate
        sighting_id = existing.data[0]["id"]
        sb.table("job_sightings") \
            .update({"confirmations": sb.rpc("increment", {"row_id": sighting_id})}) \
            .eq("id", sighting_id) \
            .execute()
        return {"message": "Sighting confirmed — thank you!", "action": "confirmed"}

    data = body.model_dump()
    data["is_approved"] = True  # Auto-approve — moderation can be added in v2
    data["confirmations"] = 1

    # Strictly no PII — explicitly exclude anything not in our schema
    allowed = {"job_title", "company_name", "city", "country", "month", "year",
               "is_approved", "confirmations", "source_url"}
    clean = {k: v for k, v in data.items() if k in allowed}

    res = sb.table("job_sightings").insert(clean).execute()
    return {"message": "Sighting submitted — thank you!", "action": "created"}

@router.get("/recent")
async def recent_sightings(limit: int = 20):
    """Latest community submissions for the public dashboard table"""
    sb = get_supabase()
    res = sb.table("job_sightings") \
        .select("job_title, company_name, city, country, month, year, confirmations, created_at") \
        .eq("is_approved", True) \
        .order("created_at", desc=True) \
        .limit(min(limit, 50)) \
        .execute()
    return {"sightings": res.data}
