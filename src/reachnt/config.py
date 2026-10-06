"""Paths and parameter loading. Every number lives in config/params.yaml or config/taxonomy.yaml."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "config"
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
OUTPUTS = ROOT / "outputs"
WEB_DATA = ROOT / "web" / "data"


@lru_cache(maxsize=None)
def params() -> dict:
    return yaml.safe_load((CONFIG / "params.yaml").read_text())


@lru_cache(maxsize=None)
def taxonomy() -> dict:
    return yaml.safe_load((CONFIG / "taxonomy.yaml").read_text())
