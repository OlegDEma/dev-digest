import type { SkillCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

// Quality cases run with no tools (skillTask measures the SKILL.md content in isolation), so each
// prompt inlines a small file from fixtures/ for the skill to review. The three cases cover the
// skill's three jobs: catch a ring violation, stay silent on clean code (near-miss negative),
// and say where misplaced logic belongs.
const fx = fixtureReader(import.meta.url);

export const cases: SkillCase[] = [
  {
    name: "flags Drizzle and an SDK client inside a service and names the fix for each",
    kind: "quality",
    prompt: `Review this service file against our onion architecture. List each violation with the rule it breaks and where the code should live.\n\n\`\`\`ts\n${fx("bad-service.ts")}\n\`\`\``,
    grounding: ["Octokit"],
    practices: [
      "the answer flags that the service imports and queries Drizzle directly (db.select / db.insert / drizzle-orm), and says DB access belongs only in a repository file (repository/*.repo.ts)",
      "the answer flags that the service constructs `new Octokit(...)` itself, and says external I/O must go through a port on the container (for example container.github())",
      "the answer names the broken rule or ring for each violation (Drizzle only in repositories; external I/O only through a container port; dependencies point inward) rather than giving generic 'clean code' advice",
      "the answer proposes a concrete target for each fix (a repository method such as upsertPulls / getRepo, and a container port) instead of only saying the code is wrong",
    ],
    threshold: 0.7,
    maxTurns: 6,
  },
  {
    name: "stays silent on a correctly layered service (near-miss negative)",
    kind: "quality",
    prompt: `Review this service file against our onion architecture. Report violations, or say clearly if there are none.\n\n\`\`\`ts\n${fx("good-service.ts")}\n\`\`\``,
    practices: [
      "the answer concludes that the file has no onion-architecture violation (it does not request changes)",
      "the answer does not claim the service touches the database directly, because it only calls the injected repository",
      "the answer does not claim the service creates an external client itself, because GitHub is reached through the container port (this.container.github())",
      "the answer does not invent a violation such as 'missing validation in the service' (Zod validation belongs in the route layer, not here)",
    ],
    threshold: 0.7,
    maxTurns: 6,
  },
  {
    name: "says a route that queries the DB and holds business logic must be split into route, service and repository",
    kind: "quality",
    prompt: `Where should each part of this route handler live? Give a concrete placement.\n\n\`\`\`ts\n${fx("bad-route.ts")}\n\`\`\``,
    grounding: ["repository"],
    practices: [
      "the answer says the Drizzle query (select / where / orderBy) belongs in a repository file, not in routes.ts",
      "the answer says the filtering, slicing and the 'risk' classification must move out of the route and must not go into the repository: they belong in the service layer (service.ts) or in a pure helpers.ts function that the service calls",
      "the answer says the route is left thin, doing only HTTP concerns (reading the request, calling the service, shaping the response) and delegating the rest, rather than keeping the business logic itself",
      "the answer states the dependency direction: the route calls the service, the service calls the repository, never the other way",
    ],
    threshold: 0.7,
    maxTurns: 6,
  },
];
