# Logbook Trail Detail Panel — Map Explorer Parity Plan

## Problem Summary

The logbook page trail detail panel inline in `ActivitiesPageComponent` is missing the interactive mini overview map and speed legend that the map explorer's standalone `TrailDetailPanelComponent` has. Previous attempt failed because:

1. **Map never initializes**: `afterNextRender()` fires once at construction time, but the `#trailMiniMapContainer` element is inside `@if (selectedTrail())` which is initially `false`. The element doesn't exist yet, so `viewChild` returns `undefined`.
2. **Compressed CSS changed values**: `#ffffff` → `#fff`, removed bottom padding values, etc.

## Files to Modify

Only 3 files, all in `src/app/activities/`:

### 1. `activities-page.component.ts` — Add map logic

**Current state:** Has all the map signals and methods from my previous attempt, but the init lifecycle is wrong.

**Required changes from current code:**

#### Fix map initialization lifecycle (lines 1093-1101)

Replace the current:

```typescript
afterNextRender(() => this.initTrailMiniMap());

effect(() => {
  this.selectedTrail();
  if (this.trailMapReady() && this.trailMapInstance) {
    this.renderTrailMiniMapRoutes();
  }
});
```

With:

```typescript
effect(() => {
  const trail = this.selectedTrail();
  const ready = this.trailMapReady();

  if (trail && !ready) {
    // Element just appeared in DOM; wait a tick for Angular to render it
    setTimeout(() => this.initTrailMiniMap(), 0);
  }

  if (ready && this.trailMapInstance) {
    // Re-render when trail selection changes or routes need update
    this.renderTrailMiniMapRoutes();
  }
});
```

Also add a `DestroyRef` cleanup:

```typescript
// When trail is cleared, destroy the map
effect(() => {
  const trail = this.selectedTrail();
  if (!trail && this.trailMapReady()) {
    // Reset map state so it re-initializes when a new trail is selected
    this.destroyTrailMiniMap();
  }
});
```

#### Add `destroyTrailMiniMap()` method

```typescript
private destroyTrailMiniMap(): void {
  if (this.trailMapInstance) {
    this.trailMapInstance.remove();
    this.trailMapInstance = null;
  }
  this.trailMapReady.set(false);
  this.trailSpeedLegend.set(false);
  this.trailMapExpanded.set(false);
}
```

#### Fix `initTrailMiniMap()` to guard better

Currently it's:

```typescript
if (this.trailMapReady()) return;
const container = this.trailMiniMapContainer()?.nativeElement;
if (!container) return;
```

This is fine logic-wise but needs to work with the new effect-based lifecycle.

### 2. `activities-page.component.html` — Template

Add the mini overview map and speed legend sections between the header closing `</div>` and the scrollable body `<div class="tdp-body">`.

**Mini map section** (place after `<!-- ── Header ─────────────────────────────── -->` block, before `<!-- ── Scrollable body ────────────────────── -->`):

```html
<!-- ── Mini Overview Map (interactive) ───────── -->
<div class="tdp-minimap" [class.tdp-minimap--expanded]="trailMapExpanded()">
  <div
    #trailMiniMapContainer
    class="tdp-minimap__map"
    (click)="navigateToTrailOnMap(selTrail)"
  ></div>
  <div class="tdp-minimap__controls">
    <button
      class="tdp-minimap__btn"
      type="button"
      (click)="trailToggleMapExpand()"
      [attr.aria-label]="trailMapExpanded() ? 'Collapse map' : 'Expand map'"
      data-tooltip="Expand map"
    >
      {{ trailMapExpanded() ? '⤡' : '⤢' }}
    </button>
    <button
      class="tdp-minimap__btn"
      type="button"
      (click)="trailToggleLayerMenu($event)"
      aria-label="Switch map layer"
      data-tooltip="Switch basemap"
    >
      <app-icon name="layers" [size]="16" strokeWidth="2"></app-icon>
    </button>
    @if (trailLayerMenuOpen()) {
    <div class="tdp-layer-menu" (click)="$event.stopPropagation()">
      @for (p of AVAILABLE_PROVIDERS; track p.id) {
      <button
        class="tdp-layer-item"
        type="button"
        [class.active]="p.id === trailActiveLayerId()"
        (click)="trailSelectLayer(p)"
      >
        {{ p.label }} @if (p.id === trailActiveLayerId()) {
        <span> ✓</span>
        }
      </button>
      }
    </div>
    }
  </div>
</div>

@if (trailSpeedLegend()) {
<div class="tdp-speed-legend" aria-label="Route speed legend">
  <span>Slower</span>
  <svg class="tdp-legend-gradient" width="80" height="8" aria-hidden="true">
    <defs>
      <linearGradient id="tdp-speed-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#3b82c4" />
        <stop offset="25%" stop-color="#78c679" />
        <stop offset="50%" stop-color="#1f6f50" />
        <stop offset="75%" stop-color="#d9a23d" />
        <stop offset="100%" stop-color="#b8433a" />
      </linearGradient>
    </defs>
    <rect width="80" height="8" rx="4" fill="url(#tdp-speed-grad)" />
  </svg>
  <span>Faster</span>
</div>
}
```

### 3. `activities-page.component.scss` — Visual Parity

Copy the EXACT styles from `src/app/map/trail-detail-panel.component.scss` for:

- `.tdp-minimap` (including `--expanded`, `__map`, `__controls`, `__btn`)
- `.tdp-layer-menu` and `.tdp-layer-item`
- `.tdp-speed-legend` and `.tdp-legend-gradient`
- `.tdp-minimap__map .maplibregl-ctrl-top-left` overrides (note: use non-`:host ::ng-deep` selectors since this isn't the map component's own `:host`)

**Important:** Use the EXACT same values as the map's `trail-detail-panel.component.scss`:

- `background: #ffffff` (not `#fff`)
- `padding: 6px 16px 6px` (not `6px 16px`)
- `border: 2px solid #1f6f50` (not changed)
- `transition:` multi-line values preserved
- All `:host ::ng-deep` selectors converted to plain class selectors (since the logbook panel is inside the page, not a component's `:host`)

**CRITICAL:** Do NOT change or compress any existing styles. Keep the existing `.tdp-header`, `.tdp-timeline`, `.tdp-insights`, `.tdp-footer`, `.tdp-body`, `.tdp-section-title`, `.trail-panel-backdrop`, `.trail-detail-panel` styles EXACTLY as they were in the original file before any modifications. If budget is an issue, adjust `angular.json` budget instead.

### 4. `angular.json` — Budget

If the total SCSS exceeds 28kB, increase the `anyComponentStyle` error budget to 32kB (as already done).

## Execution Order

1. **Revert** the SCSS compression changes — restore the original multiline formatting of existing `.tdp-*` and `.trail-*` styles
2. **Add** the new mini map + speed legend styles with exact values from `trail-detail-panel.component.scss`
3. **Fix** the map initialization lifecycle in the TS file
4. **Verify** with `npm run typecheck` and `npm run build`
