import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Routes } from '@angular/router';
import { map } from 'rxjs';
import { LocalDataService } from './storage/local-data.service';

@Component({
  selector: 'app-activities-page',
  template: `
    <section class="route-page" aria-labelledby="activities-title">
      <p class="eyebrow">Activities</p>
      <h1 id="activities-title">Activities</h1>

      <article class="empty-state" aria-labelledby="activities-empty-title">
        <p class="empty-state-kicker">No activities yet</p>
        <h2 id="activities-empty-title">Sync new activities to start building your local history.</h2>
        <p>
          Trailroam will show imported Strava activities here after the first successful sync.
        </p>
        <button class="primary-action" type="button">Sync new activities</button>
      </article>
    </section>
  `,
})
export class ActivitiesPage {}

@Component({
  selector: 'app-map-page',
  template: `
    <section class="route-page" aria-labelledby="map-title">
      <p class="eyebrow">Map</p>
      <h1 id="map-title">Map</h1>

      @if (selectedActivityId()) {
        <p class="route-state">Selected activity: {{ selectedActivityId() }}</p>
      }

      @if (hasBasemapError()) {
        <article class="empty-state warning-state" aria-labelledby="basemap-error-title" role="alert">
          <p class="empty-state-kicker">Basemap unavailable</p>
          <h2 id="basemap-error-title">The map background could not load.</h2>
          <p>
            Your local activities and routes are unaffected. Check your connection and try loading the map again.
          </p>
          <button class="primary-action" type="button">Retry map load</button>
        </article>
      } @else {
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
})
export class MapPage {
  private readonly route = inject(ActivatedRoute);
  private readonly activityId = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('activityId'))),
    { initialValue: null },
  );
  private readonly basemapError = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('basemapError') === 'true')),
    { initialValue: false },
  );

  protected readonly selectedActivityId = computed(() => this.activityId());
  protected readonly hasBasemapError = computed(() => this.basemapError());
}

@Component({
  selector: 'app-settings-page',
  template: `
    <section class="route-page" aria-labelledby="settings-title">
      <p class="eyebrow">Settings</p>
      <h1 id="settings-title">Settings</h1>
      <p>Manage local extension data stored in this browser.</p>

      <article class="empty-state danger-state" aria-labelledby="clear-local-data-title">
        <p class="empty-state-kicker">Local data</p>
        <h2 id="clear-local-data-title">Clear synced local data</h2>
        <p>
          This removes imported activities, routes, and sync state from this browser. Settings and access state are kept.
        </p>
        <button
          class="danger-action"
          type="button"
          [disabled]="isClearingLocalData()"
          (click)="clearSyncedLocalData()"
        >
          {{ isClearingLocalData() ? 'Clearing local data...' : 'Clear synced local data' }}
        </button>

        @if (clearLocalDataStatus()) {
          <p class="route-state" role="status">{{ clearLocalDataStatus() }}</p>
        }
      </article>
    </section>
  `,
})
export class SettingsPage {
  private readonly localDataService = inject(LocalDataService);

  protected readonly isClearingLocalData = signal(false);
  protected readonly clearLocalDataStatus = signal<string | null>(null);

  protected async clearSyncedLocalData(): Promise<void> {
    const confirmed = window.confirm(
      'This will delete imported activities and routes from this browser. It will not delete anything from Strava.',
    );

    if (!confirmed) {
      return;
    }

    this.isClearingLocalData.set(true);
    this.clearLocalDataStatus.set(null);

    try {
      await this.localDataService.clearSyncedLocalData();
      this.clearLocalDataStatus.set('Imported activities, routes, and sync state were cleared.');
    } finally {
      this.isClearingLocalData.set(false);
    }
  }
}

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'map',
  },
  {
    path: 'activities',
    component: ActivitiesPage,
  },
  {
    path: 'map',
    component: MapPage,
  },
  {
    path: 'settings',
    component: SettingsPage,
  },
  {
    path: '**',
    redirectTo: 'map',
  },
];
