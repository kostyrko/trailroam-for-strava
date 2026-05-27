import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { MapLibreMapComponent } from './maplibre-map.component';
import { MOCK_ROUTES, type MockRoute } from './mock-routes';

@Component({
  selector: 'app-map-page',
  imports: [MapLibreMapComponent],
  template: `
    <section class="route-page" aria-labelledby="map-title">
      <p class="eyebrow">Map</p>
      <h1 id="map-title">Map</h1>

      @if (hasBasemapError()) {
        <article class="empty-state warning-state" aria-labelledby="basemap-error-title" role="alert">
          <p class="empty-state-kicker">Basemap unavailable</p>
          <h2 id="basemap-error-title">The map background could not load.</h2>
          <p>
            Your local activities and routes are unaffected. Check your connection and try loading the map again.
          </p>
          <button class="primary-action" type="button" (click)="retryBasemapLoad()">Retry map load</button>
        </article>
      } @else if (noRouteActivity()) {
        <article class="empty-state" aria-labelledby="no-route-title">
          <p class="empty-state-kicker">No route available</p>
          <h2 id="no-route-title">{{ noRouteActivityName() }} has no GPS route data.</h2>
          <p>
            This activity was recorded without GPS or the route data is not available.
          </p>
          <button class="secondary-action" type="button" (click)="clearSelectedActivity()">
            Browse all activities
          </button>
        </article>
      } @else {
        <app-maplibre-map
          (basemapLoadFailed)="showBasemapError()"
          (routeSelected)="selectRoute($event)"
        />
      }

      @if (selectedRoute(); as route) {
        <article class="route-detail" aria-label="Selected route details">
          <div class="route-detail-header">
            <h2 class="route-detail-title">{{ route.name }}</h2>
            <button class="detail-close" type="button" (click)="clearSelectedRoute()" aria-label="Clear selected route">
              Close
            </button>
          </div>
          <p class="route-detail-coords">{{ route.coordinates.length }} GPS points</p>
        </article>
      }

      @if (!hasBasemapError() && !noRouteActivity() && !selectedRoute() && !selectedActivityId()) {
        <article class="empty-state" aria-labelledby="map-empty-title">
          <p class="empty-state-kicker">No routes yet</p>
          <h2 id="map-empty-title">Synced GPS routes will appear here.</h2>
          <p>
            Start a sync to import Strava activities and show available route lines on this map.
          </p>
          <button class="primary-action" type="button">Sync new activities</button>
        </article>
      }
    </section>
  `,
  styles: [`
    .route-detail {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 8px;
      margin-top: 24px;
      max-width: 480px;
      padding: 20px;
    }

    .route-detail-header {
      align-items: flex-start;
      display: flex;
      justify-content: space-between;
    }

    .route-detail-title {
      font-size: 1.25rem;
      margin: 0;
    }

    .detail-close {
      background: transparent;
      border: 1px solid #dce6df;
      border-radius: 6px;
      color: #314b3f;
      cursor: pointer;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      min-height: 32px;
      padding: 5px 11px;
      white-space: nowrap;
    }

    .detail-close:hover {
      background: #eef5f0;
    }

    .route-detail-coords {
      color: #63746a;
      font-size: 0.8125rem;
      margin: 12px 0 0;
    }
  `],
})
export class MapPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly activityIdParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('activityId'))),
    { initialValue: null },
  );
  private readonly basemapErrorParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('basemapError') === 'true')),
    { initialValue: false },
  );
  private readonly mapBasemapError = signal(false);
  protected readonly selectedMockRoute = signal<MockRoute | null>(null);

  protected readonly selectedActivityId = computed(() => this.activityIdParam());
  protected readonly hasBasemapError = computed(() => this.basemapErrorParam() || this.mapBasemapError());

  protected readonly selectedRoute = computed<MockRoute | null>(() => {
    const activityId = this.selectedActivityId();
    if (activityId) {
      return MOCK_ROUTES.find((r) => r.activityId === activityId) ?? null;
    }
    return this.selectedMockRoute();
  });

  protected readonly noRouteActivity = computed(() => {
    const activityId = this.selectedActivityId();
    return activityId !== null && !MOCK_ROUTES.some((r) => r.activityId === activityId);
  });

  protected readonly noRouteActivityName = computed(() => {
    return this.selectedActivityId() ?? 'Unknown';
  });

  constructor() {
    this.selectFromActivityId();
  }

  private selectFromActivityId(): void {
    const activityId = this.selectedActivityId();
    if (activityId) {
      const route = MOCK_ROUTES.find((r) => r.activityId === activityId);
      if (route) {
        this.selectedMockRoute.set(route);
      }
    }
  }

  protected showBasemapError(): void {
    this.mapBasemapError.set(true);
  }

  protected retryBasemapLoad(): void {
    this.mapBasemapError.set(false);
  }

  protected selectRoute(route: MockRoute): void {
    this.selectedMockRoute.set(route);
  }

  protected clearSelectedRoute(): void {
    this.selectedMockRoute.set(null);
    if (this.selectedActivityId()) {
      this.router.navigate(['/map']);
    }
  }

  protected clearSelectedActivity(): void {
    this.router.navigate(['/map']);
  }
}
