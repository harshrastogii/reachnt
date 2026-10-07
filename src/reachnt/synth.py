"""Synthetic fault reports and request streams.

No public dataset of NT remote repair requests exists (the Menzies evaluation could not obtain one either).
Everything this module makes is SYNTHETIC and labelled so in every output. What is real: the communities,
house counts, hubs, access calendar and the job mix (Grealy et al. 2022, Table 3).

Phrasings are split into two families per hazard: `train` phrasings for the classifier and `heldout`
phrasings that are only ever used for testing, so reported accuracy is measured on wording the model never saw.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import params

# hazard -> (train phrasings, held-out phrasings)
PHRASES: dict[str, tuple[list[str], list[str]]] = {
    "electrical_danger": (
        ["power point is sparking", "sparks coming out of the plug in the kitchen", "wires hanging out of the wall near the door",
         "got a shock off the fridge plug", "burning smell from the switch board", "meter box smoking", "exposed wires in the bathroom",
         "kids got zapped touching the light switch"],
        ["live wire sticking out by the back door", "black marks and melting on the power point", "light switch gave my son a big shock",
         "fuse box making crackling noise and smoke"]),
    "damp_mould": (
        ["black mould all over the bedroom ceiling", "walls are damp and mouldy since the rain", "mould growing in the bathroom",
         "musty smell and black spots on the walls", "kids coughing, mould in their room", "damp walls in the lounge, smells bad"],
        ["black stuff growing up the wall behind the bed", "mildew on the ceiling every wet season", "walls always wet, green fungus in the corner"]),
    "gas_leak": (
        ["smell gas in the kitchen", "gas bottle hissing", "gas leak near the stove", "strong gas smell"],
        ["smells like gas inside the house", "gas bottle leaking outside the kitchen"]),
    "structural_danger": (
        ["ceiling falling down in the lounge", "verandah floor rotten and gave way", "back steps collapsed", "roof caved in after the wind"],
        ["big piece of ceiling fell on the bed", "stairs falling apart, old people can't get out"]),
    "sewage_overflow": (
        ["sewage coming up in the yard", "toilet overflowing everywhere", "poo water coming up the shower drain", "septic overflowing outside",
         "drain backing up smells really bad"],
        ["dirty toilet water flooding the bathroom floor", "sewerage pipe broke and leaking in the yard"]),
    "burst_pipe": (
        ["pipe burst in the yard", "water spraying out of the pipe under the house", "water main leaking near the fence", "pipe broken water everywhere"],
        ["big leak under the sink water pouring out", "water gushing from the ground by the tap"]),
    "no_water": (
        ["no water in the house", "water is off, taps dry", "no running water since yesterday", "water stopped working"],
        ["nothing comes out of the taps", "can't get any water for drinking or washing"]),
    "no_power": (
        ["no power in the house", "power keeps tripping", "lights out whole house", "power is off since the storm"],
        ["whole place has no electricity", "the power cuts out every night"]),
    "hot_water": (
        ["no hot water", "hot water system broken", "water is cold in the shower", "solar hot water not working"],
        ["only cold water for washing the kids", "hws leaking and no warm water"]),
    "toilet_blocked": (
        ["toilet blocked", "toilet won't flush", "blocked toilet", "toilet broken cistern leaking", "drain blocked in bathroom"],
        ["can't use the toilet, it's stuck", "loo won't flush properly"]),
    "shower_broken": (
        ["shower not working", "broken shower head", "tap stuck won't turn off", "dripping tap in bathroom", "taps hard to turn"],
        ["shower rose fell off, can't wash", "kitchen tap leaking all the time"]),
    "smoke_alarm": (
        ["smoke alarm not working", "smoke alarm beeping all night", "fire alarm broken"],
        ["the alarm on the ceiling keeps chirping", "no smoke detector in the bedroom"]),
    "security": (
        ["front door won't lock", "back door kicked in", "lock broken on the door", "window won't lock", "screen door off the hinge"],
        ["can't secure the house at night, door broken", "someone smashed the door handle"]),
    "broken_glass": (
        ["window smashed glass on the floor", "broken glass in the kids room", "window cracked and broken"],
        ["sharp bits of glass everywhere from the window", "glass broke in the back window"]),
    "roof_leak": (
        ["roof leaking when it rains", "rain coming in through the ceiling", "storm lifted the roof sheets", "tree fell on the house in the storm"],
        ["water dripping from the ceiling into the bedroom", "big wind took part of the roof"]),
    "stove_broken": (
        ["stove not working", "oven broken", "hot plate dead", "can't cook stove no good"],
        ["elements on the cooker don't heat up", "no way to cook food for the family"]),
    "aircon_fan": (
        ["air con not working", "fan broken in the bedroom", "aircon leaking water", "house too hot, cooler not working"],
        ["ceiling fan stopped spinning", "evaporative cooler dead, too hot for the baby"]),
    "laundry": (
        ["washing machine tap leaking", "laundry tub blocked", "can't wash clothes, laundry tap broken"],
        ["no water to the washing machine", "trough in the laundry cracked"]),
    "kitchen": (
        ["kitchen sink blocked", "kitchen bench broken", "cupboard doors falling off in the kitchen", "fridge power point not working"],
        ["sink in kitchen leaking underneath", "kitchen drawers broken can't store food"]),
    "power_point": (
        ["power point not working", "light not working in bedroom", "plug in lounge dead", "lights broken in the hallway"],
        ["one socket in the kitchen stopped working", "bedroom globe fitting broken"]),
    "pests": (
        ["cockroaches everywhere", "termites in the wall", "rats in the roof", "white ants eating the door frame", "bed bugs in the mattresses"],
        ["mice in the kitchen cupboards", "lots of roaches in the kitchen and bedrooms"]),
    "screens_dust": (
        ["fly screens ripped", "insect screens missing on windows", "gap under the door lets dust in", "screen torn on the back window"],
        ["mozzies coming in, screens have holes", "dust coming in everywhere through the gaps"]),
    "general": (
        ["need painting inside", "gate broken", "cupboard door handle broken", "fence falling down", "curtain rail fell off"],
        ["tiles loose in the bathroom", "hinge broken on the wardrobe"]),
}

MODIFIER_PHRASES = {
    "vulnerable": ["we have a new baby", "my nana lives here", "old lady in a wheelchair", "kids are sick", "my husband is on dialysis",
                   "grandkids staying with us", "pregnant daughter here"],
    "crowded": ["12 people living here", "big family in this house", "lots of people staying", "9 of us living here"],
    "repeat": ["rang last week and nobody came", "reported this already", "still not fixed", "this is the third time", "reported it months ago"],
}
FILLER = ["please help", "pls fix asap", "", "", "", "thanks", "can someone come", "been like this for a week", "since last weekend",
          "urgent", "when can you come"]

# Job mix: Grealy et al. 2022, Table 3 (APY Lands 2017-2020) by trade, excluding the "travel" row.
# APY's "General" row (7,004) is handyperson and carpentry work; we split it between carpenter and general
# and add Building, Painting and Waste to carpenter (ASSUMPTION).
TRADE_MIX = {"plumber": 11364, "electrician": 5930, "aircon": 4720, "pest": 3143,
             "carpenter": 4000 + 575 + 127 + 690, "general": 3004}


def _typo(s: str, rng: np.random.Generator, rate: float) -> str:
    out = list(s)
    for i in range(len(out) - 1):
        if out[i].isalpha() and out[i + 1].isalpha() and rng.random() < rate:
            out[i], out[i + 1] = out[i + 1], out[i]
    return "".join(out)


def make_report(hazard: str, rng: np.random.Generator, split: str = "train", vulnerable=False, crowded=False, repeat=False,
                second: str | None = None, typo_rate: float = 0.02) -> str:
    train, held = PHRASES[hazard]
    pool = train if split == "train" else held
    parts = [pool[rng.integers(len(pool))]]
    if second:
        t2, h2 = PHRASES[second]
        p2 = t2 if split == "train" else h2
        parts.append("also " + p2[rng.integers(len(p2))])
    if vulnerable:
        parts.append(MODIFIER_PHRASES["vulnerable"][rng.integers(7)])
    if crowded:
        parts.append(MODIFIER_PHRASES["crowded"][rng.integers(4)])
    if repeat:
        parts.append(MODIFIER_PHRASES["repeat"][rng.integers(5)])
    f = FILLER[rng.integers(len(FILLER))]
    if f:
        parts.append(f)
    order = rng.permutation(len(parts) - 1) + 1
    parts = [parts[0]] + [parts[i] for i in order]
    sep = rng.choice([", ", ". ", " ", " - "])
    text = sep.join(parts)
    if rng.random() < 0.5:
        text = text.lower()
    elif rng.random() < 0.2:
        text = text.upper()
    return _typo(text, rng, typo_rate)


def labelled_corpus(n_per_hazard: int, split: str, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    hz = list(PHRASES)
    for h in hz:
        for _ in range(n_per_hazard):
            v, c, r = rng.random() < 0.25, rng.random() < 0.15, rng.random() < 0.15
            sec = hz[rng.integers(len(hz))] if rng.random() < 0.15 else None
            if sec == h:
                sec = None
            rows.append(dict(text=make_report(h, rng, split, v, c, r, sec), hazard=h, second=sec or "", vulnerable=v, crowded=c, repeat=r))
    return pd.DataFrame(rows)


def hazard_weights() -> dict[str, float]:
    """Arrival weight per hazard: trade share from APY Table 3 split evenly over that trade's hazards,
    then nudged so dangerous faults are rarer than routine ones (ASSUMPTION)."""
    from .config import taxonomy
    H = taxonomy()["hazards"]
    by_trade: dict[str, list[str]] = {}
    for k, v in H.items():
        by_trade.setdefault(v["trade"], []).append(k)
    tot = sum(TRADE_MIX.values())
    w = {}
    for t, ks in by_trade.items():
        share = TRADE_MIX.get(t, 500) / tot
        for k in ks:
            rarity = {"immediate": 0.35, "urgent": 1.0, "routine": 1.4}[H[k]["category"]]
            w[k] = share / len(ks) * rarity
    s = sum(w.values())
    return {k: v / s for k, v in w.items()}


WET_HEAVY = {"roof_leak", "aircon_fan", "pests", "no_power", "electrical_danger", "sewage_overflow"}


def request_stream(communities: pd.DataFrame, seed: int | None = None) -> pd.DataFrame:
    """One year of synthetic requests for every hub town and remote community (Poisson arrivals by house count)."""
    P = params()
    D = P["demand"]
    rng = np.random.default_rng(P["seed"] if seed is None else seed)
    w = hazard_weights()
    hz, pw = list(w), np.array(list(w.values()))
    sites = [dict(site=f"TOWN-{h}", hub=h, houses=v["town_houses"], town=True) for h, v in P["hubs"].items()]
    sites += [dict(site=r.cid, hub=r.hub, houses=int(r.houses_est), town=False) for r in communities.itertuples()]
    rows = []
    jid = 0
    for wk in range(D["weeks"]):
        month = (D["start_month"] - 1 + (wk * 7) // 30) % 12 + 1
        wet = month in (11, 12, 1, 2, 3, 4)
        for s in sites:
            lam = s["houses"] * D["reports_per_house_year"] / 52 * (D["wet_season_uplift"] if wet else 1.0)
            for _ in range(rng.poisson(lam)):
                p = pw.copy()
                if wet:
                    p = np.where(np.isin(hz, list(WET_HEAVY)), p * 1.6, p)
                p = p / p.sum()
                h = hz[rng.choice(len(hz), p=p)]
                v, c, r = rng.random() < 0.3, rng.random() < (0.1 if s["town"] else 0.35), rng.random() < 0.12
                text = make_report(h, rng, "heldout" if rng.random() < 0.3 else "train", v, c, r)
                rows.append(dict(job_id=f"J{jid:05d}", week=wk, day=wk * 7 + int(rng.integers(0, 5)), month=month, site=s["site"],
                                 hub=s["hub"], town=s["town"], house=f"{s['site']}-H{int(rng.integers(1, max(2, s['houses'] + 1))):03d}",
                                 true_hazard=h, text=text, synthetic=True))
                jid += 1
    return pd.DataFrame(rows)
