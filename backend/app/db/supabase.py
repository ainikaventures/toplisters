from supabase import create_client, Client
from app.config import settings

_supabase: Client = None

def init_supabase():
    global _supabase
    _supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

def get_supabase() -> Client:
    return _supabase
