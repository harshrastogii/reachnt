"""Integrity and robustness checks: the data is sane, every simulated plan keeps its books, and the reader fails safe.

Data and simulation checks skip when the pipeline outputs are missing (run python run_all.py first).
"""
from __future__ import annotations

import glob
import re
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from reachnt import intake, synth  # noqa: E402
from reachnt.config import OUTPUTS, PROCESSED, taxonomy  # noqa: E402

H = taxonomy()["hazards"]
needs = lambda p: pytest.mark.skipif(not p.exists(), reason=f"{p.name} not built; run python run_all.py")


@needs(PROCESSED / "communities.csv")
def test_communities_are_sane():
    com = pd.read_csv(PROCESSED / "communities.csv")
    assert len(com) == 70 and com.cid.is_unique
    assert com.lat.between(-26.1, -10.8).all() and com.lon.between(128.9, 138.1).all()   # inside the NT
    assert (com.houses_est > 0).all() and com.hub.notna().all()
    assert com.oneway_hours.between(0, 20).all()


@needs(PROCESSED / "settlements_osm.csv")
def test_map_positions_stay_close_to_the_government_points():
    com = pd.read_csv(PROCESSED / "communities.csv").set_index("cid")
    osm = pd.read_csv(PROCESSED / "settlements_osm.csv").set_index("cid")
    assert set(osm.index) == set(com.index)
    assert (osm.shift_km <= 1.5).all()          # a correction, never a different place


@needs(PROCESSED / "requests.parquet")
def test_requests_are_complete():
    req = pd.read_parquet(PROCESSED / "requests.parquet")
    assert req.job_id.is_unique
    assert req.true_hazard.isin(H.keys()).all() and req.hazard.isin(H.keys()).all()
    assert req.day.between(0, 365).all() and (req.text.str.len() > 0).all()


@pytest.mark.skipif(not glob.glob(str(OUTPUTS / "jobs_*.parquet")), reason="simulation outputs not built")
@pytest.mark.parametrize("path", sorted(glob.glob(str(OUTPUTS / "jobs_*.parquet"))), ids=lambda p: Path(p).stem)
def test_every_plan_keeps_its_books(path):
    req = pd.read_parquet(PROCESSED / "requests.parquet")
    j = pd.read_parquet(path)
    assert set(j.job_id) == set(req.job_id)                       # same requests under every plan
    assert (j.wait_days >= 0).all()
    done = j[~j.open_at_end]
    assert (done.done_day >= done.day - 1e-9).all()               # never fixed before it was reported


@pytest.fixture(scope="module")
def clf():
    tr = synth.labelled_corpus(60, "train", 1)
    return intake.Classifier().fit(tr.text, tr.hazard)


@pytest.mark.parametrize("text", ["", "??", "😡😡😡", "1800 104 076", "a" * 5000])
def test_unreadable_reports_go_to_a_person(text, clf):
    assert intake.read(text, clf).needs_human


@pytest.mark.parametrize("text", ["power point sparking", "POWER POINT SPARKING!!!", "powr pont sparkin",
                                  "smells like gas inside", "sewage coming up in the yard",
                                  "<script>alert(1)</script> sewage everywhere"])
def test_danger_survives_shouting_typos_and_markup(text, clf):
    r = intake.read(text, clf)
    assert H[r.hazard]["category"] == "immediate" or r.needs_human


@pytest.mark.parametrize("text", ["no sparks, the power point just doesn't work", "not sparking now but the switch is black"])
def test_a_negated_danger_is_checked_by_a_person_not_downgraded(text, clf):
    r = intake.read(text, clf)
    assert H[r.hazard]["category"] == "immediate" and r.needs_human


def test_a_missing_smoke_detector_is_not_read_as_a_negation():
    pats = [re.compile(p) for p in taxonomy()["modifiers"]["negation"]["patterns"]]
    assert not any(p.search(intake.normalise("no smoke detector in the bedroom")) for p in pats)
