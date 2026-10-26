# onion-architecture — eval

One hermetic review task over `fixtures/`. The fixture tree is a self-contained
slice of a DevDigest-shaped backend: it typechecks on its own and needs nothing
from the real repo. The answer key is [`expected-findings.json`](expected-findings.json).

## How to run

1. Copy `fixtures/` to a scratch dir **outside** the skill folder, so the
   executor cannot see `SKILL.md`, this file or the answer key.
2. Give the executor the **Task** section below verbatim, with `{fixtures}`
   replaced by the scratch path. Run it twice: with the skill loaded and without.
3. Grade each `review.md` against `expected-findings.json` (see **Grading**).

## Task

> Це чернетка PR для бекенду DevDigest. Код лежить у `{fixtures}`.
>
> Нове в цьому PR:
> - `notifications/` — правила, що постять коментар у PR на GitHub, коли рев'ю
>   завершилось із серйозними знахідками;
> - `digests/` — щотижневий дайджест активності рев'ю по репозиторію;
> - `reviewer-core/calibration/` — калібровка severity: якщо ревьюери часто
>   dismiss-ять знахідки певної категорії, знижуємо severity і додаємо пояснення
>   від LLM. `reviewer-core` — це окремий пакет-рушій рев'ю, сервер споживає його;
> - `reviews/hooks.ts` — хук, який викликається, коли рев'ю завершилось;
> - `reviews/rerun.ts` — ручний перезапуск рев'ю для PR;
> - `reviews/with-timeout.ts` — утиліта таймауту для промісів.
>
> Усе інше (`platform/`, `contracts/`, `adapters/`, `db/`, `shared/`, решта
> `reviews/`) — уже існуючий код проєкту, він тут для контексту, його не рев'юїмо.
>
> Зроби рев'ю структури нового коду перед мерджем: чи все лежить у правильному
> місці, що завадить нам згодом. Для кожної проблеми — `file:line` (шлях відносно
> `{fixtures}`), що не так, наскільки це серйозно (блокує мердж / треба
> виправити / дрібниця) і як виправити. Запиши рев'ю у `review.md`.

## Grading

A finding in `review.md` **matches** an expected finding when it names the same
`file` and cites a line within `line_tolerance` of one of its `anchors` (the lines that are the problem),
and describes the same problem (a grader model confirms the description; the
file/line match is deterministic).

- **Recall** = matched `required` findings / all `required` findings.
- **Precision check** — claims about `must_not_flag` files are false positives,
  split by `false_positive_levels`:
  - **blocking** — says the file breaks a layering/architecture rule or must be
    restructured, at blocker or should-fix level;
  - **nit** — a nit-level placement/style suggestion that does not claim a
    rule is broken;
  - not counted — context mentions, "this is fine", correctness notes unrelated
    to layering.
- **Severity floor**: each required finding has a `min_severity`
  (`blocker` > `should-fix` > `nit`). Map the review's label to that scale with
  `severity_scale` (English and Ukrainian labels; a review's own legend wins);
  the floor is met when the given level is at least the minimum. Score = findings meeting the floor / required findings found.
- `optional` findings count as a bonus, never against the run.
- A run **passes** when recall ≥ `pass.min_recall`, blocking false positives ≤
  `pass.max_blocking_false_positives`, nit false positives ≤
  `pass.max_nit_false_positives` and severity score ≥ `pass.min_severity_floor_met`.
- Findings outside the answer key that are not about layering (naming, HTTP
  status codes, tests) are neither rewarded nor penalised.
