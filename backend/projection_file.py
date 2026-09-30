"""The generated projection file the desk polls, and what actually changes in it.

`frontend/renguin-projects-v2.json` is the verified projection Content OS writes for the desk: ~12 MB, rewritten
every few seconds. Between two rewrites, byte for byte, only two top-level fields move: when it was generated
and the digest that covers that timestamp. Every other byte is the same. A reader that asks "did the content
change?" would almost always hear "no", but the file's own validators (modification time, size) change on every
rewrite, and the desk fetches it with `cache: no-store` and a cache-busting query, so it was downloaded and
parsed in full every five seconds.

This gives the file an ETag of its content minus those two fields, and answers 304 when the reader already has it.
Nothing here writes, or decides anything about, the file.
"""
import hashlib
import re
import threading
from pathlib import Path

from flask import Response, abort, request, send_file

# The producer writes the file with indent=2, so the two volatile fields are the only top-level lines
# ("  ") with these names; deeper keys are indented further and never match.
VOLATILE = re.compile(rb'^  "(generated_at|projection_digest)": "[^"\r\n]*"(,?)(?=\r?$)', re.M)

_lock = threading.Lock()
_memo = {}


def semantic_etag(path):
    """A strong validator of the file's content without its two volatile fields; recomputed only when the file is."""
    path = Path(path)
    info = path.stat()
    stamp = (info.st_mtime_ns, info.st_size)
    with _lock:
        held = _memo.get(str(path))
        if held and held[0] == stamp:
            return held[1]
        data = path.read_bytes()
        digest = hashlib.sha256(VOLATILE.sub(rb'  "\1": ""\2', data)).hexdigest()[:32]
        tag = '"sem-%s"' % digest
        _memo[str(path)] = (stamp, tag)
        return tag


def matches(header, tag):
    """True when the reader's If-None-Match names this content."""
    if not header:
        return False
    return any(part.strip().removeprefix('W/') == tag for part in header.split(','))


def serve(path):
    path = Path(path)
    try:
        tag = semantic_etag(path)
    except OSError:
        abort(404)
    if matches(request.headers.get('If-None-Match'), tag):
        return Response(status=304, headers={'ETag': tag})
    response = send_file(path, mimetype='application/json', conditional=False, max_age=0)
    response.headers['ETag'] = tag
    return response
