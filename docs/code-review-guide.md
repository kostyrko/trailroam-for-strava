# Trailroam Code Review Guide

This guide describes how to review changes to Trailroam. It is the review counterpart to `docs/engineering-guide.md`: the engineering guide says how to write the code, this guide says what to check when reading someone else's change.

Use it for pull request reviews, diff reviews, and self-review before requesting review. It is intended for both human reviewers and LLM agents.

## Goals of Review

A good review on this project confirms that a change:

- preserves user-facing behavior unless the task explicitly asked to change it
- keeps compatibility boundaries intact
- respects ownership boundaries between domains
- keeps side effects behind services
- does not duplicate shared formatting or display logic
- keeps logging clean
- adds or updates tests where behavior changed
- is scoped to the task

Style nits (formatting, naming taste) are secondary. Block only on the items above.

## Review Severity

Use the following levels when leaving feedback:

- Blocker: a change that breaks a compatibility boundary, silently changes behavior, violates ownership boundaries, hides a failing test, or introduces a clear regression.
- Comment: a non-blocking concern such as a maintainability issue, a missed refactor opportunity, or a small clarity problem.

If a concern is not clearly blocking, prefer a comment and explain the trade-off rather than blocking the PR outright.

## Start Every Review With

1. Read the task description or PR to understand the intended change.
2. Read `AGENTS.md`.
3. If the change touches architecture, Angular components, sync, storage, extension messaging, or shared utilities, also read `docs/engineering-guide.md`.
4. Review the diff against the categories below.

## Review Workflow

A practical review usually follows this order:

1. Read the task description or PR context to understand the intended change.
2. Review the diff and identify which domain changed: Angular UI, storage, sync, Strava, extension messaging, or shared formatting.
3. Check the highest-risk areas first: compatibility boundaries, behavior preservation, and ownership boundaries.
4. Verify the change with evidence: typecheck and relevant tests should be run, and the PR should point to the exact commands and outcomes.
5. Leave concise, actionable feedback that explains whether the issue is a blocker or a comment.

## Compatibility Boundaries

These are the highest-priority checks. A change that silently breaks one of these is a blocker even if tests pass.

Flag any change that:

- renames a public route or component selector
- renames a Dexie table, changes a schema version, or renames a storage model field
- renames or changes the payload shape of an extension message
- changes the on-disk format of stored data without a migration
- changes a shared formatter's output string

Watch for these message names in particular:

- `TRAILROAM_GET_MISSING_ACTIVITIES`
- `TRAILROAM_GET_SYNCED_IDS`
- `TRAILROAM_STORE_ACTIVITIES`
- `TRAILROAM_SYNC_DONE`

If a PR must change a compatibility boundary, it should say so explicitly and update every consumer, including `public/background.js` and `public/content-script.js`.

## Behavior Preservation

Trailroam separates refactors from behavior fixes. A review should confirm which kind of change is in front of it.

For a refactor:

- output strings must be byte-identical (distances, durations, speeds, elevations, dates, emojis)
- the set of rendered UI states must be unchanged
- no new or removed side effects
- no new or removed network or storage calls

For a behavior fix:

- the fix should be isolated and described in the PR
- it should not bundle unrelated refactors
- it should add or update a test that would have caught the bug

If a "refactor" changes a user-visible string, an error message, or a counter value, ask for it to be split out or justified.

## Angular Structure

Check that:

- page, dialog, panel, table, map, and complex UI components use external `.component.ts` / `.component.html` / `.component.scss` files
- inline templates and styles are only used for small leaf components
- container components own data loading, repository calls, router/query-param coordination, dialogs, and sync triggers
- presentational components stay presentational: they render, hold local UI-only state, and communicate through inputs/outputs
- presentational components do not call repositories, the Chrome runtime, or Strava services

A child component that imports from `src/app/storage/`, `src/app/strava/`, or `src/app/sync/` is a smell unless it is a deliberate boundary component.

A component split should land as a mechanical file move first, with child extraction as a separate change. Flag PRs that mix the two.

## Services and Side Effects

Check that:

- browser globals and Chrome runtime calls go through an extension bridge service, not feature components
- Strava fetch and session logic lives under `src/app/strava/`
- sync orchestration lives under `src/app/sync/`
- storage access goes through repositories and storage services
- direct Dexie access stays inside `src/app/storage/`
- repositories share the injected `TrailroamDatabase` instance

Flag services that are growing into catch-all coordinators. A service doing fetching, normalization, queueing, persistence, progress, and UI messaging at once is a review concern even if it works.

## Storage

For changes under `src/app/storage/`, check:

- repository consumers use repository methods, not direct table access
- direct Dexie access is confined to the storage layer
- backup restore validates data before writing records
- schema changes are accompanied by a version bump and migration where needed
- repository tests are updated

Confirm the author ran `npm run typecheck` after touching `src/app/storage/storage.models.ts` or `src/app/storage/db.ts`.

## Sync

Sync counters and failure states are easy to make misleading. Check carefully:

- per-run results report work done in this run, not total records already in the database
- pagination failures are not silently turned into successful syncs
- rate limiting is represented explicitly
- cancellation persists a clear cancelled state
- route fetch concurrency is conservative and unchanged unless the task asked for it

If a sync change alters what "success" means, it must be called out in the PR and covered by a test.

## Chrome Extension Boundary

Check that:

- raw Chrome runtime messages are not parsed in page components
- message routing lives in an extension bridge service
- extension message names are stable
- tests use mocked Chrome APIs, not real runtime calls
- `public/background.js` and `public/content-script.js` stay compatible with existing message names

## Formatting and Display

Check that:

- distance, duration, speed, elevation, date, and sport-emoji helpers come from `src/app/shared/formatters/` or `src/app/shared/activity-display/`
- no new copy of an existing formatter appears inside a component
- output strings are preserved unless the task explicitly asks to change them

A new helper in a component that looks like an existing shared helper is a blocker. Ask the author to reuse or extend the shared one.

## Logging

Check that:

- no new routine `console.log` calls are added in production paths
- no temporary `[TRACE]` or debug logs remain
- real failure diagnostics use `console.error` or the project logger
- any added debug logging is gated by environment/config
- no new third-party logger was introduced without an explicit request

## Tests

A task is not ready for review until it has tests at the layers the change touches. Trailroam has three test layers (see `docs/engineering-guide.md` → "Test Layers and When They Run"). A change should be covered at each layer that applies:

- **Unit** (`npm test`): isolated functions, services, normalizers, repositories, and small component behavior. Required for every behavior change. Focused tests are mandatory for changes to shared formatters, storage validation, sync counters, route sync behavior, extension message handling, or Strava normalizers.
- **Service integration**: repository/Dexie behavior, backup/restore round trips, route sync persistence, sync counters/failure states, and extension bridge message handling — run against fake IndexedDB and mocked Strava/Chrome APIs. Required when a change touches those areas.
- **E2E smoke** (`npm run test:e2e`, run before PR merge/release): stable app flows only — app shell loads, navigation, empty states, import dialog opens, map page does not crash. E2E is a smoke layer; do not require pixel-perfect or real-Strava coverage, but do require it to pass for the affected flow before merge.

Confirm:

- typecheck passes (`npm run typecheck`)
- tests exist at every layer the change touches (unit and integration for behavior; e2e smoke for the affected flow)
- relevant unit and integration tests pass and were updated for changed behavior
- e2e smoke for the affected flow passes (or is documented as deferred with a reason)
- no tests were deleted or marked skipped to make the suite green
- no failing test or typecheck failure was hidden

If the PR claims "tests pass", ask for the exact command and output or the relevant CI evidence. A review should be based on evidence, not assumptions. If a relevant layer is missing or a relevant spec was not run, treat the task as not ready and ask for the missing coverage.

## Definition of Ready

A task is ready to merge only when, in addition to the rest of this guide:

- unit tests exist and pass for the changed behavior
- service integration tests exist and pass for any changed repository, sync, storage, or extension-bridge behavior
- e2e smoke for the affected flow passes (or is explicitly deferred with a reason)

## Scope and Commit Hygiene

Check that:

- the change stays within the requested task
- unrelated reformatting, renames, or dependency bumps are not mixed in
- refactors and behavior fixes are in separate commits or PRs where practical
- no broad barrel files were created that hide ownership
- no circular imports were introduced

## Common Blockers (Quick Reference)

- silent change to a compatibility boundary
- behavior change disguised as a refactor
- duplicated formatter or emoji mapping
- presentational component calling a repository, Strava, or Chrome API
- direct Dexie access outside `src/app/storage/`
- sync counter that re-defines "success"
- leftover debug log
- deleted or skipped test
- missing tests at a layer the change touches (unit / integration / e2e)
- missing typecheck or missing relevant test run

## Reviewer Checklist

Before approving, confirm:

- [ ] I read the task/PR description and `AGENTS.md`
- [ ] I read `docs/engineering-guide.md` for architectural changes
- [ ] No compatibility boundary was silently changed
- [ ] Behavior changes are separated from refactors and described
- [ ] Ownership boundaries are respected (Angular, services, storage, sync, extension)
- [ ] No duplicated formatting or display logic
- [ ] No new routine logs; no leftover trace logs
- [ ] `npm run typecheck` passes
- [ ] Unit tests exist and pass for changed behavior
- [ ] Service integration tests exist and pass where the change touches repositories, sync, storage, or the extension bridge
- [ ] E2E smoke for the affected flow passes (or is deferred with a reason)
- [ ] Change is scoped to the task
