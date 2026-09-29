# Sources — why each rule holds + reading list

The rules in `../SKILL.md` aren't invented for this repo; they're the standard
Onion / hexagonal / clean-architecture consensus, adapted to a functional Fastify
+ Drizzle codebase with a hand-rolled container instead of a DI framework. This
maps each rule to the source that argues it best, then lists every link.

## Rule → source

| Rule | Principle | Source |
| --- | --- | --- |
| 1 — dependencies point inward | The dependency rule: coupling always toward the center; the domain compiles and runs without the outer layers. | Palermo's original Onion articles; NDepend "Going Beyond Layers"; Seemann "it's all the same". |
| 1 — domain knows nothing outward | "Stuff inside doesn't know about stuff outside." Core is free of persistence/transport detail. | Allegro Tech; Bazaglia (DDD/Onion in TS). |
| 2 — Drizzle only in repositories | Repository pattern: an abstraction over storage that decouples data access from business logic and enables the DIP. | LogRocket "Repository pattern with TypeScript"; Code Maze. |
| 3 — I/O through a port | Ports = interfaces in the inner ring; adapters = outer-ring implementations. "app/ may import ports but not adapters." | Cockburn's Ports & Adapters, via Hasan "Two Real Codebases"; Grudzynskyi "Unfolding infrastructure". |
| 3 — depend on interfaces, not concretions | Dependency Inversion Principle; DI *without a container* = pass the adapter as an argument/getter. | Wolk Software (SOLID+Onion) — but note: they use InversifyJS, which we deliberately do **not**. |
| 4 — validation at the rim | Input is validated/translated at the boundary before it reaches the core; the core trusts its types. | Hexagonal guides (Chakray); our own `server/AGENTS.md`. |
| 5 — logic not in route/repository | Application services coordinate use cases; they are not the domain and not the transport. Avoid the anemic-domain and fat-controller anti-patterns. | Allegro Tech (anti-patterns); Scharhag "layers → onions → hexagons". |
| 6 — contracts first | One schema as the single source of truth across the boundary, driving both validation and serialization. | Our `@devdigest/shared` convention; Zod docs. |
| 7 — thin module is a decision | Layering serves the code, not vice-versa; don't add ceremony a pure proxy doesn't need, but don't let a real feature skip it. | Scharhag; pragmatic reading of all of the above. |

## Why we reject the InversifyJS-style container

Most Node/TypeScript Onion tutorials reach for a DI-container library (InversifyJS,
tsyringe) and decorate classes with `@injectable`/`@inject`. DevDigest inverts
dependencies **without** that machinery: `platform/container.ts` is a plain class
with lazy getters that hands port interfaces to services, and `ContainerOverrides`
is the test seam. This is simpler, has no reflect-metadata/decorator build
requirement, and keeps the wiring readable in one file. When you read those
tutorials for the *layering* ideas, mentally replace their container with ours —
the boundaries are identical; only the injection mechanism differs.

## Reading list

**Bold** = cited directly in the rules; the rest is background and useful contrast.

### Canonical / the layer model

- **[Layers, Onions, Ports, Adapters: it's all the same — Mark Seemann (ploeh)](https://blog.ploeh.dk/2013/12/03/layers-onions-ports-adapters-its-all-the-same/)** — the key insight that Onion = Hexagonal = Clean; grounds our port-based approach.
- **[Onion Architecture — blog.allegro.tech](https://blog.allegro.tech/2023/02/onion-architecture.html)** — the most concrete statement of the dependency rule and the anti-patterns; our checklist derives from it.
- [Onion Architecture: Going Beyond Layers — NDepend](https://blog.ndepend.com/onion-architecture-layers/)
- [From layers to onions and hexagons — Michael Scharhag](https://www.mscharhag.com/architecture/layer-onion-hexagonal-architecture)
- [Onion Architecture in ASP.NET Core — Code Maze](https://code-maze.com/onion-architecture-in-aspnetcore/) — layer responsibilities, framework-agnostic.

### Node.js / TypeScript (applies, with our functional twist)

- **[Ports and Adapters, Explained with Two Real Codebases — Md Nasimul Hasan](https://saadh393.github.io/blog/adapter-port-architecture-two-cases)** — "app/ may import ports but not adapters"; closest to how we wire the container.
- **[Unfolding infrastructure in the Onion architecture — Dani Grudzynskyi](https://dgrudzynskyi.github.io/dev-blog/architecture/2020/12/18/unfolding-infrastructure-in-onion-architecture.html)**
- [Clean architecture with TypeScript: DDD, Onion — André Bazaglia](https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/)
- [Onion Architecture in Node.js with TypeScript — Sankhadip Samanta](https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391)
- [Hexagonal Architecture: a complete guide — Chakray](https://chakray.com/hexagonal-architecture-a-complete-guide-to-robust-and-testable-software-design/)
- [Exploring the Repository pattern with TypeScript and Node — LogRocket](https://dev.to/logrocket/exploring-the-repository-pattern-with-typescript-and-node-4jc9) — behind rule 2.

### Contrast — DI-container style we deliberately do **not** use

Read for the layering ideas, but mentally swap their container for ours (see above).

- [Implementing SOLID and the Onion Architecture in Node.js with InversifyJS — Wolk Software](http://blog.wolksoftware.com/implementing-solid-and-the-onion-architecture-in-node-js-with-typescript-and-inversifyjs)
- [Same, on dev.to — remojansen](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad)
- [onion-architecture-boilerplate — Melzar (GitHub)](https://github.com/Melzar/onion-architecture-boilerplate)

### Enforcement tooling

- [dependency-cruiser — sverweij (GitHub)](https://github.com/sverweij/dependency-cruiser) — already in our stack; the engine behind `pnpm arch:check`.

## Internal sources of truth

Because `server/docs/` and `server/specs/` are still stubs, the authoritative
in-repo references today are:

- `server/README.md` — the request/DI-flow Mermaid diagram.
- `server/AGENTS.md` — the module conventions this skill formalizes.
- `server/INSIGHTS.md` — the shared-contract fan-out lesson behind rule 6.
- `reviewer-core/AGENTS.md` — the "pure engine" definition behind rule 1.
- `server/src/modules/repo-intel/README.md` + `types.ts` — the facade/port pattern.
