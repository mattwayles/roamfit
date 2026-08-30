# ADR 0003 — `packages/store/` as a pure-schema package, testable in node without a simulator

**Status:** Accepted
**Raised by:** Wave 3 brief ("decide early whether this lives in `packages/store/` or
`app/src/db/`... whichever you pick, the logic must be testable WITHOUT a simulator")

## Context

§3/CLAUDE.md name op-sqlite + Drizzle as the stack. op-sqlite is a native binding — it only runs
inside a compiled RN app on a simulator or device, which would make `app/src/db/` untestable from
plain `node` and unverifiable by this track's own test suite (the brief is explicit: "if you
cannot test it in node, the wave cannot be verified").

Drizzle ORM ships parallel driver adapters that speak the same SQLite dialect and the same query
builder against the same schema definition: `drizzle-orm/better-sqlite3` (a synchronous, pure-JS/
native-addon driver that runs anywhere node runs, including this sandbox and CI) and
`drizzle-orm/op-sqlite` (the RN-native binding). Confirmed both exist at the pinned Drizzle
version and both accept an identical `sqlite-core` schema — swapping drivers is a constructor
call, not a schema or query rewrite.

## Decision

**`packages/store/`** is a workspace package, structured like `packages/engine`/`packages/data`:
pure TypeScript, no React Native import anywhere in `src/`.

- `src/schema.ts` — the Drizzle `sqlite-core` schema (§4.3–§4.7 plus rolled-up stats and deferred-
  work queues). One definition, shared by both drivers.
- `src/db.ts` — `createStore(sqliteDb: BetterSQLite3Database | OPSQLiteDatabase)` takes an
  **already-constructed Drizzle database handle** and returns the repository/completion API.
  `packages/store` itself depends only on `drizzle-orm` and `better-sqlite3` (a devDependency,
  used by its own test harness) — it does not depend on `@op-engineering/op-sqlite` at all, so it
  stays installable and testable in plain node with no native RN toolchain.
- **Production wiring lives in `app/src/db/`** (a thin file, Wave 4's to create/consume): it
  imports `@op-engineering/op-sqlite`, opens the on-device database, wraps it with
  `drizzle-orm/op-sqlite`, and passes the handle into `createStore` from `@roamfit/store`. That
  file is the only place the native binding is ever imported.
- **Migrations** are hand-authored, numbered SQL files under `packages/store/src/migrations/`,
  applied by a tiny driver-agnostic runner (`src/migrate.ts`) that tracks applied versions in a
  `_migrations` table and works against either driver's `.exec`/`.run` primitive. Real evolution
  from commit one, per the brief — not deferred until the schema "settles."
- Tests run entirely against `better-sqlite3` (in-memory `:memory:` databases, one per test) via
  `src/testHarness.ts`. This is the in-memory/better-sqlite3-backed harness the brief calls
  "strongly preferred."

## Consequences

- `npm run check`'s existing per-workspace `typecheck`/`test` pattern picks up
  `packages/store` automatically once it's added to the root `package.json` workspaces array —
  no new top-level scripts needed.
- No purity linter is added for `packages/store` (unlike `packages/engine`) — it is expected to
  eventually depend on platform-ish concerns (e.g. reading `Intl.DateTimeFormat().resolvedOptions
  ().timeZone` for the caller to pass in). It still must not import `react-native` or `app/`
  directly; this is enforced by code review, not tooling, since the package's job is persistence
  wiring, not engine-grade purity.
- Because both drivers share one schema and one query surface, a behavior difference between
  node-tested code and on-device code can only come from the native binding itself (transaction
  semantics, pragma support), not from divergent logic. Wave 4 should smoke-test once on a real
  simulator DB file before shipping, but does not need to re-derive or re-test business logic
  there.
- If op-sqlite's real transaction/pragma behavior ever diverges materially from better-sqlite3's
  in a way that matters (e.g. a pragma this schema relies on), that is a new ADR, not a silent
  patch.
