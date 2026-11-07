"""scripts/macro/recorder.py — capture every HTTP response AKShare receives (spec §4.4, §0.2 N2).

AKShare 1.20.35 sends every request through akshare/utils/http.py, which ends in exactly two places:
``requests.Session.request`` (``http.request/get/post/get_buffer``, ``http.Session``,
``request_with_retry``; ``requests.request`` itself builds a Session) and
``curl_cffi.requests.Session.request`` (``http.curl_request/curl_get/curl_post`` and ``http.CurlSession``,
used by the NBS module; ``curl_cffi.requests.request`` also builds a Session). ``recording()`` wraps both
methods for the duration of a ``with`` block and restores them afterwards. The wrapper calls the original
method unchanged and returns its response object untouched, so AKShare's behaviour does not change; it only
reads ``response.content`` (both libraries cache the body, so later ``.text``/``.json()``/``iter_content``
still work) and appends a Capture. Failed requests (exceptions) propagate and are not captured.
"""
from __future__ import annotations

import contextlib
import datetime as _dt
import hashlib
import threading
from dataclasses import dataclass, field
from typing import Iterator, List

import curl_cffi.requests as _curl
import requests as _requests

__all__ = ["Capture", "recording"]


def _utc_now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass(frozen=True)
class Capture:
    method: str
    url: str            # final URL after redirects (response.url)
    status: int
    content_type: str
    body: bytes = field(repr=False)
    fetched_at: str     # UTC ISO-8601 with milliseconds and Z

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.body).hexdigest()


_lock = threading.RLock()  # re-entrant: a nested recording() wraps the wrapper and both lists capture


def _wrap(original, sink: List[Capture]):
    def request(self, method, url, *args, **kwargs):
        response = original(self, method, url, *args, **kwargs)
        sink.append(Capture(
            method=str(method).upper(),
            url=str(response.url or url),
            status=int(response.status_code),
            content_type=str(response.headers.get("content-type", "") or ""),
            body=bytes(response.content or b""),
            fetched_at=_utc_now(),
        ))
        return response
    request.__wrapped__ = original  # type: ignore[attr-defined]
    return request


@contextlib.contextmanager
def recording() -> Iterator[List[Capture]]:
    """Yields the (growing) list of captures for the block; patches are always removed on exit."""
    captures: List[Capture] = []
    with _lock:
        orig_requests = _requests.Session.request
        orig_curl = _curl.Session.request
        _requests.Session.request = _wrap(orig_requests, captures)  # type: ignore[method-assign]
        _curl.Session.request = _wrap(orig_curl, captures)  # type: ignore[method-assign]
        try:
            yield captures
        finally:
            _requests.Session.request = orig_requests  # type: ignore[method-assign]
            _curl.Session.request = orig_curl  # type: ignore[method-assign]
