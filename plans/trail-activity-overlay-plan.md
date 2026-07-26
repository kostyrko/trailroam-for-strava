# Trail → Activity Detail Panel Overlay Plan

## Rephrased Requirements

**User statement:**
_"When I click on an activity in the trail detail panel's itinerary, the activity detail panel should open on top of the trail detail panel (overlaying it). When I close the activity detail panel, the trail detail panel should still be visible underneath. But when I click an activity from the left sidebar, the trail detail panel should close entirely."_

### Three Rules

| #   | Action                                   | Current                              | Desired                                             |
| --- | ---------------------------------------- | ------------------------------------ | --------------------------------------------------- |
| 1   | Click itinerary item in trail panel      | Activity **replaces** trail in panel | Activity **overlays** trail; trail stays underneath |
| 2   | Close activity panel (opened from trail) | Both panels close                    | Only activity closes; trail **remains open**        |
| 3   | Click activity from left sidebar         | Activity replaces whatever was open  | Same — but trail panel should **close**             |

---

## User Scenarios

### Scenario A: Trail → Activity drill-down (overlay)

```
1. User opens trail "Tatra Traverse" from left panel
   → detail-panel-wrapper opens → trail-detail-panel visible

2. User clicks a hike in the trail itinerary
   → trail-detail-panel stays rendered underneath
   → activity-detail-panel slides in ON TOP as overlay
   → "Back to Tatra Traverse" button visible in activity header
   → map zooms to selected activity

3. User clicks × on activity panel
   → activity overlay closes (slides out)
   → trail-detail-panel remains fully visible
   → map zooms back to full trail bounds

4. User clicks "Back to Tatra Traverse" button
   → same as step 3 + restores trail scroll position
```

### Scenario B: Sidebar activity (no trail)

```
1. User has trail-detail-panel open

2. User clicks a standalone activity from left sidebar
   → trail closes (selectedTrailId cleared)
   → activity panel opens in standalone mode (no overlay)
   → "Back to Trail" button NOT present

3. User closes activity panel → everything closes
```

### Scenario C: Edge cases

```
1. Trail open + activity overlay shown
   User clicks DIFFERENT itinerary item
   → overlay switches to new activity (trailViewState updates)
   → map zooms to new activity

2. Trail open + activity overlay shown
   User clicks standalone activity in sidebar
   → trail closes (Scenario B)
   → activity replaces everything
```

---

## Implementation Plan

### Files to change

| File                                  | Changes                                                 |
| ------------------------------------- | ------------------------------------------------------- |
| `src/app/map/map-page.component.ts`   | Add `trailDrillDownActive` signal; update close handler |
| `src/app/map/map-page.component.html` | Render both panels simultaneously; add overlay wrapper  |
| `src/app/map/map-page.component.scss` | Add overlay CSS class                                   |

### Step 1: Add `trailDrillDownActive` signal (`map-page.component.ts`)

```typescript
/** True when the user opened an activity from within a trail (drill-down overlay mode). */
private readonly trailDrillDownActive = signal(false);
```

The signal is `true` when an activity was opened via `onTrailSelectActivity()`.
It is set to `false` when:

- The drill-down activity is closed (× or "Back to Trail")
- A sidebar activity is selected
- The trail is cleared entirely

### Step 2: Update `onTrailSelectActivity` (`map-page.component.ts`)

```typescript
protected onTrailSelectActivity(route: MapRouteFeature): void {
  const el = document.querySelector('.tdp-body');
  this.trailViewState.set({
    scrollTop: el?.scrollTop ?? 0,
    selectedActivityId: route.activityId,
  });
  this.routeRendererService.clearEmphasis();
  this.selectRoute(route);
  this.onPanelSelectRoute(route);
  // Signal that we're in drill-down mode
  this.trailDrillDownActive.set(true);
}
```

### Step 3: Add `onCloseDrillDown` handler (`map-page.component.ts`)

```typescript
/** Called when the user closes the activity overlay opened from a trail. */
protected onCloseDrillDown(): void {
  this.trailDrillDownActive.set(false);
  this.clearSelectedRoute();
  // Re-fit map to trail bounds
  const trailId = this.selectedTrailId();
  if (trailId) {
    const trail = this.trailsService.trails().find((t) => t.id === trailId);
    if (trail) {
      const trailRoutes = this.allRoutes().filter((r) =>
        trail.activityIds.includes(r.activityId),
      );
      const allCoords = trailRoutes.flatMap((r) => r.coordinates);
      if (allCoords.length > 0) {
        this.fitToTrailBoundsWithRetry(allCoords);
      }
    }
  }
}
```

### Step 4: Update `onBackToTrail` (`map-page.component.ts`)

Already exists — it already restores scroll and re-selects trail. Just add `trailDrillDownActive.set(false)` at the end.

```typescript
protected onBackToTrail(): void {
  const state = this.trailViewState();
  if (!state) return;
  const trailId = this.trailsService.trails()
    .find((t) => t.activityIds.includes(state.selectedActivityId ?? ''))?.id;
  if (trailId) {
    this.selectTrail(trailId);
    setTimeout(() => {
      const el = document.querySelector('.tdp-body');
      if (el) el.scrollTop = state.scrollTop;
    }, 0);
  }
  this.trailViewState.set(null);
  this.trailDrillDownActive.set(false);
  this.clearSelectedRoute();
}
```

### Step 5: Clear drill-down when sidebar activity is selected

In `onPanelSelectRoute` or wherever sidebar clicks are handled, add:

```typescript
// If a sidebar activity is selected while trail overlay is active, close the trail
if (this.trailDrillDownActive()) {
  this.trailDrillDownActive.set(false);
  this.selectedTrailId.set(null);
}
```

### Step 6: HTML — render both panels (`map-page.component.html`)

Change the current `@if/@else` to render both panels when appropriate:

```html
<div
  class="detail-panel-wrapper"
  [class.detail-panel-wrapper--open]="detailPanelOpen()"
  [class.detail-panel-wrapper--expanded]="detailPanelOpen() && detailPanelExpanded()"
>
  @if (detailPanelOpen()) {
  <!-- ── Trail panel (always rendered when trail is selected) ── -->
  @if (selectedTrailId(); as trailId) { @let trail = getSidebarTrail(trailId); @if (trail) {
  <app-trail-detail-panel
    [trail]="trail"
    [allRoutes]="allRoutes()"
    (selectActivity)="onTrailSelectActivity($event)"
    (close)="closeDetailPanel(); clearSelectedTrail()"
  />
  } }

  <!-- ── Activity panel (standalone or drill-down overlay) ── -->
  @if (selectedRoute()?.activity ?? null; as activity) { @if (!selectedTrailId() ||
  trailDrillDownActive()) {
  <div class="detail-panel-overlay" [class.detail-panel-overlay--active]="trailDrillDownActive()">
    <app-activity-detail-panel
      [activity]="activity"
      [route]="detailPanelRoute()"
      [pushMode]="!trailDrillDownActive()"
      [showInActivities]="true"
      [backLabel]="trailDrillDownActive() ? trailBackLabel() : null"
      (backToTrail)="onBackToTrail()"
      (panelExpand)="detailPanelExpanded.set($event)"
      (close)="trailDrillDownActive() ? onCloseDrillDown() : closeDetailPanel(); clearSelectedRoute()"
    />
  </div>
  } } }
</div>
```

### Step 7: CSS — overlay styles (`map-page.component.scss`)

```scss
.detail-panel-wrapper {
  position: relative; /* ADD: anchor for absolute overlay */
  flex-shrink: 0;
  min-width: 0;
  overflow: hidden;
  transition: width 0.25s ease;
  width: 0;
}

.detail-panel-overlay {
  background: #ffffff;
  height: 100%;
  left: 0;
  position: absolute;
  top: 0;
  transform: translateX(100%);
  transition: transform 0.25s ease;
  width: 100%;
  z-index: 10;
}

.detail-panel-overlay--active {
  transform: translateX(0);
}
```

The overlay slides in from the right (matching the activity panel's own slide-in animation). The trail panel stays visible underneath. When active, the overlay sits with `z-index: 10`.

### Key behavioral logic

| Trigger                | `trailDrillDownActive` | `selectedTrailId` | `selectedMapRoute` | Result                               |
| ---------------------- | ---------------------- | ----------------- | ------------------ | ------------------------------------ |
| Open trail             | `false`                | set               | `null`             | Trail panel visible                  |
| Click itinerary item   | `true`                 | set               | set                | Trail + activity overlay             |
| × close drill-down     | `false`                | set               | `null`             | Only trail visible                   |
| "Back to Trail"        | `false`                | re-set            | `null`             | Only trail visible + scroll restored |
| Click sidebar activity | `false`                | `null`            | set                | Activity standalone (no overlay)     |
| × close standalone     | `false`                | `null`            | `null`             | Nothing (wrapper closes)             |

---

## Tests

### Unit tests for `map-page.component.ts`

1. **`trailDrillDownActive` starts as `false`**
2. **`onTrailSelectActivity` sets `trailDrillDownActive` to `true`**
3. **`onCloseDrillDown` sets `trailDrillDownActive` to `false` and keeps `selectedTrailId`**
4. **`onBackToTrail` sets `trailDrillDownActive` to `false` and clears `selectedMapRoute`**
5. **Sidebar activity selection clears `selectedTrailId` and `trailDrillDownActive`**

### Component tests for `map-page.component.html`

6. **Renders trail panel when only `selectedTrailId` is set**
7. **Renders both trail and activity panels when `trailDrillDownActive` is `true`**
8. **Renders only activity panel when `selectedTrailId` is null and route is set**
9. **`.detail-panel-overlay` has `.detail-panel-overlay--active` class when `trailDrillDownActive` is `true`**
10. **`.detail-panel-overlay` does NOT have `--active` class when `trailDrillDownActive` is `false`**
