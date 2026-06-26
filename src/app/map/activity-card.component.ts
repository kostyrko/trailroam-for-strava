import { Component, input, output, signal, DestroyRef, inject } from '@angular/core';
import { ElevationProfileComponent } from './elevation-profile.component';
import { IconComponent } from '../shared/icon.component';
import { type MapRouteFeature } from './mock-routes';
import { type RouteGeometryRecord } from '../storage/storage.models';
import { formatSportType } from '../shared/activity-category';

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

function sportTypeEmoji(sportType: string): string {
  return SPORT_TYPE_EMOJI[sportType] ?? SPORT_TYPE_EMOJI['Other'] ?? '🏋️';
}

@Component({
  selector: 'app-activity-card',
  imports: [ElevationProfileComponent, IconComponent],
  template: `
    <article class="activity-card" aria-label="Selected route details">
      <div class="card-header">
        <div class="card-header-left">
          <h2 class="card-title" [title]="route().name">{{ route().name }}</h2>
        </div>
        <div class="card-header-right">
          <button class="card-icon-btn" type="button" (click)="onRename()" aria-label="Edit activity name" title="Edit name">
            <app-icon name="pencil" [size]="16" strokeWidth="2"></app-icon>
          </button>
          <button class="card-icon-btn" type="button" (click)="close.emit()" aria-label="Close route details">
            <app-icon name="x" [size]="16" strokeWidth="2"></app-icon>
          </button>
        </div>
      </div>

      <div class="card-meta">
        <span class="meta-item">
          <span class="meta-emoji">{{ sportTypeEmoji(route().activity.sportType) }}</span>
          <span class="meta-text sport-type-name">{{ formatSportType(route().activity.sportType) }}</span>
        </span>
        <span class="meta-item">
          <app-icon name="calendar" [size]="14" strokeWidth="2" [class]="'meta-icon'"></app-icon>
          <span class="meta-text">{{ formatDate(route().activity.startDate) }}</span>
        </span>
      </div>

      <div class="card-stats">
        <div class="stat-block">
          <span class="stat-value">{{ formatDistance(route().activity.distanceMeters) }}</span>
          <span class="stat-label">Distance</span>
        </div>
        <div class="stat-block">
          <span class="stat-value">{{ formatDuration(route().activity.movingTimeSeconds) }}</span>
          <span class="stat-label">Moving time</span>
        </div>
        <div class="stat-block">
          <span class="stat-value">{{ formatElevation(route().activity.totalElevationGainMeters) }}</span>
          <span class="stat-label">Elev. gain</span>
        </div>
      </div>

      @if (geometry(); as geom) {
        @if (geom.elevations && geom.elevations.length > 0) {
          <div class="card-elevation">
            <app-elevation-profile
              [elevations]="geom.elevations"
              [cumulativeDistances]="geom.cumulativeDistances"
              [coordinates]="geom.coordinates"
              [totalDistanceMeters]="route().activity.distanceMeters"
              (hoveredPosition)="elevationHover.emit($event)"
            />
          </div>
        }
      }

      <div class="card-footer">
        <div class="card-footer-center">
          <button class="card-btn card-btn--outline" type="button" (click)="viewDetails.emit(route())">
            View Details
          </button>
        </div>
        <div class="card-menu-wrapper">
          <button class="card-icon-btn card-menu-trigger" type="button" (click)="toggleMenu($event)" aria-haspopup="menu" [attr.aria-expanded]="menuOpen()" aria-label="More actions">
            <app-icon class="menu-icon-rotated" name="more-horizontal" [size]="20" strokeWidth="2"></app-icon>
          </button>
          @if (menuOpen()) {
            <ul class="card-dropdown" role="menu" (click)="$event.stopPropagation()">
              <li role="none">
                <button class="card-dropdown-item" role="menuitem" (click)="onDownloadGpx($event)">
                  <app-icon name="download" [size]="16" strokeWidth="2" [class]="'dd-icon'"></app-icon>
                  Download GPX
                </button>
              </li>
              <li role="none">
                <button class="card-dropdown-item" role="menuitem" (click)="onOpenStrava($event)">
                  <app-icon name="external-link" [size]="16" strokeWidth="2" [class]="'dd-icon'"></app-icon>
                  Open in Strava
                </button>
              </li>
            </ul>
          }
        </div>
      </div>
    </article>
  `,
  styles: [`
    .activity-card {
      background: #ffffff;
      border: 1px solid #cbd8d0;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgb(20 33 27 / 5%);
      box-sizing: border-box;
      margin: 0;
      max-width: 380px;
      padding: 20px;
      position: fixed;
      bottom: 52px;
      right: 24px;
      z-index: 1001;
    }

    .card-header {
      align-items: center;
      display: flex;
      justify-content: space-between;
      min-width: 0;
    }

    .card-header-left {
      align-items: center;
      display: flex;
      gap: 8px;
      min-width: 0;
    }

    .card-title {
      color: #14211b;
      font-size: 1.125rem;
      font-weight: 700;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-header-right {
      align-items: center;
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      margin-left: 8px;
    }

    .card-icon-btn {
      align-items: center;
      background: transparent;
      border: 0;
      color: #63746a;
      cursor: pointer;
      display: inline-flex;
      justify-content: center;
      padding: 4px;
      border-radius: 4px;
    }

    .card-icon-btn:hover {
      color: #14211b;
      background: #eef5f0;
    }

    .card-meta {
      align-items: center;
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    .meta-item {
      align-items: center;
      display: inline-flex;
      gap: 6px;
    }

    .meta-item + .meta-item {
      margin-left: 12px;
    }

    .meta-emoji {
      font-size: 1rem;
      line-height: 1;
    }

    .sport-type-name {
      margin-left: -2px;
    }

    .meta-icon {
      color: #a0b4a6;
      flex-shrink: 0;
    }

    .meta-text {
      color: #6B7280;
      font-size: 0.875rem;
      font-weight: 400;
    }

    .card-stats {
      display: flex;
      justify-content: space-between;
      padding: 24px 0;
    }

    .stat-block {
      align-items: center;
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      color: #1F2937;
      font-size: 1.2rem;
      font-weight: 700;
      line-height: 1.2;
    }

    .stat-label {
      color: #6B7280;
      font-size: 0.875rem;
      font-weight: 400;
      margin-top: 2px;
    }

    .card-elevation {
      margin: 0;
      padding: 0 20px;
    }

    .card-footer {
      align-items: center;
      display: flex;
      justify-content: flex-end;
      margin-top: 20px;
    }

    .card-footer-center {
      display: flex;
      justify-content: center;
      margin: 0 auto;
    }

    .card-btn {
      align-items: center;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: 0.875rem;
      font-weight: 500;
      justify-content: center;
      min-height: 42px;
      padding: 10px 25px;
      text-align: center;
    }

    .card-btn--outline {
      background: #ffffff;
      border: 1px solid #dce6df;
      color: #314b3f;
      width: 125%;
    }

    .card-btn--outline:hover {
      background: #eef5f0;
    }

    .card-menu-wrapper {
      flex-shrink: 0;
      position: relative;
    }

    .menu-icon-rotated {
      transform: rotate(90deg);
    }

    .card-menu-trigger {
      min-height: 32px;
      min-width: 32px;
    }

    .card-dropdown {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgb(20 33 27 / 18%);
      list-style: none;
      min-width: 160px;
      padding: 4px;
      position: absolute;
      right: 0;
      bottom: 100%;
      margin-bottom: 4px;
      z-index: 1000;
    }

    .card-dropdown-item {
      align-items: center;
      background: transparent;
      border: 0;
      border-radius: 6px;
      color: #314b3f;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      gap: 10px;
      min-height: 34px;
      padding: 6px 10px;
      text-align: left;
      white-space: nowrap;
      width: 100%;
    }

    .card-dropdown-item:hover {
      background: #eef5f0;
    }

    .dd-icon {
      color: #a0b4a6;
      flex-shrink: 0;
    }

    .card-dropdown-item:hover .dd-icon {
      color: #63746a;
    }
  `],
})
export class ActivityCardComponent {
  readonly route = input.required<MapRouteFeature>();
  readonly geometry = input<RouteGeometryRecord | null>(null);

  readonly close = output<void>();
  readonly viewDetails = output<MapRouteFeature>();
  readonly downloadGpx = output<MapRouteFeature>();
  readonly openStrava = output<MapRouteFeature>();
  readonly rename = output<MapRouteFeature>();
  readonly elevationHover = output<{ lng: number; lat: number } | null>();

  protected readonly menuOpen = signal(false);

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    globalThis.addEventListener('click', this.closeMenuOnOutsideClick);
    this.destroyRef.onDestroy(() => globalThis.removeEventListener('click', this.closeMenuOnOutsideClick));
  }

  private readonly closeMenuOnOutsideClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    if (!target?.closest('.card-menu-wrapper') && !target?.closest('.card-dropdown')) {
      this.menuOpen.set(false);
    }
  };

  protected formatSportType = formatSportType;
  protected sportTypeEmoji = sportTypeEmoji;

  protected formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  protected formatDistance(meters: number | undefined): string {
    if (meters === undefined || meters === 0) { return '—'; }
    return `${(meters / 1000).toFixed(2)} km`;
  }

  protected formatDuration(seconds: number | undefined): string {
    if (seconds === undefined || seconds === 0) { return '—'; }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) { return `${h}h ${m}m`; }
    return `${m}m`;
  }

  protected formatElevation(meters: number | undefined): string {
    if (meters === undefined || meters === 0) { return '—'; }
    return `${meters.toFixed(0)} m`;
  }

  protected toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.update((v) => !v);
  }

  protected onDownloadGpx(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    this.downloadGpx.emit(this.route());
  }

  protected onOpenStrava(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    this.openStrava.emit(this.route());
  }

  protected onRename(): void {
    this.rename.emit(this.route());
  }
}
