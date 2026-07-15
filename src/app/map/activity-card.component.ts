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
  templateUrl: './activity-card.component.html',
  styleUrl: './activity-card.component.scss',
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
