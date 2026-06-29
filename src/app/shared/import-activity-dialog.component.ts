import { Component, inject, signal, viewChild, ElementRef, afterNextRender, effect, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { IconComponent } from './icon.component';
import { formatSportType } from './activity-category';
import type { ParsedActivity } from './activity-parser.service';
import type { ActivityCategory, ActivityStatus } from '../storage/storage.models';

const AVG_SPEED_FALLBACK = ['Walk', 'Hike', 'TrailRun', 'Run'];

const SPORT_TYPE_EMOJI: Record<string, string> = {
  Ride: '🚴', GravelRide: '🚴', MountainBikeRide: '🚵', EBikeRide: '🚴', EMountainBikeRide: '🚵', VirtualRide: '🚴',
  Run: '🏃', TrailRun: '🏃', VirtualRun: '🏃',
  Walk: '🚶', Hike: '🥾',
  Swim: '🏊',
  Kayaking: '🛶', Canoeing: '🛶', StandUpPaddling: '🛶', Rowing: '🛶',
  AlpineSki: '⛷️', BackcountrySki: '⛷️', NordicSki: '⛷️', Snowboard: '🏂', Snowshoe: '🥾',
  RockClimbing: '🧗', Golf: '🏌️',
  Other: '🏋️', Workout: '🏋️',
};

const CATEGORY_EMOJI: Record<ActivityCategory, string> = {
  ride: '🚴', run: '🏃', walk: '🚶', hike: '🥾',
  water: '🌊', paddling: '🛶', winter: '⛷️', winter_sport: '⛷️',
  mountaineering: '🧗', other: '🏋️',
};

function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export interface ImportDialogResult {
  name: string;
  sportType: string;
  activityStatus: ActivityStatus;
}

export interface ImportActivityData {
  parsed: ParsedActivity;
  fileName: string;
  isDuplicate: boolean;
}

const SPORT_TYPES = [
  'Walk', 'Hike', 'TrailRun', 'Run', 'Ride', 'GravelRide',
  'MountainBikeRide', 'EBikeRide', 'Swim', 'Kayaking', 'Canoeing',
  'StandUpPaddling', 'AlpineSki', 'BackcountrySki', 'NordicSki',
  'Snowboard', 'Snowshoe', 'RockClimbing', 'Golf', 'Workout', 'Other',
];

@Component({
  selector: 'app-import-activity-dialog',
  standalone: true,
  imports: [MatDialogModule, FormsModule, IconComponent],
  template: `
    <div class="import-overlay" (click)="dialogRef.close()">
      <div class="import-dialog" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <button class="import-close" type="button" (click)="dialogRef.close()" aria-label="Close dialog">
          <app-icon name="x" [size]="14" strokeWidth="2"></app-icon>
        </button>

        <div class="import-layout">
          <div class="import-left">
            <div #mapContainer class="import-map" aria-label="Activity route preview map"></div>
          </div>
          <div class="import-right">
            <h2 class="import-title" id="import-title">Import Activity</h2>
            <p class="import-file">{{ data.fileName }}</p>

            @if (data.isDuplicate) {
              <div class="import-duplicate-warn">
                A similar activity already exists.
              </div>
            }

            <div class="import-field">
              <label class="import-label" for="import-name">Activity name</label>
              <input
                id="import-name"
                class="import-input"
                [(ngModel)]="name"
                (keydown.enter)="onImport()"
                maxlength="100"
                placeholder="Activity name"
                #nameInput
                autocomplete="off"
              />
            </div>

            <div class="import-field">
              <label class="import-label" for="import-sport">Sport type</label>
              <div class="import-select-wrap">
                <span class="import-select-emoji">{{ sportTypeEmoji(sportType()) }}</span>
                <select
                  id="import-sport"
                  class="import-select"
                  [ngModel]="sportType()"
                  (ngModelChange)="sportType.set($event)"
                >
                  @for (st of SPORT_TYPES; track st) {
                    <option [value]="st">{{ formatSportType(st) }}</option>
                  }
                </select>
                <app-icon name="chevron-down" [size]="14" strokeWidth="2" [class]="'import-select-arrow'"></app-icon>
              </div>
              <p class="import-sport-hint">{{ sportHint() }}</p>
            </div>

            <div class="import-field">
              <label class="import-label">Activity status</label>
              <div class="import-status-group">
                <label class="import-status-option">
                  <input type="radio" name="activityStatus" [value]="'completed'" [(ngModel)]="activityStatus" />
                  <span class="import-status-dot"></span>
                  Completed
                </label>
                <label class="import-status-option">
                  <input type="radio" name="activityStatus" [value]="'planned'" [(ngModel)]="activityStatus" />
                  <span class="import-status-dot"></span>
                  Planned
                </label>
              </div>
            </div>

            <div class="import-stats">
              <div class="import-stat">
                <span class="import-stat-value">{{ formatDistance(data.parsed.totalDistanceMeters) }}</span>
                <span class="import-stat-label">Distance</span>
              </div>
              <div class="import-stat">
                <span class="import-stat-value">{{ formatDuration(data.parsed.movingTimeSeconds) }}</span>
                <span class="import-stat-label">Moving time</span>
              </div>
              <div class="import-stat">
                <span class="import-stat-value">{{ data.parsed.totalElevationGainMeters.toFixed(0) }} m</span>
                <span class="import-stat-label">Elevation</span>
              </div>
              <div class="import-stat">
                <span class="import-stat-value">{{ formatDateShort(data.parsed.startTime) }}</span>
                <span class="import-stat-label">Date</span>
              </div>
            </div>

            <div class="import-actions">
              <button class="import-btn import-btn--secondary" type="button" (click)="dialogRef.close()">Cancel</button>
              <button class="import-btn import-btn--primary" type="button" [disabled]="!canImport()" (click)="onImport()">
                <app-icon name="check-circle" [size]="14" strokeWidth="2"></app-icon>
                Import
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .import-overlay {
      align-items: center;
      background: rgb(20 33 27 / 35%);
      backdrop-filter: blur(3px);
      display: flex;
      inset: 0;
      justify-content: center;
      position: fixed;
      z-index: 1000;
    }

    .import-dialog {
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 16px 48px rgb(20 33 27 / 18%);
      box-sizing: border-box;
      max-width: 720px;
      padding: 0;
      position: relative;
      width: 100%;
      animation: import-in 150ms ease-out;
    }

    @keyframes import-in {
      from { opacity: 0; transform: scale(0.96) translateY(6px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    .import-close {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 6px;
      color: #859b8e;
      cursor: pointer;
      display: inline-flex;
      height: 28px;
      justify-content: center;
      padding: 0;
      position: absolute;
      right: 12px;
      top: 12px;
      transition: background 120ms ease, color 120ms ease;
      width: 28px;
      z-index: 10;
    }

    .import-close:hover {
      background: #eef5f0;
      color: #14211b;
    }

    .import-layout {
      display: flex;
      min-height: 400px;
    }

    .import-left {
      flex: 0 0 35%;
      min-width: 0;
      border-radius: 20px 0 0 20px;
      overflow: hidden;
    }

    .import-map {
      height: 100%;
      min-height: 400px;
      width: 100%;
    }

    .import-right {
      flex: 1;
      min-width: 0;
      padding: 28px;
      display: flex;
      flex-direction: column;
    }

    .import-title {
      color: #14211b;
      font-size: 1.125rem;
      font-weight: 700;
      margin: 0;
    }

    .import-file {
      color: #63746a;
      font-size: 0.8125rem;
      margin: 2px 0 0;
    }

    .import-duplicate-warn {
      background: #fef9e7;
      border: 1px solid #f5d76e;
      border-radius: 8px;
      color: #7d6608;
      font-size: 0.8125rem;
      margin-top: 10px;
      padding: 8px 12px;
    }

    .import-field {
      margin-top: 14px;
    }

    .import-label {
      color: #314b3f;
      display: block;
      font-size: 0.8125rem;
      font-weight: 600;
      margin-bottom: 5px;
    }

    .import-input {
      border: 1px solid #dce6df;
      border-radius: 10px;
      box-sizing: border-box;
      color: #14211b;
      font: inherit;
      font-size: 0.875rem;
      height: 40px;
      line-height: 1.4;
      padding: 0 12px;
      width: 100%;
    }

    .import-input:focus {
      border-color: #1f6f50;
      box-shadow: 0 0 0 3px rgb(31 111 80 / 12%);
      outline: 0;
    }

    .import-select-wrap {
      align-items: center;
      border: 1px solid #dce6df;
      border-radius: 10px;
      display: flex;
      height: 40px;
      padding: 0 10px;
      position: relative;
    }

    .import-select-wrap:focus-within {
      border-color: #1f6f50;
      box-shadow: 0 0 0 3px rgb(31 111 80 / 12%);
    }

    .import-select-emoji {
      flex-shrink: 0;
      font-size: 1rem;
      line-height: 1;
      margin-right: 6px;
    }

    .import-select {
      appearance: none;
      background: transparent;
      border: 0;
      color: #14211b;
      flex: 1;
      font: inherit;
      font-size: 0.875rem;
      height: 100%;
      outline: 0;
      padding: 0;
    }

    .import-select-arrow {
      color: #859b8e;
      flex-shrink: 0;
      pointer-events: none;
    }

    .import-sport-hint {
      color: #859b8e;
      font-size: 0.6875rem;
      margin: 4px 0 0;
    }

    .import-stats {
      display: grid;
      gap: 8px;
      grid-template-columns: 1fr 1fr;
      margin-top: 16px;
    }

    .import-stat {
      background: #f4f9f6;
      border-radius: 8px;
      padding: 8px 10px;
    }

    .import-stat-value {
      color: #14211b;
      display: block;
      font-size: 0.875rem;
      font-weight: 700;
      line-height: 1.3;
    }

    .import-stat-label {
      color: #63746a;
      display: block;
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.03em;
      margin-top: 1px;
      text-transform: uppercase;
    }

    .import-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: auto;
      padding-top: 20px;
    }

    .import-btn {
      align-items: center;
      border-radius: 10px;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      gap: 6px;
      height: 40px;
      justify-content: center;
      line-height: 1;
      padding: 0 20px;
      transition: background 120ms ease, border-color 120ms ease;
    }

    .import-btn--secondary {
      background: #ffffff;
      border: 1px solid #dce6df;
      color: #314b3f;
    }

    .import-btn--secondary:hover {
      background: #f4f9f6;
      border-color: #cbd8d0;
    }

    .import-btn--primary {
      background: #15803d;
      border: 1px solid #15803d;
      color: #ffffff;
    }

    .import-btn--primary:hover:not(:disabled) {
      background: #166f38;
      border-color: #166f38;
    }

    .import-btn--primary:disabled {
      background: #b6cdbe;
      border-color: #b6cdbe;
      cursor: default;
    }

    .import-status-group {
      display: flex;
      gap: 16px;
    }

    .import-status-option {
      align-items: center;
      cursor: pointer;
      display: inline-flex;
      font-size: 0.875rem;
      gap: 6px;
      color: #314b3f;
    }

    .import-status-option input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .import-status-dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid #b6cdbe;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: border-color 120ms ease, background 120ms ease;
    }

    .import-status-option input:checked + .import-status-dot {
      border-color: #15803d;
      background: #15803d;
      box-shadow: inset 0 0 0 3px #fff;
    }

    .import-status-option input:focus-visible + .import-status-dot {
      box-shadow: 0 0 0 3px rgb(31 111 80 / 20%);
    }
  `],
})
export class ImportActivityDialog {
  protected readonly dialogRef = inject(MatDialogRef<ImportActivityDialog, ImportDialogResult | undefined>);
  protected readonly data = inject<ImportActivityData>(MAT_DIALOG_DATA);

  protected readonly SPORT_TYPES = SPORT_TYPES;
  protected readonly formatSportType = formatSportType;
  protected readonly formatDistance = formatDistance;
  protected readonly formatDuration = formatDuration;

  protected name = this.data.parsed.suggestedName;
  protected readonly sportType = signal(this.data.parsed.suggestedSportType);
  protected activityStatus: ActivityStatus = 'completed';

  protected readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  protected readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');

  constructor() {
    afterNextRender(() => {
      this.nameInput()?.nativeElement?.focus();
      this.initMap();
    });
  }

  protected sportHint = computed(() => {
    const st = this.sportType();
    const parsed = this.data.parsed;
    const speedKmh = parsed.averageSpeedMetersPerSecond * 3.6;
    const isHeuristic = AVG_SPEED_FALLBACK.includes(st) || st === 'Ride';
    if (isHeuristic) {
      return `Suggested based on average speed (${speedKmh.toFixed(1)} km/h) and distance.`;
    }
    return '';
  });

  protected canImport = (): boolean => {
    return this.name.trim().length > 0;
  };

  protected onImport(): void {
    if (!this.canImport()) return;
    this.dialogRef.close({ name: this.name.trim(), sportType: this.sportType(), activityStatus: this.activityStatus });
  }

  private initMap(): void {
    const container = this.mapContainer()?.nativeElement;
    if (!container) return;

    setTimeout(() => {
      import('maplibre-gl').then((ml) => {
        const map = new (ml.default ?? ml).Map({
          container,
          style: 'https://tiles.openfreemap.org/styles/liberty',
          center: [0, 20],
          zoom: 2,
          attributionControl: false,
          interactive: false,
        });

        map.on('load', () => {
          const coords = this.data.parsed.coordinates;
          if (coords.length < 2) return;

          try {
            map.addSource('route', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: coords },
              },
            });

            map.addLayer({
              id: 'route-line',
              type: 'line',
              source: 'route',
              paint: {
                'line-color': '#15803d',
                'line-width': 3,
              },
            });
          } catch {
          }

          const b = this.data.parsed.bounds;
          try {
            map.fitBounds(
              [[b[0][0], b[0][1]], [b[1][0], b[1][1]]],
              { padding: 20, maxZoom: 15 },
            );
          } catch {
          }
          map.resize();
        });
      });
    }, 100);
  }

  protected sportTypeEmoji(sportType: string): string {
    return SPORT_TYPE_EMOJI[sportType] ?? '🏋️';
  }

  protected formatDateShort(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
