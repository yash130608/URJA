from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Header
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "database" / "urja.db"
FRONTEND_DIR = BASE_DIR / "frontend"
SECRET_KEY = os.getenv("URJA_SECRET_KEY", "change-this-development-secret-before-deployment").encode()

app = FastAPI(title="URJA API", version="1.0.0", description="Smart electricity management")
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS appliances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'Other',
                watts REAL NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                hours_per_day REAL NOT NULL,
                days_per_month INTEGER NOT NULL DEFAULT 30,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        """)
        conn.commit()


@app.on_event("startup")
def startup():
    init_db()


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 240_000)
    return salt.hex() + "$" + digest.hex()


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 240_000)
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def make_token(user_id: int) -> str:
    payload = {"uid": user_id, "exp": int(time.time()) + 60 * 60 * 24 * 7}
    raw = json.dumps(payload, separators=(",", ":")).encode().hex()
    signature = hmac.new(SECRET_KEY, raw.encode(), hashlib.sha256).hexdigest()
    return raw + "." + signature


def current_user(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please sign in to continue.")
    token = authorization[7:]
    try:
        raw, signature = token.split(".", 1)
        expected = hmac.new(SECRET_KEY, raw.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("bad signature")
        payload = json.loads(bytes.fromhex(raw))
        if payload["exp"] < int(time.time()):
            raise ValueError("expired")
        user_id = int(payload["uid"])
    except Exception:
        raise HTTPException(status_code=401, detail="Your session expired. Please sign in again.")
    with db() as conn:
        user = conn.execute("SELECT id, name, email FROM users WHERE id=?", (user_id,)).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Account not found.")
    return dict(user)


class AuthInput(BaseModel):
    name: str = Field(default="", max_length=80)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=8, max_length=128)


class ApplianceInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: str = Field(default="Other", max_length=40)
    watts: float = Field(gt=0, le=20000)
    quantity: int = Field(default=1, ge=1, le=100)
    hours_per_day: float = Field(gt=0, le=24)
    days_per_month: int = Field(default=30, ge=1, le=31)


@app.get("/")
def home():
    return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/service-worker.js")
def get_service_worker():
    return FileResponse(
        FRONTEND_DIR / "service-worker.js",
        media_type="application/javascript"
    )


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "URJA"}


@app.post("/api/auth/signup")
def signup(data: AuthInput):
    name = data.name.strip()
    email = data.email.strip().lower()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Please enter your name.")
    with db() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users(name,email,password_hash) VALUES(?,?,?)",
                (name, email, hash_password(data.password))
            )
            conn.commit()
            user_id = cur.lastrowid
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
    return {"token": make_token(user_id), "user": {"id": user_id, "name": name, "email": email}}


@app.post("/api/auth/login")
def login(data: AuthInput):
    email = data.email.strip().lower()
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return {
        "token": make_token(user["id"]),
        "user": {"id": user["id"], "name": user["name"], "email": user["email"]}
    }


@app.get("/api/me")
def me(user=Depends(current_user)):
    return {"user": user}


@app.get("/api/appliances")
def list_appliances(user=Depends(current_user)):
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM appliances WHERE user_id=? ORDER BY id DESC", (user["id"],)
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/appliances")
def add_appliance(data: ApplianceInput, user=Depends(current_user)):
    with db() as conn:
        cur = conn.execute("""
            INSERT INTO appliances(user_id,name,category,watts,quantity,hours_per_day,days_per_month)
            VALUES(?,?,?,?,?,?,?)
        """, (user["id"], data.name.strip(), data.category, data.watts, data.quantity,
              data.hours_per_day, data.days_per_month))
        conn.commit()
        row = conn.execute("SELECT * FROM appliances WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)


@app.delete("/api/appliances/{appliance_id}")
def delete_appliance(appliance_id: int, user=Depends(current_user)):
    with db() as conn:
        cur = conn.execute("DELETE FROM appliances WHERE id=? AND user_id=?",
                           (appliance_id, user["id"]))
        conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Appliance not found.")
    return {"deleted": True}


@app.get("/api/summary")
def summary(tariff: float = 7.5, user=Depends(current_user)):
    if tariff <= 0 or tariff > 1000:
        raise HTTPException(status_code=400, detail="Tariff must be between 0 and 1000.")
    with db() as conn:
        rows = conn.execute("SELECT * FROM appliances WHERE user_id=?", (user["id"],)).fetchall()
    appliances = [dict(row) for row in rows]
    daily_kwh = sum((a["watts"] * a["quantity"] * a["hours_per_day"]) / 1000 for a in appliances)
    monthly_kwh = sum(
        (a["watts"] * a["quantity"] * a["hours_per_day"] * a["days_per_month"]) / 1000
        for a in appliances
    )
    monthly_cost = monthly_kwh * tariff
    # Approximate grid-emissions factor; informational estimate, not a utility reading.
    co2_kg = monthly_kwh * 0.7
    return {
        "appliance_count": len(appliances),
        "daily_kwh": round(daily_kwh, 2),
        "monthly_kwh": round(monthly_kwh, 2),
        "monthly_cost": round(monthly_cost, 2),
        "co2_kg": round(co2_kg, 2),
        "tariff": tariff,
        "appliances": appliances
    }
