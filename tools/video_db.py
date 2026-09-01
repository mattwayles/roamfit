#!/usr/bin/env python3
"""video_db.py -- §11.5 operator CLI for curating exercise-demonstration videos.

Setting the canonical video for an exercise is an OPERATOR workflow, not an app feature: it
writes to Firestore remote config (`video/{exercise_id}`), never to the bundled library, so it
never needs an App Store release. Modeled on the daily-workout skill's `workout_db.py`, with the
same discipline: validate before writing, refuse invalid input rather than storing it.

Subcommands:
  queue       uncurated exercises, ranked by how often they've actually been performed
  candidates  search + auto-filter a shortlist for one exercise_id
  set         validate a video id, then write it (and reset its flag count)
  verify      re-check every curated id; clear the dead ones; list stale ones
  flagged     exercises whose in-app "wrong or broken" reports have accumulated
  status      overall coverage / health of the curated set

Two invariants this file exists to never violate (CLAUDE.md, spec invariant 8):
  - a video id is never INVENTED here. Every id this tool writes came from a real YouTube API
    response (`candidates`) or was re-validated against one (`set`, `verify`) -- never typed in
    from memory and trusted.
  - a curated id NEVER reaches `packages/data` / the bundled library. This tool only ever talks
    to Firestore and the YouTube Data API; it has no write path into the library JSON at all.

Where things live:
  - The exercise LIBRARY (id, name, setup cue, video_search fallback query) is read-only from
    `packages/data/library/exercises.json` -- the same file the app bundles, minus any curated
    video field (the library schema forbids one; see packages/data/src/validate.ts).
  - Curated video docs (`video_id` / `video_verified_at` / `video_flag_count`) live ONLY in
    Firestore's `video/{exercise_id}` collection, written through the Admin SDK. `firestore.rules`
    blocks client writes to this collection by design -- this CLI is the only writer.
  - User "wrong or broken" flags accumulate locally per-device on `exercise_state` (track 6b) and
    sync to Firestore as per-uid documents (track 6d): `users/{uid}/exercise_state/{exercise_id}`.
    There is no Firestore trigger rolling those up into `video/{exercise_id}.video_flag_count` --
    `flagged` reads the per-uid documents directly via a collection-group query. See
    docs/handoff/STATUS-6e-video-cli.md for why.

The API key and Firestore credentials live on the OPERATOR's machine only (env vars below). The
app itself never calls the YouTube Data API and never writes to Firestore's video collection.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Protocol

HERE = Path(__file__).resolve()
REPO_ROOT = HERE.parents[1]
LIBRARY_PATH = REPO_ROOT / "packages" / "data" / "library" / "exercises.json"

MAX_DURATION_SECONDS = 4 * 60  # §11.5: auto-reject anything longer than ~4 minutes.
DEFAULT_STALE_DAYS = 365
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")  # the one YouTube video-id shape there is.

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
YOUTUBE_OEMBED_BASE = "https://www.youtube.com/oembed"


# =============================================================================================
# Library (read-only)
# =============================================================================================


@dataclass(frozen=True)
class Exercise:
    id: str
    name: str
    setup: str
    video_search: str


def load_library(path: Path = LIBRARY_PATH) -> dict[str, Exercise]:
    data = json.loads(path.read_text())
    out: dict[str, Exercise] = {}
    for rec in data["exercises"]:
        if "video_id" in rec:
            # Should be structurally impossible (the library validator rejects this field), but
            # refuse to even load a library that somehow carries one rather than silently using it.
            sys.exit(
                f"error: {path} record '{rec.get('id')}' carries a bundled video_id -- refusing "
                "to load. A curated id belongs in Firestore remote config only (invariant 8)."
            )
        out[rec["id"]] = Exercise(
            id=rec["id"], name=rec["name"], setup=rec["setup"], video_search=rec["video_search"]
        )
    return out


def search_query_from(video_search_url: str) -> str:
    """Extract the literal search query the library already constructed for this exercise."""
    parsed = urllib.parse.urlparse(video_search_url)
    qs = urllib.parse.parse_qs(parsed.query)
    values = qs.get("search_query") or qs.get("q")
    if not values:
        sys.exit(f"error: could not parse a search query out of video_search url: {video_search_url}")
    return values[0]


# =============================================================================================
# Auto-reject rules (§11.4 curation criteria, §11.5 "the filtering the machine can do")
# =============================================================================================


@dataclass(frozen=True)
class VideoDetails:
    video_id: str
    title: str
    channel: str
    embeddable: bool
    privacy_status: str  # "public" | "unlisted" | "private"
    duration_seconds: int
    age_restricted: bool
    region_restricted: bool  # True if ANY region-restriction block (allow or block list) exists


def auto_reject_reasons(d: VideoDetails) -> list[str]:
    """Every §11.5 auto-reject rule, independently. Returns [] if the video passes all of them.

    Each check is its own `if`, deliberately -- removing any one of these five lines must make a
    video that fails ONLY that rule wrongly pass, which is exactly what the verification suite
    exercises one rule at a time.
    """
    reasons: list[str] = []
    if not d.embeddable:
        reasons.append("not embeddable")
    if d.privacy_status != "public":
        reasons.append(f"not public (privacyStatus={d.privacy_status})")
    if d.age_restricted:
        reasons.append("age-restricted")
    if d.region_restricted:
        reasons.append("region-locked")
    if d.duration_seconds > MAX_DURATION_SECONDS:
        reasons.append(f"too long ({d.duration_seconds}s > {MAX_DURATION_SECONDS}s)")
    return reasons


def is_valid_video_id_syntax(video_id: str) -> bool:
    return bool(VIDEO_ID_RE.match(video_id))


# =============================================================================================
# YouTube Data API boundary -- injectable, per the established ParseFn/FirestoreSyncClient
# pattern (packages/store's llmQueueWorker.ts / firestoreSyncClient.ts).
# =============================================================================================


class YouTubeClient(Protocol):
    def search(self, query: str, max_results: int = 15) -> list[str]:
        """Returns candidate video ids, most-relevant first. `search.list`, 100 units."""
        ...

    def videos_details(self, video_ids: list[str]) -> dict[str, VideoDetails]:
        """Batched `videos.list`, 1 unit for up to 50 ids. Missing ids (removed/never existed)
        are simply absent from the returned dict -- callers must treat a missing id as invalid."""
        ...

    def oembed_ok(self, video_id: str) -> bool:
        """Cheap liveness probe via the public oEmbed endpoint, no API key or quota consumed.
        True iff the video still resolves and embedding isn't blocked."""
        ...


class RealYouTubeClient:
    """The only implementation that ever makes a network call. Never imported by tests."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    def _get(self, path: str, params: dict[str, str]) -> dict:
        q = dict(params)
        q["key"] = self.api_key
        url = f"{YOUTUBE_API_BASE}/{path}?{urllib.parse.urlencode(q)}"
        with urllib.request.urlopen(url, timeout=15) as resp:
            return json.loads(resp.read())

    def search(self, query: str, max_results: int = 15) -> list[str]:
        data = self._get(
            "search",
            {"part": "id", "q": query, "type": "video", "maxResults": str(max_results)},
        )
        return [item["id"]["videoId"] for item in data.get("items", []) if "videoId" in item.get("id", {})]

    def videos_details(self, video_ids: list[str]) -> dict[str, VideoDetails]:
        out: dict[str, VideoDetails] = {}
        for i in range(0, len(video_ids), 50):
            batch = video_ids[i : i + 50]
            data = self._get(
                "videos",
                {"part": "snippet,status,contentDetails", "id": ",".join(batch)},
            )
            for item in data.get("items", []):
                out[item["id"]] = _video_details_from_api(item)
        return out

    def oembed_ok(self, video_id: str) -> bool:
        url = (
            f"{YOUTUBE_OEMBED_BASE}?url="
            f"{urllib.parse.quote(f'https://www.youtube.com/watch?v={video_id}', safe='')}&format=json"
        )
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                return resp.status == 200
        except urllib.error.HTTPError:
            return False
        except urllib.error.URLError:
            return False


def _video_details_from_api(item: dict) -> VideoDetails:
    status = item.get("status", {})
    content = item.get("contentDetails", {})
    snippet = item.get("snippet", {})
    region = content.get("regionRestriction") or {}
    return VideoDetails(
        video_id=item["id"],
        title=snippet.get("title", ""),
        channel=snippet.get("channelTitle", ""),
        embeddable=bool(status.get("embeddable", False)),
        privacy_status=status.get("privacyStatus", "private"),
        duration_seconds=_parse_iso8601_duration(content.get("duration", "PT0S")),
        age_restricted=(content.get("contentRating", {}).get("ytRating") == "ytAgeRestricted"),
        region_restricted=bool(region.get("blocked") or region.get("allowed")),
    )


_DURATION_RE = re.compile(
    r"P(?:(?P<days>\d+)D)?T?(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?"
)


def _parse_iso8601_duration(s: str) -> int:
    m = _DURATION_RE.match(s)
    if not m:
        return 0
    parts = {k: int(v) if v else 0 for k, v in m.groupdict().items()}
    return parts["days"] * 86400 + parts["hours"] * 3600 + parts["minutes"] * 60 + parts["seconds"]


# =============================================================================================
# Firestore boundary -- injectable, same pattern.
# =============================================================================================


@dataclass
class VideoDoc:
    exercise_id: str
    video_id: Optional[str]
    video_verified_at: Optional[str]  # ISO date, "when the id was last confirmed"
    video_flag_count: int = 0


@dataclass
class ExerciseStateFlagRow:
    """One user's flag state for one exercise, as read back from the per-uid collection-group
    query over `users/{uid}/exercise_state/{exercise_id}`."""

    uid: str
    exercise_id: str
    video_flag_count: int
    video_demoted_at: Optional[str]


class VideoDbClient(Protocol):
    def get_video_doc(self, exercise_id: str) -> Optional[VideoDoc]: ...

    def set_video_doc(self, doc: VideoDoc) -> None: ...

    def all_video_docs(self) -> dict[str, VideoDoc]: ...

    def all_flagged_exercise_states(self) -> list[ExerciseStateFlagRow]:
        """Collection-group query over every user's exercise_state, for rows carrying any flag
        signal at all (video_flag_count > 0 or video_demoted_at set)."""
        ...

    def all_sessions_performed(self) -> dict[str, int]:
        """exercise_id -> sum of sessions_performed across every user's exercise_state doc. The
        closest real signal this system has to "how often the engine has actually programmed
        this" -- see STATUS-6e-video-cli.md for why it's an approximation, not the literal
        metric §11.5 names."""
        ...


class RealFirestoreVideoDbClient:
    """The only implementation that ever talks to Firestore. Never imported by tests.

    Requires `google-cloud-firestore` (pip install google-cloud-firestore) and a service-account
    credential on GOOGLE_APPLICATION_CREDENTIALS. Neither is a repo dependency -- both are
    strictly the operator's own machine setup. Lazily imported so importing this module (or
    running the test suite) never requires the package to be installed.
    """

    def __init__(self):
        try:
            from google.cloud import firestore  # type: ignore
        except ImportError:
            sys.exit(
                "error: google-cloud-firestore is not installed.\n"
                "  pip install google-cloud-firestore\n"
                "  and set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file."
            )
        if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
            sys.exit(
                "error: GOOGLE_APPLICATION_CREDENTIALS is not set. This CLI writes to Firestore "
                "through the Admin SDK, which needs a service-account credential -- see the "
                "operator runbook in docs/handoff/STATUS-6d-sync-health.md."
            )
        self._db = firestore.Client()

    def get_video_doc(self, exercise_id: str) -> Optional[VideoDoc]:
        snap = self._db.collection("video").document(exercise_id).get()
        if not snap.exists:
            return None
        return _video_doc_from_dict(exercise_id, snap.to_dict() or {})

    def set_video_doc(self, doc: VideoDoc) -> None:
        self._db.collection("video").document(doc.exercise_id).set(
            {
                "video_id": doc.video_id,
                "video_verified_at": doc.video_verified_at,
                "video_flag_count": doc.video_flag_count,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    def all_video_docs(self) -> dict[str, VideoDoc]:
        out: dict[str, VideoDoc] = {}
        for snap in self._db.collection("video").stream():
            out[snap.id] = _video_doc_from_dict(snap.id, snap.to_dict() or {})
        return out

    def all_flagged_exercise_states(self) -> list[ExerciseStateFlagRow]:
        out: list[ExerciseStateFlagRow] = []
        for snap in self._db.collection_group("exercise_state").stream():
            data = snap.to_dict() or {}
            count = int(data.get("video_flag_count") or 0)
            demoted = data.get("video_demoted_at")
            if count <= 0 and not demoted:
                continue
            uid = snap.reference.parent.parent.id if snap.reference.parent.parent else "?"
            out.append(
                ExerciseStateFlagRow(
                    uid=uid,
                    exercise_id=snap.id,
                    video_flag_count=count,
                    video_demoted_at=demoted,
                )
            )
        return out

    def all_sessions_performed(self) -> dict[str, int]:
        totals: dict[str, int] = {}
        for snap in self._db.collection_group("exercise_state").stream():
            data = snap.to_dict() or {}
            n = int(data.get("sessions_performed") or 0)
            if n:
                totals[snap.id] = totals.get(snap.id, 0) + n
        return totals


def _video_doc_from_dict(exercise_id: str, d: dict) -> VideoDoc:
    return VideoDoc(
        exercise_id=exercise_id,
        video_id=d.get("video_id"),
        video_verified_at=d.get("video_verified_at"),
        video_flag_count=int(d.get("video_flag_count") or 0),
    )


# =============================================================================================
# Subcommands
# =============================================================================================


def _today(args) -> date:
    if getattr(args, "date", None):
        return datetime.strptime(args.date, "%Y-%m-%d").date()
    return date.today()


def cmd_queue(args, lib: dict[str, Exercise], store: VideoDbClient, yt: YouTubeClient) -> None:
    docs = store.all_video_docs()
    performed = store.all_sessions_performed()
    uncurated = [e for e in lib.values() if not (docs.get(e.id) and docs[e.id].video_id)]
    uncurated.sort(key=lambda e: (-performed.get(e.id, 0), e.id))
    print(f"=== UNCURATED ({len(uncurated)} of {len(lib)}), ranked by sessions performed ===")
    for e in uncurated:
        print(f"  {e.id:<32} performed {performed.get(e.id, 0):>4}x   {e.name}")
    if not uncurated:
        print("  (none -- full coverage)")


def cmd_candidates(args, lib: dict[str, Exercise], store: VideoDbClient, yt: YouTubeClient) -> None:
    ex = lib.get(args.exercise_id)
    if ex is None:
        sys.exit(f"error: unknown exercise_id '{args.exercise_id}'")
    query = search_query_from(ex.video_search)
    print(f"=== CANDIDATES for {ex.id} ===")
    print(f"  setup cue: {ex.setup}")
    print(f"  search query: {query}\n")

    ids = yt.search(query, max_results=args.max_results)
    if not ids:
        print("  no search results")
        return
    details = yt.videos_details(ids)

    accepted, rejected = [], []
    for vid in ids:
        d = details.get(vid)
        if d is None:
            rejected.append((vid, "no longer resolves"))
            continue
        reasons = auto_reject_reasons(d)
        if reasons:
            rejected.append((vid, ", ".join(reasons)))
        else:
            accepted.append(d)

    print(f"  {len(accepted)} passed auto-filter, {len(rejected)} auto-rejected\n")
    if accepted:
        print("  SHORTLIST (confirm equipment/anchoring against the setup cue above):")
        for d in accepted:
            mins, secs = divmod(d.duration_seconds, 60)
            print(
                f"    {d.video_id}  {mins}:{secs:02d}  {d.channel}\n"
                f"      {d.title}\n"
                f"      https://www.youtube.com/watch?v={d.video_id}"
            )
    if rejected and args.verbose:
        print("\n  REJECTED:")
        for vid, reason in rejected:
            print(f"    {vid}  {reason}")


def cmd_set(args, lib: dict[str, Exercise], store: VideoDbClient, yt: YouTubeClient) -> None:
    ex = lib.get(args.exercise_id)
    if ex is None:
        sys.exit(f"error: unknown exercise_id '{args.exercise_id}'")
    video_id = args.video_id
    if not is_valid_video_id_syntax(video_id):
        sys.exit(f"error: '{video_id}' is not a well-formed YouTube video id (11 chars, [A-Za-z0-9_-])")

    details = yt.videos_details([video_id])
    d = details.get(video_id)
    if d is None:
        sys.exit(f"error: '{video_id}' does not resolve on the YouTube Data API -- refusing to store it")
    reasons = auto_reject_reasons(d)
    if reasons:
        sys.exit(f"error: '{video_id}' fails re-validation: {', '.join(reasons)} -- refusing to store it")

    doc = VideoDoc(
        exercise_id=ex.id,
        video_id=video_id,
        video_verified_at=_today(args).isoformat(),
        video_flag_count=0,
    )
    store.set_video_doc(doc)
    print(f"set {ex.id} -> {video_id} ({d.title!r}, {d.channel})")
    print(f"  video_verified_at={doc.video_verified_at}  video_flag_count reset to 0")
    print("  REMINDER: confirm this shows the same equipment class and anchoring as the setup "
          "cue -- the machine only checked embeddability/privacy/age/region/length, not content.")


def cmd_verify(args, lib: dict[str, Exercise], store: VideoDbClient, yt: YouTubeClient) -> None:
    stale_days = args.stale
    docs = store.all_video_docs()
    curated = [d for d in docs.values() if d.video_id]
    print(f"=== VERIFY ({len(curated)} curated ids) ===")
    if not curated:
        print("  nothing curated yet")
        return

    today = _today(args)
    cleared, stale, ok = [], [], []
    for d in curated:
        assert d.video_id is not None
        alive = yt.oembed_ok(d.video_id)
        if not alive:
            store.set_video_doc(
                VideoDoc(exercise_id=d.exercise_id, video_id=None, video_verified_at=None, video_flag_count=0)
            )
            cleared.append(d)
            continue
        age_days = None
        if d.video_verified_at:
            try:
                age_days = (today - datetime.strptime(d.video_verified_at, "%Y-%m-%d").date()).days
            except ValueError:
                age_days = None
        if age_days is None or age_days > stale_days:
            stale.append(d)
        else:
            ok.append(d)

    print(f"  {len(ok)} verified alive and fresh")
    if cleared:
        print(f"  {len(cleared)} dead -- CLEARED (video_id set to null):")
        for d in cleared:
            print(f"    {d.exercise_id}  (was {d.video_id})")
    if stale:
        print(f"  {len(stale)} alive but stale (>{stale_days}d, or never verified) -- re-review:")
        for d in stale:
            print(f"    {d.exercise_id}  {d.video_id}  verified_at={d.video_verified_at}")


def cmd_flagged(args, lib: dict[str, Exercise], store: VideoDbClient, yt: YouTubeClient) -> None:
    rows = store.all_flagged_exercise_states()
    by_exercise: dict[str, list[ExerciseStateFlagRow]] = {}
    for r in rows:
        by_exercise.setdefault(r.exercise_id, []).append(r)

    print(f"=== FLAGGED ({len(by_exercise)} exercises with at least one report) ===")
    if not by_exercise:
        print("  none -- nothing has been reported broken")
        return

    def severity(exercise_id: str) -> tuple[int, int]:
        group = by_exercise[exercise_id]
        demoted = sum(1 for r in group if r.video_demoted_at)
        total_flags = sum(r.video_flag_count for r in group)
        return (-demoted, -total_flags)

    for exercise_id in sorted(by_exercise, key=severity):
        group = by_exercise[exercise_id]
        ex = lib.get(exercise_id)
        name = ex.name if ex else "(unknown exercise -- library drift?)"
        demoted_users = [r for r in group if r.video_demoted_at]
        total_flags = sum(r.video_flag_count for r in group)
        latest_demote = max((r.video_demoted_at for r in demoted_users if r.video_demoted_at), default=None)
        print(
            f"  {exercise_id:<32} {name:<28} {len(group)} user(s) reported, "
            f"{total_flags} total flags, {len(demoted_users)} demoted"
            + (f", latest {latest_demote}" if latest_demote else "")
        )
    print("\n  re-curate with `candidates`/`set` to clear an entry -- `set` resets its counter.")


def cmd_status(args, lib: dict[str, Exercise], store: VideoDbClient, yt: YouTubeClient) -> None:
    docs = store.all_video_docs()
    curated = [d for d in docs.values() if d.video_id]
    flagged_rows = store.all_flagged_exercise_states()
    flagged_exercises = {r.exercise_id for r in flagged_rows}
    today = _today(args)
    stale = []
    for d in curated:
        if not d.video_verified_at:
            stale.append(d)
            continue
        try:
            age = (today - datetime.strptime(d.video_verified_at, "%Y-%m-%d").date()).days
        except ValueError:
            stale.append(d)
            continue
        if age > args.stale:
            stale.append(d)

    print("=== VIDEO COVERAGE STATUS ===")
    print(f"  curated:  {len(curated)} of {len(lib)}")
    print(f"  flagged:  {len(flagged_exercises)} exercises with an open report")
    print(f"  stale:    {len(stale)} curated ids older than {args.stale}d (or never verified)")
    uncurated = len(lib) - len(curated)
    print(f"  uncurated: {uncurated}")


# =============================================================================================
# Wiring
# =============================================================================================


def build_real_youtube_client() -> YouTubeClient:
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        sys.exit(
            "error: YOUTUBE_API_KEY is not set. This CLI calls the YouTube Data API from the "
            "operator's own machine only -- export a key with API access to youtube.googleapis.com."
        )
    return RealYouTubeClient(api_key)


def main(argv: Optional[list[str]] = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    q = sub.add_parser("queue", help="uncurated exercises, ranked by how often programmed")
    q.set_defaults(func=cmd_queue)

    c = sub.add_parser("candidates", help="search + auto-filter a shortlist for one exercise")
    c.add_argument("exercise_id")
    c.add_argument("--max-results", type=int, default=15)
    c.add_argument("--verbose", action="store_true", help="also list what was auto-rejected and why")
    c.set_defaults(func=cmd_candidates)

    s = sub.add_parser("set", help="validate a video id, then write it")
    s.add_argument("exercise_id")
    s.add_argument("video_id")
    s.add_argument("--date", help="override today's date (YYYY-MM-DD), for testing")
    s.set_defaults(func=cmd_set)

    v = sub.add_parser("verify", help="re-check every curated id; clear the dead ones")
    v.add_argument("--stale", type=int, default=DEFAULT_STALE_DAYS, help="days before a verified id needs re-review")
    v.add_argument("--date", help="override today's date (YYYY-MM-DD), for testing")
    v.set_defaults(func=cmd_verify)

    f = sub.add_parser("flagged", help="user-reported review queue")
    f.set_defaults(func=cmd_flagged)

    st = sub.add_parser("status", help="coverage / health of the curated set")
    st.add_argument("--stale", type=int, default=DEFAULT_STALE_DAYS)
    st.add_argument("--date", help="override today's date (YYYY-MM-DD), for testing")
    st.set_defaults(func=cmd_status)

    args = p.parse_args(argv)
    lib = load_library()
    store = RealFirestoreVideoDbClient()
    yt = build_real_youtube_client()
    args.func(args, lib, store, yt)


if __name__ == "__main__":
    main()
