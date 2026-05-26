import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Routes } from '@angular/router';
import { map } from 'rxjs';

@Component({
  selector: 'app-activities-page',
  template: `
    <section class="route-page" aria-labelledby="activities-title">
      <p class="eyebrow">Activities</p>
      <h1 id="activities-title">Activities</h1>
      <p>Imported Strava activities will appear here.</p>
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
      <p>Synced activity routes will render on the map here.</p>

      @if (selectedActivityId()) {
        <p class="route-state">Selected activity: {{ selectedActivityId() }}</p>
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

  protected readonly selectedActivityId = computed(() => this.activityId());
}

@Component({
  selector: 'app-settings-page',
  template: `
    <section class="route-page" aria-labelledby="settings-title">
      <p class="eyebrow">Settings</p>
      <h1 id="settings-title">Settings</h1>
      <p>Local extension settings will be configured here.</p>
    </section>
  `,
})
export class SettingsPage {}

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
