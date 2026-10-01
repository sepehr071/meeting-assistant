"""Keycloak / OIDC client (BFF flow).

Single authlib `OAuth` registry with one provider, ``keycloak``. The backend
runs the Authorization Code + PKCE flow server-side; the existing signed
session cookie remains the app's auth primitive (see `routers/auth.py`).
Tokens never reach the browser.

Registered unconditionally so `oauth.keycloak` exists even when OIDC is
unconfigured (dev/tests mock `authorize_access_token`). Real network calls
(discovery, token exchange, JWKS) happen lazily on first use; `oidc_configured`
gates the endpoints that would trigger them. authlib uses httpx under the hood,
so it honours `HTTPS_PROXY`/`NO_PROXY` for the prod egress proxy.
"""

from __future__ import annotations

from authlib.integrations.starlette_client import OAuth

from app.config import settings

oauth = OAuth()

_register_kwargs: dict = {
    "name": "keycloak",
    "client_id": settings.OIDC_CLIENT_ID,
    "client_secret": settings.OIDC_CLIENT_SECRET,
    "client_kwargs": {
        "scope": settings.OIDC_SCOPES,
        "code_challenge_method": "S256",  # PKCE
    },
}
if settings.OIDC_ISSUER:
    _register_kwargs["server_metadata_url"] = (
        f"{settings.OIDC_ISSUER.rstrip('/')}/.well-known/openid-configuration"
    )

oauth.register(**_register_kwargs)


def oidc_configured() -> bool:
    return settings.oidc_configured
