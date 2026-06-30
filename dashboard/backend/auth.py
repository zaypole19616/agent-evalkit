"""Dashboard auth — Google ID Token verification + domain whitelist + JWT.

Auth is OPTIONAL. If ``DASHBOARD_GOOGLE_CLIENT_ID`` is unset the dashboard
runs fully open (anonymous read-only) — which is the default for the
static demo and most self-hosted deploys. Configure the env vars below
only if you want to gate a private deployment.

Flow (when configured):
  1. Frontend uses Google Identity Services (GIS) to obtain an ID Token
     in the browser (no client_secret, no redirect URI).
  2. Frontend POSTs ``{id_token}`` to ``/api/dashboard/auth/google``.
  3. We verify the ID Token against ``DASHBOARD_GOOGLE_CLIENT_ID``,
     enforce the configured email/domain allowlist, and issue our own JWT
     (HS256, 30-day expiry) signed with ``DASHBOARD_JWT_SECRET``.
  4. Frontend stores the JWT in localStorage; every API call sends
     ``Authorization: Bearer <jwt>``. ``require_auth()`` (used by the
     gating middleware) decodes it and rejects expired/forged tokens.

Two env vars are mandatory in prod; missing either flips the daemon
into an explicit ``auth-misconfigured`` state — login responds 503,
gated endpoints respond 401, ``/api/health`` stays green so the pod
remains in the Service. This makes a config gap loud, not silent.
"""

from __future__ import annotations

import os
import time
from typing import Optional

import jwt
from fastapi import HTTPException, Request, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

# Allowlists are env-driven and empty by default. Set when gating a private
# deployment:
#   DASHBOARD_ALLOWED_DOMAINS="example.com,corp.io"   # whole-domain access
#   DASHBOARD_ALLOWED_EMAILS="alice@gmail.com"        # individual accounts
# An empty domain allowlist means "any verified Google account" (only
# relevant when DASHBOARD_GOOGLE_CLIENT_ID is set — otherwise auth is off).
ALLOWED_EMAIL_DOMAINS = frozenset(
    d.strip().lower() for d in os.environ.get("DASHBOARD_ALLOWED_DOMAINS", "").split(",") if d.strip()
)
ALLOWED_EMAILS = frozenset(
    e.strip().lower() for e in os.environ.get("DASHBOARD_ALLOWED_EMAILS", "").split(",") if e.strip()
)

JWT_ALGORITHM = "HS256"
JWT_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days


def _env(name: str) -> Optional[str]:
    v = os.environ.get(name)
    return v.strip() if v and v.strip() else None


def google_client_id() -> Optional[str]:
    return _env("DASHBOARD_GOOGLE_CLIENT_ID")


def jwt_secret() -> Optional[str]:
    return _env("DASHBOARD_JWT_SECRET")


def auth_configured() -> bool:
    return bool(google_client_id() and jwt_secret())


def is_email_allowed(email: str) -> bool:
    if not email or "@" not in email:
        return False
    # No allowlist configured → any verified Google account is allowed.
    if not ALLOWED_EMAILS and not ALLOWED_EMAIL_DOMAINS:
        return True
    email_lower = email.lower()
    if email_lower in ALLOWED_EMAILS:
        return True
    domain = email_lower.rsplit("@", 1)[1]
    return domain in ALLOWED_EMAIL_DOMAINS


def verify_google_id_token(id_token_str: str) -> dict:
    """Validate the ID Token JWT against Google's keys + our client_id.

    Returns the verified user info dict (email/name/picture/sub).
    Raises HTTPException(401) on any verification failure.
    """
    client_id = google_client_id()
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth not configured on server",
        )
    try:
        idinfo = google_id_token.verify_oauth2_token(
            id_token_str, google_requests.Request(), client_id
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google ID token: {e}",
        )

    email = idinfo.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google ID token missing email claim",
        )
    if not idinfo.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google email not verified",
        )
    if not is_email_allowed(email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Email {email} is not authorized to access this dashboard",
        )
    return {
        "email": email,
        "name": idinfo.get("name") or email.split("@", 1)[0],
        "picture": idinfo.get("picture") or "",
        "google_sub": idinfo.get("sub"),
    }


def issue_jwt(user: dict) -> str:
    secret = jwt_secret()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT secret not configured on server",
        )
    now = int(time.time())
    payload = {
        "sub": user["email"],
        "name": user.get("name", ""),
        "picture": user.get("picture", ""),
        "iat": now,
        "exp": now + JWT_TTL_SECONDS,
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict:
    secret = jwt_secret()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT secret not configured on server",
        )
    try:
        return jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")


def extract_bearer(request: Request) -> Optional[str]:
    header = request.headers.get("authorization") or request.headers.get("Authorization")
    if not header:
        return None
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def require_auth(request: Request) -> dict:
    """FastAPI dependency: returns the decoded JWT payload or raises 401."""
    token = extract_bearer(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_jwt(token)


def is_configured() -> bool:
    """Auth is active only when both the Google client id and the JWT secret
    are set. Otherwise the dashboard runs open (anonymous read-only)."""
    return bool(google_client_id() and jwt_secret())


def gate(request: Request) -> Optional[dict]:
    """Router dependency: enforce auth ONLY when the server is configured for
    it. Unconfigured (the default) → every endpoint is anonymous read-only.
    Configured → a valid Bearer JWT is required, so data endpoints actually
    respond 401 without one."""
    if not is_configured():
        return None
    return require_auth(request)
