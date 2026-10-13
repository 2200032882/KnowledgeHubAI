
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
KNOWLEDGEHUB_SECRET_KEY = os.getenv("KNOWLEDGEHUB_SECRET_KEY")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not configured.")

if not KNOWLEDGEHUB_SECRET_KEY:
    raise RuntimeError("KNOWLEDGEHUB_SECRET_KEY is not configured.")
