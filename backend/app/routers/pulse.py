from fastapi import APIRouter, Query
from app.db.supabase import get_supabase
from typing import Optional

router = APIRouter()

@router.get("/heatmap")
async def heatmap():
    """Job sightings grouped by country for world heatmap"""
    sb = get_supabase()
    res = sb.table("job_sightings") \
        .select("country") \
        .eq("is_approved", True) \
        .execute()

    counts = {}
    for row in res.data:
        c = row["country"]
        counts[c] = counts.get(c, 0) + 1

    return {"heatmap": [{"country": k, "count": v} for k, v in counts.items()]}

@router.get("/top-roles")
async def top_roles(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2020, le=2030),
    limit: int = Query(10, ge=1, le=20),
):
    """Top job titles being hired — for bar chart"""
    sb = get_supabase()
    query = sb.table("job_sightings").select("job_title").eq("is_approved", True)
    if month:
        query = query.eq("month", month)
    if year:
        query = query.eq("year", year)

    res = query.execute()

    counts = {}
    for row in res.data:
        t = row["job_title"]
        counts[t] = counts.get(t, 0) + 1

    sorted_roles = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    return {"roles": [{"title": k, "count": v} for k, v in sorted_roles]}

@router.get("/trends")
async def trends(
    year: Optional[int] = Query(None, ge=2020, le=2030),
    role: Optional[str] = Query(None, max_length=100),
):
    """Monthly hiring trend — for line chart"""
    sb = get_supabase()
    query = sb.table("job_sightings") \
        .select("month, year") \
        .eq("is_approved", True)
    if year:
        query = query.eq("year", year)
    if role:
        query = query.ilike("job_title", f"%{role}%")

    res = query.execute()

    counts = {}
    for row in res.data:
        key = f"{row['year']}-{str(row['month']).zfill(2)}"
        counts[key] = counts.get(key, 0) + 1

    sorted_trend = sorted(counts.items())
    return {"trends": [{"period": k, "count": v} for k, v in sorted_trend]}

@router.get("/stats")
async def stats():
    """Platform-wide summary stats"""
    sb = get_supabase()
    sightings = sb.table("job_sightings").select("id", count="exact").eq("is_approved", True).execute()
    companies = sb.table("job_sightings").select("company_name").eq("is_approved", True).execute()
    countries = sb.table("job_sightings").select("country").eq("is_approved", True).execute()

    unique_companies = len(set(r["company_name"] for r in companies.data))
    unique_countries = len(set(r["country"] for r in countries.data))

    return {
        "total_sightings": sightings.count or 0,
        "unique_companies": unique_companies,
        "countries_covered": unique_countries,
    }
