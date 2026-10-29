#!/usr/bin/env python3
"""Deterministic first pass of skill-eval grading.

Scans a review.md for `path/to/file.ts:LINE` (also `:A-B`, `:A,B,C`) references and
matches them against an expected-findings.json answer key:

  * an expected finding is a CANDIDATE HIT when the review cites its `file` with a
    line inside `lines` widened by `line_tolerance`;
  * a `must_not_flag` file that is cited at all is a CANDIDATE FALSE POSITIVE.

Candidates still need a semantic check (does the cited text describe the same
problem / actually claim a violation?) — that is the grader model's job. This
script only narrows it down and prints JSON.

Usage: match_findings.py <expected-findings.json> <review.md>
"""
import json
import re
import sys
from pathlib import Path

REF = re.compile(r"([A-Za-z0-9_./\-]+\.ts)\s*:\s*(\d+(?:\s*[-–,]\s*\d+)*)")


def norm(path: str, roots: list[str]) -> str:
    path = path.lstrip("./")
    if "fixtures/" in path:
        path = path.split("fixtures/", 1)[1]
    for root in roots:
        if path.endswith(root):
            return root
    return path


def parse_lines(spec: str) -> list[int]:
    out: list[int] = []
    for part in re.split(r"\s*,\s*", spec):
        if re.search(r"[-–]", part):
            a, b = (int(x) for x in re.split(r"\s*[-–]\s*", part)[:2])
            out.extend(range(min(a, b), max(a, b) + 1))
        elif part.strip():
            out.append(int(part))
    return out


def main(key_path: str, review_path: str) -> None:
    key = json.loads(Path(key_path).read_text())
    tol = key.get("line_tolerance", 3)
    known = [f["file"] for f in key["findings"]] + [m["file"] for m in key["must_not_flag"]]

    refs: dict[str, set[int]] = {}
    for m in REF.finditer(Path(review_path).read_text()):
        refs.setdefault(norm(m.group(1), known), set()).update(parse_lines(m.group(2)))

    findings = []
    for f in key["findings"]:
        cited = sorted(n for n in refs.get(f["file"], ()) if any(abs(n - a) <= tol for a in f["anchors"]))
        findings.append({"id": f["id"], "required": f["required"], "candidate_hit": bool(cited), "cited_lines": cited})

    fps = [{"file": m["file"], "cited_lines": sorted(refs[m["file"]])} for m in key["must_not_flag"] if m["file"] in refs]
    req = [f for f in findings if f["required"]]
    print(json.dumps({
        "candidate_recall": round(sum(f["candidate_hit"] for f in req) / len(req), 2),
        "findings": findings,
        "must_not_flag_cited": fps,
    }, indent=2))


if __name__ == "__main__":
    main(*sys.argv[1:3])
