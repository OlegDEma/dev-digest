/* Pure helpers for the DiffTab: role grouping and finding annotations. */
import type { FindingRecord, PrFile, SmartDiff, SmartDiffRole } from "@devdigest/shared";
import type { DiffAnnotation } from "@/components/diff-viewer";
import { ROLE_ORDER } from "./constants";

export interface FileGroup {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Join `pr.files` (patches, GitHub order) with the server's role grouping by path.
 * Always returns all five groups in ROLE_ORDER (empty ones included, so the client
 * does not rely on the route filling them); files inside a group keep their
 * `pr.files` order; a path the response does not know falls into `core`.
 * Returns null while the response is loading.
 */
export function groupFiles(files: PrFile[], smart: SmartDiff | undefined): FileGroup[] | null {
  if (!smart) return null;
  const roleOf = new Map<string, SmartDiffRole>();
  for (const g of smart.groups) for (const f of g.files) roleOf.set(f.path, g.role);
  const buckets = new Map<SmartDiffRole, PrFile[]>(ROLE_ORDER.map((role) => [role, []]));
  for (const f of files) {
    const role = roleOf.get(f.path);
    (buckets.get(role ?? "core") ?? buckets.get("core")!).push(f);
  }
  return ROLE_ORDER.map((role) => ({ role, files: buckets.get(role) ?? [] }));
}

export function toAnnotations(findings: FindingRecord[]): DiffAnnotation[] {
  return findings.map((f) => ({
    id: f.id,
    path: f.file,
    line: f.start_line,
    severity: f.severity,
  }));
}

/** How many of `files` carry at least one finding. */
export function filesWithFindings(files: PrFile[], findings: FindingRecord[]): number {
  const paths = new Set(findings.map((f) => f.file));
  return files.filter((f) => paths.has(f.path)).length;
}

/** Findings whose file is among `files`. */
export function findingsInFiles(files: PrFile[], findings: FindingRecord[]): number {
  const paths = new Set(files.map((f) => f.path));
  return findings.filter((f) => paths.has(f.file)).length;
}
