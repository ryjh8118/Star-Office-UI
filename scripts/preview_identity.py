"""Preview identity authority: which checkout, and which commit, is on the port.

Shared by the launcher and the isolated Preview server. Pure standard library and
read-only: the server installs an audit hook that blocks subprocesses and every
write outside its own state directory, so the commit is read from the git files
rather than by running git.
"""

from __future__ import annotations

import json
from pathlib import Path

KIND = "RENGUIN_ISOLATED_P0_PREVIEW"
# Every identity key the launcher pins, in the order it reports the first mismatch.
PINNED = ("office_worktree", "producer_worktree", "canonical_root", "state_directory")


def _git_dir(root: Path) -> Path | None:
    """Resolve a checkout to its git directory, following a linked worktree."""
    marker = Path(root) / ".git"
    if marker.is_file():
        line = marker.read_text(encoding="utf-8").strip()
        if not line.startswith("gitdir:"):
            return None
        linked = Path(line.split(":", 1)[1].strip())
        marker = linked if linked.is_absolute() else (Path(root) / linked).resolve()
    return marker if marker.is_dir() else None


def _read_ref(git_dir: Path, ref: str) -> str | None:
    """Read one ref, following a linked worktree back to its common directory."""
    roots = [git_dir]
    common = git_dir / "commondir"
    if common.is_file():
        shared = Path(common.read_text(encoding="utf-8").strip())
        roots.append(shared if shared.is_absolute() else (git_dir / shared).resolve())
    for base in roots:
        loose = base / ref
        if loose.is_file():
            return loose.read_text(encoding="utf-8").strip() or None
        packed = base / "packed-refs"
        if packed.is_file():
            for row in packed.read_text(encoding="utf-8").splitlines():
                if row.startswith(("#", "^")) or " " not in row:
                    continue
                sha, _, name = row.partition(" ")
                if name.strip() == ref:
                    return sha.strip()
    return None


def revision(root) -> tuple[str | None, str]:
    """Return (commit, source) for a checkout. Never raises; unreadable means unknown."""
    try:
        git_dir = _git_dir(Path(root))
        if git_dir is None:
            return None, "NO_GIT_DIRECTORY"
        head = (git_dir / "HEAD").read_text(encoding="utf-8").strip()
        if not head.startswith("ref:"):
            return (head, "DETACHED_HEAD") if len(head) == 40 else (None, "UNREADABLE_HEAD")
        ref = head.split(":", 1)[1].strip()
        commit = _read_ref(git_dir, ref)
        return (commit, ref) if commit else (None, "UNRESOLVED_REF:" + ref)
    except OSError:
        return None, "UNREADABLE_GIT"


def verify(value, expected: dict) -> None:
    """The identity gate. Unchanged checks; the message now carries the evidence."""
    if not value or value.get("kind") != KIND or value.get("canonical_read_only") is not True:
        raise RuntimeError("PREVIEW_IDENTITY_UNVERIFIED " + json.dumps(value or {})[:400])
    for key in PINNED:
        want = Path(expected[key])
        got = value.get(key)
        if not got or Path(got).resolve() != want.resolve():
            raise RuntimeError(
                f"PREVIEW_IDENTITY_MISMATCH:{key} expected={want.resolve()} "
                f"actual={got} pid={value.get('pid')}"
            )


def classify(value, expected: dict, wanted_revision: str | None) -> dict:
    """Decide what the launcher must do with whatever holds the port.

    Never widens the gate: every outcome that ends in a served preview is still
    passed through verify(). This only separates "someone else's preview" and
    "our own preview from before the sync" from "identity is broken".
    """
    if not value:
        return {"action": "START", "reason": "PORT_FREE"}
    if value.get("kind") != KIND or value.get("canonical_read_only") is not True:
        return {"action": "REFUSE", "reason": "PORT_HELD_BY_UNVERIFIED_SERVICE",
                "holder": value.get("kind"), "pid": value.get("pid")}
    holder = value.get("office_worktree")
    if not holder or Path(holder).resolve() != Path(expected["office_worktree"]).resolve():
        return {"action": "RECLAIM", "reason": "PORT_HELD_BY_OTHER_WORKTREE",
                "holder": holder, "pid": value.get("pid"),
                "holder_state": value.get("state_directory")}
    served = value.get("office_revision")
    if wanted_revision and served != wanted_revision:
        return {"action": "RESTART", "reason": "PREVIEW_PREDATES_CHECKOUT",
                "serving": served, "wanted": wanted_revision, "pid": value.get("pid")}
    return {"action": "ATTACH", "reason": "IDENTITY_AND_REVISION_MATCH",
            "serving": served, "pid": value.get("pid")}
