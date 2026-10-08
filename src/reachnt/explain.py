"""Plain-English answers to "why is my repair waiting?".

Every sentence is built from the job's own record (reading, score parts, the reason codes logged each week
it was not done) and from the decision ledger. Nothing is generated freely, so nothing can be made up.
Sentences are short so a Community Housing Officer or an Aboriginal Interpreter Service interpreter can read
them out. tests/test_explain.py checks the reading level.
"""
from __future__ import annotations

import re

from . import urgency
from .config import params, taxonomy

TRADE_WORD = {"plumber": "plumber", "electrician": "electrician", "carpenter": "carpenter", "aircon": "air-con technician",
              "pest": "pest controller", "general": "maintenance worker"}
CAT_WORD = {"immediate": "Immediate (danger)", "urgent": "Urgent", "routine": "Routine"}
HOTLINE = "1800 104 076"


def _days(d: float) -> str:
    d = int(round(d))
    return "1 day" if d == 1 else f"{d} days"


def _money(x: float) -> str:
    return f"${int(round(x, -2)):,}"


def _a(word: str) -> str:
    return ("an " if word[:1].lower() in "aeiou" else "a ") + word


def _why(log: list, trade: str, place: str, ledger: dict, community: dict | None) -> list[str]:
    from collections import Counter
    rc = Counter(code for _, code, _, _ in log)
    why = []
    if rc.get("cut"):
        road = (community or {}).get("closure_road")
        road = f"{road.title()} closed" if isinstance(road, str) and road else "wet-season conditions"
        why.append(f"For {_days(rc['cut'] * 7)} the road to {place} was cut ({road}) and there was no airstrip to fly {_a(trade)} in.")
    if rc.get("travel_cost"):
        cost = max(c for _, code, c, _ in log if code == "travel_cost")
        mode = "fly" if any(m == "air" for _, code, _, m in log if code == "travel_cost") else "drive"
        why.append(f"For {_days(rc['travel_cost'] * 7)} no {trade} was sent to {place}. "
                   f"It costs about {_money(cost)} to {mode} one there and back.")
        if ledger.get("date", "").startswith("("):
            why.append("That was a cost decision, not a judgement about your repair. Nobody signed off on it.")
        else:
            why.append(f"That was a cost decision, not a judgement about your repair. "
                       f"It follows the setting the {ledger.get('role', 'coordinator')} approved on {ledger['date']}.")
    if rc.get("crew_full"):
        why.append(f"For {_days(rc['crew_full'] * 7)} every {trade} was fully booked on repairs that scored higher than yours. "
                   "Higher scores mean more danger or a longer wait.")
    if rc.get("lower_priority"):
        why.append(f"For {_days(rc['lower_priority'] * 7)} {_a(trade)} was working nearby but did higher-scoring repairs first.")
    return why


def tenant_explanation(job: dict, place: str, ledger: dict, community: dict | None = None, rank: tuple[int, int] | None = None,
                       as_of_week: int | None = None, booked: bool = False) -> dict:
    """job: one row of simulate.run(...).jobs as a dict. ledger: the signed policy decision in force.

    With `as_of_week`, the answer is what the tenant would be told that week (only the history up to then)."""
    H = taxonomy()["hazards"][job["hazard"]]
    cat = job["category"]
    trade = TRADE_WORD[job["trade"]]
    remote = bool(job["remote"])
    regime = "official" if ledger.get("policy") == "official" else "equal"
    official = urgency.clock_days("urgent" if cat == "immediate" else cat, remote, "official")
    clock = urgency.clock_days("urgent" if cat == "immediate" else cat, remote, regime)
    log = list(job.get("reason_log") or [])
    if as_of_week is not None:
        log = [x for x in log if x[0] < as_of_week]
        waited = max(0.0, as_of_week * 7 + 3 - job["day"])
        is_open = True
    else:
        waited = float(job["wait_days"])
        is_open = bool(job.get("open_at_end"))
    mods = {k: 1 for k in ("vulnerable", "crowded", "repeat") if job.get(k)}
    u = urgency.score(job["hazard"], mods, waited, clock)
    sections = []

    heard = f'You told us: "{job["text"]}". We read this as: {H["label"].lower()}.'
    if job.get("needs_human"):
        heard += " A person checked your report before it went in the line."
    sections.append(("What we heard", heard))

    how = [f"This is {_a(CAT_WORD[cat])} repair."]
    if cat == "immediate":
        how.append(f"The local Housing Maintenance Officer makes it safe the same day. Then {_a(trade)} does the full fix.")
    bd = 10 if cat == "routine" else 2
    if regime == "equal":
        how.append(f"Our rule is the same in town and out bush: {_a(trade)} within {bd} business days.")
    else:
        how.append(f"The current rule for {'remote' if remote else 'town'} houses is {int(round(official * 5 / 7))} business days.")
    if H.get("rta_s63"):
        how.append("The law calls this kind of fault an emergency repair.")
    sections.append(("How urgent it is", " ".join(how)))

    status = []
    if as_of_week is not None and booked:
        status.append(f"You have waited {_days(waited)}. {_a(trade).capitalize()} is booked to fix it this week.")
    elif is_open:
        status.append(f"Not fixed yet. You have waited {_days(waited)}.")
    else:
        status.append(f"Fixed after {_days(waited)}.")
    if waited > clock:
        status.append(f"That is longer than our rule, by {_days(waited - clock)}.")
    if rank and not booked:
        status.append(f"You are number {rank[0]} of {rank[1]} waiting for {_a(trade)} from {job['hub']}.")
    if job.get("merged_into"):
        status.append("This fault was already reported for your house, so we joined the two reports: one visit fixes it.")
    if job.get("true_category", cat) == "immediate" or cat == "immediate":
        status.append("A maintenance officer makes it safe the day you report it. Fixing it properly is a second step, with its own date.")
    sections.append(("Where it is up to", " ".join(status)))

    why = _why(log, trade, place, ledger, community)
    if not why:
        why = ["Nothing has held it up so far." if is_open or booked else "Nothing held it up. It was done on the first trip."]
    sections.append(("Why it is not fixed yet" if (is_open and not booked) else "What held it up", " ".join(why)))

    sections.append(("What would change it",
                     f"If it gets worse (sparks, smoke, water everywhere, sewage), call {HOTLINE} or tell your housing officer. "
                     "It becomes Immediate and is made safe the same day. "
                     "Every day you wait adds points, so your repair moves up the line."))
    sections.append(("Your rights",
                     "You can ask for a free interpreter at any time. "
                     "If an urgent repair is not done, you can ask the Tribunal (NTCAT) for an emergency repair order. "
                     "You can also complain to the NT Ombudsman. "
                     "You can ask for a person to review how your repair was ranked: say so when you call, tell your housing officer, or use the app. "
                     "We answer within 10 working days."))

    score_txt = (f"Score {u.total}: {u.base} for the {cat} category, {u.harm} for harm, {u.hlp} for the health practice it affects, "
                 f"{u.exposure} for who lives there, {u.repeat} for a repeat report, {u.ageing} for waiting. "
                 "Distance and cost are never part of this score.")
    held = [c for _, c, _, _ in log]
    short = (f"Your {H['label'].lower()} repair is {cat}. "
             + ("Booked this week. " if booked else ("Waiting " + _days(waited) + ". " if is_open else f"Fixed after {_days(waited)}. "))
             + ("Held up by travel cost. " if "travel_cost" in held else "")
             + ("Road was cut. " if "cut" in held else "")
             + f"Ask why: {HOTLINE}")
    return dict(short=short, sections=sections, score=u.parts(), score_text=score_txt)


def _syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    groups = re.findall(r"[aeiouy]+", w)
    n = len(groups) - (1 if w.endswith("e") and len(groups) > 1 else 0)
    return max(1, n)


def flesch_reading_ease(text: str) -> float:
    sents = max(1, len(re.findall(r"[.!?]", text)))
    words = re.findall(r"[A-Za-z']+", text)
    if not words:
        return 100.0
    syl = sum(_syllables(w) for w in words)
    return 206.835 - 1.015 * len(words) / sents - 84.6 * syl / len(words)
