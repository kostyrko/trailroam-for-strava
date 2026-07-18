import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MapPlacesPanelComponent } from './map-places-panel.component';
import type { SavedPlaceRecord } from '../storage/storage.models';

function makePlace(id: string, name: string, secondaryLabel?: string): SavedPlaceRecord {
  const rec: SavedPlaceRecord = {
    id,
    name,
    latitude: 50.0614,
    longitude: 19.9372,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  };
  if (secondaryLabel) { rec.secondaryLabel = secondaryLabel; }
  return rec;
}

describe('MapPlacesPanelComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapPlacesPanelComponent],
    }).compileComponents();
  });

  it('renders the place count in the header', () => {
    const fixture = TestBed.createComponent(MapPlacesPanelComponent);
    fixture.componentRef.setInput('places', [makePlace('p1', 'Kraków'), makePlace('p2', 'Zakopane')]);
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    // The computed list mirrors the input when no search is active.
    expect(c.filteredPlaces()).toHaveLength(2);
  });

  it('shows the empty state when there are no saved places', () => {
    const fixture = TestBed.createComponent(MapPlacesPanelComponent);
    fixture.componentRef.setInput('places', []);
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    expect(c.filteredPlaces()).toHaveLength(0);
  });

  it('filters places by name and secondary label', async () => {
    const fixture = TestBed.createComponent(MapPlacesPanelComponent);
    fixture.componentRef.setInput('places', [
      makePlace('p1', 'Kraków', 'Małopolska, Polska'),
      makePlace('p2', 'Zakopane', 'Polska'),
    ]);
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    c.onSearchInput('Polska');
    await new Promise((r) => setTimeout(r, 200));
    expect(c.filteredPlaces().map((p: SavedPlaceRecord) => p.id)).toEqual(['p1', 'p2']);

    c.onSearchInput('Krak');
    await new Promise((r) => setTimeout(r, 200));
    expect(c.filteredPlaces().map((p: SavedPlaceRecord) => p.id)).toEqual(['p1']);
  });

  it('emits selectPlace when a row is selected', () => {
    const fixture = TestBed.createComponent(MapPlacesPanelComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    const place = makePlace('p1', 'Kraków');
    const emitted = vi.fn();
    c.selectPlace.subscribe(emitted);
    c.onSelectPlace(place);
    expect(emitted).toHaveBeenCalledWith(place);
  });

  it('emits editPlace from the overflow menu and closes the menu', () => {
    const fixture = TestBed.createComponent(MapPlacesPanelComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    const place = makePlace('p1', 'Kraków');
    const emitted = vi.fn();
    c.editPlace.subscribe(emitted);
    const stopPropagation = vi.fn();
    c.openMenuId.set('p1');
    c.onEditPlace(place, { stopPropagation } as unknown as Event);
    expect(emitted).toHaveBeenCalledWith(place);
    expect(stopPropagation).toHaveBeenCalled();
    expect(c.openMenuId()).toBeNull();
  });

  it('emits removePlace from the overflow menu and closes the menu', () => {
    const fixture = TestBed.createComponent(MapPlacesPanelComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    const place = makePlace('p1', 'Kraków');
    const emitted = vi.fn();
    c.removePlace.subscribe(emitted);
    const stopPropagation = vi.fn();
    c.openMenuId.set('p1');
    c.onRemovePlace(place, { stopPropagation } as unknown as Event);
    expect(emitted).toHaveBeenCalledWith(place);
    expect(stopPropagation).toHaveBeenCalled();
    expect(c.openMenuId()).toBeNull();
  });

  it('toggles the overflow menu open/closed for a place', () => {
    const fixture = TestBed.createComponent(MapPlacesPanelComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    const place = makePlace('p1', 'Kraków');
    const stopPropagation = vi.fn();
    c.toggleMenu(place, { stopPropagation } as unknown as Event);
    expect(c.openMenuId()).toBe('p1');
    c.toggleMenu(place, { stopPropagation } as unknown as Event);
    expect(c.openMenuId()).toBeNull();
  });

  it('does not close the menu when the document click lands inside .place-row__menu (regression)', async () => {
    const fixture = TestBed.createComponent(MapPlacesPanelComponent);
    fixture.componentRef.setInput('places', [makePlace('p1', 'Kraków')]);
    fixture.detectChanges();
    const c = fixture.componentInstance as any;

    // Open the menu via the trigger button.
    const trigger = fixture.nativeElement.querySelector('.place-row__overflow');
    expect(trigger).toBeTruthy();
    trigger.click();
    fixture.detectChanges();
    expect(c.openMenuId()).toBe('p1');

    // A document click whose target is inside .place-row__menu must NOT close it.
    const docClick = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(docClick, 'target', { value: trigger });
    document.dispatchEvent(docClick);
    fixture.detectChanges();
    expect(c.openMenuId()).toBe('p1');

    // A document click elsewhere closes it.
    const outsideClick = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(outsideClick, 'target', { value: document.body });
    document.dispatchEvent(outsideClick);
    fixture.detectChanges();
    expect(c.openMenuId()).toBeNull();
  });
});
