# Trailroam Engineering Guide

This guide documents technical conventions for Trailroam. It is intended for developers and LLM agents making future changes.

## Goals

The codebase should be easy to review, easy to test, and explicit about ownership. Trailroam has several domains that should remain separated:

- Angular UI and page orchestration
- Chrome extension messaging
- Strava session/fetch/normalization
- local IndexedDB storage
- sync orchestration and counters
- map rendering
- shared display formatting

When adding or changing code, preserve these boundaries unless there is a clear reason to adjust them.

## Angular Structure

Use external component files for any component with meaningful layout or styling:

```text
feature-name.component.ts
feature-name.component.html
feature-name.component.scss
```

Inline templates and inline styles are acceptable only for small leaf components where the template and style are short enough to read at a glance.

Large page components should not contain long templates, long style blocks, and page logic in one TypeScript file. Split in two phases:

1. Move inline `template` and `styles` into external files without changing behavior.
2. Extract child components for clear UI regions.

Examples of good extraction targets:

- toolbar/filter rows
- stats summaries
- selected-actions bars
- empty/loading states
- notice banners
- panels and cards

Container components should own:

- data loading
- repository calls
- router/query-param coordination
- dialogs
- sync triggers
- side-effect orchestration

Presentational child components should own:

- rendering
- local UI-only state
- input/output contracts

Presentational components should not call repositories, Chrome runtime APIs, or Strava services.

## State and Services

Keep side effects behind services. Components should call services, not browser globals or low-level storage directly, unless the component is specifically a boundary component.

Recommended ownership:

```text
src/app/extension/
  Chrome runtime bridge and extension message handling.

src/app/strava/
  Strava session checks, fetch calls, response types, and normalizers.

src/app/sync/
  Sync orchestration, progress state, route queues, backoff, and sync result persistence.

src/app/storage/
  Dexie database, repositories, local backup/restore, and sync summaries.

src/app/shared/
  Truly shared UI, formatters, activity display helpers, and simple cross-feature services.
```

Avoid service objects that become catch-all coordinators. If a service handles fetching, normalization, queueing, persistence, progress, and UI messaging, split it.

## Storage Rules

Trailroam stores user activity data locally in IndexedDB through Dexie.

Rules:

- Storage model fields are compatibility boundaries. Do not rename them casually.
- Table names and schema versions are compatibility boundaries.
- Repository consumers should use repository methods instead of direct Dexie table access.
- Direct Dexie access should stay in `src/app/storage/`.
- Repository injection should share the same `TrailroamDatabase` instance used by direct database injection.
- Backup restore should validate data before writing records.

When changing storage:

1. Read `src/app/storage/storage.models.ts`.
2. Read `src/app/storage/db.ts`.
3. Update repository tests or storage service tests.
4. Run `npm run typecheck`.

## Sync Rules

Sync code is easy to make misleading. Keep counters and failure states precise.

Rules:

- Per-run results should report work done in the current run, not total records already in the database.
- Pagination failures should not silently become successful syncs.
- Rate limiting should be represented explicitly.
- Cancellation should persist a clear cancelled state.
- Route fetch concurrency should stay conservative unless a task explicitly asks to change it.

Recommended split:

- activity page fetch/import orchestration
- route queue and backoff orchestration
- progress state
- sync-state persistence
- sync history recording

## Chrome Extension Boundary

Chrome runtime messaging is a boundary concern.

Rules:

- Do not parse raw Chrome runtime messages in page components.
- Keep extension message names stable.
- Put runtime listener setup and message routing in an extension bridge service.
- Use mocked Chrome APIs in tests.
- Keep `public/background.js` and `public/content-script.js` compatible with existing message names unless explicitly asked to change them.

Important message names include:

- `TRAILROAM_GET_MISSING_ACTIVITIES`
- `TRAILROAM_GET_SYNCED_IDS`
- `TRAILROAM_STORE_ACTIVITIES`
- `TRAILROAM_SYNC_DONE`

## Shared Formatting and Display

Do not duplicate display helpers in components.

Use shared modules for:

- distance formatting
- duration formatting
- speed formatting
- elevation formatting
- date/date-input formatting
- computed speed fallback
- sport emoji mapping

Recommended folders:

```text
src/app/shared/formatters/
src/app/shared/activity-display/
```

Preserve existing strings unless the task explicitly asks to fix inconsistent formatting. Formatting utilities should have focused tests for undefined/zero values and normal values.

## Logging

Production code should not emit noisy routine logs.

Rules:

- Remove temporary trace logs before completing a task.
- Debug logs should be gated by environment/config.
- Keep real failure diagnostics visible.
- Do not add a third-party logger unless explicitly requested.

Good examples:

- `console.error` for real unrecoverable failures at boundary points.
- Debug logger calls that are disabled in production.

Bad examples:

- Permanent `[TRACE]` logs.
- Routine `console.log` on every map render, route retry, parser step, or extension message.

## Testing

Default verification:

```sh
npm run typecheck
```

Run relevant specs for the area you changed. Add focused tests when changing:

- shared formatters
- storage validation
- sync counters
- route sync behavior
- extension message handling
- Strava normalizers

Do not mark work complete if typecheck or relevant tests fail. If a known unrelated failure blocks verification, document the exact diagnostic.

## Test Layers and When They Run

Trailroam should use multiple verification layers with different costs.

### Typecheck

Run on every code change and in CI:

```sh
npm run typecheck
```

This catches TypeScript and Angular template errors.

### Unit Tests

Run on every code change and in CI:

```sh
npm test
```

Unit tests should cover isolated functions, services, normalizers, repositories, and small component behavior.

### Service Integration Tests

Service integration tests should run with the normal test command once added.

They should use fake IndexedDB and mocked Strava/Chrome APIs. They must not make network calls or depend on real browser extension state.

They should cover:

- repository and Dexie behavior
- backup/restore round trips
- route sync persistence
- sync counters and failure states
- extension bridge message handling

### Browser / E2E Smoke Tests

Run before release or PR merge, not on every normal build:

```sh
npm run test:e2e
```

These should cover only stable app flows:

- app shell loads
- navigation works
- empty states render
- import dialog opens
- map page does not crash

Do not use E2E tests for pixel-perfect checks or real Strava integration.

### Build

Build should produce the extension artifact:

```sh
npm run build
```

Do not make `npm run build` run the full test suite by default. Use release checks for that.

### Recommended Commands

For normal development and CI:

```sh
npm run check
```

Expected meaning:

```sh
npm run typecheck && npm test
```

For release:

```sh
npm run check:release
```

Expected meaning:

```sh
npm run check && npm run test:e2e && npm run build
```

## Refactoring Workflow

Prefer this order:

1. Mechanical file split with no behavior change.
2. Extract child components with explicit inputs/outputs.
3. Extract duplicated helpers.
4. Move side effects into services.
5. Fix behavior bugs with tests.

Keep refactors and behavior fixes separate where practical. This makes review easier and reduces the chance of accidental UI or data changes.

## Checklist Before Finishing Work

- Did I keep behavior changes separate from structure changes?
- Did I avoid renaming compatibility boundaries?
- Did I remove temporary logs?
- Did I avoid duplicating formatters or emoji mappings?
- Did I keep direct storage access inside the storage layer?
- Did I keep browser globals behind a boundary service?
- Did I run `npm run typecheck` or document why it could not pass?
- Did I run relevant tests for the changed area?
