import secrets
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        # M7 FIX: Generate a per-request nonce for script-src.
        # This allows legitimate inline scripts that reference the nonce while
        # blocking injected scripts that don't know it.
        # style-src still has 'unsafe-inline' because Vite/React injects
        # dynamic <style> tags — removing it requires a separate frontend build change.
        nonce = secrets.token_urlsafe(16)
        request.state.csp_nonce = nonce  # expose nonce to downstream handlers if needed

        response: Response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            # M7 FIX: 'unsafe-inline' removed from script-src; replaced with per-request nonce.
            f"script-src 'self' 'nonce-{nonce}' https://www.googletagmanager.com; "
            # style-src still has 'unsafe-inline' (Vite/React dynamic styles — separate fix needed)
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.google-analytics.com wss:; "
            "font-src 'self' https://fonts.gstatic.com; "
            "frame-ancestors 'none';"
        )
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response
