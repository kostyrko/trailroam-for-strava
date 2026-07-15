import { Component, computed, Input, output, signal } from '@angular/core';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface Preset { label: string; days: number | null }
const PRESETS: Preset[] = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'This month', days: -1 },
  { label: 'This year', days: -2 },
  { label: 'All time', days: -3 },
];

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parse(iso: string): Date | null {
  if (!iso) return null;
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function daysInMonth(d: Date): number {
  return endOfMonth(d).getDate();
}

function startDow(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function today(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  templateUrl: './date-range-picker.component.html',
  styleUrl: './date-range-picker.component.scss',
})
export class DateRangePickerComponent {
  private _appliedDateFrom = '';
  private _appliedDateTo = '';
  @Input() set appliedDateFrom(v: string | null) {
    const raw = v ?? '';
    this._appliedDateFrom = raw;
    this.draftStart.set(parse(raw));
    this.draftEnd.set(parse(this._appliedDateTo));
  }
  get appliedDateFrom(): string { return this._appliedDateFrom; }
  @Input() set appliedDateTo(v: string | null) {
    const raw = v ?? '';
    this._appliedDateTo = raw;
    this.draftStart.set(parse(this._appliedDateFrom));
    this.draftEnd.set(parse(raw));
  }
  get appliedDateTo(): string { return this._appliedDateTo; }
  readonly applied = output<{ dateFrom: string; dateTo: string }>();
  readonly closed = output<void>();

  protected readonly DAYS_SHORT = DAYS_SHORT;
  protected readonly presets = PRESETS;

  private readonly leftOffset = signal(0);
  private readonly rightOffset = signal(1);
  private readonly leftBase = computed(() => {
    const o = this.leftOffset();
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + o, 1);
  });
  private readonly rightBase = computed(() => {
    const o = this.rightOffset();
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + o, 1);
  });

  protected readonly leftMonthLabel = computed(() => {
    const d = this.leftBase();
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  });
  protected readonly rightMonthLabel = computed(() => {
    const d = this.rightBase();
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  });

  protected readonly draftStart = signal<Date | null>(null);
  protected readonly draftEnd = signal<Date | null>(null);
  protected readonly hoverDate = signal<Date | null>(null);

  protected readonly activePreset = computed(() => {
    const s = this.draftStart();
    const e = this.draftEnd();
    if (!s && !e) {
      for (const p of PRESETS) {
        if (!this.presetStart(p)) return p;
      }
      return null;
    }
    if (!s || !e) return null;
    for (const p of PRESETS) {
      const ps = this.presetStart(p);
      const pe = this.presetEnd(p);
      if (ps && pe && sameDay(s, ps) && sameDay(e, pe)) return p;
    }
    return null;
  });

  protected readonly dayCount = computed(() => {
    const s = this.draftStart();
    const e = this.draftEnd();
    if (!s || !e) return 0;
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  });

  protected prev(right: boolean): void {
    if (right) {
      this.rightOffset.update(v => v - 1);
    } else {
      this.leftOffset.update(v => v - 1);
    }
  }

  protected next(right: boolean): void {
    if (right) {
      this.rightOffset.update(v => v + 1);
    } else {
      this.leftOffset.update(v => v + 1);
    }
  }

  protected pickDay(d: Date): void {
    const s = this.draftStart();
    const e = this.draftEnd();
    if (!s || (s && e)) {
      this.draftStart.set(d);
      this.draftEnd.set(null);
    } else {
      if (d < s) {
        this.draftStart.set(d);
        this.draftEnd.set(s);
      } else {
        this.draftEnd.set(d);
      }
    }
  }

  protected hoverDay(d: Date): void {
    this.hoverDate.set(d);
  }

  protected applyPreset(p: Preset): void {
    const s = this.presetStart(p);
    const e = this.presetEnd(p);
    this.draftStart.set(s || null);
    this.draftEnd.set(e || null);
  }

  private presetDays(p: Preset): number {
    const t = today();
    if (p.days === 0) return 0;
    if (p.days === 1) return 1;
    if (p.days === 7) return 7;
    if (p.days === 30) return 30;
    if (p.days === -1) return t.getDate();
    if (p.days === -2) return Math.round((t.getTime() - new Date(t.getFullYear(), 0, 1).getTime()) / 86400000);
    return 99999;
  }

  private presetStart(p: Preset): Date | null {
    const t = today();
    if (p.days === 0) return t;
    if (p.days === 1) return addDays(t, -1);
    if (p.days === 7 || p.days === 30) return addDays(t, -p.days);
    if (p.days === -1) return new Date(t.getFullYear(), t.getMonth(), 1);
    if (p.days === -2) return new Date(t.getFullYear(), 0, 1);
    return null;
  }

  private presetEnd(p: Preset): Date | null {
    const t = today();
    if (p.days === 0 || p.days === 1) return t;
    if (p.days === 7 || p.days === 30) return t;
    if (p.days === -1) return t;
    if (p.days === -2) return t;
    return null;
  }

  protected formatDate(d: Date): string {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected clearDraft(): void {
    this.draftStart.set(null);
    this.draftEnd.set(null);
  }

  protected doApply(): void {
    const s = this.draftStart();
    const e = this.draftEnd();
    this.applied.emit({ dateFrom: s ? fmt(s) : '', dateTo: e ? fmt(e) : '' });
  }

  protected readonly monthsGrid = MONTHS.map((label, i) => ({ n: i, label: label.slice(0, 3) }));

  protected readonly leftMode = signal<'calendar' | 'months' | 'years'>('calendar');
  protected readonly leftMpYear = signal(new Date().getFullYear());
  protected readonly leftMpDecade = signal(0);
  protected readonly leftMpYearLabel = computed(() => String(this.leftMpYear()));
  protected readonly leftMpMonth = computed(() => this.leftBase().getMonth());
  protected readonly leftYearsGrid = computed(() => {
    const d = this.leftMpDecade() * 12;
    const start = new Date().getFullYear() + d - 6;
    return Array.from({ length: 12 }, (_, i) => start + i);
  });
  protected readonly leftDecadeLabel = computed(() => {
    const g = this.leftYearsGrid();
    return `${g[0]} – ${g[g.length - 1]}`;
  });
  protected leftPickMonth(n: number): void {
    this.leftOffset.set(n - (new Date()).getMonth() + (this.leftMpYear() - (new Date()).getFullYear()) * 12);
    this.leftMode.set('calendar');
  }
  protected leftPickYear(y: number): void {
    this.leftMpYear.set(y);
    this.leftMode.set('months');
  }
  protected leftMpPrevYear(): void { this.leftMpYear.update(v => v - 1); }
  protected leftMpNextYear(): void { this.leftMpYear.update(v => v + 1); }
  protected leftMpPrevDecade(): void { this.leftMpDecade.update(v => v - 1); }
  protected leftMpNextDecade(): void { this.leftMpDecade.update(v => v + 1); }

  protected readonly rightMode = signal<'calendar' | 'months' | 'years'>('calendar');
  protected readonly rightMpYear = signal(new Date().getFullYear());
  protected readonly rightMpDecade = signal(0);
  protected readonly rightMpYearLabel = computed(() => String(this.rightMpYear()));
  protected readonly rightMpMonth = computed(() => this.rightBase().getMonth());
  protected readonly rightYearsGrid = computed(() => {
    const d = this.rightMpDecade() * 12;
    const start = new Date().getFullYear() + d - 6;
    return Array.from({ length: 12 }, (_, i) => start + i);
  });
  protected readonly rightDecadeLabel = computed(() => {
    const g = this.rightYearsGrid();
    return `${g[0]} – ${g[g.length - 1]}`;
  });
  protected rightPickMonth(n: number): void {
    this.rightOffset.set(n - (new Date()).getMonth() + (this.rightMpYear() - (new Date()).getFullYear()) * 12);
    this.rightMode.set('calendar');
  }
  protected rightPickYear(y: number): void {
    this.rightMpYear.set(y);
    this.rightMode.set('months');
  }
  protected rightMpPrevYear(): void { this.rightMpYear.update(v => v - 1); }
  protected rightMpNextYear(): void { this.rightMpYear.update(v => v + 1); }
  protected rightMpPrevDecade(): void { this.rightMpDecade.update(v => v - 1); }
  protected rightMpNextDecade(): void { this.rightMpDecade.update(v => v + 1); }

  private calcCells(monthStart: Date): Array<{ key: string; day: number; date: Date; empty?: boolean; today?: boolean; selected?: boolean; inRange?: boolean; rangeStart?: boolean; rangeEnd?: boolean }> {
    const dim = daysInMonth(monthStart);
    const sdow = startDow(monthStart);
    const t = today();
    const ds = this.draftStart();
    const de = this.draftEnd();
    const hd = this.hoverDate();

    const cells: Array<{ key: string; day: number; date: Date; empty?: boolean; today?: boolean; selected?: boolean; inRange?: boolean; rangeStart?: boolean; rangeEnd?: boolean }> = [];
    for (let i = 0; i < sdow; i++) {
      cells.push({ key: `e${i}`, day: 0, date: new Date(0), empty: true });
    }
    for (let day = 1; day <= dim; day++) {
      const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      const rangeStart = ds && de && sameDay(ds, date);
      const rangeEnd = ds && de && sameDay(de, date);
      const inRange = !!(ds && de && ds <= date && date <= de);
      const hoverInRange = !!(ds && !de && hd && ((ds <= date && date <= hd) || (hd <= date && date <= ds)));
      cells.push({
        key: fmt(date),
        day,
        date,
        today: sameDay(t, date),
        selected: !!(ds && sameDay(ds, date) || de && sameDay(de, date)),
        inRange: !!(inRange || hoverInRange),
        rangeStart: !!(rangeStart || (!de && ds && hd && hd < ds && sameDay(hd, date))),
        rangeEnd: !!(rangeEnd || (!de && ds && hd && hd >= ds && sameDay(hd, date))),
      });
    }
    return cells;
  }

  protected readonly leftCells = computed(() => this.calcCells(this.leftBase()));
  protected readonly rightCells = computed(() => this.calcCells(this.rightBase()));
}
