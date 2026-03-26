from fastapi import APIRouter, HTTPException, Request, Header
from typing import Optional
from app.models.schemas import ApplicationCreate, ApplicationUpdate
from app.db.supabase import get_supabase

router = APIRouter()

def get_user(token: str):
    """Verify JWT and return user"""
    sb = get_supabase()
    try:
        user = sb.auth.get_user(token)
        return user.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def auth_header(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return authorization.replace("Bearer ", "")

@router.get("/applications")
async def get_applications(authorization: Optional[str] = Header(None)):
    token = auth_header(authorization)
    user = get_user(token)
    sb = get_supabase()
    res = sb.table("applications") \
        .select("*") \
        .eq("user_id", user.id) \
        .order("created_at", desc=True) \
        .execute()
    return {"applications": res.data}

@router.post("/applications")
async def create_application(
    body: ApplicationCreate,
    authorization: Optional[str] = Header(None)
):
    token = auth_header(authorization)
    user = get_user(token)
    sb = get_supabase()

    data = body.model_dump()
    data["user_id"] = user.id
    # Convert dates to strings for JSON serialisation
    if data.get("applied_date"):
        data["applied_date"] = str(data["applied_date"])
    if data.get("followup_date"):
        data["followup_date"] = str(data["followup_date"])

    res = sb.table("applications").insert(data).execute()
    return {"application": res.data[0]}

@router.patch("/applications/{app_id}")
async def update_application(
    app_id: str,
    body: ApplicationUpdate,
    authorization: Optional[str] = Header(None)
):
    token = auth_header(authorization)
    user = get_user(token)
    sb = get_supabase()

    # Verify ownership
    existing = sb.table("applications") \
        .select("user_id") \
        .eq("id", app_id) \
        .execute()
    if not existing.data or existing.data[0]["user_id"] != user.id:
        raise HTTPException(status_code=404, detail="Application not found")

    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if data.get("applied_date"):
        data["applied_date"] = str(data["applied_date"])
    if data.get("followup_date"):
        data["followup_date"] = str(data["followup_date"])

    res = sb.table("applications").update(data).eq("id", app_id).execute()
    return {"application": res.data[0]}

@router.delete("/applications/{app_id}")
async def delete_application(
    app_id: str,
    authorization: Optional[str] = Header(None)
):
    token = auth_header(authorization)
    user = get_user(token)
    sb = get_supabase()

    existing = sb.table("applications") \
        .select("user_id") \
        .eq("id", app_id) \
        .execute()
    if not existing.data or existing.data[0]["user_id"] != user.id:
        raise HTTPException(status_code=404, detail="Application not found")

    sb.table("applications").delete().eq("id", app_id).execute()
    return {"message": "Application deleted"}
