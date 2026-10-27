import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const REVIEW_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("checkout-service.diff")}`;

// A second real diff whose violations map onto the numbered rules of the onion-architecture skill
// (rule 1 "Dependencies point inward": reviewer-core does no I/O) that a competent model will
// describe in prose but will not spontaneously cite unless the agent forces a citation. This is
// the discriminating case for the strict-vs-lite A/B: both variants should FIND both problems,
// but only the strict variant (whose report template has a `Rule:` field per finding) should reliably
// cite the rule. The checkout diff's textbook violations don't discriminate — the model names
// the inward-dependency / DI rule either way.
const REVIEWER_CORE_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("reviewer-core-gate.diff")}`;

// A diff that violates NO documented rule (a pure local-variable rename inside a domain file, no
// new imports, no cross-layer edges). A grounded reviewer should report zero violations. This
// surfaces the COST of relaxing the citation rule: freed from "every finding must name a
// documented contract", the lite variant is more prone to fabricating a judgment/best-practice
// finding where the strict variant stays silent.
const BENIGN_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("benign-refactor.diff")}`;

// Shared across the strict (architecture-reviewer) and relaxed (architecture-reviewer-lite)
// variants so the two agents are graded on the exact same task — the only thing that should
// move between the two runs is whether "cites the specific documented rule" keeps passing.
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags the domain file (checkout.ts) importing a type from 'fastify' as a violation of the inward-only dependency rule between Domain and Presentation layers",
      "flags the `new PgCheckoutRepository()` call inside service.ts as a violation of DI discipline (concrete adapters/repositories must be constructed only in the composition root / container)",
      "names the documented onion-architecture rule violated (by its number or title, e.g. 'Dependencies point inward', 'External I/O enters only through a port') for EVERY finding rather than describing the problem only in prose",
      "assigns a severity (CRITICAL, WARNING or SUGGESTION) to each finding",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with an explicit verdict (approve, request_changes or comment) that is request_changes because at least one CRITICAL finding exists",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "does not present the optional `reply?: FastifyReply` parameter as a runtime bug or a security vulnerability (describing it as the same layering / dependency-direction problem as the fastify import is correct, not fabrication)",
      "stays scoped to structural/layering/DI findings: no standalone finding about naming, style or test coverage (mentioning testability as a consequence of a DI finding, or listing tests under 'not reviewed', is fine)",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "cites the documented onion rule for reviewer-core violations",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/pipeline/run.ts as a violation (reviewer-core must do no I/O except the injected LLMProvider)",
      "flags that runPipeline now returns `deduped` directly, skipping the mandatory `groundFindings()` gate before emitting findings",
      "names the documented onion-architecture rule (by number or title, i.e. dependencies point inward / reviewer-core performs no I/O beyond the injected LLMProvider) for the fs-import finding rather than only describing it in prose",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with an explicit verdict (approve, request_changes or comment) that is request_changes because at least one CRITICAL finding exists",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no violations for the benign rename (or records only SUGGESTION-level, non-blocking observations) — it does not invent a CRITICAL or WARNING finding",
      "does not fabricate a documented-rule violation where the diff violates none of the checked rules",
      "the final verdict is approve (or comment with no CRITICAL finding), not request_changes",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
