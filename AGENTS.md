# Trailroam Coding Agent Guide

This file is the operating guide for LLM coding agents working in this repository. Follow it before making code changes.

For more explanation and human-facing guidance, read `docs/engineering-guide.md`.
For review expectations when reading or preparing changes, read `docs/code-review-guide.md`.

## Required Startup Procedure

Before making any code change:

1. Read this file completely.
2. If the task touches architecture, Angular components, sync, storage, extension messaging, or shared utilities, also read `docs/engineering-guide.md`. When preparing a change for review (or reviewing one), also read `docs/code-review-guide.md`.
3. State which files you inspected before editing.
4. Make the smallest behavior-preserving change that satisfies the task.
5. Run the required verification command or document why it failed.

## Project Shape

- This is an Angular standalone-component app packaged as a browser extension.
- Source lives mainly under `src/app/`.
- Extension runtime files live under `public/`.
- IndexedDB/Dexie storage code lives under `src/app/storage/`.
- Strava API and normalization code lives under `src/app/strava/`.
- Map code lives under `src/app/map/`.
- Activity list/detail code lives under `src/app/activities/`.

## Non-Negotiable Rules

- Do not change user-facing behavior during readability or structure refactors.
- Do not rename public routes, component selectors, storage table names, storage model fields, or extension message names unless explicitly requested.
- Do not disable TypeScript strictness or Angular strict template checks.
- Do not add a new framework, state-management library, logger package, date library, or schema-validation package unless explicitly requested.
- Do not delete tests.
- Do not hide failing tests or typecheck failures.
- Keep changes scoped to the requested task.

## Angular Component Rules

- Page, dialog, panel, table, map, and complex UI components should use external files:
  - `*.component.ts`
  - `*.component.html`
  - `*.component.scss`
- Inline templates/styles are acceptable only for small leaf components.
- Container components orchestrate data, routing, dialogs, persistence, and side effects.
- Child components should be mostly presentational and communicate through explicit inputs/outputs.
- Do not put repository calls, Chrome runtime calls, or Strava fetches inside presentational components.
- When splitting a component, first do a behavior-preserving file split. Extract child components only in a separate step.

## Service and Side-Effect Rules

- Browser/Chrome runtime APIs should go through an extension bridge service, not directly through feature components.
- Strava fetch/session logic belongs under `src/app/strava/`.
- Sync orchestration belongs under `src/app/sync/`.
- Storage access should go through repositories and storage services.
- Direct Dexie access should stay inside the storage layer.
- Repositories should share the injected database instance.

## Formatting and Display Rules

- Do not duplicate distance, duration, speed, elevation, date, or sport emoji helpers in components.
- Shared display helpers belong under:
  - `src/app/shared/formatters/`
  - `src/app/shared/activity-display/`
- Preserve existing output strings unless the task explicitly asks for a behavior fix.

## Logging Rules

- No noisy production `console.log` calls.
- Temporary trace logs must not remain in source.
- Real failures may use `console.error`, or a small project logger if one exists.
- Debug logs must be gated by environment/config.

## Testing and Verification

Run the narrowest useful verification after each change group.

Default checks:

```sh
npm run typecheck
```

Run relevant unit tests when behavior or shared helpers change. If a command fails, either fix the failure or document the exact diagnostic.

## Refactor Discipline

- Keep behavior-preserving refactors separate from behavior fixes.
- Prefer small, reviewable steps.
- Avoid moving files only for aesthetics.
- Do not create broad barrels that hide ownership.
- Avoid circular imports.
- Add tests before or alongside changes to shared behavior.

