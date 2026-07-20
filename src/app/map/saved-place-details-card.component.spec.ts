import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { SavedPlaceDetailsCardComponent } from './saved-place-details-card.component';
import type { SavedPlaceRecord } from '../storage/storage.models';

function makePlace(overrides: Partial<SavedPlaceRecord> = {}): SavedPlaceRecord {
  return {
    id: 'place:1',
    name: 'Kraków Main Square',
    latitude: 50.0614,
    longitude: 19.9372,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('SavedPlaceDetailsCardComponent', () => {
  it('renders the place name', () => {
    const fixture = TestBed.createComponent(SavedPlaceDetailsCardComponent);
    fixture.componentRef.setInput('place', makePlace());
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Kraków Main Square');
  });

  it('renders the secondary label when present', () => {
    const fixture = TestBed.createComponent(SavedPlaceDetailsCardComponent);
    fixture.componentRef.setInput('place', makePlace({ secondaryLabel: 'Poland' }));
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Poland');
  });

  it('shows notes when present and placeholder when absent', () => {
    const withNotes = TestBed.createComponent(SavedPlaceDetailsCardComponent);
    withNotes.componentRef.setInput('place', makePlace({ notes: 'Meet at dawn' }));
    withNotes.componentRef.setInput('visible', true);
    withNotes.detectChanges();
    expect(withNotes.nativeElement.textContent).toContain('Meet at dawn');
    expect(withNotes.nativeElement.textContent).not.toContain('No notes added');

    const withoutNotes = TestBed.createComponent(SavedPlaceDetailsCardComponent);
    withoutNotes.componentRef.setInput('place', makePlace());
    withoutNotes.componentRef.setInput('visible', true);
    withoutNotes.detectChanges();
    expect(withoutNotes.nativeElement.textContent).toContain('No notes added');
  });

  it('emits edit when the Edit button is clicked', () => {
    const fixture = TestBed.createComponent(SavedPlaceDetailsCardComponent);
    const place = makePlace();
    fixture.componentRef.setInput('place', place);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    const editSpy = vi.fn();
    fixture.componentInstance.edit.subscribe(editSpy);

    const editBtn = fixture.nativeElement.querySelector(
      '.card-actions__btn--edit',
    ) as HTMLButtonElement;
    editBtn.click();

    expect(editSpy).toHaveBeenCalledWith(place);
  });

  it('emits remove when the Remove button is clicked', () => {
    const fixture = TestBed.createComponent(SavedPlaceDetailsCardComponent);
    const place = makePlace();
    fixture.componentRef.setInput('place', place);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    const removeSpy = vi.fn();
    fixture.componentInstance.remove.subscribe(removeSpy);

    const removeBtn = fixture.nativeElement.querySelector(
      '.card-actions__btn--remove',
    ) as HTMLButtonElement;
    removeBtn.click();

    expect(removeSpy).toHaveBeenCalledWith(place);
  });

  it('emits close when the close button is clicked', () => {
    const fixture = TestBed.createComponent(SavedPlaceDetailsCardComponent);
    fixture.componentRef.setInput('place', makePlace());
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    const closeSpy = vi.fn();
    fixture.componentInstance.close.subscribe(closeSpy);

    const closeBtn = fixture.nativeElement.querySelector('.card-close-btn') as HTMLButtonElement;
    closeBtn.click();

    expect(closeSpy).toHaveBeenCalled();
  });
});
