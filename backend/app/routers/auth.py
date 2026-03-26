from fastapi import APIRouter, HTTPException, Request, Depends
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.models.schemas import UserRegister, UserLogin
from app.db.supabase import get_supabase

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

@router.post("/register")
@limiter.limit("5/minute")
async def register(request: Request, body: UserRegister):
    sb = get_supabase()
    try:
        res = sb.auth.sign_up({"email": body.email, "password": body.password})
        if res.user is None:
            raise HTTPException(status_code=400, detail="Registration failed")
        return {"message": "Registration successful. Please check your email to verify your account."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, body: UserLogin):
    sb = get_supabase()
    try:
        res = sb.auth.sign_in_with_password({"email": body.email, "password": body.password})
        return {
            "access_token": res.session.access_token,
            "token_type": "bearer",
            "user": {"id": res.user.id, "email": res.user.email}
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid credentials")

@router.post("/logout")
async def logout():
    return {"message": "Logged out successfully"}

@router.delete("/account")
async def delete_account(request: Request):
    """GDPR right to erasure — deletes all user data"""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    sb = get_supabase()
    try:
        user = sb.auth.get_user(token)
        # Cascade delete handled by Supabase RLS policies
        sb.table("applications").delete().eq("user_id", user.user.id).execute()
        sb.auth.admin.delete_user(user.user.id)
        return {"message": "All your data has been permanently deleted."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
