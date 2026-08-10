import { Component, inject, signal, viewChild, ElementRef, afterNextRender, effect, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { IconComponent } from './icon.component';
import { formatSportType } from './activity-category';
import { formatDistance, formatDuration, formatDate } from './formatters';
import { sportTypeEmojiFromString } from './activity-display';
import { estimateMovingTime, type ParsedActivity } from './activity-parser.service';
import type { ActivityStatus } from '../storage/storage.models';

const AVG_SPEED_FALLBACK = ['Walk', 'Hike', 'TrailRun', 'Run'];


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
  templateUrl: './import-activity-dialog.component.html',
  styleUrl: './import-activity-dialog.component.scss',
})
export class ImportActivityDialog {
  protected readonly dialogRef = inject(MatDialogRef<ImportActivityDialog, ImportDialogResult | undefined>);
  protected readonly data = inject<ImportActivityData>(MAT_DIALOG_DATA);

  protected readonly SPORT_TYPES = SPORT_TYPES;
  protected readonly formatSportType = formatSportType;
  protected readonly formatDistance = formatDistance;
  protected readonly formatDuration = formatDuration;
  protected readonly formatDate = formatDate;
  protected readonly sportTypeEmojiFromString = sportTypeEmojiFromString;

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
    const suggestedSt = parsed.suggestedSportType;
    const suggestedCat = parsed.suggestedCategory;
    const suggestedEmoji = sportTypeEmojiFromString(suggestedSt);
    if (st !== suggestedSt) {
      return '';
    }
    const speedKmh = parsed.averageSpeedMetersPerSecond * 3.6;
    const isHeuristic = AVG_SPEED_FALLBACK.includes(st) || st === 'Ride';
    if (isHeuristic) {
      return `Suggested: ${suggestedEmoji} ${formatSportType(st)}. Based on average speed (${speedKmh.toFixed(1)} km/h) and distance.`;
    }
    return `Suggested: ${suggestedEmoji} ${formatSportType(st)}. From embedded activity metadata.`;
  });

  // Moving time shown in the preview. Tracks without usable timestamps (absent or too sparse for
  // the 5-minute moving window) yield 0 from the parser; in that case estimate it from the
  // currently selected sport type's typical pace so the duration updates as the user changes sport.
  protected readonly movingTimeIsEstimated = this.data.parsed.movingTimeSeconds <= 0;
  protected readonly movingTimeSeconds = computed(() => {
    const parsed = this.data.parsed;
    if (parsed.movingTimeSeconds > 0) {
      return parsed.movingTimeSeconds;
    }
    return estimateMovingTime(parsed.totalDistanceMeters, this.sportType());
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

}
