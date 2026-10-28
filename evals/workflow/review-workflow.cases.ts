import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (root CLAUDE.md → AGENTS.md, the
 * per-package AGENTS.md, skills, subagents; loaded via settingSources:["project"]) behaves as
 * documented. Organized by scenario, not by a single artifact, because these behaviors are
 * cross-cutting.
 *
 * Budget: 6 Claude sessions total.
 *   - 2 × trace      → 1 session each (several facets folded into one)   = 2
 *   - 1 × contrast   → 2 sessions (treatment + control, the one reference) = 2
 *   - 1 × activation pair (positive + near-miss negative)                  = 2
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 * Negatives and `contrast` are NOT folded: they need their own prompt / their own control run.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): nested per-package AGENTS.md routing + grep-trap avoidance ------------
  {
    kind: "trace",
    // Two things in one session. (1) Grep-trap check: nothing in the prompt names the forbidden
    // dirs, so staying out of server/clones/ + .claude/worktrees/ (Read, Grep AND Glob targets)
    // only holds if the root "Do not touch" rule works. (2) Content probes for auto-loaded
    // context, which a Read-based trace cannot see (measured: 0/3 unprompted reads of
    // client|server/AGENTS.md): "617.js" is a fact that lives in client/AGENTS.md (+ docs), and
    // "node_modules/.bin/tsc" in the root AGENTS.md reached through the CLAUDE.md @import — neither
    // is in source code. A model can still find them by reading the docs, so this proves the fact
    // reached the answer, not strictly that it was auto-loaded. Runs to its natural end (no early
    // stop) so the trap gets a real chance to fire.
    name: "grep traps stay untouched, and facts from the nested + root AGENTS.md reach the answer",
    prompt:
      "Я збираюся одночасно змінювати три пакети: server (новий модуль), client (нова сторінка) і " +
      "reviewer-core (grounding). Перш ніж братися за код: 1) знайди, у якому файлі кожного з трьох " +
      "пакетів визначено або вперше використовується схема Review; 2) скажи, яку помилку про відсутній " +
      "модуль я отримаю в client, якщо запущу next build при працюючому dev-сервері; 3) скажи, чим " +
      "запускати typecheck у server, якщо pnpm typecheck падає ще до роботи. Відповідай коротко, " +
      "нічого не змінюй.",
    forbidFilesRead: ["server/clones/", ".claude/worktrees/"],
    expectTextIncludes: ["617.js", "node_modules/.bin/tsc"],
    maxTurns: 20,
  },

  // --- trace (1 session): root "Read when" rows + subagent dispatch -----------------------------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews existing code inline instead of
    // planning-then-dispatching. GET /repos/:id/index-status is absent from server/src.
    name: "tests + indexing task reads TESTING.md and the repo-intel README, then pulls architecture-reviewer",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /repos/:id/index-status та інтеграційний " +
      "тест для індексації repo-intel. Спершу прочитай ті документи, які " +
      "настанови server/AGENTS.md радять для тестів і для індексації, ДО будь-якого коду. Потім ОБОВʼЯЗКОВО запусти сабагента architecture-reviewer, щоб він оцінив мій " +
      "план на відповідність onion-шарам — не рецензуй сам.",
    expectFilesRead: ["TESTING.md", "server/src/modules/repo-intel/README.md"],
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 15,
  },

  // --- contrast (2 sessions): the ONE reference proving CLAUDE.md/AGENTS.md causes the read -----
  // Treatment (real harness) must read docs/agent-prompts/; control (empty tmpdir, no on-disk
  // config) must not. This is what a plain `trace` cannot show: that the read happened BECAUSE of
  // the repo's instructions, not because the model guessed.
  {
    kind: "contrast",
    name: "AGENTS.md routes a prompt-change task to docs/agent-prompts/",
    prompt:
      "Я хочу змінити, що саме прапорить security-ревʼюер агент і які в нього правила severity. " +
      "За настановами цього репо — що спершу треба прочитати? Прочитай це.",
    expectFileRead: "docs/agent-prompts/",
    maxTurns: 6,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    // 8, not 4: a session naturally runs ~5 turns; hitting the cap sets isError, which eval:repeat
    // records as a failure even though the activation assert itself passed.
    shouldActivate: true,
    maxTurns: 8,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 8,
  },
];
