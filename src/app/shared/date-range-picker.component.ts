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
  template: `
    <div class="drp-overlay" (click)="$event.stopPropagation()">
      <div class="drp-col">
        <div class="drp-header">
          <span class="drp-title">Select date range</span>
          <button class="drp-close" type="button" (click)="closed.emit()" aria-label="Close">&times;</button>
        </div>

        <div class="drp-presets">
          @for (p of presets; track p.label) {
            <button
              class="drp-preset-btn"
              [class.drp-preset-active]="activePreset() === p"
              type="button"
              (click)="applyPreset(p)"
            >{{ p.label }}</button>
          }
        </div>

        <div class="drp-calendars">
          <div class="drp-cal">
            <div class="drp-cal-header">
              <button class="drp-nav" type="button" (click)="prev(false)" aria-label="Previous month">&lsaquo;</button>
              <span class="drp-cal-title">{{ leftMonthLabel() }}</span>
              <button class="drp-nav" type="button" (click)="next(false)" aria-label="Next month">&rsaquo;</button>
            </div>
            <div class="drp-wdays">
              @for (d of DAYS_SHORT; track d) { <span class="drp-wd">{{ d }}</span> }
            </div>
            <div class="drp-grid">
              @for (cell of leftCells(); track cell.key) {
                @if (cell.empty) { <span class="drp-cell"></span> }
                @else {
                  <button
                    class="drp-cell drp-day"
                    [class.drp-today]="cell.today"
                    [class.drp-selected]="cell.selected"
                    [class.drp-in-range]="cell.inRange"
                    [class.drp-range-start]="cell.rangeStart"
                    [class.drp-range-end]="cell.rangeEnd"
                    type="button"
                    (click)="pickDay(cell.date)"
                    (mouseenter)="hoverDay(cell.date)"
                  >{{ cell.day }}</button>
                }
              }
            </div>
          </div>

          <div class="drp-cal">
            <div class="drp-cal-header">
              <button class="drp-nav" type="button" (click)="prev(true)" aria-label="Previous month">&lsaquo;</button>
              <span class="drp-cal-title">{{ rightMonthLabel() }}</span>
              <button class="drp-nav" type="button" (click)="next(true)" aria-label="Next month">&rsaquo;</button>
            </div>
            <div class="drp-wdays">
              @for (d of DAYS_SHORT; track d) { <span class="drp-wd">{{ d }}</span> }
            </div>
            <div class="drp-grid">
              @for (cell of rightCells(); track cell.key) {
                @if (cell.empty) { <span class="drp-cell"></span> }
                @else {
                  <button
                    class="drp-cell drp-day"
                    [class.drp-today]="cell.today"
                    [class.drp-selected]="cell.selected"
                    [class.drp-in-range]="cell.inRange"
                    [class.drp-range-start]="cell.rangeStart"
                    [class.drp-range-end]="cell.rangeEnd"
                    type="button"
                    (click)="pickDay(cell.date)"
                    (mouseenter)="hoverDay(cell.date)"
                  >{{ cell.day }}</button>
                }
              }
            </div>
          </div>
        </div>

        <div class="drp-summary">
          <span class="drp-summary-icon">📅</span>
          @if (draftStart() && draftEnd()) {
            <span>{{ formatDate(draftStart()!) }} – {{ formatDate(draftEnd()!) }}</span>
            <span class="drp-summary-days">&middot; {{ dayCount() }} {{ dayCount() === 1 ? 'day' : 'days' }}</span>
          } @else if (draftStart()) {
            <span>Start: {{ formatDate(draftStart()!) }} — Select an end date</span>
          } @else {
            <span>Select a date range</span>
          }
        </div>

        <div class="drp-footer">
          <button class="drp-clear-btn" type="button" (click)="clearDraft()">Clear</button>
          <button class="drp-apply-btn" type="button" (click)="doApply()">Apply</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .drp-overlay {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgb(20 33 27 / 18%);
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      max-width: 700px;
      user-select: none;
    }
    .drp-col { display: flex; flex-direction: column; gap: 0; padding: 16px; }
    .drp-header {
      align-items: center;
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .drp-title { font-size: 0.9375rem; font-weight: 700; color: #14211b; }
    .drp-close {
      background: transparent; border: 0; color: #9ca3af; cursor: pointer;
      font-size: 1.25rem; line-height: 1; padding: 0 4px; border-radius: 4px;
    }
    .drp-close:hover { color: #374151; background: #f3f4f6; }
    .drp-presets {
      display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px;
    }
    .drp-preset-btn {
      background: #ffffff; border: 1px solid #dce6df; border-radius: 8px;
      color: #374151; cursor: pointer; font: inherit; font-size: 0.8125rem;
      font-weight: 600; padding: 6px 12px; white-space: nowrap;
    }
    .drp-preset-btn:hover { background: #eef5f0; border-color: #c0cfc6; }
    .drp-preset-active { background: #15803d !important; border-color: #15803d !important; color: #ffffff !important; }
    .drp-calendars { display: flex; gap: 20px; margin-bottom: 12px; }
    .drp-cal { flex: 1; min-width: 0; }
    .drp-cal-header {
      align-items: center; display: flex; gap: 4px; justify-content: space-between;
      margin-bottom: 8px; padding: 0 2px;
    }
    .drp-cal-title { font-size: 0.8125rem; font-weight: 700; color: #14211b; }
    .drp-nav {
      background: transparent; border: 0; border-radius: 6px; color: #63746a;
      cursor: pointer; font-size: 1rem; line-height: 1; padding: 2px 8px;
    }
    .drp-nav:hover { background: #eef5f0; color: #14211b; }
    .drp-wdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; margin-bottom: 4px; }
    .drp-wd { color: #9ca3af; font-size: 0.6875rem; font-weight: 700; text-align: center; text-transform: uppercase; padding: 2px 0; }
    .drp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
    .drp-cell { width: 100%; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; border-radius: 6px; }
    .drp-day {
      background: transparent; border: 0; color: #374151; cursor: pointer;
      font: inherit; font-size: 0.75rem; font-weight: 500; padding: 0;
    }
    .drp-day:hover { background: #eef5f0; }
    .drp-today { font-weight: 700; color: #1f6f50; box-shadow: inset 0 0 0 1px #1f6f50; }
    .drp-selected { background: #15803d !important; color: #ffffff !important; font-weight: 700; border-radius: 6px !important; }
    .drp-selected:hover { background: #166f38 !important; }
    .drp-in-range { background: #eef5f0; border-radius: 0; }
    .drp-range-start { background: #15803d !important; color: #ffffff !important; font-weight: 700; border-radius: 6px 0 0 6px !important; }
    .drp-range-end { background: #15803d !important; color: #ffffff !important; font-weight: 700; border-radius: 0 6px 6px 0 !important; }
    .drp-summary {
      background: #f9fafb; border: 1px solid #eef5f0; border-radius: 8px;
      padding: 10px 14px; margin-bottom: 12px; font-size: 0.8125rem; color: #374151;
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    }
    .drp-summary-icon { flex-shrink: 0; }
    .drp-summary-days { color: #9ca3af; }
    .drp-footer {
      display: flex; gap: 8px; justify-content: flex-end;
    }
    .drp-clear-btn {
      background: transparent; border: 1px solid #dce6df; border-radius: 8px;
      color: #63746a; cursor: pointer; font: inherit; font-size: 0.8125rem;
      font-weight: 600; padding: 8px 16px;
    }
    .drp-clear-btn:hover { background: #f3f4f6; color: #14211b; }
    .drp-apply-btn {
      background: #15803d; border: 0; border-radius: 8px; color: #ffffff;
      cursor: pointer; font: inherit; font-size: 0.8125rem; font-weight: 600;
      padding: 8px 20px;
    }
    .drp-apply-btn:hover { background: #166f38; }
  `],
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

  private readonly viewOffset = signal(0);
  private readonly viewBase = computed(() => {
    const o = this.viewOffset();
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + o, 1);
  });

  protected readonly leftMonthLabel = computed(() => {
    const d = this.viewBase();
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  });
  protected readonly rightMonthLabel = computed(() => {
    const d = addDays(endOfMonth(this.viewBase()), 1);
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  });

  protected readonly draftStart = signal<Date | null>(null);
  protected readonly draftEnd = signal<Date | null>(null);
  protected readonly hoverDate = signal<Date | null>(null);

  private readonly rightMonth = computed(() => addDays(endOfMonth(this.viewBase()), 1));

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
      const r = this.rightMonth();
      this.viewOffset.set(r.getMonth() - (new Date()).getMonth() + (r.getFullYear() - (new Date()).getFullYear()) * 12 - 1);
    } else {
      this.viewOffset.update(v => v - 1);
    }
  }

  protected next(right: boolean): void {
    if (right) {
      const r = this.rightMonth();
      this.viewOffset.set(r.getMonth() - (new Date()).getMonth() + (r.getFullYear() - (new Date()).getFullYear()) * 12 + 1);
    } else {
      this.viewOffset.update(v => v + 1);
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

  protected readonly leftCells = computed(() => this.calcCells(this.viewBase()));
  protected readonly rightCells = computed(() => this.calcCells(this.rightMonth()));
}
