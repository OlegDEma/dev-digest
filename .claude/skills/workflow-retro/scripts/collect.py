#!/usr/bin/env python3
"""Collect hard facts about a Claude Code session and its subagents.

Reads the session transcript `~/.claude/projects/<slug>/<session>.jsonl` and
`<session>/subagents/agent-*.{jsonl,meta.json}`, and prints a markdown report:
token totals, per-agent usage, launch order/timeline, tool mix, tool errors,
duplicated file reads and resumes. Stdlib only; read-only.

Usage:
  collect.py [--session ID] [--project-dir DIR] [--since ISO] [--until ISO] [--json]

Default session = the most recently modified *.jsonl in the project dir, which
is the running session when invoked from inside it.
"""
import argparse
import glob
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime

GAP_SECONDS = 90  # idle gap that splits an agent's activity into separate segments


def repo_root():
    try:
        import subprocess
        return subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True,
                              check=True).stdout.strip() or os.getcwd()
    except Exception:
        return os.getcwd()


def project_dir_for(cwd):
    return os.path.expanduser("~/.claude/projects/" + cwd.replace("/", "-").replace(".", "-"))


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def fmt_dur(sec):
    sec = int(sec)
    return f"{sec // 60}m{sec % 60:02d}s" if sec >= 60 else f"{sec}s"


def fmt_tok(n):
    return f"{n / 1_000_000:.2f}M" if n >= 1_000_000 else f"{n / 1000:.1f}k" if n >= 1000 else str(n)


def read_jsonl(path):
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if line:
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue


ERROR_KINDS = [  # (kind, lowercase substrings) — first match wins
    ("permission_denied", ["permission", "denied", "doesn't want to proceed", "rejected by the user"]),
    ("edit_anchor_miss", ["string to replace not found", "file has not been read", "modified since read"]),
    ("bad_search_input", ["error parsing glob", "regex parse error", "rejected the pattern"]),
    ("missing_path", ["does not exist", "no such file", "enoent"]),
    ("timeout", ["timed out", "timeout"]),
    ("command_failed", ["exit code", "command failed"]),
]


def error_kind(text):
    low = text.lower()
    for kind, needles in ERROR_KINDS:
        if any(n in low for n in needles):
            return kind
    return "other"


def summarize(path, since=None, until=None):
    """Aggregate one transcript file (main or subagent)."""
    usage_by_msg = {}
    msg_time = {}
    tools = Counter()
    reads = Counter()
    writes = Counter()
    models = Counter()
    api_errors = 0
    errors = []
    spawns, resumes, skills = [], [], []
    user_prompts = 0
    stamps = []
    for d in read_jsonl(path):
        t = ts(d.get("timestamp"))
        if since and t and t < since:
            continue
        if until and t and t > until:
            continue
        if t:
            stamps.append(t)
        m = d.get("message") or {}
        content = m.get("content")
        if d.get("type") == "assistant":
            if m.get("id") and m.get("usage"):
                if m["id"] not in usage_by_msg and m.get("model"):
                    models[m["model"]] += 1
                usage_by_msg[m["id"]] = m["usage"]  # streamed blocks repeat usage; keep one per message
                msg_time.setdefault(m["id"], t)
            if d.get("isApiErrorMessage") or m.get("stop_reason") == "error":
                api_errors += 1
            for c in content or []:
                if c.get("type") != "tool_use":
                    continue
                name, inp = c.get("name", "?"), c.get("input") or {}
                tools[name] += 1
                if name == "Read" and inp.get("file_path"):
                    reads[inp["file_path"]] += 1
                elif name in ("Edit", "Write", "NotebookEdit") and (inp.get("file_path") or inp.get("notebook_path")):
                    writes[inp.get("file_path") or inp.get("notebook_path")] += 1
                elif name == "Agent":
                    spawns.append({"t": t, "id": c.get("id"), "type": inp.get("subagent_type", "general-purpose"),
                                   "desc": inp.get("description", ""), "bg": inp.get("run_in_background", True),
                                   "prompt_chars": len(inp.get("prompt", ""))})
                elif name == "SendMessage":
                    resumes.append({"t": t, "to": inp.get("to"), "summary": inp.get("summary", ""),
                                    "chars": len(str(inp.get("message", "")))})
                elif name == "Skill":
                    skills.append(inp.get("skill"))
        elif d.get("type") == "user":
            if isinstance(content, str):
                if not d.get("isMeta"):
                    user_prompts += 1
            elif isinstance(content, list):
                has_result = False
                for c in content:
                    if c.get("type") == "tool_result":
                        has_result = True
                        if c.get("is_error"):
                            body = c.get("content")
                            if isinstance(body, list):
                                body = " ".join(x.get("text", "") for x in body if isinstance(x, dict))
                            errors.append(str(body)[:160].replace("\n", " "))
                if not has_result and not d.get("isMeta") and not d.get("isSidechain"):
                    user_prompts += 1
    tok = Counter()
    for u in usage_by_msg.values():
        tok["input"] += u.get("input_tokens", 0) or 0
        tok["cache_write"] += u.get("cache_creation_input_tokens", 0) or 0
        tok["cache_read"] += u.get("cache_read_input_tokens", 0) or 0
        tok["output"] += u.get("output_tokens", 0) or 0
    tok["turns"] = len(usage_by_msg)
    # active segments: split on idle gaps
    stamps.sort()
    segments, active = [], 0.0
    if stamps:
        start = prev = stamps[0]
        for s in stamps[1:]:
            if (s - prev).total_seconds() > GAP_SECONDS:
                segments.append((start, prev))
                start = s
            prev = s
        segments.append((start, prev))
        active = sum((b - a).total_seconds() for a, b in segments)
    seg_tok = []
    for a0, b0 in segments:
        ids = [i for i, t in msg_time.items() if t and a0 <= t <= b0]
        u = [usage_by_msg[i] for i in ids]
        seg_tok.append({"start": a0, "turns": len(ids),
                        "prompt": sum((x.get("input_tokens") or 0) + (x.get("cache_creation_input_tokens") or 0)
                                      + (x.get("cache_read_input_tokens") or 0) for x in u),
                        "output": sum(x.get("output_tokens") or 0 for x in u),
                        "max_ctx": max(((x.get("input_tokens") or 0) + (x.get("cache_creation_input_tokens") or 0)
                                        + (x.get("cache_read_input_tokens") or 0) for x in u), default=0)})
    return {"tok": tok, "tools": tools, "reads": reads, "writes": writes, "models": models,
            "api_errors": api_errors, "errors": errors, "spawns": spawns,
            "resumes": resumes, "skills": skills, "user_prompts": user_prompts,
            "first": stamps[0] if stamps else None, "last": stamps[-1] if stamps else None,
            "segments": segments, "seg_tok": seg_tok, "active": active}


def total_in(tok):
    return tok["input"] + tok["cache_write"] + tok["cache_read"]


def cost_usd(tok_by_model, prices):
    """tok_by_model: {model: Counter}; prices: {model: {input, cache_write, cache_read, output}} per 1M tokens.
    Returns (usd, unpriced_models)."""
    usd, missing = 0.0, set()
    for model, tok in tok_by_model.items():
        pr = prices.get(model)
        if not pr:
            missing.add(model)
            continue
        usd += sum(tok[k] * pr.get(k, 0) for k in ("input", "cache_write", "cache_read", "output")) / 1_000_000
    return usd, missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session")
    ap.add_argument("--project-dir", default=project_dir_for(repo_root()))
    ap.add_argument("--since", help="ISO timestamp; ignore earlier entries (scope one workflow inside a long session)")
    ap.add_argument("--until", help="ISO timestamp; ignore later entries")
    ap.add_argument("--prices", help="JSON file: {model: {input, cache_write, cache_read, output}} in USD per 1M "
                    "tokens. Without it no $ figures are printed (get current prices via the claude-api skill).")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    pdir = a.project_dir
    if a.session:
        main_path = os.path.join(pdir, a.session + ".jsonl")
    else:
        cands = glob.glob(os.path.join(pdir, "*.jsonl"))
        if not cands:
            sys.exit(f"no transcripts in {pdir}")
        main_path = max(cands, key=os.path.getmtime)
    if not os.path.exists(main_path):
        sys.exit(f"transcript not found: {main_path}")
    sid = os.path.basename(main_path)[:-6]
    since = ts(a.since) if a.since else None
    until = ts(a.until) if a.until else None

    main_s = summarize(main_path, since, until)
    agents = []
    for meta_path in sorted(glob.glob(os.path.join(pdir, sid, "subagents", "agent-*.meta.json"))):
        aid = os.path.basename(meta_path)[len("agent-"):-len(".meta.json")]
        jl = meta_path.replace(".meta.json", ".jsonl")
        meta = json.load(open(meta_path))
        if not os.path.exists(jl):
            continue
        s = summarize(jl, since, until)
        if not s["first"]:
            continue
        agents.append({"id": aid, "type": meta.get("agentType", "?"), "desc": meta.get("description", ""),
                       "tool_use_id": meta.get("toolUseId"), "depth": meta.get("spawnDepth"), **s})
    agents.sort(key=lambda x: x["first"])

    resumes_by_agent = Counter(r["to"] for r in main_s["resumes"])
    for ag in agents:
        ag["resumes"] = resumes_by_agent.get(ag["id"], 0)

    grand = Counter(main_s["tok"])
    for ag in agents:
        grand.update(ag["tok"])
    for s_ in [main_s] + agents:
        s_["model"] = s_["models"].most_common(1)[0][0] if s_["models"] else "?"
    prices = json.load(open(a.prices)) if a.prices else None
    if prices:
        for s_ in [main_s] + agents:
            s_["usd"], s_["unpriced"] = cost_usd({s_["model"]: s_["tok"]}, prices)
    wall = 0.0

    # duplicated reads across agents (incl. main)
    readers = defaultdict(dict)
    for name, s in [("main", main_s)] + [(f'{ag["type"]}#{ag["id"][:6]}', ag) for ag in agents]:
        for f, n in s["reads"].items():
            readers[f][name] = n
    dup_cross = {f: r for f, r in readers.items() if len(r) > 1}
    dup_self = [(f, who, n) for f, r in readers.items() for who, n in r.items() if n > 2]

    # max concurrency over active segments
    events = []
    for ag in agents:
        for a0, b0 in ag["segments"]:
            events += [(a0, 1), (b0, -1)]
    events.sort(key=lambda e: (e[0], e[1]))
    cur = peak = 0
    for _, dlt in events:
        cur += dlt
        peak = max(peak, cur)

    t0 = main_s["first"] or (agents[0]["first"] if agents else None)
    t1 = max([main_s["last"]] + [ag["last"] for ag in agents if ag["last"]]) if t0 else None
    wall = (t1 - t0).total_seconds() if t0 and t1 else 0.0
    busy = main_s["active"] + sum(ag["active"] for ag in agents)
    par_factor = busy / wall if wall else 0.0
    bottleneck = max(agents, key=lambda x: x["active"]) if agents else None
    total_tools = sum(main_s["tools"].values()) + sum(sum(ag["tools"].values()) for ag in agents)
    err_kinds = Counter()
    for s_ in [main_s] + agents:
        for e in s_["errors"]:
            err_kinds[error_kind(e)] += 1
        if s_["api_errors"]:
            err_kinds["api_error"] += s_["api_errors"]

    if a.json:
        out = {"session": sid, "start": str(t0), "end": str(t1), "grand_tokens": dict(grand),
               "main": {k: (dict(v) if isinstance(v, Counter) else v) for k, v in main_s.items()
                        if k in ("tok", "tools", "user_prompts", "skills", "errors")},
               "agents": [{k: (dict(v) if isinstance(v, Counter) else v) for k, v in ag.items()
                           if k in ("id", "type", "desc", "tok", "tools", "errors", "resumes", "active", "depth",
                                    "model", "usd")}
                          | {"writes": dict(ag["writes"])}
                          | {"first": str(ag["first"]), "last": str(ag["last"])} for ag in agents],
               "dup_reads_cross": dup_cross, "peak_concurrency": peak, "parallelism_factor": round(par_factor, 2),
               "bottleneck": bottleneck and bottleneck["id"], "total_tool_calls": total_tools,
               "error_kinds": dict(err_kinds),
               "usd": (sum(x.get("usd", 0) for x in [main_s] + agents) if prices else None)}
        print(json.dumps(out, indent=2, default=str))
        return

    rel = lambda t: fmt_dur((t - t0).total_seconds()) if t and t0 else "?"
    p = print
    p(f"# Workflow facts — session `{sid}`\n")
    p(f"- Window: {t0:%Y-%m-%d %H:%M} → {t1:%H:%M} UTC ({fmt_dur((t1 - t0).total_seconds())} wall clock)" if t0 else "- Window: ?")
    p(f"- Agents active in window: {len(agents)} (spawned by main: {len(main_s['spawns'])}) (peak concurrently active: {peak}); resumes via SendMessage: {len(main_s['resumes'])}")
    p(f"- Owner turns (user prompts): {main_s['user_prompts']}; skills invoked by main: {', '.join(main_s['skills']) or '—'}")
    p(f"- **Tokens, all agents + main:** input {fmt_tok(grand['input'])} · cache write {fmt_tok(grand['cache_write'])} · "
      f"cache read {fmt_tok(grand['cache_read'])} · output {fmt_tok(grand['output'])} · API turns {grand['turns']}")
    p(f"  - total prompt-side tokens: {fmt_tok(total_in(grand))}; cache-read share: "
      f"{(grand['cache_read'] / total_in(grand) * 100 if total_in(grand) else 0):.0f}% (cache efficiency; low ⇒ context churn)")
    p(f"- Tool calls: {total_tools} total · parallelism factor {par_factor:.2f} "
      f"(sum of active time ÷ wall clock; <1 ⇒ idle time, e.g. waiting on the owner; >1 ⇒ agents really ran in parallel)")
    if bottleneck:
        p(f"- Bottleneck: {bottleneck['type']} `{bottleneck['id'][:8]}` — {fmt_dur(bottleneck['active'])} active "
          f"({bottleneck['active'] / wall * 100 if wall else 0:.0f}% of wall clock)")
    if prices:
        usd = sum(x.get("usd", 0) for x in [main_s] + agents)
        unpriced = set().union(*[x.get("unpriced", set()) for x in [main_s] + agents])
        p(f"- **Cost:** ${usd:.2f}" + (f" (unpriced models: {', '.join(sorted(unpriced))})" if unpriced else ""))
    else:
        p("- Cost: not computed (no `--prices`)")
    p("")

    p("## Per agent (launch order)\n")
    usd_col = (lambda x: f" ${x.get('usd', 0):.2f} |") if prices else (lambda x: "")
    p("| # | Agent | Model | Description | Start | Active | Turns | Prompt-side tok | Output tok | Tools | Errors | Resumes |"
      + (" Cost |" if prices else ""))
    p("|---|---|---|---|---|---|---|---|---|---|---|---|" + ("---|" if prices else ""))
    p(f"| 0 | main | {main_s['model']} | orchestrator | 0s | {fmt_dur(main_s['active'])} | {main_s['tok']['turns']} | "
      f"{fmt_tok(total_in(main_s['tok']))} | {fmt_tok(main_s['tok']['output'])} | {sum(main_s['tools'].values())} | "
      f"{len(main_s['errors'])} | — |" + usd_col(main_s))
    for i, ag in enumerate(agents, 1):
        p(f"| {i} | {ag['type']} `{ag['id'][:8]}` | {ag['model']} | {ag['desc']} | {rel(ag['first'])} | "
          f"{fmt_dur(ag['active'])} | {ag['tok']['turns']} | {fmt_tok(total_in(ag['tok']))} | "
          f"{fmt_tok(ag['tok']['output'])} | {sum(ag['tools'].values())} | {len(ag['errors'])} | {ag['resumes']} |"
          + usd_col(ag))

    p("\n## Timeline\n")
    ev = [(s["t"], f"main → spawn **{s['type']}** ({s['desc']}){' [bg]' if s['bg'] else ''}, prompt {s['prompt_chars']} chars")
          for s in main_s["spawns"]]
    ev += [(r["t"], f"main → resume `{(r['to'] or '')[:8]}` ({r['summary']}), {r['chars']} chars") for r in main_s["resumes"]]
    for ag in agents:
        for a0, b0 in ag["segments"]:
            ev.append((b0, f"{ag['type']} `{ag['id'][:8]}` segment ends ({fmt_dur((b0 - a0).total_seconds())} active)"))
    for t, txt in sorted((e for e in ev if e[0]), key=lambda e: e[0]):
        p(f"- +{rel(t)} — {txt}")

    p("\n## Rounds per agent (context growth)\n")
    p("Each active segment ≈ one round (initial run or a resume). `max ctx` = largest single prompt in the round.\n")
    p("| Agent | Round | Start | Turns | Prompt-side tok | Output tok | Max ctx |")
    p("|---|---|---|---|---|---|---|")
    for ag in agents:
        for i, st in enumerate(ag["seg_tok"], 1):
            p(f"| {ag['type']} `{ag['id'][:8]}` | {i} | +{rel(st['start'])} | {st['turns']} | {fmt_tok(st['prompt'])} | "
              f"{fmt_tok(st['output'])} | {fmt_tok(st['max_ctx'])} |")

    p("\n## Tool mix per agent\n")
    for name, s in [("main", main_s)] + [(f"{ag['type']} `{ag['id'][:8]}`", ag) for ag in agents]:
        p(f"- {name}: " + ", ".join(f"{k}×{v}" for k, v in s["tools"].most_common()))

    p("\n## Duplicated reads\n")
    if dup_cross:
        p("Files read by more than one agent (candidates for passing findings instead of re-reading):\n")
        for f, r in sorted(dup_cross.items(), key=lambda kv: -len(kv[1]))[:25]:
            p(f"- `{f.replace(repo_root() + '/', '')}` — " + ", ".join(f"{k}×{v}" for k, v in r.items()))
    else:
        p("- none across agents")
    if dup_self:
        p("\nSame agent read a file 3+ times:\n")
        for f, who, n in dup_self[:15]:
            p(f"- {who}: `{f.replace(repo_root() + '/', '')}` ×{n}")

    p("\n## Files written per agent (delegation / scope check)\n")
    any_w = False
    for name, s_ in [("main", main_s)] + [(f"{ag['type']} `{ag['id'][:8]}`", ag) for ag in agents]:
        if s_["writes"]:
            any_w = True
            p(f"- {name}: " + ", ".join(f"`{f.replace(repo_root() + '/', '')}`×{n}" for f, n in s_["writes"].most_common()))
    if not any_w:
        p("- none")

    p("\n## Failure taxonomy\n")
    p("- " + (", ".join(f"{k}×{v}" for k, v in err_kinds.most_common()) or "no errors"))

    p("\n## Tool errors\n")
    any_err = False
    for name, s in [("main", main_s)] + [(f"{ag['type']} `{ag['id'][:8]}`", ag) for ag in agents]:
        for e in s["errors"][:8]:
            any_err = True
            p(f"- {name}: {e}")
    if not any_err:
        p("- none")


if __name__ == "__main__":
    main()
