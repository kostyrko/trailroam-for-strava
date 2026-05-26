import { InjectionToken } from '@angular/core';
import { TrailroamDatabase } from '../db';
import { createRepositories, type TrailroamRepositories } from './index';

export const TRAILROAM_REPOSITORIES = new InjectionToken<TrailroamRepositories>(
  'Trailroam IndexedDB repositories',
  {
    providedIn: 'root',
    factory: () => createRepositories(new TrailroamDatabase()),
  },
);
