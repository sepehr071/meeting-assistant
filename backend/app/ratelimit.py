"""Shared rate limiter. Keyed by client IP. Applied to auth endpoints to blunt
credential-stuffing / brute force. Behind a reverse proxy, ensure the proxy
sets a trusted client address (Caddy/nginx forward the real IP)."""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
