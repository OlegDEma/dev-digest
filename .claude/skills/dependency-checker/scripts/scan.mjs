#!/usr/bin/env node
// dependency-checker scanner — zero dependencies, read-only, offline by default.
//
//   node .claude/skills/dependency-checker/scripts/scan.mjs [--root <dir>] [--out <dir>] [--online] [--top <n>]
//
// Writes <out>/deps-data.json (machine data) and <out>/deps-report.md (sections 1-5 of the report).
// Sections 4b (tiers) and 5 (summary) are written by the agent — see SKILL.md.
// --online additionally runs `npm|pnpm audit` and `npm outdated` per package (needs network).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ROOT = path.resolve(opt('--root', process.cwd()));
const OUT = path.resolve(opt('--out', path.join(ROOT, '.devdigest', 'cache', 'deps-report')));
const ONLINE = flag('--online');
const TOP = Number(opt('--top', 12));

const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage', 'clones', '.git', '.turbo', 'out', 'build', '.claude', '.devdigest']);
const SRC_EXT = /\.(?:[cm]?[jt]sx?)$/;
const TEST_RE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:__tests__|tests?|e2e|evals?|fixtures|scripts)\/|(?:^|\/)(?:vitest|jest|playwright|vite|eslint|tailwind|postcss|next|drizzle|tsup)\.config\.[cm]?[jt]s$)/;

// ---------- helpers ----------
const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const readJsonc = (f) => {
  try {
    const raw = fs.readFileSync(f, 'utf8')
      .replace(/("(?:\\.|[^"\\])*")|\/\/.*$|\/\*[\s\S]*?\*\//gm, (m, s) => s ?? '')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const kb = (b) => Math.round(b / 1024);
const fmt = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B');
const sh = (cmd, args, cwd) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90_000, maxBuffer: 64 << 20 });
  } catch (e) {
    return e.stdout || null; // npm audit/outdated exit non-zero when they find something
  }
};

function walk(dir, visit, rel = '') {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of ents) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      walk(path.join(dir, e.name), visit, rel ? `${rel}/${e.name}` : e.name);
    } else if (e.isFile()) visit(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
  }
}

const sizeCache = new Map();
// Size of ONE package directory, excluding any nested node_modules (those are counted as their own packages).
function ownSize(dir) {
  if (sizeCache.has(dir)) return sizeCache.get(dir);
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') stack.push(p);
      } else if (e.isFile()) {
        try {
          total += fs.statSync(p).size;
        } catch {}
      }
    }
  }
  sizeCache.set(dir, total);
  return total;
}

function resolveFrom(fromDir, name) {
  let d = fromDir;
  for (;;) {
    const cand = path.join(d, 'node_modules', name);
    if (fs.existsSync(cand)) {
      try {
        return fs.realpathSync(cand);
      } catch {
        return cand;
      }
    }
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

// Transitive closure of runtime deps (dependencies + optional + peer that are installed) -> Map<realpath, {name, version, size}>
function closure(startDir) {
  const seen = new Map();
  const queue = [startDir];
  while (queue.length) {
    const dir = queue.pop();
    if (seen.has(dir)) continue;
    const pj = readJson(path.join(dir, 'package.json')) || {};
    seen.set(dir, { name: pj.name || path.basename(dir), version: pj.version || '?', size: ownSize(dir) });
    // peers are supplied by the consumer, so they are not part of this package's own weight
    for (const dep of Object.keys({ ...pj.dependencies, ...pj.optionalDependencies })) {
      const r = resolveFrom(dir, dep);
      if (r && !seen.has(r)) queue.push(r);
    }
  }
  return seen;
}

// ---------- discover packages ----------
const pkgDirs = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.') && fs.existsSync(path.join(ROOT, e.name, 'package.json')))
  .map((e) => e.name)
  .sort();
if (fs.existsSync(path.join(ROOT, 'package.json'))) pkgDirs.unshift('.');
if (!pkgDirs.length) {
  console.error('No package.json found one level below', ROOT);
  process.exit(1);
}

const aliasOwner = (absTarget) => {
  for (const d of pkgDirs) {
    const abs = path.join(ROOT, d);
    if (d !== '.' && (absTarget === abs || absTarget.startsWith(abs + path.sep))) return d;
  }
  return null;
};

const packages = [];
for (const dir of pkgDirs) {
  const abs = path.join(ROOT, dir);
  const pj = readJson(path.join(abs, 'package.json'));
  const manager = fs.existsSync(path.join(abs, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(abs, 'package-lock.json')) ? 'npm' : fs.existsSync(path.join(abs, 'yarn.lock')) ? 'yarn' : 'none';
  const installed = fs.existsSync(path.join(abs, 'node_modules'));

  // declared deps
  const declared = [];
  for (const [kind, key] of [['prod', 'dependencies'], ['dev', 'devDependencies'], ['optional', 'optionalDependencies'], ['peer', 'peerDependencies']]) {
    for (const [name, range] of Object.entries(pj[key] || {})) declared.push({ name, range, kind });
  }

  // aliases from tsconfig -> internal edges
  const ts = readJsonc(path.join(abs, 'tsconfig.json'));
  const aliases = [];
  for (const [k, v] of Object.entries(ts?.compilerOptions?.paths || {})) {
    const target = path.resolve(abs, ts.compilerOptions.baseUrl || '.', String(v[0]).replace(/\/\*$/, ''));
    aliases.push({ prefix: k.replace(/\/\*$/, ''), owner: aliasOwner(target), target: path.relative(ROOT, target) });
  }

  // import scan
  const used = new Map(); // dep -> {src:n, test:n}
  const internal = new Map(); // other package dir -> import count
  const relative = new Map(); // other package dir -> files importing it by relative path (bypasses the public entry)
  const importRe = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"\n]+)['"]/gm;
  let files = 0;
  const scriptsText = JSON.stringify(pj.scripts || {});
  // top-level config files (vitest.config.ts, postcss.config.mjs, .eslintrc…) reference plugins by string, not import
  let configText = '';
  for (const e of fs.readdirSync(abs, { withFileTypes: true }))
    if (e.isFile() && /(?:config|rc)(?:\.[\w]+)*$|\.(?:[cm]?[jt]s|json|ya?ml)$/.test(e.name) && !/lock|package\.json$/.test(e.name))
      try { configText += fs.readFileSync(path.join(abs, e.name), 'utf8') + '\n'; } catch {}
  walk(abs, (file, rel) => {
    if (!SRC_EXT.test(file)) return;
    files++;
    const isTest = TEST_RE.test(rel);
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return;
    }
    for (const m of text.matchAll(importRe)) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        const owner = aliasOwner(path.resolve(path.dirname(file), spec));
        if (owner && owner !== dir) relative.set(owner, [...(relative.get(owner) || []), rel]);
        continue;
      }
      if (spec.startsWith('node:') || spec.startsWith('/')) continue;
      const al = aliases.find((a) => spec === a.prefix || spec.startsWith(a.prefix + '/'));
      if (al) {
        if (al.owner && al.owner !== dir) internal.set(al.owner, (internal.get(al.owner) || 0) + 1);
        if (al.owner || al.prefix === '@') continue; // alias to local code
      }
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      const u = used.get(name) || { src: 0, test: 0 };
      u[isTest ? 'test' : 'src']++;
      used.set(name, u);
    }
  });

  // sizes
  const direct = new Map(); // name -> closure Map
  if (installed) {
    for (const d of declared) {
      if (d.kind === 'peer') continue;
      const r = resolveFrom(abs, d.name);
      if (r) direct.set(d.name, closure(r));
    }
  }
  // how many direct deps pull each package in (for "unique" size)
  const owners = new Map();
  for (const [name, cl] of direct) for (const p of cl.keys()) owners.set(p, (owners.get(p) || 0) + 1);

  // a dep another installed dep lists as a peer (e.g. react-dom for next) is needed even with no import
  const peerProvided = new Set();
  for (const d of declared) {
    const r = installed && resolveFrom(abs, d.name);
    for (const peer of Object.keys((r && readJson(path.join(r, 'package.json'))?.peerDependencies) || {})) peerProvided.add(peer);
  }

  const deps = declared.map((d) => {
    const cl = direct.get(d.name);
    const self = cl ? [...cl.entries()].find(([, v]) => v.name === d.name) : null;
    const u = used.get(d.name) || used.get(d.name.replace(/^@types\//, '').replace(/^(.+)__(.+)$/, '@$1/$2')) || { src: 0, test: 0 };
    const typesFor = d.name.startsWith('@types/') ? d.name.slice(7).replace('__', '/') : null;
    const typesUsed = typesFor && (used.get(typesFor) || used.get('@' + typesFor));
    const inScripts = new RegExp(`(?:^|[\\s"'/&|;])${d.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[\\s"'/&|;@]|$)`).test(scriptsText);
    const inConfig = new RegExp(`['"\`]${d.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:['"\`/])`).test(configText);
    const bin = (() => {
      const r = resolveFrom(abs, d.name);
      const b = r && readJson(path.join(r, 'package.json'))?.bin;
      const names = typeof b === 'string' ? [d.name.split('/').pop()] : Object.keys(b || {});
      return names.some((n) => new RegExp(`(?:^|[\\s"'&|;])${n}(?:[\\s"'&|;]|$)`).test(scriptsText));
    })();
    let unique = 0;
    if (cl) for (const [p, v] of cl) if (owners.get(p) === 1) unique += v.size;
    return {
      ...d,
      installed_version: self?.[1].version ?? null,
      own_bytes: self?.[1].size ?? null,
      closure_bytes: cl ? [...cl.values()].reduce((a, v) => a + v.size, 0) : null,
      closure_count: cl ? cl.size : null,
      unique_bytes: cl ? unique : null,
      imports_src: u.src,
      imports_test: u.test,
      used_by_tooling: Boolean(inScripts || bin || inConfig || typesUsed || typesFor === 'node' || peerProvided.has(d.name)),
    };
  });

  const nmBytes = installed
    ? (() => {
        const out = sh('du', ['-sk', path.join(abs, 'node_modules')]);
        return out ? Number(out.split('\t')[0]) * 1024 : null;
      })()
    : null;

  packages.push({
    dir,
    name: pj.name || dir,
    manager,
    installed,
    source_files: files,
    node_modules_bytes: nmBytes,
    counts: { prod: deps.filter((d) => d.kind === 'prod').length, dev: deps.filter((d) => d.kind === 'dev').length, other: deps.filter((d) => d.kind === 'optional' || d.kind === 'peer').length },
    deps,
    internal: [...internal].map(([to, imports]) => ({ to, imports })),
    relative: [...relative].map(([to, files]) => ({ to, files })),
    aliases,
  });
}

// ---------- findings (deterministic signals; the agent assigns final priority) ----------
const findings = [];
const add = (f) => findings.push(f);
const isRealRange = (r) => !/^(?:workspace:|file:|link:|git|https?:)/.test(r);

for (const p of packages) {
  for (const d of p.deps) {
    if (d.kind === 'peer') continue;
    const ref = `${p.dir}:${d.name}`;
    if (d.imports_src + d.imports_test === 0 && !d.used_by_tooling)
      add({ id: 'unused', pkg: p.dir, dep: d.name, kind: d.kind, bytes: d.unique_bytes ?? d.closure_bytes ?? 0, note: 'No import, script, or bin reference found (verify: dynamic requires, config strings, plugins).' });
    else if (d.kind === 'prod' && d.imports_src === 0 && d.imports_test > 0 && !d.name.startsWith('@types/'))
      add({ id: 'prod-only-in-tests', pkg: p.dir, dep: d.name, kind: d.kind, bytes: d.unique_bytes ?? 0, note: 'In dependencies but only imported from tests/config — move to devDependencies.' });
    else if (d.kind === 'dev' && d.imports_src > 0 && !/^@types\//.test(d.name) && p.dir !== 'e2e' && p.dir !== 'evals')
      add({ id: 'dev-used-in-src', pkg: p.dir, dep: d.name, kind: d.kind, bytes: d.closure_bytes ?? 0, note: 'In devDependencies but imported from non-test source — move to dependencies if shipped at runtime.' });
    if (d.kind === 'prod' && d.name.startsWith('@types/'))
      add({ id: 'types-in-prod', pkg: p.dir, dep: d.name, kind: d.kind, bytes: d.own_bytes ?? 0, note: '@types/* in dependencies — belongs in devDependencies.' });
    if (d.range === '*' || d.range === 'latest')
      add({ id: 'unpinned', pkg: p.dir, dep: d.name, kind: d.kind, bytes: 0, note: `Range "${d.range}" is unbounded.` });
    if (d.closure_bytes != null && d.closure_bytes > (d.kind === 'prod' ? 20 : 50) * 1048576)
      add({ id: 'heavy', pkg: p.dir, dep: d.name, kind: d.kind, bytes: d.closure_bytes, note: `Closure ${fmt(d.closure_bytes)} across ${d.closure_count} packages.` });
  }
}

// cross-package drift / duplication
const byName = new Map();
for (const p of packages) for (const d of p.deps) if (d.kind !== 'peer' && isRealRange(d.range)) (byName.get(d.name) || byName.set(d.name, []).get(d.name)).push({ pkg: p.dir, range: d.range, installed: d.installed_version, kind: d.kind });
const shared = [];
for (const [name, uses] of byName) {
  if (uses.length < 2) continue;
  const ranges = new Set(uses.map((u) => u.range));
  const majors = new Set(uses.map((u) => (u.installed || u.range).replace(/^[^\d]*/, '').split('.')[0]));
  shared.push({ name, uses, drift: ranges.size > 1, major_drift: majors.size > 1 });
  if (majors.size > 1) add({ id: 'major-drift', pkg: uses.map((u) => u.pkg).join(', '), dep: name, kind: 'mixed', bytes: 0, note: uses.map((u) => `${u.pkg}@${u.installed || u.range}`).join(' vs ') });
  else if (ranges.size > 1) add({ id: 'range-drift', pkg: uses.map((u) => u.pkg).join(', '), dep: name, kind: 'mixed', bytes: 0, note: uses.map((u) => `${u.pkg}:${u.range}`).join(' vs ') });
}
shared.sort((a, b) => b.uses.length - a.uses.length);

// relative imports that reach into another package's source
for (const p of packages)
  for (const r of p.relative)
    for (const f of r.files) add({ id: 'cross-package-relative', pkg: p.dir, dep: `${f} → ${r.to}`, kind: 'internal', bytes: 0, note: `Imports ${r.to}/ by relative path instead of a tsconfig alias / public entry point.` });

// package-level import cycles (A -> B -> A through tsconfig aliases)
for (const a of packages)
  for (const e of a.internal) {
    const b = packages.find((x) => x.dir === e.to);
    if (b && a.dir < b.dir && b.internal.some((x) => x.to === a.dir))
      add({ id: 'package-cycle', pkg: `${a.dir} ↔ ${b.dir}`, dep: `${a.dir} ↔ ${b.dir}`, kind: '-', bytes: 0, note: `${a.dir}→${b.dir} (${e.imports}) and ${b.dir}→${a.dir} (${b.internal.find((x) => x.to === a.dir).imports}); often a vendored dir (e.g. src/vendor/shared) living inside one package.` });
  }

// package manager mix
const managers = new Set(packages.map((p) => p.manager).filter((m) => m !== 'none'));
if (managers.size > 1) add({ id: 'mixed-managers', pkg: '*', dep: [...managers].join(' + '), kind: '-', bytes: 0, note: 'Packages use different package managers — expected here, but each must run its own.' });

// ---------- online (optional) ----------
if (ONLINE) {
  for (const p of packages) {
    const cwd = path.join(ROOT, p.dir);
    const outd = sh('npm', ['outdated', '--json'], cwd);
    try {
      const j = JSON.parse(outd || '{}');
      for (const [name, v] of Object.entries(j)) {
        const d = p.deps.find((x) => x.name === name);
        if (d) d.latest = v.latest;
        const lm = Number(String(v.latest).split('.')[0]);
        const cm = Number(String(v.current).split('.')[0]);
        if (Number.isFinite(lm) && Number.isFinite(cm) && lm > cm) add({ id: 'outdated-major', pkg: p.dir, dep: name, kind: d?.kind ?? '?', bytes: 0, note: `${v.current} → ${v.latest}` });
      }
    } catch {}
    const audit = p.manager === 'pnpm' ? sh('pnpm', ['audit', '--json'], cwd) : sh('npm', ['audit', '--json'], cwd);
    try {
      const j = JSON.parse(audit || '{}');
      const vulns = j.vulnerabilities
        ? Object.entries(j.vulnerabilities).map(([n, v]) => ({ name: n, severity: v.severity, direct: v.isDirect }))
        : Object.values(j.advisories || {}).map((a) => ({ name: a.module_name, severity: a.severity, direct: false }));
      p.vulns = vulns;
      for (const v of vulns) add({ id: 'vulnerable', pkg: p.dir, dep: v.name, kind: v.direct ? 'direct' : 'transitive', bytes: 0, note: `severity ${v.severity}` });
    } catch {}
  }
}

// ---------- write JSON ----------
fs.mkdirSync(OUT, { recursive: true });
const data = { generated: new Date().toISOString(), root: ROOT, online: ONLINE, packages, shared, findings };
fs.writeFileSync(path.join(OUT, 'deps-data.json'), JSON.stringify(data, null, 2));

// ---------- render markdown (sections 1-5) ----------
const L = [];
const id = (s) => s.replace(/[^\w]/g, '_');
const tier = (b) => (b == null ? '·' : b >= 20 * 1048576 ? '🔴' : b >= 5 * 1048576 ? '🟠' : b >= 1048576 ? '🟡' : '🟢');
const bar = (b, max) => '█'.repeat(max ? Math.max(b > 0 ? 1 : 0, Math.round((b / max) * 20)) : 0);
const notInstalled = packages.filter((p) => !p.installed);

L.push('# Dependency report', '');
L.push(`_Generated ${data.generated} · ${packages.length} packages · ${online()} · sizes = installed bytes on disk (not bundle size)_`, '');
function online() {
  return ONLINE ? 'online checks ON (audit + outdated)' : 'offline (no audit/outdated — rerun with --online)';
}
if (notInstalled.length) L.push(`> ⚠️ Not installed, sizes unavailable: ${notInstalled.map((p) => '`' + p.dir + '`').join(', ')}`, '');

// 1. inventory
L.push('## 1. Scope', '', '| Package | Manager | prod | dev | other | node_modules | Source files |', '|---|---|--:|--:|--:|--:|--:|');
for (const p of packages) L.push(`| \`${p.dir}\` | ${p.manager} | ${p.counts.prod} | ${p.counts.dev} | ${p.counts.other} | ${p.node_modules_bytes != null ? fmt(p.node_modules_bytes) : 'n/a'} | ${p.source_files} |`);
const tp = packages.reduce((a, p) => a + p.counts.prod, 0), td = packages.reduce((a, p) => a + p.counts.dev, 0), tn = packages.reduce((a, p) => a + (p.node_modules_bytes || 0), 0);
L.push(`| **total** | | **${tp}** | **${td}** | | **${fmt(tn)}** | |`, '');

// 2. graph
L.push('## 2. Dependency graph', '', '**Internal** (not a workspace — packages share code through tsconfig path aliases): solid arrow = alias import, dashed = relative import bypassing the public entry; number = imports/files. **External** npm deps per package are graphed in section 3.', '', '```mermaid', 'flowchart LR');
for (const p of packages) L.push(`  ${id(p.dir)}["${p.dir}<br/>${p.counts.prod} prod · ${p.counts.dev} dev<br/>${p.node_modules_bytes != null ? fmt(p.node_modules_bytes) : 'n/a'}"]`);
for (const p of packages) for (const e of p.internal) L.push(`  ${id(p.dir)} -->|${e.imports}| ${id(e.to)}`);
for (const p of packages) for (const e of p.relative) L.push(`  ${id(p.dir)} -.->|${e.files.length} relative| ${id(e.to)}`);
L.push('```', '');
const noEdges = packages.every((p) => !p.internal.length && !p.relative.length);
if (noEdges) L.push('_No cross-package alias imports detected._', '');

// 3. per-package
L.push('## 3. Size breakdown', '', '### 3a. Dependencies by package', '', `Top ${TOP} by installed size per package. **Own** = the package itself; **Closure** = it plus everything it pulls in; **Unique** = what you would actually reclaim by removing it (closure minus anything shared with other direct deps). Tier: 🔴 ≥20 MB · 🟠 ≥5 MB · 🟡 ≥1 MB · 🟢 <1 MB.`, '');
for (const p of packages) {
  L.push(`### \`${p.dir}\` (${p.manager})`, '');
  const ranked = p.deps.filter((d) => d.kind !== 'peer').sort((a, b) => (b.closure_bytes ?? -1) - (a.closure_bytes ?? -1));
  if (!p.installed) {
    L.push('_node_modules missing — run the package\'s own install, then re-scan._', '', '| Dependency | Kind | Range | Imports (src/test) |', '|---|---|---|--:|');
    for (const d of ranked.slice(0, TOP)) L.push(`| \`${d.name}\` | ${d.kind} | \`${d.range}\` | ${d.imports_src}/${d.imports_test} |`);
    L.push('');
    continue;
  }
  const max = ranked[0]?.closure_bytes || 0;
  L.push('| | Dependency | Kind | Version | Own | Closure | Unique | Pkgs | Imports src/test | |', '|---|---|---|---|--:|--:|--:|--:|--:|---|');
  for (const d of ranked.slice(0, TOP)) L.push(`| ${tier(d.closure_bytes)} | \`${d.name}\` | ${d.kind} | ${d.installed_version ?? d.range} | ${d.own_bytes != null ? fmt(d.own_bytes) : '·'} | ${d.closure_bytes != null ? fmt(d.closure_bytes) : '·'} | ${d.unique_bytes != null ? fmt(d.unique_bytes) : '·'} | ${d.closure_count ?? '·'} | ${d.imports_src}/${d.imports_test} | \`${bar(d.closure_bytes || 0, max)}\` |`);
  if (ranked.length > TOP) L.push(`| | _+${ranked.length - TOP} more, ${fmt(ranked.slice(TOP).reduce((a, d) => a + (d.unique_bytes || 0), 0))} unique_ | | | | | | | | |`);
  L.push('');
  const top = ranked.filter((d) => d.closure_bytes).slice(0, 8);
  if (top.length) {
    L.push('```mermaid', 'flowchart LR', `  ${id(p.dir)}(["${p.dir}"])`);
    for (const d of top) L.push(`  ${id(p.dir)} -->|${d.kind}| ${id(p.dir + d.name)}["${d.name}<br/>${fmt(d.closure_bytes)}"]`);
    L.push(`  classDef big fill:#fde2e1,stroke:#c0392b;`, `  classDef mid fill:#fff1d6,stroke:#d68910;`);
    for (const d of top) if (d.closure_bytes >= 5 * 1048576) L.push(`  class ${id(p.dir + d.name)} ${d.closure_bytes >= 20 * 1048576 ? 'big' : 'mid'};`);
    L.push('```', '');
  }
}

// 4. shared
L.push('### 3b. Shared across packages and version drift', '');
const sh2 = shared.filter((s) => s.uses.length >= 2);
if (!sh2.length) L.push('_No dependency is declared in more than one package._', '');
else {
  L.push('| Dependency | Used in | Ranges | Drift |', '|---|---|---|---|');
  for (const s of sh2.slice(0, 25)) L.push(`| \`${s.name}\` | ${s.uses.length} | ${s.uses.map((u) => `${u.pkg}:\`${u.range}\``).join(' · ')} | ${s.major_drift ? '🔴 major' : s.drift ? '🟡 range' : '✅'} |`);
  L.push('');
}

// 5. findings
L.push('## 4. Findings & Priorities', '', '### 4a. Raw signals', '', 'Deterministic detections, **not verdicts**. The agent verifies each, then writes 4b (P0/P1/P2/Info tiers) per `references/prioritization.md`.', '');
if (!findings.length) L.push('_None._', '');
else {
  const groups = {};
  for (const f of findings) (groups[f.id] ||= []).push(f);
  L.push('| Signal | Count | Examples |', '|---|--:|---|');
  for (const [k, v] of Object.entries(groups)) L.push(`| \`${k}\` | ${v.length} | ${v.slice(0, 4).map((f) => `\`${f.dep}\``).join(', ')}${v.length > 4 ? ', …' : ''} |`);
  L.push('');
  for (const [k, v] of Object.entries(groups)) {
    L.push(`<details><summary><code>${k}</code> (${v.length})</summary>`, '', '| Package | Dependency | Kind | Reclaimable | Note |', '|---|---|---|--:|---|');
    for (const f of v.sort((a, b) => b.bytes - a.bytes)) L.push(`| \`${f.pkg}\` | \`${f.dep}\` | ${f.kind} | ${f.bytes ? fmt(f.bytes) : '·'} | ${f.note} |`);
    L.push('', '</details>', '');
  }
}

fs.writeFileSync(path.join(OUT, 'deps-report.md'), L.join('\n') + '\n');
console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, 'deps-report.md'))} and deps-data.json — ${packages.length} packages, ${findings.length} signals`);
