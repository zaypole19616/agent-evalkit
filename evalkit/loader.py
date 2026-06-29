"""Filesystem → dataclass loaders. The only module that reads benchmark
definitions from disk. Errors raise ``LoaderError`` with a path/line."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from .models import (
    BenchmarkFixture,
    BenchmarkManifest,
    GuardConfig,
    HardAssertionConfig,
    JudgeConfig,
    RuntimeConfig,
    ScoringConfig,
)


class LoaderError(ValueError):
    pass


_REQUIRED = {"name", "description", "version", "owner", "fixtures_file"}


def _section(data: dict[str, Any], key: str, cls: type) -> Any:
    raw = data.get(key, {}) or {}
    if not isinstance(raw, dict):
        raise LoaderError(f"section '{key}' must be a mapping, got {type(raw).__name__}")
    fields = set(cls.__dataclass_fields__)  # type: ignore[attr-defined]
    return cls(**{k: v for k, v in raw.items() if k in fields})


def load_manifest(path: Path) -> BenchmarkManifest:
    if not path.exists():
        raise LoaderError(f"manifest not found: {path}")
    data = yaml.safe_load(path.read_text()) or {}
    missing = _REQUIRED - data.keys()
    if missing:
        raise LoaderError(f"{path}: missing required fields {sorted(missing)}")

    judge_raw = (data.get("judge") or {}).copy()
    if isinstance(judge_raw.get("scale"), list):
        judge_raw["scale"] = tuple(judge_raw["scale"])

    return BenchmarkManifest(
        name=data["name"],
        description=data["description"],
        version=int(data["version"]),
        owner=data["owner"],
        fixtures_file=data["fixtures_file"],
        runtime=_section(data, "runtime", RuntimeConfig),
        scoring=_section(data, "scoring", ScoringConfig),
        assertions=_section(data, "assertions", HardAssertionConfig),
        judge=_section({**data, "judge": judge_raw}, "judge", JudgeConfig),
        guard=_section(data, "guard", GuardConfig),
        tags=list(data.get("tags") or []),
    )


def load_fixtures(path: Path) -> list[BenchmarkFixture]:
    if not path.exists():
        raise LoaderError(f"fixtures file not found: {path}")
    out: list[BenchmarkFixture] = []
    seen: set[str] = set()
    for lineno, raw in enumerate(path.read_text().splitlines(), start=1):
        raw = raw.strip()
        if not raw:
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError as e:
            raise LoaderError(f"{path}: line {lineno}: {e}") from e
        fid = obj.get("id")
        if not fid:
            raise LoaderError(f"{path}: line {lineno}: missing 'id'")
        if fid in seen:
            raise LoaderError(f"{path}: duplicate fixture id '{fid}' at line {lineno}")
        seen.add(fid)
        out.append(
            BenchmarkFixture(
                id=fid,
                prompt=obj.get("prompt", ""),
                files=list(obj.get("files") or []),
                expected_answer_intent=obj.get("expected_answer_intent", ""),
                tags=list(obj.get("tags") or []),
                model=obj.get("model"),
            )
        )
    return out


def discover_tasks(benchmarks_dir: Path, only: list[str] | None = None) -> list[Path]:
    """Return manifest.yaml paths for each task dir under ``benchmarks_dir``
    (optionally filtered to ``only``)."""
    if not benchmarks_dir.exists():
        return []
    out = []
    for d in sorted(p for p in benchmarks_dir.iterdir() if p.is_dir()):
        if only and d.name not in only:
            continue
        m = d / "manifest.yaml"
        if m.exists():
            out.append(m)
    return out
