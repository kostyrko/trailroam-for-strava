import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MapAllPanelComponent } from './map-all-panel.component';
import { type MapRouteFeature } from './mock-routes';
import type { ActivityRecord, SavedPlaceRecord } from '../storage/storage.models';

function makeActivity(id: string, name: string, startDate: string): ActivityRecord {
  return {
    id,
    provider: 'strava',
    providerActivityId: id.replace('strava:', ''),
    name,
    sportType: 'Ride',
    activityCategory: 'ride',
    startDate,
    distanceMeters: 10000,
    movingTimeSeconds: 1800,
    hasRoute: true,
    routeSyncStatus: 'route_synced',
    importedAt: startDate,
    updatedAt: startDate,
  };
}

function makeRoute(id: string, name: string, startDate: string): MapRouteFeature {
  const activity = makeActivity(id, name, startDate);
  return {
    activityId: id,
    activity,
    route: {
      activityId: id,
      providerActivityId: id,
      simplifiedCoordinates: [[19.9, 50.05]],
      simplifiedPointCount: 1,
      pointCount: 1,
      syncedAt: startDate,
      updatedAt: startDate,
    },
    coordinates: [[19.9, 50.05]],
    name,
    fullGeometryId: id,
  };
}

function makePlace(id: string, name: string, createdAt: string, secondaryLabel?: string): SavedPlaceRecord {
  const rec: SavedPlaceRecord = {
    id,
    name,
    latitude: 50.0614,
    longitude: 19.9372,
    createdAt,
    updatedAt: createdAt,
  };
  if (secondaryLabel) { rec.secondaryLabel = secondaryLabel; }
  return rec;
}

describe('MapAllPanelComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapAllPanelComponent],
    }).compileComponents();
  });

  function mount(routes: MapRouteFeature[], places: SavedPlaceRecord[]) {
    const fixture = TestBed.createComponent(MapAllPanelComponent);
    fixture.componentRef.setInput('routes', routes);
    fixture.componentRef.setInput('places', places);
    fixture.detectChanges();
    return fixture;
  }

  it('merges activities and places into one newest-first list', () => {
    const fixture = mount(
      [
        makeRoute('strava:old', 'Old ride', '2026-05-01T08:00:00.000Z'),
        makeRoute('strava:new', 'New ride', '2026-07-01T08:00:00.000Z'),
      ],
      [makePlace('place:mid', 'Zakopane', '2026-06-01T08:00:00.000Z')],
    );
    const c = fixture.componentInstance as any;

    // Newest activity first, then the place, then the older activity.
    const labels = c.filteredRows().map((r: any) =>
      r.kind === 'activity' ? r.route.activity.name : r.place.name,
    );
    expect(labels).toEqual(['New ride', 'Zakopane', 'Old ride']);
    expect(c.activityCount()).toBe(2);
    expect(c.placeCount()).toBe(1);
  });

  it('treats rows with no timestamp as oldest (sorted last)', () => {
    const fixture = mount(
      [makeRoute('strava:nodate', 'No date ride', '')],
      [makePlace('place:1', 'Kraków', '2026-07-01T00:00:00.000Z')],
    );
    const c = fixture.componentInstance as any;
    const order = c.filteredRows().map((r: any) => r.kind);
    // Dated place first, undated activity last.
    expect(order).toEqual(['place', 'activity']);
  });

  it('filters rows by activity name and place name', async () => {
    const fixture = mount(
      [makeRoute('strava:1', 'Morning Ride', '2026-07-01T00:00:00.000Z')],
      [makePlace('place:1', 'Zakopane', '2026-06-01T00:00:00.000Z', 'Polska')],
    );
    const c = fixture.componentInstance as any;

    c.onSearchInput('ride');
    await new Promise((r) => setTimeout(r, 200));
    expect(c.filteredRows()).toHaveLength(1);
    expect(c.filteredRows()[0].kind).toBe('activity');

    c.onSearchInput('Polska');
    await new Promise((r) => setTimeout(r, 200));
    expect(c.filteredRows()).toHaveLength(1);
    expect(c.filteredRows()[0].kind).toBe('place');
  });

  it('shows an empty state when there are no activities or places', () => {
    const fixture = mount([], []);
    const c = fixture.componentInstance as any;
    expect(c.filteredRows()).toHaveLength(0);
  });

  it('emits selectRoute / selectPlace / editPlace / removePlace', () => {
    const fixture = mount(
      [makeRoute('strava:1', 'Ride', '2026-07-01T00:00:00.000Z')],
      [makePlace('place:1', 'Kraków', '2026-06-01T00:00:00.000Z')],
    );
    const c = fixture.componentInstance as any;
    const route = c.routes()[0];
    const place = c.places()[0];

    const selRoute = vi.fn();
    const selPlace = vi.fn();
    const editPlace = vi.fn();
    const removePlace = vi.fn();
    c.selectRoute.subscribe(selRoute);
    c.selectPlace.subscribe(selPlace);
    c.editPlace.subscribe(editPlace);
    c.removePlace.subscribe(removePlace);

    c.onSelectActivity(route);
    c.onSelectPlace(place);
    c.onEditPlace(place, { stopPropagation: vi.fn() } as unknown as Event);
    c.onRemovePlace(place, { stopPropagation: vi.fn() } as unknown as Event);

    expect(selRoute).toHaveBeenCalledWith(route);
    expect(selPlace).toHaveBeenCalledWith(place);
    expect(editPlace).toHaveBeenCalledWith(place);
    expect(removePlace).toHaveBeenCalledWith(place);
  });

  it('toggles the place overflow menu and closes it after an action', () => {
    const fixture = mount([], [makePlace('place:1', 'Kraków', '2026-06-01T00:00:00.000Z')]);
    const c = fixture.componentInstance as any;
    const place = c.places()[0];
    const stopPropagation = vi.fn();

    c.toggleMenu('place:1', { stopPropagation } as unknown as Event);
    expect(c.openMenuId()).toBe('place:1');

    c.onEditPlace(place, { stopPropagation: vi.fn() } as unknown as Event);
    expect(c.openMenuId()).toBeNull();
  });
});
