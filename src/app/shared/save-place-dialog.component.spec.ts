import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SavePlaceDialog, type SavePlaceDialogData } from './save-place-dialog.component';

describe('SavePlaceDialog', () => {
  function createComponent(data: SavePlaceDialogData) {
    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, MatDialogModule, SavePlaceDialog],
      providers: [
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(SavePlaceDialog);
  }

  it('prefills the name input from suggestedName', () => {
    const fixture = createComponent({ mode: 'create', suggestedName: 'Kraków' });
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    expect(c.name).toBe('Kraków');
  });

  it('shows "Save place" title in create mode', () => {
    const fixture = createComponent({ mode: 'create', suggestedName: 'Kraków' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Save place');
  });

  it('shows "Edit place" title in edit mode', () => {
    const fixture = createComponent({ mode: 'edit', suggestedName: 'Kraków' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Edit place');
  });

  it('disables Save when name is empty', () => {
    const fixture = createComponent({ mode: 'create', suggestedName: '' });
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    expect(c.canSave()).toBe(false);
  });

  it('enables Save when name is valid and notes are empty', () => {
    const fixture = createComponent({ mode: 'create', suggestedName: 'Kraków' });
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    expect(c.canSave()).toBe(true);
  });

  it('shows an error when name is empty on input', () => {
    const fixture = createComponent({ mode: 'create', suggestedName: '' });
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    c.onInput();
    expect(c.errorMessage()).toBe('Name cannot be empty');
  });

  it('shows an error when name exceeds maximum length on input', () => {
    const fixture = createComponent({ mode: 'create', suggestedName: 'a'.repeat(101) });
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    c.onInput();
    expect(c.errorMessage()).toContain('100 characters or fewer');
  });

  it('clears the error when both name and notes are valid on input', () => {
    const fixture = createComponent({ mode: 'create', suggestedName: 'Kraków' });
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    c.onInput();
    expect(c.errorMessage()).toBeNull();
  });

  it('closes with the trimmed name and notes on Save', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, MatDialogModule, SavePlaceDialog],
      providers: [
        { provide: MatDialogRef, useValue: { close } },
        { provide: MAT_DIALOG_DATA, useValue: { mode: 'create', suggestedName: '  Kraków  ' } },
      ],
    });
    const fixture = TestBed.createComponent(SavePlaceDialog);
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    c.onSave();
    expect(close).toHaveBeenCalledWith({ name: 'Kraków', notes: '' });
  });

  it('closes without a result on Cancel (overlay click calls dialogRef.close())', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, MatDialogModule, SavePlaceDialog],
      providers: [
        { provide: MatDialogRef, useValue: { close } },
        { provide: MAT_DIALOG_DATA, useValue: { mode: 'create', suggestedName: 'Kraków' } },
      ],
    });
    const fixture = TestBed.createComponent(SavePlaceDialog);
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    c.dialogRef.close();
    expect(close).toHaveBeenCalled();
  });

  it('handles notes exceeding max length in edit mode', () => {
    const longNotes = 'x'.repeat(501);
    const fixture = createComponent({
      mode: 'edit',
      suggestedName: 'Kraków',
      suggestedNotes: longNotes,
    });
    fixture.detectChanges();
    const c = fixture.componentInstance as any;
    expect(c.canSave()).toBe(false);
    c.onInput();
    expect(c.errorMessage()).toContain('500 characters or fewer');
  });
});
