import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { LogbookNavComponent, type LogbookNavItem } from './logbook-nav.component';

function makeItems(): LogbookNavItem[] {
  return [
    { id: 'activities', label: 'Activities', icon: 'activity', count: 5 },
    { id: 'places', label: 'Places', icon: 'map-pin', count: 0 },
    { id: 'all', label: 'All', icon: 'layers', count: 3 },
  ];
}

describe('LogbookNavComponent', () => {
  it('renders all items', () => {
    const fixture = TestBed.createComponent(LogbookNavComponent);
    fixture.componentRef.setInput('items', makeItems());
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent).toContain('Activities');
    expect(buttons[1].textContent).toContain('Places');
    expect(buttons[2].textContent).toContain('All');
  });

  it('applies active class and aria-selected to the active item', () => {
    const fixture = TestBed.createComponent(LogbookNavComponent);
    fixture.componentRef.setInput('items', makeItems());
    fixture.componentRef.setInput('activeId', 'places');
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[0].classList.contains('logbook-nav__item--active')).toBe(false);
    expect(buttons[0].getAttribute('aria-selected')).toBe('false');
    expect(buttons[0].getAttribute('tabindex')).toBe('-1');

    expect(buttons[1].classList.contains('logbook-nav__item--active')).toBe(true);
    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    expect(buttons[1].getAttribute('tabindex')).toBe('0');
  });

  it('shows badge only when count > 0', () => {
    const fixture = TestBed.createComponent(LogbookNavComponent);
    fixture.componentRef.setInput('items', makeItems());
    fixture.detectChanges();

    const badges = fixture.nativeElement.querySelectorAll('.logbook-nav__badge');
    expect(badges.length).toBe(2); // Activities (5) and All (3), but not Places (0)
    expect(badges[0].textContent).toContain('5');
    expect(badges[1].textContent).toContain('3');
  });

  it('emits activeIdChange on item click', () => {
    const fixture = TestBed.createComponent(LogbookNavComponent);
    fixture.componentRef.setInput('items', makeItems());
    fixture.detectChanges();

    const spy = vi.fn();
    fixture.componentInstance.activeIdChange.subscribe(spy);

    const buttons = fixture.nativeElement.querySelectorAll('button');
    buttons[2].click();

    expect(spy).toHaveBeenCalledWith('all');
  });

  it('does nothing on click when items is empty', () => {
    const fixture = TestBed.createComponent(LogbookNavComponent);
    fixture.componentRef.setInput('items', []);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  describe('keyboard navigation', () => {
    function dispatchKey(button: HTMLElement, key: string): KeyboardEvent {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      });
      button.dispatchEvent(event);
      return event;
    }

    it('emits next item on ArrowRight from first item', () => {
      const fixture = TestBed.createComponent(LogbookNavComponent);
      fixture.componentRef.setInput('items', makeItems());
      fixture.detectChanges();

      const spy = vi.fn();
      fixture.componentInstance.activeIdChange.subscribe(spy);

      const buttons = fixture.nativeElement.querySelectorAll('button');
      dispatchKey(buttons[0], 'ArrowRight');

      expect(spy).toHaveBeenCalledWith('places');
    });

    it('wraps around on ArrowRight at last item', () => {
      const fixture = TestBed.createComponent(LogbookNavComponent);
      fixture.componentRef.setInput('items', makeItems());
      fixture.detectChanges();

      const spy = vi.fn();
      fixture.componentInstance.activeIdChange.subscribe(spy);

      const buttons = fixture.nativeElement.querySelectorAll('button');
      dispatchKey(buttons[2], 'ArrowRight');

      expect(spy).toHaveBeenCalledWith('activities');
    });

    it('emits previous item on ArrowLeft from middle item', () => {
      const fixture = TestBed.createComponent(LogbookNavComponent);
      fixture.componentRef.setInput('items', makeItems());
      fixture.detectChanges();

      const spy = vi.fn();
      fixture.componentInstance.activeIdChange.subscribe(spy);

      const buttons = fixture.nativeElement.querySelectorAll('button');
      dispatchKey(buttons[1], 'ArrowLeft');

      expect(spy).toHaveBeenCalledWith('activities');
    });

    it('wraps around on ArrowLeft at first item', () => {
      const fixture = TestBed.createComponent(LogbookNavComponent);
      fixture.componentRef.setInput('items', makeItems());
      fixture.detectChanges();

      const spy = vi.fn();
      fixture.componentInstance.activeIdChange.subscribe(spy);

      const buttons = fixture.nativeElement.querySelectorAll('button');
      dispatchKey(buttons[0], 'ArrowLeft');

      expect(spy).toHaveBeenCalledWith('all');
    });

    it('emits first item on Home', () => {
      const fixture = TestBed.createComponent(LogbookNavComponent);
      fixture.componentRef.setInput('items', makeItems());
      fixture.detectChanges();

      const spy = vi.fn();
      fixture.componentInstance.activeIdChange.subscribe(spy);

      const buttons = fixture.nativeElement.querySelectorAll('button');
      dispatchKey(buttons[2], 'Home');

      expect(spy).toHaveBeenCalledWith('activities');
    });

    it('emits last item on End', () => {
      const fixture = TestBed.createComponent(LogbookNavComponent);
      fixture.componentRef.setInput('items', makeItems());
      fixture.detectChanges();

      const spy = vi.fn();
      fixture.componentInstance.activeIdChange.subscribe(spy);

      const buttons = fixture.nativeElement.querySelectorAll('button');
      dispatchKey(buttons[0], 'End');

      expect(spy).toHaveBeenCalledWith('all');
    });

    it('prevents default for navigation keys', () => {
      const fixture = TestBed.createComponent(LogbookNavComponent);
      fixture.componentRef.setInput('items', makeItems());
      fixture.detectChanges();

      const buttons = fixture.nativeElement.querySelectorAll('button');
      const event = dispatchKey(buttons[0], 'ArrowRight');

      expect(event.defaultPrevented).toBe(true);
    });

    it('does nothing for non-navigation keys', () => {
      const fixture = TestBed.createComponent(LogbookNavComponent);
      fixture.componentRef.setInput('items', makeItems());
      fixture.detectChanges();

      const spy = vi.fn();
      fixture.componentInstance.activeIdChange.subscribe(spy);

      const buttons = fixture.nativeElement.querySelectorAll('button');
      const event = dispatchKey(buttons[0], 'Enter');

      expect(spy).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });
  });
});
