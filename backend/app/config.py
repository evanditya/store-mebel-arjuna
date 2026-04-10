import os

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
MIDTRANS_SERVER_KEY = os.environ.get("MIDTRANS_SERVER_KEY", "")
MIDTRANS_CLIENT_KEY = os.environ.get("MIDTRANS_CLIENT_KEY", "")
MIDTRANS_IS_PRODUCTION = os.environ.get("MIDTRANS_IS_PRODUCTION", "false").lower() == "true"
BITESHIP_API_KEY = os.environ.get("BITESHIP_API_KEY", "")

EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_USER = os.environ.get("EMAIL_USER", "")
EMAIL_PASSWORD = os.environ.get("EMAIL_PASSWORD", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Toko Online")
