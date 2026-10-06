"""Need-only urgency.

The score never sees distance, travel cost, community, region or anything about who the tenant is
beyond what the report itself says (a baby, an elder, a crowded house, a repeat report).
That rule is tested in tests/test_urgency.py.

    points = category base + harm + Healthy Living Practice rank + exposure + repeat + ageing

Category sets the clock (NT FS17). Inside a category, points order the queue. Every component is
returned so the explanation can show the arithmetic.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from .config import params, taxonomy

CATEGORY_BASE = {"immediate": 1000, "urgent": 500, "routine": 100}
INPUTS_ALLOWED = {"hazard", "modifiers", "days_waited", "clock_days"}   # the only things urgency may read


@dataclass
class Urgency:
    category: str
    base: int
    harm: int
    hlp: int
    exposure: int
    repeat: int
    ageing: int

    @property
    def total(self) -> int:
        return self.base + self.harm + self.hlp + self.exposure + self.repeat + self.ageing

    def parts(self) -> dict:
        d = asdict(self)
        d["total"] = self.total
        return d


def clock_days(category: str, remote: bool, regime: str = "equal") -> float:
    """Calendar days allowed before the job is overdue (business days x 7/5)."""
    C = params()["clocks"][regime]
    if category == "immediate":
        return C["immediate_hours"] / 24
    key = "urgent_business_days" if category == "urgent" else "routine_business_days"
    return C[key]["remote" if remote else "town"] * 7 / 5


def score(hazard: str, modifiers: dict, days_waited: float = 0.0, clock: float | None = None) -> Urgency:
    H = taxonomy()["hazards"][hazard]
    T = params()["triage"]
    cat = H["category"]
    clock = clock if clock is not None else clock_days(cat, False)
    hlp_pts = (10 - H["hlp"]) * 4                    # Safety (0) = 40 ... HLP 9 = 4
    exposure = (T["vulnerable_points"] if "vulnerable" in modifiers else 0) + (T["crowded_points"] if "crowded" in modifiers else 0)
    repeat = T["repeat_points"] if "repeat" in modifiers else 0
    over_half = max(0.0, days_waited - clock / 2)
    ageing = int(round(params()["planning"]["ageing_points_per_day"] * over_half))
    return Urgency(cat, CATEGORY_BASE[cat], int(H["harm"]), hlp_pts, exposure, repeat, ageing)
