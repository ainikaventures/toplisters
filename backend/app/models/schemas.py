from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import date
from enum import Enum

# ── AUTH ──────────────────────────────────────────────
class UserRegister(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

# ── APPLICATION STATUS ─────────────────────────────────
class AppStatus(str, Enum):
    SAVED       = "saved"
    APPLIED     = "applied"
    INTERVIEW   = "interview"
    OFFER       = "offer"
    REJECTED    = "rejected"
    WITHDRAWN   = "withdrawn"

# ── JOB APPLICATION (private tracker) ─────────────────
class ApplicationCreate(BaseModel):
    job_title: str
    company_name: str
    location: str
    country: str
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    job_url: Optional[str] = None
    adzuna_id: Optional[str] = None
    status: AppStatus = AppStatus.SAVED
    applied_date: Optional[date] = None
    followup_date: Optional[date] = None
    notes: Optional[str] = None

class ApplicationUpdate(BaseModel):
    status: Optional[AppStatus] = None
    applied_date: Optional[date] = None
    followup_date: Optional[date] = None
    notes: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None

# ── JOB SIGHTING (public, anonymous) ──────────────────
class SightingCreate(BaseModel):
    job_title: str
    company_name: str
    city: str
    country: str
    month: int
    year: int
    source_url: Optional[str] = None

    @field_validator("month")
    @classmethod
    def valid_month(cls, v):
        if not 1 <= v <= 12:
            raise ValueError("Month must be between 1 and 12")
        return v

    @field_validator("year")
    @classmethod
    def valid_year(cls, v):
        if not 2020 <= v <= 2030:
            raise ValueError("Year must be between 2020 and 2030")
        return v

    @field_validator("job_title", "company_name", "city", "country")
    @classmethod
    def no_pii(cls, v):
        # Basic sanitisation — strip and limit length
        return v.strip()[:200]

# ── ADZUNA SEARCH ──────────────────────────────────────
class AdzunaSearchParams(BaseModel):
    query: str
    location: Optional[str] = "uk"
    page: Optional[int] = 1
    results_per_page: Optional[int] = 10
