# React / Frontend — організація коду: список джерел для скіла

> Мета: зібрати авторитетні джерела про **організацію та архітектуру** frontend-коду на
> React — де лежать компоненти, як їх розбивати, куди виносити бізнес-логіку, константи,
> utils/helpers, state та шар даних. З цього списку далі збираємо скіл.
>
> Зібрано: 2026-09-21. Кожен URL перевірено через web-fetch (HTTP 200), окрім кількох
> позначених ⚠️ (Medium віддає 403 ботам — лінки живі, зміст підтверджено через пошук).
>
> **Легенда статусу:** `CURRENT` — актуальна практика · `HISTORICAL` — застаріле/замінене
> (тримаємо для контексту й щоб знати, чого НЕ радити).

---

## 0. Ядро (must-read) — з цього почати при написанні скіла

Найсильніші першоджерела, на яких тримається все інше:

- **Thinking in React** — https://react.dev/learn/thinking-in-react
- **Reusing Logic with Custom Hooks** — https://react.dev/learn/reusing-logic-with-custom-hooks
- **You Might Not Need an Effect** — https://react.dev/learn/you-might-not-need-an-effect
- **Choosing the State Structure** — https://react.dev/learn/choosing-the-state-structure
- **bulletproof-react → project-structure.md** — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- **Kent C. Dodds — Colocation** — https://kentcdodds.com/blog/colocation
- **Kent C. Dodds — Application State Management with React** — https://kentcdodds.com/blog/application-state-management-with-react
- **Redux Style Guide** (feature folders + ducks/slices) — https://redux.js.org/style-guide/
- **Feature-Sliced Design — Overview** — https://feature-sliced.design/docs/get-started/overview

---

## 1. Структура проєкту та тек (де що лежить · feature-vs-type · colocation)

- **File Structure — React FAQ (legacy docs)** — React team, ~2018–2022, `HISTORICAL` (сторінка), але це канонічна позиція «React не нав'язує структуру». Описує два підходи: групування by feature/route vs by file type; попереджає про надмірну вкладеність.
  https://legacy.reactjs.org/docs/faq-structure.html

- **React Folder Structure Best Practices [2026]** — Robin Wieruch, оновлено 2026-05-05, `CURRENT`. Еволюція у 5 кроків: один файл → кілька файлів → теки компонентів → технічні теки (`components/hooks/context/utils`) → **feature folders**. Правило «promotion»: util/hook/константа живе у фічі, поки її не потребують 2+ фічі — тоді підіймається у shared.
  https://www.robinwieruch.de/react-folder-structure/

- **Delightful React File/Directory Structure** — Josh W. Comeau, 2022, оновл. 2025-12-03, `CURRENT` (думка практика). Розкладка by-function (`src/components/` по теці на компонент, `hooks/`, `helpers/` vs `utils.ts`, `constants.ts`). Підтримує **per-component `index.ts` barrel** та path-аліаси (`@/components/Button`) — свідомий контраст до анти-barrel позиції нижче.
  https://www.joshwcomeau.com/react/file-structure/

- **How To Structure React Projects From Beginner To Advanced** — Web Dev Simplified (Kyle Cook), 2022, `CURRENT`. Прогресія simple → intermediate → advanced; просунутий рівень — **feature-based** з `index.js` як публічним API фічі, захищеним ESLint-правилами імпорту.
  https://blog.webdevsimplified.com/2022-07/react-folder-structure/

- **A Folder Per Type or a Folder Per Feature (…survives an AI Session)** — Avery, dev.to, 2024, `CURRENT`. Свіжий, «agent-era» аргумент: type-based теки дають мало контексту, код кладуть не туди, межі розмиваються; feature folders з публічним `index` виживають рефактори й AI-правки.
  https://dev.to/avery_code/a-folder-per-type-or-a-folder-per-feature-only-one-of-them-survives-an-ai-session-c67

- **Project structure and organization (Next.js)** — Vercel, оновл. 2026, `CURRENT`. Next.js «unopinionated», але дає інструменти: safe colocation, private folders (`_folder`), route groups (`(group)`), опційна `src/`. Три стратегії: файли поза `app`, у теках усередині `app`, або **split by feature/route**.
  https://nextjs.org/docs/app/getting-started/project-structure
  Секція colocation: https://nextjs.org/docs/app/getting-started/project-structure#colocation

---

## 2. Референсні архітектури (готові до наслідування)

- **bulletproof-react (репозиторій)** — Alan Alickovic, підтримується, `CURRENT`. Найцитованіша опінійована архітектура масштабованих React-застосунків: `src/` → `app, assets, components, config, features, hooks, lib, stores, testing, types, utils`.
  https://github.com/alan2207/bulletproof-react

- **bulletproof-react → project-structure.md** — `CURRENT`. Конкретні правила: основний код у `src/features/<feature>/{api,components,hooks,stores,types,utils}` («лише потрібні»); **однонапрямний потік** shared → features → app (shared не імпортує з features); **заборона крос-фіча імпортів** через ESLint; **радить проти barrel files** заради tree-shaking у Vite.
  https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md

- **bulletproof-react → project-standards.md** — `CURRENT`. Що робить структуру примусовою: **absolute imports** з єдиним аліасом `@/*`, **kebab-case імена файлів через ESLint**, Prettier/TS/Husky.
  https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md

- **bulletproof-react → api-layer.md** — `CURRENT`. Референс окремого API/сервісного шару: один переднастроєний інстанс клієнта на весь застосунок; кожен запит = (1) типи + схема валідації, (2) fetcher, (3) хук (react-query/swr). Колокейт декларацій запитів заради discoverability і end-to-end типів.
  https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md

- **Feature-Sliced Design — homepage** — спільнотна методологія, v2.1, `CURRENT`. Стандартизує ієрархію **layers → slices → segments** для великих застосунків; організація за бізнес-доменом, з публічними API-межами й однонапрямними імпортами.
  https://feature-sliced.design/

- **FSD — Overview (get started)** — `CURRENT`. Layers (`app, pages, widgets, features, entities, shared`; `processes` deprecated), Slices (домени; «slice не може використовувати інший slice того самого шару»), Segments (`ui, api, model, lib, config`). Правило: модуль імпортує лише з шарів строго нижче.
  https://feature-sliced.design/docs/get-started/overview

- **FSD — Layers (reference)** — `CURRENT`. Авторитетний per-layer довідник і строге правило імпорту між шарами.
  https://feature-sliced.design/docs/reference/layers

- **Redux Style Guide — «Structure Files as Feature Folders with Single-File Logic»** — Redux team, підтримується, `CURRENT`. Feature-folder підхід + Redux-логіка як один **slice** (`createSlice`) — сучасні «ducks». Організація стану **by data domain, не by UI**; нормалізований, мінімальний стан; «якнайбільше логіки в редюсерах».
  https://redux.js.org/style-guide/
  Анкор правила: https://redux.js.org/style-guide/#structure-files-as-feature-folders-with-single-file-logic

- **Ducks: Redux Reducer Bundles (оригінал)** — Erik Rasmussen, 2015, `HISTORICAL` за походженням, але **актуальний по духу** (сучасна реалізація — `createSlice`). Модуль бандлить reducer + action creators + типи в одному файлі.
  https://github.com/erikras/ducks-modular-redux

---

## 3. Розбиття та дизайн компонентів (як різати · SRP · чистота · композиція)

- **Thinking in React** — React team, `CURRENT`. Канонічний 5-кроковий метод: макет → дерево компонентів. Крок 1 — розбити UI за принципом єдиної відповідальності; структура компонентів дзеркалить модель даних; далі — де живе стан.
  https://react.dev/learn/thinking-in-react

- **Your First Component** — React team, `CURRENT`. Визначення/вкладення компонентів; правила: PascalCase, один root return, **ніколи не оголошувати компонент усередині іншого** — лише на top level.
  https://react.dev/learn/your-first-component

- **Importing and Exporting Components** — React team, `CURRENT`. Розбиття компонентів по файлах; default vs named exports (один default на файл; named — коли з файлу експортуються кілька компонентів).
  https://react.dev/learn/importing-and-exporting-components

- **Passing Props to a Component** — React team, `CURRENT`. Props як API компонента: деструктуризація, дефолти (`size = 100`), обережний `{...props}`, JSX через `children` для композиції; props read-only.
  https://react.dev/learn/passing-props-to-a-component

- **Keeping Components Pure** — React team, `CURRENT`. Чистота як обмеження дизайну: однакові інпути → однаковий JSX, без мутацій під час рендеру; side effects — у хендлерах/`useEffect`; StrictMode ловить нечистоту.
  https://react.dev/learn/keeping-components-pure

- **Composition vs Inheritance** — React team (legacy docs), guidance `CURRENT`, сторінка `HISTORICAL/archived`. Найцитованіше окреме формулювання «композиція > успадкування»: containment через `children`/slot-props (приклад `SplitPane`) і specialization (`WelcomeDialog` конфігурує `Dialog`).
  https://legacy.reactjs.org/docs/composition-vs-inheritance.html

- **Single Responsibility Principle in React: The Art of Component Focus** — Christian Ekrem, 2025-02-04, `CURRENT`. Рецепт розбиття: винести data-fetching у custom hooks (`useUser`), presentational компоненти лише на props, тонкий контейнер-оркестратор; **тест «and»** — якщо описуєш компонент через «and», ділиш. Різати за *причиною змінюватися*, не за кількістю задач.
  https://cekrem.github.io/posts/single-responsibility-principle-in-react/

- **Single Responsibility Principle in React applications — Part 1** — Jacek Mikrut, Sunscrapers, 2018, концепт `CURRENT`. SRP для React («одна причина змінюватися»); фундаментальний компаньйон до статті вище.
  https://sunscrapers.com/blog/single-responsibility-principle-in-react-applications-part-1/

---

## 4. Патерни компонентів (compound · provider · HOC · render props · hooks · headless · atomic)

Каталог патернів patterns.dev — свіжий (сторінки згадують React 18/19, React Compiler):

- **Compound Pattern** — `CURRENT`. Складені компоненти зі спільним неявним станом; Context-підхід (реком. для React 18+, `FlyOut.Toggle`) vs старий `React.Children.map` + `cloneElement`.
  https://www.patterns.dev/react/compound-pattern/

- **Provider Pattern** — `CURRENT`. Context для передачі даних без prop drilling; `createContext` + provider + `useContext`; кілька провайдерів проти зайвих ре-рендерів. (Актуальний слаг — `/vanilla/`.)
  https://www.patterns.dev/vanilla/provider-pattern/

- **HOC Pattern** — `CURRENT` (описує HOC як тепер-legacy техніку). Cross-cutting concerns (`withAnalytics`), пастки «wrapper hell»/колізій props; явно радить **custom hooks замість HOC** для нового коду.
  https://www.patterns.dev/react/hoc-pattern/

- **Render Props Pattern** — `CURRENT`. Функція-проп, що отримує стан і повертає JSX; render props досі важливі для **headless-бібліотек** (Downshift, Framer Motion), але дефолт для шерингу логіки — hooks.
  https://www.patterns.dev/react/render-props-pattern/

- **Hooks Pattern** — `CURRENT`. Чому hooks переформатували патерни; два правила hooks (+ `eslint-plugin-react-hooks`); винесення логіки у custom hooks (`useLocalStorage`, `useMediaQuery`); React 19 (`use`, `useActionState`, `useOptimistic`); React Compiler зменшує ручні `useMemo`/`useCallback`.
  https://www.patterns.dev/react/hooks-pattern/

- **Headless Component: a pattern for composing React UIs** — Juntao Qiu, martinfowler.com, 2023, `CURRENT`. Найкращий одиничний референс headless/compound: хук (`useDropdown`) володіє станом, хендлерами й a11y-атрибутами, але не рендерить UI — одна логіка живить багато UI. Основа Radix/Downshift/shadcn-стилю.
  https://www.martinfowler.com/articles/headless-component.html

- **Atomic Design (оригінальний пост)** — Brad Frost, 2013. П'ять рівнів: **atoms → molecules → organisms → templates → pages**. Словник `CURRENT` у дизайн-системах; для React-коду 2025 — радше ментальна модель, ніж закон тек (багато команд лишають feature-based колокацію, а atomic-словник — для shared-примітивів).
  https://bradfrost.com/blog/post/atomic-web-design/

- **Atomic Design (онлайн-книга)** — Brad Frost, 2016. Книжкове опрацювання створення й підтримки дизайн-систем.
  https://atomicdesign.bradfrost.com/

---

## 5. API компонента та іменування props

- **An Opinionated Guide to Component APIs** — John Gozde, Imply Engineering, 2022, `CURRENT`. Конкретні правила: event-props як `on[Subject]Verb`; DOM-подія останнім аргументом; boolean-props як голі прикметники з дефолтом `false` (`disabled`); string-union замість enum; примітивні значення props (дружні до referential equality); `children`; namespace `Dialog.Header` замість slot-props; композиція замість render props.
  https://imply.io/blog/an-opinionated-guide-to-component-apis/

- **Best Practices for Naming Props and States in React** — Shivam Saini, Medium, `CURRENT` (іменування). ⚠️UNVERIFIED (Medium 403; лінк живий). Префікси `is`/`has`; хендлери з `on`; множина для масивів; camelCase; дзеркалення нативних DOM API (`value`/`onChange`). *Сильніше, повністю перевірене першоджерело — гайд Imply вище.*
  https://medium.com/@shivamsainier98/best-practices-for-naming-props-and-states-in-react-db0d91a09feb

---

## 6. Де живе бізнес-логіка (custom hooks · separation of concerns · controller)

- **Reusing Logic with Custom Hooks** — React team, `CURRENT`. Першоджерело: custom hooks — дім для повторюваної stateful-логіки (наступник container-компонентів). Правила: `use`-префікс, hooks шерять *логіку, не стан*; конкретні хуки (`useChatRoom`), а не generic `useMount`.
  https://react.dev/learn/reusing-logic-with-custom-hooks

- **You Might Not Need an Effect** — React team, `CURRENT`. Що НЕ належить у Effect: derive під час рендеру, кеш через `useMemo`, reset стану через `key`, логіку подій — у хендлери. Ключове для рішення «де жити логіці».
  https://react.dev/learn/you-might-not-need-an-effect

- **Separating Events from Effects** — React team, `CURRENT` (API `useEffectEvent` досі experimental). Розрізняє реактивну (Effects) й нереактивну (хендлери) логіку; ніколи не глушити deps-лінтер.
  https://react.dev/learn/separating-events-from-effects

- **Separation of concerns with React hooks** — Felix Gerschau, 2021, `CURRENT`. Приклад: винести логіку у custom hook (`useExponentCalculator`), потім чисті функції з хука → бізнес-логіка стає framework-agnostic і юніт-тестованою. З caveat: не дробити тривіальні компоненти.
  https://felixgerschau.com/react-hooks-separation-of-concerns/

- **Decoupling Business Logic from UI with Custom React Hooks** — eMoosavi, 2024, `CURRENT`. Свіжий практичний розбір: винести повторювану логіку й side effects у `useCounter`/`useForm`/`useFetch`, композиція хуків, компоненти сфокусовані на рендері.
  https://www.emoosavi.com/blog/decoupling-business-logic-from-ui-with-custom-react-hooks

- **The Controller Pattern: Separate business logic from presentation in React** — Martin Buchalik, Medium, `CURRENT` (патерн). ⚠️UNVERIFIED (Medium 403; лінк живий). Per-component controller-хук тримає стан+логіку, компонент — чистий JSX; послідовна, тестована структура (кут «container hooks / MVP»).
  https://medium.com/@MBuchalik/the-controller-pattern-separate-business-logic-from-presentation-in-react-331f72fcb32a

- **Presentational and Container Components** — Dan Abramov, Medium, 2015 (+ апдейт 2019), `HISTORICAL` / замінено hooks. ⚠️UNVERIFIED (Medium 403; лінк живий). Апдейт 2019: автор більше НЕ радить так ділити — «не робіть цього з догматичним завзяттям». Сучасна заміна — custom hooks. Тримаємо, щоб знати, чого не нав'язувати.
  https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0

---

## 7. Організація стану (server vs UI state · colocation · lifting · shape)

- **Application State Management with React** — Kent C. Dodds, 2020, `CURRENT` (фундамент). Ділити стан на **server cache** (react-query — «кешування складне») vs **UI state** (`isOpen`); React сам — менеджер стану, більшості не потрібен Redux/MobX.
  https://kentcdodds.com/blog/application-state-management-with-react

- **State Colocation will make your React app faster** — Kent C. Dodds, 2019, `CURRENT` (фундамент). Тримати стан якнайближче до місця використання; підіймати лише коли справді shared; context/global — лише коли prop-drilling реально болить. Плюс виграш у перформансі.
  https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster

- **Sharing State Between Components** (колишнє «Lifting State Up») — React team, `CURRENT`. Три кроки підняття стану, controlled vs uncontrolled, single source of truth.
  https://react.dev/learn/sharing-state-between-components

- **Choosing the State Structure** — React team, `CURRENT`. П'ять принципів: групувати пов'язаний стан; уникати суперечливого (один status, не кілька boolean); уникати надлишкового (derive під час рендеру); уникати дублювання (зберігати ID); уникати глибокої вкладеності (нормалізувати).
  https://react.dev/learn/choosing-the-state-structure

---

## 8. Шар даних / сервісний / API (де живе логіка запитів і server-state)

- **bulletproof-react → api-layer.md** — `CURRENT`. (Див. секцію 2 — окремий, типізований API-шар: клієнт + типи/схема + fetcher + хук.)
  https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md

- **Practical React Query** — TkDodo (Dominik Dorfmeister), 2020, оновл. 2023, `CURRENT`. Де живе server-state: дані як «позичені»; загортати запити у **custom query hooks** (колокейт fetch + query keys + трансформи); «не клади дані з `useQuery` у local state»; тюнити `staleTime`, а не боротися з refetch.
  https://tkdodo.eu/blog/practical-react-query

- **React Query as a State Manager** — TkDodo, 2021, `CURRENT`. React Query — async state manager (глобальний через `QueryKey`, дедуп запитів), а не просто fetch-бібліотека; server-state читається `useQuery` будь-де — це ховає поділ «smart vs dumb».
  https://tkdodo.eu/blog/react-query-as-a-state-manager

---

## 9. Константи · utils/helpers · config/env

- **Tips to Use Constants File in TypeScript** — amir fakoor, dev.to, 2023, `CURRENT` (з застереженням). UPPER_SNAKE_CASE, центральний `constants.ts`, дроблення великих наборів за категоріями (`constants/api.ts`, `constants/ui.ts`), JSDoc. НЕ покриває `as const`/enum — доповнити TS-джерелом.
  https://dev.to/amirfakour/tips-to-use-constants-file-in-typescript-27je

- **Why utils & helpers is a dump** — Sergey Sova, dev.to, 2021, `CURRENT`. Відомий аргумент: generic `utils`/`helpers` стають «звалищем». Фікс: purpose-named внутрішні бібліотеки під `lib/` (напр. `lib/datetime`) — чіткий scope, тести, docs, namespace-префікс (`@lib/datetime`).
  https://dev.to/sergeysova/why-utils-helpers-is-a-dump-45fo

- **Ditch process.env, use a typed config** — Cully Larson, Echobind, 2023, `CURRENT`. Проти розкиданого `process.env`: читати env один раз у єдиному config-модулі, приводити до типів із дефолтами, **валідувати Zod на старті** — один типізований frozen source of truth.
  https://echobind.com/post/ditch-process-env-use-a-typed-config

---

## 10. Обробка помилок (організація)

- **React.Component — Catching rendering errors with an error boundary** — React team (API reference), `CURRENT`. Error boundaries через `static getDerivedStateFromError` + `componentDidCatch`; межі — на осмислених рівнях UI, не навколо кожного компонента; class-компоненти досі єдиний нативний механізм.
  https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary

- **react-error-boundary** — Brian Vaughn (React core), актив. підтримка, `CURRENT`. De-facto бібліотека: `<ErrorBoundary>` з `fallback`/`FallbackComponent`/`fallbackRender`, reset (`onReset`, `resetKeys`), хук `useErrorBoundary` для помилок у хендлерах/async (які нативні межі не ловлять).
  https://github.com/bvaughn/react-error-boundary
  npm: https://www.npmjs.com/package/react-error-boundary

---

## 11. Barrel-файли, імпорти, аліаси (важлива суперечка)

- **How we optimized package imports in Next.js** — Shu Ding, Vercel Blog, 2023, `CURRENT` (авторитет щодо перформансу). Головне першоджерело про ціну barrel-файлів: один імпорт із великого barrel тягне все (200–800 мс+); `optimizePackageImports` авто-переписує → −40% cold start, −28% build.
  https://vercel.com/blog/how-we-optimized-package-imports-in-next-js

- **Barrel files are the clean-code habit quietly wrecking your bundle** — Aditya Agarwal, dev.to, 2024, `CURRENT`. Практично: прямі імпорти для perf-критичного/Next.js коду; `optimizePackageImports` для сторонніх barrel; видаляти barrel, що існують лише заради гарних шляхів; стежити за circular deps. Дані: MUI 151 kB (barrel) vs 75 kB (прямо); −68% модулів після видалення внутрішніх barrel.
  https://dev.to/adioof/barrel-files-are-the-clean-code-habit-quietly-wrecking-your-bundle-1cn6

---

## 12. Colocation та принципи абстракції (наскрізні)

- **Colocation** — Kent C. Dodds, 2019, `CURRENT` (фундамент). Ключове формулювання: **«тримай код якомога ближче до місця, де він релевантний»** — тести, стилі, стан, утиліти. Концептуальний хребет усіх feature-folder/colocation порад.
  https://kentcdodds.com/blog/colocation

- **AHA Programming (Avoid Hasty Abstractions)** — Kent C. Dodds, 2020, `CURRENT`. Коли підіймати код у shared: «prefer duplication over the wrong abstraction» (Sandi Metz) — чекай на патерн. Правило рішення «цей util — у фічі чи в shared?».
  https://kentcdodds.com/blog/aha-programming

- **Prop Drilling** — Kent C. Dodds, 2018, `CURRENT`. Prop drilling не є злом сам по собі (явний, статично простежуваний потік); тримати стан близько, Context — лише для справді глибоко потрібних даних.
  https://kentcdodds.com/blog/prop-drilling

- **Passing Data Deeply with Context** — React team, `CURRENT`. Перед Context: (1) почни з props, (2) **винеси компоненти й передавай JSX як `children`**, щоб проміжні шари не тягнули props. «Потреба передати props кілька рівнів ≠ привід класти це в контекст».
  https://react.dev/learn/passing-data-deeply-with-context

---

## 13. Стайлгайди та конвенції

- **Airbnb React/JSX Style Guide** — Airbnb, GitHub, `PARTIALLY DATED`. Актуальне: один компонент на файл, PascalCase імена/`.jsx`, PascalCase для компонентів + camelCase для інстансів, чисті функції для stateless. Застаріле: 15-крокове впорядкування методів класу, class-vs-function поради (тепер стандарт — функції + hooks).
  Розділ React: https://github.com/airbnb/javascript/tree/master/react
  Репозиторій: https://github.com/airbnb/javascript

---

## Ключові напруження / відкриті суперечки (винести у скіл явно)

1. **Barrel-файли (`index.ts`).** Josh Comeau — за per-component barrel заради чистих імпортів; bulletproof-react + Vercel + dev.to — проти (tree-shaking/perf). Рекомендація для скіла: barrel лише як публічний API фічі, не всюди; для great сторонніх пакетів — `optimizePackageImports`.
2. **Container / Presentational.** `HISTORICAL` — сам Dan Abramov відкликав (2019). Сучасно: логіка у custom hooks, а не у container-компонентах.
3. **Atomic Design як закон тек.** Словник живий, але строгі теки atoms/molecules/organisms у React-коді 2025 часто програють feature-based колокації. Тримати atomic лише для shared-примітивів.
4. **type-based vs feature-based теки.** Консенсус свіжих джерел — feature-based з публічним `index`-межею для будь-чого, крім найдрібніших проєктів.

---

## Уже встановлені скіли, з якими вирівнюємось (щоб не дублювати)

- `react-best-practices` — компоненти, стан, hooks-misuse, перформанс, data fetching, організація коду.
- `next-best-practices` — file conventions, RSC boundaries, data patterns, async APIs, metadata.
- `react-testing-library` — тести компонентів/хуків (RTL + Vitest).

Новий скіл варто вузько сфокусувати на **архітектурі й організації** (де що лежить, як різати, куди логіку/константи/утиліти/дані), з посиланнями на ці три для суміжних тем.

---

## Наступні кроки

1. Обрати «canonical stance» скіла на кожне питання (структура, розбиття, логіка, константи, utils, дані, стан) — з опорою на ядро (секція 0) і з явним рішенням по 4 суперечках вище.
2. Узгодити з конвенціями цього репо (client `_components/<PascalName>/` + `<Name>.test.tsx` + `index.ts`).
3. Зібрати скіл через `skill-creator`; ці джерела покласти у `references/` скіла.
