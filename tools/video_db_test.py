#!/usr/bin/env python3
"""Tests for video_db.py. Stdlib `unittest` only (no pytest in this repo/environment) -- run with

    python3 -m unittest tools.video_db_test -v

from the repo root, or `python3 tools/video_db_test.py`.

Zero network, zero API key, zero Firestore credentials: every test injects a fake YouTubeClient
and/or fake VideoDbClient instead of the real ones. `RealYouTubeClient`/`RealFirestoreVideoDbClient`
are never imported here.

Per the verification bar (docs/handoff/wave-06-network.md / ORCHESTRATION.md): every auto-reject
rule, `set`'s re-validation, and the "never reaches packages/data" invariant are each covered by a
test that is falsified by removing the specific check it targets -- confirmed by hand (see
STATUS-6e-video-cli.md's "What I verified" section for the mutate/re-run/restore record), not just
asserted after the fact.
"""
from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import video_db as vdb  # noqa: E402


# =============================================================================================
# Fakes
# =============================================================================================


def make_details(
    video_id="aaaaaaaaaaa",
    embeddable=True,
    privacy_status="public",
    duration_seconds=120,
    age_restricted=False,
    region_restricted=False,
    title="A Great Demo",
    channel="Some Channel",
) -> vdb.VideoDetails:
    return vdb.VideoDetails(
        video_id=video_id,
        title=title,
        channel=channel,
        embeddable=embeddable,
        privacy_status=privacy_status,
        duration_seconds=duration_seconds,
        age_restricted=age_restricted,
        region_restricted=region_restricted,
    )


class FakeYouTubeClient:
    def __init__(self, search_results=None, details=None, oembed_alive=None):
        self.search_results: list[str] = search_results or []
        self.details: dict[str, vdb.VideoDetails] = details or {}
        self.oembed_alive: dict[str, bool] = oembed_alive or {}
        self.search_calls: list[str] = []
        self.videos_details_calls: list[list[str]] = []
        self.oembed_calls: list[str] = []

    def search(self, query: str, max_results: int = 15) -> list[str]:
        self.search_calls.append(query)
        return self.search_results[:max_results]

    def videos_details(self, video_ids: list[str]) -> dict[str, vdb.VideoDetails]:
        self.videos_details_calls.append(list(video_ids))
        return {vid: self.details[vid] for vid in video_ids if vid in self.details}

    def oembed_ok(self, video_id: str) -> bool:
        self.oembed_calls.append(video_id)
        return self.oembed_alive.get(video_id, True)


class FakeVideoDbClient:
    def __init__(self, docs=None, flag_rows=None, sessions_performed=None):
        self.docs: dict[str, vdb.VideoDoc] = docs or {}
        self.flag_rows: list[vdb.ExerciseStateFlagRow] = flag_rows or []
        self.sessions_performed: dict[str, int] = sessions_performed or {}
        self.set_calls: list[vdb.VideoDoc] = []

    def get_video_doc(self, exercise_id):
        return self.docs.get(exercise_id)

    def set_video_doc(self, doc):
        self.set_calls.append(doc)
        self.docs[doc.exercise_id] = doc

    def all_video_docs(self):
        return dict(self.docs)

    def all_flagged_exercise_states(self):
        return list(self.flag_rows)

    def all_sessions_performed(self):
        return dict(self.sessions_performed)


def make_lib(*ids: str) -> dict[str, vdb.Exercise]:
    return {
        i: vdb.Exercise(
            id=i,
            name=i.replace("-", " ").title(),
            setup=f"setup cue for {i}",
            video_search=f"https://www.youtube.com/results?search_query=band+{i}+tutorial",
        )
        for i in ids
    }


def run_cmd(func, args_ns, lib, store, yt) -> str:
    buf = io.StringIO()
    with redirect_stdout(buf):
        func(args_ns, lib, store, yt)
    return buf.getvalue()


class Args:
    """Minimal stand-in for argparse.Namespace with sensible defaults for every subcommand."""

    def __init__(self, **kw):
        self.date = None
        self.stale = vdb.DEFAULT_STALE_DAYS
        self.max_results = 15
        self.verbose = False
        for k, v in kw.items():
            setattr(self, k, v)


# =============================================================================================
# auto_reject_reasons -- each rule in isolation
# =============================================================================================


class TestAutoReject(unittest.TestCase):
    def test_fully_compliant_video_passes(self):
        self.assertEqual(vdb.auto_reject_reasons(make_details()), [])

    def test_rejects_non_embeddable(self):
        d = make_details(embeddable=False)
        reasons = vdb.auto_reject_reasons(d)
        self.assertTrue(any("embeddable" in r for r in reasons))

    def test_rejects_private(self):
        d = make_details(privacy_status="private")
        reasons = vdb.auto_reject_reasons(d)
        self.assertTrue(any("public" in r for r in reasons))

    def test_rejects_unlisted_too(self):
        # Only "public" passes -- unlisted is not an explicit spec case but is not public either.
        d = make_details(privacy_status="unlisted")
        self.assertTrue(vdb.auto_reject_reasons(d))

    def test_rejects_age_restricted(self):
        d = make_details(age_restricted=True)
        reasons = vdb.auto_reject_reasons(d)
        self.assertTrue(any("age" in r for r in reasons))

    def test_rejects_region_locked(self):
        d = make_details(region_restricted=True)
        reasons = vdb.auto_reject_reasons(d)
        self.assertTrue(any("region" in r for r in reasons))

    def test_rejects_over_four_minutes(self):
        d = make_details(duration_seconds=241)
        reasons = vdb.auto_reject_reasons(d)
        self.assertTrue(any("too long" in r for r in reasons))

    def test_four_minutes_exactly_is_allowed(self):
        d = make_details(duration_seconds=240)
        self.assertEqual(vdb.auto_reject_reasons(d), [])

    def test_multiple_violations_all_reported(self):
        d = make_details(embeddable=False, age_restricted=True, duration_seconds=999)
        reasons = vdb.auto_reject_reasons(d)
        self.assertEqual(len(reasons), 3)


class TestVideoIdSyntax(unittest.TestCase):
    def test_valid_11_char_id(self):
        self.assertTrue(vdb.is_valid_video_id_syntax("dQw4w9WgXcQ"))

    def test_rejects_too_short(self):
        self.assertFalse(vdb.is_valid_video_id_syntax("short"))

    def test_rejects_too_long(self):
        self.assertFalse(vdb.is_valid_video_id_syntax("waytoolongvideoid123"))

    def test_rejects_bad_characters(self):
        self.assertFalse(vdb.is_valid_video_id_syntax("has spaces!"))


# =============================================================================================
# cmd_set -- validate-before-write, refuses invalid input rather than storing it
# =============================================================================================


class TestCmdSet(unittest.TestCase):
    def setUp(self):
        self.lib = make_lib("bw-plank")

    def test_valid_id_is_written_and_verified_at_stamped(self):
        store = FakeVideoDbClient()
        yt = FakeYouTubeClient(details={"aaaaaaaaaaa": make_details(video_id="aaaaaaaaaaa")})
        args = Args(exercise_id="bw-plank", video_id="aaaaaaaaaaa")
        vdb.cmd_set(args, self.lib, store, yt)
        self.assertEqual(len(store.set_calls), 1)
        doc = store.set_calls[0]
        self.assertEqual(doc.video_id, "aaaaaaaaaaa")
        self.assertEqual(doc.video_flag_count, 0)
        self.assertIsNotNone(doc.video_verified_at)

    def test_unknown_exercise_id_refused_without_calling_api(self):
        store = FakeVideoDbClient()
        yt = FakeYouTubeClient()
        args = Args(exercise_id="does-not-exist", video_id="aaaaaaaaaaa")
        with self.assertRaises(SystemExit):
            vdb.cmd_set(args, self.lib, store, yt)
        self.assertEqual(store.set_calls, [])
        self.assertEqual(yt.videos_details_calls, [])

    def test_malformed_video_id_refused_without_calling_api(self):
        """Syntax check happens before any network call -- refuse cheap junk cheaply."""
        store = FakeVideoDbClient()
        yt = FakeYouTubeClient()
        args = Args(exercise_id="bw-plank", video_id="not-a-real-id")
        with self.assertRaises(SystemExit):
            vdb.cmd_set(args, self.lib, store, yt)
        self.assertEqual(store.set_calls, [])
        self.assertEqual(yt.videos_details_calls, [])

    def test_id_that_no_longer_resolves_is_refused(self):
        store = FakeVideoDbClient()
        yt = FakeYouTubeClient(details={})  # videos.list returns nothing for this id
        args = Args(exercise_id="bw-plank", video_id="aaaaaaaaaaa")
        with self.assertRaises(SystemExit):
            vdb.cmd_set(args, self.lib, store, yt)
        self.assertEqual(store.set_calls, [])

    def test_id_failing_revalidation_is_refused_not_stored(self):
        """The core `set` re-validates rule: an id that fails auto_reject_reasons must never
        reach the store, even though its syntax and existence are both fine."""
        store = FakeVideoDbClient()
        yt = FakeYouTubeClient(
            details={"aaaaaaaaaaa": make_details(video_id="aaaaaaaaaaa", embeddable=False)}
        )
        args = Args(exercise_id="bw-plank", video_id="aaaaaaaaaaa")
        with self.assertRaises(SystemExit):
            vdb.cmd_set(args, self.lib, store, yt)
        self.assertEqual(store.set_calls, [])

    def test_set_resets_an_existing_flag_count(self):
        store = FakeVideoDbClient(
            docs={"bw-plank": vdb.VideoDoc("bw-plank", "old-id-000", "2020-01-01", video_flag_count=5)}
        )
        yt = FakeYouTubeClient(details={"aaaaaaaaaaa": make_details(video_id="aaaaaaaaaaa")})
        args = Args(exercise_id="bw-plank", video_id="aaaaaaaaaaa")
        vdb.cmd_set(args, self.lib, store, yt)
        self.assertEqual(store.docs["bw-plank"].video_flag_count, 0)


# =============================================================================================
# cmd_candidates -- machine filtering before a human looks
# =============================================================================================


class TestCmdCandidates(unittest.TestCase):
    def test_unknown_exercise_refused(self):
        lib = make_lib("bw-plank")
        store, yt = FakeVideoDbClient(), FakeYouTubeClient()
        with self.assertRaises(SystemExit):
            vdb.cmd_candidates(Args(exercise_id="nope"), lib, store, yt)

    def test_shortlist_excludes_every_auto_reject_class(self):
        lib = make_lib("banded-row")
        good = make_details(video_id="good0000000", title="Good Video")
        bad_embed = make_details(video_id="bad10000000", embeddable=False)
        bad_private = make_details(video_id="bad20000000", privacy_status="private")
        bad_age = make_details(video_id="bad30000000", age_restricted=True)
        bad_region = make_details(video_id="bad40000000", region_restricted=True)
        bad_long = make_details(video_id="bad50000000", duration_seconds=500)
        ids = [d.video_id for d in (good, bad_embed, bad_private, bad_age, bad_region, bad_long)]
        details = {d.video_id: d for d in (good, bad_embed, bad_private, bad_age, bad_region, bad_long)}
        yt = FakeYouTubeClient(search_results=ids, details=details)
        store = FakeVideoDbClient()

        out = run_cmd(vdb.cmd_candidates, Args(exercise_id="banded-row"), lib, store, yt)

        self.assertIn("good0000000", out)
        for bad_id in ("bad10000000", "bad20000000", "bad30000000", "bad40000000", "bad50000000"):
            self.assertNotIn(bad_id, out.split("REJECTED")[0] if "REJECTED" in out else out)
        self.assertIn("1 passed auto-filter, 5 auto-rejected", out)

    def test_search_query_extracted_from_video_search_field(self):
        lib = make_lib("banded-row")
        yt = FakeYouTubeClient(search_results=[])
        store = FakeVideoDbClient()
        vdb.cmd_candidates(Args(exercise_id="banded-row"), lib, store, yt)
        self.assertEqual(yt.search_calls, ["band banded-row tutorial"])


# =============================================================================================
# cmd_queue -- uncurated, ranked by sessions performed
# =============================================================================================


class TestCmdQueue(unittest.TestCase):
    def test_curated_exercises_excluded(self):
        lib = make_lib("a", "b")
        store = FakeVideoDbClient(docs={"a": vdb.VideoDoc("a", "aaaaaaaaaaa", "2026-01-01", 0)})
        out = run_cmd(vdb.cmd_queue, Args(), lib, store, FakeYouTubeClient())
        self.assertNotIn(" a ", out)
        self.assertIn("b", out)

    def test_null_video_id_doc_still_counts_as_uncurated(self):
        lib = make_lib("a")
        store = FakeVideoDbClient(docs={"a": vdb.VideoDoc("a", None, None, 0)})
        out = run_cmd(vdb.cmd_queue, Args(), lib, store, FakeYouTubeClient())
        self.assertIn("a", out)
        self.assertIn("UNCURATED (1 of 1)", out)

    def test_ranked_by_sessions_performed_descending(self):
        lib = make_lib("low", "high", "zero")
        store = FakeVideoDbClient(sessions_performed={"low": 2, "high": 40})
        out = run_cmd(vdb.cmd_queue, Args(), lib, store, FakeYouTubeClient())
        self.assertLess(out.index("high"), out.index("low"))
        self.assertLess(out.index("low"), out.index("zero"))


# =============================================================================================
# cmd_verify -- dead ids cleared, stale ones flagged, nothing invented
# =============================================================================================


class TestCmdVerify(unittest.TestCase):
    def test_dead_id_is_cleared(self):
        store = FakeVideoDbClient(
            docs={"a": vdb.VideoDoc("a", "aaaaaaaaaaa", "2026-01-01", 0)}
        )
        yt = FakeYouTubeClient(oembed_alive={"aaaaaaaaaaa": False})
        vdb.cmd_verify(Args(), make_lib("a"), store, yt)
        self.assertIsNone(store.docs["a"].video_id)

    def test_alive_and_fresh_is_untouched(self):
        store = FakeVideoDbClient(
            docs={"a": vdb.VideoDoc("a", "aaaaaaaaaaa", date_str_days_ago(1), 0)}
        )
        yt = FakeYouTubeClient(oembed_alive={"aaaaaaaaaaa": True})
        out = run_cmd(vdb.cmd_verify, Args(), make_lib("a"), store, yt)
        self.assertEqual(store.docs["a"].video_id, "aaaaaaaaaaa")
        self.assertIn("1 verified alive and fresh", out)

    def test_alive_but_old_is_flagged_stale_not_cleared(self):
        store = FakeVideoDbClient(
            docs={"a": vdb.VideoDoc("a", "aaaaaaaaaaa", date_str_days_ago(400), 0)}
        )
        yt = FakeYouTubeClient(oembed_alive={"aaaaaaaaaaa": True})
        out = run_cmd(vdb.cmd_verify, Args(stale=365), make_lib("a"), store, yt)
        self.assertEqual(store.docs["a"].video_id, "aaaaaaaaaaa")  # not cleared
        self.assertIn("1 alive but stale", out)

    def test_never_reinvents_an_id_only_clears_or_keeps(self):
        """verify must never WRITE a video_id that didn't already come from the store -- it can
        only clear (set null) an existing one, never fabricate a replacement."""
        store = FakeVideoDbClient(docs={"a": vdb.VideoDoc("a", "aaaaaaaaaaa", "2026-01-01", 0)})
        yt = FakeYouTubeClient(oembed_alive={"aaaaaaaaaaa": False})
        vdb.cmd_verify(Args(), make_lib("a"), store, yt)
        for doc in store.set_calls:
            self.assertIn(doc.video_id, (None, "aaaaaaaaaaa"))


def date_str_days_ago(n: int) -> str:
    from datetime import date, timedelta

    return (date.today() - timedelta(days=n)).isoformat()


# =============================================================================================
# cmd_flagged -- the loop closes on user flags (issue #30's remaining half)
# =============================================================================================


class TestCmdFlagged(unittest.TestCase):
    def test_no_reports_prints_none(self):
        out = run_cmd(vdb.cmd_flagged, Args(), make_lib("a"), FakeVideoDbClient(), FakeYouTubeClient())
        self.assertIn("none", out)

    def test_aggregates_multiple_users_reporting_the_same_exercise(self):
        rows = [
            vdb.ExerciseStateFlagRow("uid1", "banded-row", 2, "2026-08-01"),
            vdb.ExerciseStateFlagRow("uid2", "banded-row", 1, None),
        ]
        store = FakeVideoDbClient(flag_rows=rows)
        out = run_cmd(vdb.cmd_flagged, Args(), make_lib("banded-row"), store, FakeYouTubeClient())
        self.assertIn("2 user(s) reported", out)
        self.assertIn("3 total flags", out)
        self.assertIn("1 demoted", out)

    def test_most_demoted_sorts_first(self):
        rows = [
            vdb.ExerciseStateFlagRow("uid1", "one-report", 1, None),
            vdb.ExerciseStateFlagRow("uid2", "fully-demoted", 2, "2026-08-01"),
        ]
        store = FakeVideoDbClient(flag_rows=rows)
        out = run_cmd(
            vdb.cmd_flagged, Args(), make_lib("one-report", "fully-demoted"), store, FakeYouTubeClient()
        )
        self.assertLess(out.index("fully-demoted"), out.index("one-report"))


# =============================================================================================
# cmd_status
# =============================================================================================


class TestCmdStatus(unittest.TestCase):
    def test_counts(self):
        lib = make_lib("a", "b", "c")
        store = FakeVideoDbClient(
            docs={
                "a": vdb.VideoDoc("a", "aaaaaaaaaaa", date_str_days_ago(1), 0),
                "b": vdb.VideoDoc("b", "bbbbbbbbbbb", date_str_days_ago(400), 0),
            },
            flag_rows=[vdb.ExerciseStateFlagRow("uid1", "a", 1, None)],
        )
        out = run_cmd(vdb.cmd_status, Args(stale=365), lib, store, FakeYouTubeClient())
        self.assertIn("curated:  2 of 3", out)
        self.assertIn("flagged:  1 exercises", out)
        self.assertIn("stale:    1 curated ids", out)
        self.assertIn("uncurated: 1", out)


# =============================================================================================
# The riskiest invariant: a video id must never reach packages/data.
# =============================================================================================


class TestNeverBundlesAVideoId(unittest.TestCase):
    def test_load_library_refuses_a_library_carrying_a_video_id(self):
        """Defense in depth: even if something upstream ever let a video_id slip into the
        library JSON, this tool refuses to load it rather than silently treating it as curated
        (which would risk this CLI 'confirming' a bundled id back into Firestore as legitimate)."""
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "exercises.json"
            path.write_text(
                json.dumps(
                    {
                        "exercises": [
                            {
                                "id": "bw-plank",
                                "name": "Plank",
                                "setup": "x",
                                "video_search": "https://www.youtube.com/results?search_query=x",
                                "video_id": "shouldnotbehere",
                            }
                        ]
                    }
                )
            )
            with self.assertRaises(SystemExit):
                vdb.load_library(path)

    def test_this_module_has_no_write_path_into_packages_data(self):
        """Structural check on the source itself: nothing in video_db.py ever opens
        packages/data/library/exercises.json for writing. `LIBRARY_PATH` may only appear as a
        read (`load_library`'s `.read_text()`), never alongside a write call."""
        source = Path(vdb.__file__).read_text()
        self.assertNotIn("LIBRARY_PATH.write_text", source)
        self.assertNotIn("LIBRARY_PATH, \"w\"", source)
        self.assertNotIn("open(LIBRARY_PATH", source)

    def test_real_library_on_disk_carries_no_video_id(self):
        """Live check against the actual bundled library, not a fixture -- this is the same
        assertion packages/data/src/validate.ts makes, exercised from this tool's own loader."""
        lib = vdb.load_library()  # would sys.exit if any record carried video_id
        self.assertGreater(len(lib), 0)


if __name__ == "__main__":
    unittest.main()
