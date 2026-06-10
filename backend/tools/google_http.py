"""Shared Google API HTTP client with request timeouts."""

import httplib2
from google_auth_httplib2 import AuthorizedHttp
from googleapiclient.discovery import build

# Prevent hung Gmail/Calendar calls from blocking the API server
DEFAULT_GOOGLE_TIMEOUT_SEC = 20


def build_google_service(
    api_name: str,
    api_version: str,
    creds,
    timeout: int = DEFAULT_GOOGLE_TIMEOUT_SEC,
):
    http = httplib2.Http(timeout=timeout)
    authorized = AuthorizedHttp(creds, http=http)
    return build(api_name, api_version, http=authorized, cache_discovery=False)


# Alias used across tools
build_google_api_service = build_google_service


# Alias used across tools
build_google_api_service = build_google_service
