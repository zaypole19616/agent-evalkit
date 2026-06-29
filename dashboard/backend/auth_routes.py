"""Dashboard auth endpoints — Google sign-in + current user lookup.

POST /api/dashboard/auth/google  — exchange a Google ID Token for our JWT
GET  /api/dashboard/auth/me      — return the current user (decoded JWT)
GET  /api/dashboard/auth/config  — public: surfaces ``google_client_id``
                                   so the SPA knows which OAuth client to
                                   initialize. Lets us rotate the client
                                   without rebuilding the frontend.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from . import auth

router = APIRouter(prefix="/api/dashboard/auth")


class GoogleLoginRequest(BaseModel):
    id_token: str


class GoogleLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.get("/config")
def auth_config() -> dict:
    # Client ID is a public identifier (visible in browser anyway). Surfacing
    # it via the API lets the frontend boot without baking it into the build.
    return {
        "google_client_id": auth.google_client_id() or "",
        "configured": auth.auth_configured(),
        "allowed_domains": sorted(auth.ALLOWED_EMAIL_DOMAINS),
    }


@router.post("/google", response_model=GoogleLoginResponse)
def login_with_google(body: GoogleLoginRequest) -> GoogleLoginResponse:
    if not auth.auth_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dashboard auth is not configured on the server",
        )
    user = auth.verify_google_id_token(body.id_token)
    token = auth.issue_jwt(user)
    return GoogleLoginResponse(
        access_token=token,
        token_type="bearer",
        user={"email": user["email"], "name": user["name"], "picture": user["picture"]},
    )


@router.get("/me")
def current_user(payload: dict = Depends(auth.require_auth)) -> dict:
    return {
        "email": payload.get("sub"),
        "name": payload.get("name", ""),
        "picture": payload.get("picture", ""),
        "exp": payload.get("exp"),
    }
