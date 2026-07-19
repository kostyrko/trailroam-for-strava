# PRD: Logbook Page — Tabbed Views

## Status: Draft

## Problem Statement

The Logbook page (formerly Activities) currently shows a single flat list of activities with filters (sport type, date range, source, name search). There is no way to view saved places in the Logbook — users must switch to the Map Explorer and select the Places tab to see their saved places.

Adding tabbed views (mirroring the Map Explorer's Activities / Places / All pattern) would create a consistent navigation pattern across the app and give users a dedicated place to browse saved places outside the map context.

## Goals

- Add an **Activities** tab (current default view — unchanged behavior)
- Add a **Places** tab showing saved places in a sortable/searchable list
- Add an **All** tab merging activities and places into a unified timeline
- Keep all existing functionality intact (filtering, sorting, pagination, selection, bulk actions, import, sync)
- Follow the same visual pattern as Map Explorer's tab switcher

## Non-Goals

- Rethinking the Logbook's existing filtering/sorting/selection system
- Adding map functionality to the Logbook
- Adding place management beyond what exists (edit/remove via existing dialogs)

## User Scenarios

### Scenario 1 — Browse saved places in Logbook

**Given** I have saved places,
**when** I navigate to the Logbook page and select the **Places** tab,
**then** I see a list of my saved places (name, secondary label, created date) sortable by name or date.

**And**
**when** I click a place row,
**then** the app navigates to the Map Explorer and flies to that place (reusing existing `onSelectPlace` behavior).

### Scenario 2 — Unified timeline

**Given** I have both activities and saved places,
**when** I select the **All** tab in the Logbook,
**then** I see a merged, reverse-chronological list of both activities and places.

**And**
**when** I click an activity row,
**then** it navigates to the Map Explorer or opens the existing detail panel.

**And**
**when** I click a place row,
**then** it navigates to the Map Explorer and flies to that place.

### Scenario 3 — Places actions

**Given** I am viewing the Places tab in the Logbook,
**when** I click the overflow menu on a place row,
**then** I see **Edit** and **Remove** options (same as the existing places panel).

**And**
**when** I select **Edit**,
**then** the existing `SavePlaceDialog` opens in edit mode.

**And**
**when** I select **Remove**,
**then** a confirmation dialog appears and the place is removed on confirmation.

## Design

### Tab Switcher

A segmented control at the top of the Logbook page, below the header row:

```
┌─────────────────────────────────────────────────┐
│  Logbook                                   🔒   │
├─────────────────────────────────────────────────┤
│  [Activities]  [Places]  [All]                  │
├─────────────────────────────────────────────────┤
│  (content changes based on selected tab)        │
└─────────────────────────────────────────────────┘
```

Style: Match the Map Explorer's `.map-panel-switcher__btn` pattern — three inline buttons, active state with green underline/background.

### Activities Tab (default)

No changes to the existing view. Shows the current activities table with all existing filters, toolbar, stats, pagination, and actions.

### Places Tab

A list of saved places with:

- Search field (filter by name / secondary label)
- Sort controls (name, date created)
- Each row shows: name, secondary label, created date, overflow menu (Edit / Remove)
- Empty state when no places exist: "No saved places yet. Save places from the Map Explorer."

### All Tab

A merged list combining activities and places, sorted by date descending:

- Activity rows look identical to the existing activity rows
- Place rows show: name, secondary label, a pin icon to differentiate from activities
- Same search / sort controls apply to both types
- Clicking a row navigates to Map Explorer (for both types)

## Component Changes

### `src/app/activities/activities-page.component.ts`

- Add `logbookView` signal: `'activities' | 'places' | 'all'` (default `'activities'`)
- Add `savedPlacesService` injection
- Add computed signals for filtered places
- For "All" view, merge activities + places into a unified sorted list
- Wire place selection to navigate to Map Explorer with `router.navigate`

### `src/app/activities/activities-page.component.html`

- Add tab switcher above the toolbar
- Conditional rendering: show existing content on Activities tab, places list on Places tab, merged list on All tab

### `src/app/map/saved-places.service.ts`

- Already provides `places()` signal — no changes needed

## Data Flow

```
Activities tab:
  activitiesService.activities() → existing filters → table

Places tab:
  savedPlacesService.places() → name/date search → sorted list

All tab:
  merge(activities, places) → sort by date → unified list
```

## State / Persistence

- The active tab does not need to persist across page loads (defaults to Activities).
- Place search/filter state does not need to persist.

## Dependencies

- `SavedPlacesService` (already available, injected at root)
- `MapPage` navigation already supports `focusActivityId` and `selectedPlaceId` query params

## Future Considerations

- Pagination for places (if the user has many saved places)
- Batch place operations (select multiple, remove in bulk)
- Drag-and-drop import of GPX files shown only on Activities tab
