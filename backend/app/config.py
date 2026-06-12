import os

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
OTTOPAY_MERCHANT_ID = os.environ.get("OTTOPAY_MERCHANT_ID", "")
OTTOPAY_API_KEY = os.environ.get("OTTOPAY_API_KEY", "")
OTTOPAY_IS_PRODUCTION = os.environ.get("OTTOPAY_IS_PRODUCTION", "false").lower() == "true"
BITESHIP_API_KEY = os.environ.get("BITESHIP_API_KEY", "")


