import { Routes } from '@angular/router';
import { ActivitiesPageComponent } from './activities/activities-page.component';
import { MapPage } from './map/map-page.component';
import { SettingsPage } from './shared/settings-page.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'map',
  },
  {
    path: 'activities',
    component: ActivitiesPageComponent,
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
