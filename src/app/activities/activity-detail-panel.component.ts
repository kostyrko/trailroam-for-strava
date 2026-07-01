import { Component, input, output, signal, effect, ElementRef, viewChild, inject, afterNextRender, computed } from '@angular/core';
import { Router } from '@angular/router';
import type { Map as MapLibreMap, GeoJSONSource, ExpressionSpecification } from 'maplibre-gl';
import { ElevationProfileComponent } from '../map/elevation-profile.component';
import { BasemapProviderService, AVAILABLE_PROVIDERS } from '../map/basemap-provider.service';
import { MapLibreService } from '../map/maplibre.service';
import type { BasemapProviderConfig } from '../map/basemap-provider';
import { GpxExportService } from '../shared/gpx-export.service';
import { ToastService } from '../shared/toast.service';
import { ConfirmService } from '../shared/confirm.service';
import { DataRefreshService } from '../shared/data-refresh.service';
import { MatDialog } from '@angular/material/dialog';
import { TRAILROAM_REPOSITORIES } from '../storage/repositories/repositories.token';
import { type ActivityRecord, type ActivityRouteRecord } from '../storage/storage.models';
import { IconComponent } from '../shared/icon.component';
import { EditActivityDialog } from '../shared/edit-activity-dialog.component';
import { formatSportType } from '../shared/activity-category';

function formatDistance(meters: number | undefined): string {
  if (meters === undefined || meters === 0) { return '—'; }
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || seconds === 0) { return '—'; }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) { return `${h}h ${m}m`; }
  return `${m}m`;
}

function formatSpeedKmh(speedMs: number | undefined): string {
  if (speedMs === undefined || speedMs === 0) { return '—'; }
  return `${(speedMs * 3.6).toFixed(1)} km/h`;
}

function formatElevation(meters: number | undefined): string {
  if (meters === undefined || meters === 0) { return '—'; }
  return `${meters.toFixed(0)} m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function haversineDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SPAN_SECONDS = 120;
const SPEED_COLORS = [
  { at: 0, color: '#3b82c4' },
  { at: 0.5, color: '#5fb8a0' },
  { at: 0.8, color: '#78c679' },
  { at: 1.0, color: '#1f6f50' },
  { at: 1.2, color: '#d9a23d' },
  { at: 1.5, color: '#d9732b' },
  { at: 2.0, color: '#b8433a' },
];

@Component({
  selector: 'app-activity-detail-panel',
  imports: [ElevationProfileComponent, IconComponent],
  template: `
    @if (!pushMode()) {
      <div class="panel-backdrop" [class.backdrop-visible]="panelVisible()" (click)="closePanel()"></div>
    }
    <aside class="detail-panel" [class.panel-expanded]="panelExpanded()" [class.panel-visible]="panelVisible()" [class.panel-push]="pushMode()" role="complementary" aria-label="Selected activity details">
      @if (!activity()) {
        <div class="panel-empty">
          <p>Select an activity to view its route and details.</p>
          <p class="panel-empty-sub">The interactive map will show the selected route with speed-based coloring.</p>
        </div>
      } @else {
        <div class="panel-map-wrap" [class.panel-map-expanded]="panelExpanded()">
          @if (routeLoading()) {
            <div class="panel-map-loading" aria-label="Loading route data">
              <div class="map-loading-spinner"></div>
            </div>
          }
          <div #mapContainer class="panel-map" aria-label="Interactive map showing selected activity route"></div>
          <div class="panel-map-controls">
            <button
              class="panel-map-btn panel-map-btn--maximize"
              type="button"
              [attr.aria-label]="panelExpanded() ? 'Collapse map' : 'Expand map'"
              data-tooltip="Expand map"
              (click)="togglePanelExpand()"
            >{{ panelExpanded() ? '⤡' : '⤢' }}</button>
            <button
              class="panel-map-btn panel-map-btn--layer"
              type="button"
              (click)="toggleLayerMenu($event)"
              aria-label="Switch map layer"
              data-tooltip="Switch basemap"
            >
              <app-icon name="layers" [size]="16" strokeWidth="2"></app-icon>
            </button>
            @if (layerMenuOpen()) {
              <div class="panel-layer-menu" (click)="$event.stopPropagation()">
                @for (p of AVAILABLE_PROVIDERS; track p.id) {
                  <button class="panel-layer-item" type="button" [class.active]="p.id === activeLayerId()" (click)="selectLayer(p)">
                    {{ p.label }}
                    @if (p.id === activeLayerId()) {
                      <span> ✓</span>
                    }
                  </button>
                }
              </div>
            }
          </div>
        </div>
        <div class="panel-scroll">

          @if (speedLegend()) {
            <div class="speed-legend" aria-label="Route speed legend">
              <span>Slower</span>
              <svg class="legend-gradient" width="80" height="8" aria-hidden="true">
                <defs>
                  <linearGradient id="speed-grad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#3b82c4" />
                    <stop offset="25%" stop-color="#78c679" />
                    <stop offset="50%" stop-color="#1f6f50" />
                    <stop offset="75%" stop-color="#d9a23d" />
                    <stop offset="100%" stop-color="#b8433a" />
                  </linearGradient>
                </defs>
                <rect width="80" height="8" rx="4" fill="url(#speed-grad)" />
              </svg>
              <span>Faster</span>
            </div>
          }

          <div class="panel-header">
            <div class="panel-header-main">
              <div class="panel-title-row">
                <h2 class="panel-title">{{ activity()!.name }}</h2>
                <div class="panel-menu-wrapper">
                  <button class="panel-menu-trigger" type="button" (click)="toggleMenu($event)" aria-label="Activity actions">&#8942;</button>
                  @if (menuOpen()) {
                    <ul class="panel-menu-dropdown" role="menu" (click)="$event.stopPropagation()">
                      <li role="none">
                        <button class="panel-menu-item" role="menuitem" (click)="openInStrava($event)">
                          <app-icon name="external-link" [size]="16" strokeWidth="2"></app-icon>
                          Strava
                        </button>
                      </li>
                      <li role="none">
                        <button class="panel-menu-item" role="menuitem" (click)="editActivity($event)">
                          <app-icon name="pencil" [size]="16" strokeWidth="2"></app-icon>
                          Edit
                        </button>
                      </li>
                      <li role="none">
                        <button class="panel-menu-item panel-menu-item--danger" role="menuitem" (click)="deleteActivity($event)">
                          <app-icon name="trash-2" [size]="16" strokeWidth="2"></app-icon>
                          Delete
                        </button>
                      </li>
                    </ul>
                  }
                </div>
              </div>
              <div class="panel-source-status-row">
                @let a = activity()!;
                @let st = a.activityStatus ?? 'completed';
                @if (st === 'completed') {
                  <span class="panel-detail-status-badge panel-detail-status-badge--completed">&#10003; Completed</span>
                } @else {
                  <span class="panel-detail-status-badge panel-detail-status-badge--planned">&#9711; Planned</span>
                }
                @if (a.provider === 'strava') {
                  <span class="panel-detail-source">⚡ Strava (Synced)</span>
                } @else {
                  <span class="panel-detail-source panel-detail-source--imported">⬆ Imported</span>
                }
              </div>
              <p class="panel-date">{{ formatDate(a.startDate) }}</p>
            </div>
            <button class="panel-close" type="button" (click)="closePanel()" aria-label="Close activity details">&times;</button>
          </div>

          <div class="panel-metrics">
            <div class="metric">
              <span class="metric-value">{{ formatDistance(activity()!.distanceMeters) }}</span>
              <span class="metric-label">Distance</span>
            </div>
            <div class="metric">
              <span class="metric-value">{{ formatDuration(activity()!.movingTimeSeconds) }}</span>
              <span class="metric-label">Moving Time</span>
            </div>
            <div class="metric">
              <span class="metric-value">{{ formatSpeedKmh(speedMs()) }}</span>
              <span class="metric-label">Avg Speed</span>
            </div>
            <div class="metric">
              <span class="metric-value">{{ formatElevation(activity()!.totalElevationGainMeters) }}</span>
              <span class="metric-label">Elev Gain</span>
            </div>
          </div>

          @if (routeElevations() && routeElevations()!.length > 0) {
            <div class="panel-elevation card">
              <h3 class="card-title">Elevation</h3>
              <app-elevation-profile
                [elevations]="routeElevations()"
                [cumulativeDistances]="routeDistances()"
                [coordinates]="routeCoords()"
                [totalDistanceMeters]="activity()!.distanceMeters"
                (hoveredPosition)="onElevationHover($event)"
              />
            </div>
          }

          <div class="panel-actions">
            <button class="action-btn action-btn--primary" type="button" (click)="downloadGpx()" [disabled]="!activity()!.hasRoute">
              <app-icon name="download" [size]="16" strokeWidth="2"></app-icon>
              Download GPX
            </button>
            @if (showInActivities()) {
              <button class="action-btn action-btn--secondary" type="button" (click)="showOnActivitiesTable()" [disabled]="!activity()">
                <app-icon name="list" [size]="16" strokeWidth="2"></app-icon>
                Show in Activities
              </button>
            } @else {
              <button class="action-btn action-btn--secondary" type="button" (click)="showOnMapExplorer()" [disabled]="!route()">
                <app-icon name="map" [size]="16" strokeWidth="2"></app-icon>
                Show on Map Explorer
              </button>
            }
          </div>

          <div class="panel-details card">
            <h3 class="card-title">Activity Details</h3>
            <dl class="details-list">
              <div class="detail-row">
                <dt>Type</dt>
                <dd>{{ formatSportType(activity()!.sportType) }}</dd>
              </div>
              <div class="detail-row">
                <dt>Moving Time</dt>
                <dd>{{ formatDuration(activity()!.movingTimeSeconds) }}</dd>
              </div>
              <div class="detail-row">
                <dt>Calories</dt>
                <dd>{{ calories() }}</dd>
              </div>
              <div class="detail-row">
                <dt>Start Elevation</dt>
                <dd>{{ formatElevation(startElevation()) }}</dd>
              </div>
              <div class="detail-row">
                <dt>Max Elevation</dt>
                <dd>{{ formatElevation(maxElevation()) }}</dd>
              </div>
              <div class="detail-row">
                <dt>Total Elev Gain</dt>
                <dd>{{ formatElevation(activity()!.totalElevationGainMeters) }}</dd>
              </div>
            </dl>
          </div>
        </div>
      }
    </aside>
  `,
  styles: [`
    .panel-backdrop {
      background: rgb(20 33 27 / 30%);
      inset: 0;
      opacity: 0;
      position: fixed;
      transition: opacity 0.25s ease;
      z-index: 100;
    }
    .panel-backdrop.backdrop-visible {
      opacity: 1;
    }
    .detail-panel {
      background: #ffffff;
      border-left: 3px solid #cbd8d0;
      box-shadow: -4px 0 24px rgb(20 33 27 / 12%);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      position: fixed;
      right: 0;
      top: 0;
      transform: translateX(100%);
      transition: transform 0.25s ease, width 0.2s ease;
      width: 520px;
      z-index: 110;
    }
    .detail-panel.panel-visible {
      transform: translateX(0);
    }
    .detail-panel.panel-expanded {
      width: 842px;
    }
    .detail-panel.panel-push {
      height: 100%;
      position: relative;
      right: auto;
      top: auto;
      transform: none;
      transition: none;
    }
    .panel-empty {
      align-items: center;
      color: #63746a;
      display: flex;
      flex-direction: column;
      font-size: 0.875rem;
      height: 100%;
      justify-content: center;
      padding: 32px;
      text-align: center;
    }
    .panel-empty-sub {
      color: #a0b4a6;
      font-size: 0.8125rem;
      margin-top: 8px;
    }
    .panel-scroll {
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: 16px;
      overflow-y: auto;
      padding: 0;
    }
    .panel-map-wrap {
      height: 322px;
      position: relative;
    }
    .panel-map-wrap.panel-map-expanded {
      height: 60vh;
    }
    .panel-map-wrap.panel-map-expanded .panel-map {
      height: 100%;
      min-height: 60vh;
    }
    .panel-map {
      border-radius: 0;
      height: 322px;
      min-height: 322px;
      position: relative;
      width: 100%;
    }

    :host ::ng-deep .panel-map .maplibregl-canvas {
      border-radius: 0 !important;
    }
    .panel-map-loading {
      align-items: center;
      background: rgb(20 33 27 / 40%);
      display: flex;
      height: 100%;
      justify-content: center;
      left: 0;
      position: absolute;
      top: 0;
      width: 100%;
      z-index: 20;
    }
    .map-loading-spinner {
      animation: detail-spin 0.8s linear infinite;
      border: 3px solid #dce6df;
      border-radius: 50%;
      border-top-color: #1f6f50;
      height: 28px;
      width: 28px;
    }
    @keyframes detail-spin {
      to { transform: rotate(360deg); }
    }
    .panel-map-btn {
      align-items: center;
      background: #ffffff;
      border: 2px solid #1f6f50;
      border-radius: 6px;
      box-shadow: 0 2px 6px rgb(20 33 27 / 18%);
      color: #1f6f50;
      cursor: pointer;
      display: inline-flex;
      font-size: 1rem;
      height: 29px;
      justify-content: center;
      line-height: 1;
      padding: 0;
      position: absolute;
      width: 29px;
      z-index: 30;
    }
    .panel-map-btn:hover {
      background: #e6f7ef;
    }
    :host ::ng-deep .panel-map .maplibregl-ctrl-top-left {
      top: auto !important;
    }

    :host ::ng-deep .panel-map .maplibregl-ctrl-top-left .maplibregl-ctrl-group {
      background: #ffffff;
      border: 2px solid #1f6f50;
      border-radius: 6px;
      box-shadow: 0 2px 6px rgb(20 33 27 / 18%);
      overflow: hidden;
    }

    :host ::ng-deep .panel-map .maplibregl-ctrl-top-left .maplibregl-ctrl-group button {
      background: #ffffff;
      border-color: transparent;
      color: #1f6f50;
      height: 27px !important;
      width: 27px !important;
    }

    :host ::ng-deep .panel-map .maplibregl-ctrl-top-left .maplibregl-ctrl-group button:hover {
      background: #e6f7ef;
    }

    :host ::ng-deep .panel-map .maplibregl-ctrl-top-left .maplibregl-ctrl-group button:not(:last-child) {
      border-bottom: 1px solid #dce6df;
    }

    :host ::ng-deep .panel-map .maplibregl-ctrl-top-left .maplibregl-ctrl-group button .maplibregl-ctrl-icon {
      background-color: transparent;
      background-size: 18px;
    }

    .panel-map-controls {
      display: flex;
      flex-direction: column;
      gap: 4px;
      position: absolute;
      right: 10px;
      top: 10px;
      z-index: 30;
    }
    .panel-map-controls .panel-map-btn {
      position: relative !important;
      right: auto !important;
      top: auto !important;
    }
    .panel-map-btn[data-tooltip]::after {
      background: #14211b;
      border-radius: 4px;
      color: #ffffff;
      content: attr(data-tooltip);
      font-size: 0.6875rem;
      font-weight: 600;
      opacity: 0;
      padding: 4px 8px;
      pointer-events: none;
      position: absolute;
      right: calc(100% + 8px);
      top: 50%;
      transform: translateY(-50%);
      transition: opacity 0s 0.5s;
      white-space: nowrap;
      z-index: 100;
    }

    .panel-map-btn[data-tooltip]:hover::after {
      opacity: 1;
    }

    .panel-map-btn svg {
      display: block;
    }
    .panel-layer-menu {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgb(20 33 27 / 15%);
      position: absolute;
      right: 10px;
      top: 81px;
      z-index: 30;
      min-width: 160px;
      padding: 4px;
    }
    .panel-layer-item {
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
      gap: 8px;
      min-height: 34px;
      padding: 6px 12px;
      text-align: left;
      white-space: nowrap;
      width: 100%;
    }
    .panel-layer-item:hover,
    .panel-layer-item.active {
      background: #eef5f0;
    }
    .speed-legend {
      align-items: center;
      display: flex;
      gap: 12px;
      padding: 6px 16px 0;
      position: relative;
      z-index: 0;
    }
    .legend-gradient {
      border-radius: 4px;
      flex-shrink: 0;
    }
    .panel-header {
      display: flex;
      gap: 12px;
      padding: 0 16px;
    }
    .panel-header-main {
      flex: 1;
      min-width: 0;
    }
    .panel-title-row {
      align-items: center;
      display: flex;
      gap: 6px;
    }
    .panel-title {
      font-size: 1rem;
      font-weight: 700;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .panel-date {
      color: #63746a;
      font-size: 0.8125rem;
      margin: 2px 0 0;
    }
    .panel-source-status-row {
      align-items: center;
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }
    .panel-detail-status-badge {
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 2px 6px;
    }
    .panel-detail-status-badge--completed {
      background: #e6f7ef;
      color: #15803d;
    }
    .panel-detail-status-badge--planned {
      background: #f3e8ff;
      color: #7c3aed;
    }
    .panel-detail-source {
      color: #b87a2d;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .panel-detail-source--imported {
      color: #2d7fb8;
    }
    .panel-close {
      align-items: center;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      color: #63746a;
      cursor: pointer;
      display: inline-flex;
      font-size: 1.25rem;
      font-weight: 700;
      justify-content: center;
      line-height: 1;
      min-height: 32px;
      min-width: 32px;
      padding: 0;
    }
    .panel-close:hover {
      background: #eef5f0;
      color: #14211b;
    }
    .panel-menu-wrapper {
      position: relative;
    }
    .panel-menu-trigger {
      align-items: center;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      color: #63746a;
      cursor: pointer;
      display: inline-flex;
      font-size: 1.1rem;
      font-weight: 700;
      justify-content: center;
      letter-spacing: 2px;
      line-height: 1;
      min-height: 32px;
      min-width: 32px;
      padding: 0;
    }
    .panel-menu-trigger:hover {
      background: #eef5f0;
      color: #14211b;
    }
    .panel-menu-dropdown {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
      list-style: none;
      margin: 0;
      padding: 4px;
      position: absolute;
      right: 0;
      top: 100%;
      z-index: 200;
      min-width: 140px;
    }
    .panel-menu-item {
      align-items: center;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: #14211b;
      cursor: pointer;
      display: flex;
      font: inherit;
      font-size: 0.8125rem;
      gap: 8px;
      padding: 8px 12px;
      width: 100%;
    }
    .panel-menu-item:hover {
      background: #eef5f0;
    }
    .panel-menu-item--danger {
      color: #b8433a;
    }
    .panel-menu-item--danger:hover {
      background: #fdf0ef;
    }
    .panel-metrics {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(4, 1fr);
      padding: 0 16px;
    }
    .metric {
      background: #f4f9f6;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 10px 8px;
      text-align: center;
    }
    .metric-value {
      color: #14211b;
      font-size: 0.8125rem;
      font-weight: 700;
      line-height: 1.2;
    }
    .metric-label {
      color: #63746a;
      font-size: 0.625rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .card {
      background: #ffffff;
      border: 1px solid #dce6df;
      border-radius: 10px;
      margin: 0 16px;
      padding: 14px 16px;
    }
    .card-title {
      color: #314b3f;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      margin: 0 0 10px;
      text-transform: uppercase;
    }
    .panel-elevation {
      margin: 0 16px;
      min-width: calc(100% - 32px);
    }
    .panel-expanded .panel-elevation {
      margin: 0 auto;
      min-width: 488px;
      width: auto;
    }
    .panel-elevation :deep(.elevation-chart-wrap) {
      width: 100% !important;
    }
    .panel-elevation :deep(.elevation-svg) {
      width: 100% !important;
    }
    .panel-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 0 16px;
    }
    .action-btn {
      align-items: center;
      border: 1px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-size: 0.875rem;
      font-weight: 700;
      gap: 8px;
      justify-content: center;
      min-height: 44px;
      padding: 0 20px;
      white-space: nowrap;
      width: 100%;
    }
    .action-btn:disabled {
      cursor: default;
      opacity: 0.5;
    }
    .action-btn--primary {
      background: #1f6f50;
      border-color: #1f6f50;
      color: #ffffff;
    }
    .action-btn--primary:hover:not(:disabled) {
      background: #185940;
    }
    .action-btn--secondary {
      background: #ffffff;
      border-color: #dce6df;
      color: #314b3f;
    }
    .action-btn--secondary:hover {
      background: #eef5f0;
      border-color: #cbd8d0;
    }
    .panel-details {
      margin: 0 16px 20px;
    }
    .details-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
    }
    .detail-row {
      align-items: center;
      display: flex;
      justify-content: space-between;
    }
    .detail-row dt {
      color: #63746a;
      font-size: 0.8125rem;
      font-weight: 600;
    }
    .detail-row dd {
      color: #14211b;
      font-size: 0.8125rem;
      font-weight: 700;
      margin: 0;
    }
  `],
})
export class ActivityDetailPanelComponent {
  private readonly router = inject(Router);
  private readonly basemapProviderService = inject(BasemapProviderService);
  private readonly mapLibreService = inject(MapLibreService);
  private readonly gpxExportService = inject(GpxExportService);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  private readonly dialog = inject(MatDialog);
  private readonly repositories = inject(TRAILROAM_REPOSITORIES);
  private readonly dataRefresh = inject(DataRefreshService);

  readonly activity = input<ActivityRecord | null>(null);
  readonly route = input<ActivityRouteRecord & { coordinates: [number, number][]; elevations?: number[]; cumulativeDistances?: number[] } | null>(null);
  readonly pushMode = input(false);
  readonly showInActivities = input(false);
  readonly close = output<void>();
  readonly panelExpand = output<boolean>();

  protected readonly routeLoading = signal(false);
  protected readonly speedLegend = signal(false);
  protected readonly panelVisible = signal(false);
  protected readonly panelExpanded = signal(false);
  protected readonly layerMenuOpen = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly activeLayerId = signal('openfreemap');
  protected readonly AVAILABLE_PROVIDERS = AVAILABLE_PROVIDERS;

  protected readonly routeCoords = computed<[number, number][] | undefined>(() => this.route()?.coordinates ?? undefined);
  protected readonly routeElevations = computed<number[] | undefined>(() => this.route()?.elevations);
  protected readonly routeDistances = computed<number[] | undefined>(() => this.route()?.cumulativeDistances);

  protected readonly speedMs = computed(() => {
    const a = this.activity();
    if (!a) { return undefined; }
    if (a.averageSpeedMetersPerSecond) { return a.averageSpeedMetersPerSecond; }
    if (a.distanceMeters && a.movingTimeSeconds) { return a.distanceMeters / a.movingTimeSeconds; }
    return undefined;
  });

  protected readonly maxElevation = computed(() => {
    const el = this.routeElevations();
    if (!el || el.length === 0) { return this.activity()?.totalElevationGainMeters; }
    return Math.max(...el);
  });

  protected readonly startElevation = computed(() => {
    const el = this.routeElevations();
    if (!el || el.length === 0) { return undefined; }
    return el[0];
  });

  protected readonly calories = computed(() => {
    const a = this.activity();
    if (!a) { return '—'; }
    return (a as any).calories ?? '—';
  });

  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');
  private mapInstance: MapLibreMap | null = null;
  private readonly mapInitialized = signal(false);
  private mapRerenderPending = false;
  private rerenderLoadHandler: (() => void) | null = null;

  constructor() {
    afterNextRender(() => {
      if (!this.pushMode()) {
        setTimeout(() => this.panelVisible.set(true), 10);
      } else {
        this.panelVisible.set(true);
      }
      this.initMap();
    });
    globalThis.addEventListener('click', () => {
      this.layerMenuOpen.set(false);
      this.menuOpen.set(false);
    });

    effect(() => {
      const a = this.activity();
      const r = this.route();
      if (a && r) {
        this.routeLoading.set(true);
        this.speedLegend.set(false);
      }
    });

    effect(() => {
      const a = this.activity();
      const r = this.route();
      const mi = this.mapInitialized();
      if (mi && this.mapInstance && a && r) {
        this.renderRouteOnMap();
        if (!this.mapInstance.isStyleLoaded()) {
          this.mapInstance.once('load', () => this.renderRouteOnMap());
        }
      }
    });
  }

  protected readonly formatDate = formatDate;
  protected readonly formatDistance = formatDistance;
  protected readonly formatDuration = formatDuration;
  protected readonly formatSpeedKmh = formatSpeedKmh;
  protected readonly formatElevation = formatElevation;
  protected readonly formatSportType = formatSportType;

  private initMap(): void {
    if (this.mapInitialized()) { return; }
    this.mapInitialized.set(true);
    this.routeLoading.set(true);
    const container = this.mapContainer()?.nativeElement;
    if (!container) { return; }
    const provider = this.basemapProviderService.getDefaultProvider();
    this.mapLibreService.createMap(container, provider).then((map) => {
      this.mapInstance = map;
      map.jumpTo({ center: [0, 20], zoom: 2 });
      import('maplibre-gl').then((ml) => {
        const NavControl = (ml as any).NavigationControl ?? (ml as any).default?.NavigationControl;
        const ScaleControl = (ml as any).ScaleControl ?? (ml as any).default?.ScaleControl;
        if (NavControl) { map.addControl(new NavControl({ showCompass: false }), 'top-left'); }
        if (ScaleControl) { map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left'); }
      });
      map.on('load', () => this.renderRouteOnMap());
    });
  }

  private doneLoading(): void {
    setTimeout(() => this.routeLoading.set(false), 500);
  }

  private renderRouteOnMap(): void {
    const map = this.mapInstance;
    const route = this.route();
    if (!map || !route || route.coordinates.length < 2) {
      this.doneLoading();
      return;
    }

    const sourceId = 'detail-route-segments';
    const layerBaseId = 'detail-route-seg';

    const existingLayers = [`${layerBaseId}-casing`, layerBaseId, 'detail-hover-point-layer'];
    for (const id of existingLayers) {
      if (map.getLayer(id)) { map.removeLayer(id); }
    }
    if (map.getSource(sourceId)) { map.removeSource(sourceId); }
    if (map.getSource('detail-hover-point')) { map.removeSource('detail-hover-point'); }

    const segFeatures = this.buildSpeedSegments(route.coordinates, route.cumulativeDistances);
    this.speedLegend.set(segFeatures.length > 0);

    const speedRatios = segFeatures
      .map((f) => f.properties?.['speedRatio'] as number)
      .filter((v) => v !== undefined);
    const minRatio = speedRatios.length > 0 ? Math.min(...speedRatios) : 0.5;
    const maxRatio = speedRatios.length > 0 ? Math.max(...speedRatios) : 1.5;
    const range = maxRatio - minRatio || 0.5;

    const colorStops: (number | string)[] = [];
    for (const sc of SPEED_COLORS) {
      const t = sc.at / 2.0;
      const scaled = minRatio + t * range;
      colorStops.push(scaled, sc.color);
    }
    const interpolateExpr: ExpressionSpecification = ['interpolate', ['linear'], ['get', 'speedRatio'], ...colorStops];


    const routeData = { type: 'FeatureCollection' as const, features: segFeatures };

    try {
      map.addSource(sourceId, { type: 'geojson', data: routeData });
    } catch {
      this.mapRerenderPending = true;
      if (!this.rerenderLoadHandler) {
        this.rerenderLoadHandler = () => {
          if (this.mapRerenderPending) {
            this.mapRerenderPending = false;
            this.renderRouteOnMap();
          }
        };
        map.once('load', this.rerenderLoadHandler);
      }
      return;
    }

    map.addLayer({
      id: `${layerBaseId}-casing`,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.9,
        'line-width': 6,
      },
    });

    map.addLayer({
      id: layerBaseId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': interpolateExpr,
        'line-opacity': 0.9,
        'line-width': 4,
      },
    });

    map.addSource('detail-hover-point', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
      id: 'detail-hover-point-layer',
      type: 'circle',
      source: 'detail-hover-point',
      paint: {
        'circle-color': '#14211b',
        'circle-radius': 5,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });

    this.doneLoading();

    const coords = route.coordinates;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    map.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      { padding: 40, maxZoom: 15, duration: 0 },
    );
  }

  private buildSpeedSegments(
    coords: [number, number][],
    cumulativeDistances?: number[],
  ): GeoJSON.Feature<GeoJSON.LineString>[] {
    if (coords.length < 2) { return []; }

    const avgSpeedMs = this.speedMs();
    if (!avgSpeedMs || avgSpeedMs <= 0) { return []; }

    const spanMeters = Math.max(50, avgSpeedMs * SPAN_SECONDS);

    const spans: { startIdx: number; endIdx: number; dist: number }[] = [];
    let spanStart = 0;
    let spanDist = 0;
    for (let i = 1; i < coords.length; i++) {
      const segDist = cumulativeDistances
        ? (cumulativeDistances[i] ?? 0) - (cumulativeDistances[i - 1] ?? 0)
        : haversineDistance(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
      spanDist += segDist;
      if (spanDist >= spanMeters || i === coords.length - 1) {
        spans.push({ startIdx: spanStart, endIdx: i, dist: spanDist });
        spanStart = i;
        spanDist = 0;
      }
    }

    if (spans.length < 2) { return []; }

    const pointCounts = spans.map((s) => s.endIdx - s.startIdx + 1);
    const avgPoints = pointCounts.reduce((s, c) => s + c, 0) / pointCounts.length;

    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    for (const span of spans) {
      const coordsInSpan = coords.slice(span.startIdx, span.endIdx + 1);
      if (coordsInSpan.length < 2) { continue; }

      const pointDensity = span.dist > 0 ? coordsInSpan.length / span.dist : 0;
      const normDensity = avgPoints > 0 ? pointDensity / (avgPoints / spanMeters) : 1;
      const speedRatio = normDensity > 0 ? 1 / normDensity : 2;

      features.push({
        type: 'Feature',
        properties: { speedRatio: Math.max(0.1, Math.min(3, speedRatio)) },
        geometry: {
          type: 'LineString',
          coordinates: coordsInSpan,
        },
      });
    }

    return features;
  }

  resizeMap(): void {
    setTimeout(() => this.mapInstance?.resize(), 50);
  }

  protected togglePanelExpand(): void {
    const expanded = !this.panelExpanded();
    this.panelExpanded.set(expanded);
    this.panelExpand.emit(expanded);
    setTimeout(() => {
      this.mapInstance?.resize();
    }, 100);
  }

  protected toggleLayerMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.layerMenuOpen.update((v) => !v);
  }

  protected selectLayer(config: BasemapProviderConfig): void {
    this.layerMenuOpen.set(false);
    if (config.id === this.activeLayerId()) { return; }
    this.activeLayerId.set(config.id);
    this.basemapProviderService.setProvider(config);
    const map = this.mapInstance;
    if (map) {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const pitch = map.getPitch();
      const bearing = map.getBearing();
      map.setStyle(config.styleUrl!);
      map.once('style.load', () => {
        this.renderRouteOnMap();
        map.jumpTo({ center, zoom, pitch, bearing });
        import('maplibre-gl').then((ml) => {
          map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');
          map.addControl(new ml.ScaleControl({ unit: 'metric' }), 'bottom-left');
        });
      });
    }
  }

  protected onElevationHover(pos: { lng: number; lat: number } | null): void {
    const map = this.mapInstance;
    if (!map) { return; }
    const source = map.getSource('detail-hover-point') as GeoJSONSource | undefined;
    if (!source) { return; }
    if (pos) {
      source.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] }, properties: {} }],
      });
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }

  protected downloadGpx(): void {
    const a = this.activity();
    if (!a) { return; }
    this.gpxExportService.exportActivity(a).then((result) => {
      if (!result.success) {
        this.toastService.show(result.reason);
      }
    });
  }

  protected showOnMapExplorer(): void {
    const a = this.activity();
    if (!a) { return; }
    this.router.navigate(['/map'], { queryParams: { activityId: a.id } });
  }

  protected showOnActivitiesTable(): void {
    const a = this.activity();
    if (!a) { return; }
    this.closePanel();
    this.router.navigate(['/activities'], { queryParams: { focusActivityId: a.id } });
  }

  protected toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.update((v) => !v);
  }

  protected openInStrava(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    const a = this.activity();
    if (!a || !a.providerActivityId) { return; }
    const c = (globalThis as any).chrome;
    if (c?.tabs?.create) {
      c.tabs.create({ url: `https://www.strava.com/activities/${a.providerActivityId}` });
    } else {
      window.open(`https://www.strava.com/activities/${a.providerActivityId}`, '_blank');
    }
  }

  protected async deleteActivity(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    this.menuOpen.set(false);
    const a = this.activity();
    if (!a) { return; }
    const confirmed = await this.confirmService.confirm({
      title: 'Delete activity',
      message: `Remove "${a.name}" and its route from the local database?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) { return; }
    this.close.emit();
    this.panelVisible.set(false);
    await this.repositories.activities.delete(a.id);
    await this.repositories.activityRoutes.delete(a.id);
    this.dataRefresh.emitRefresh();
  }

  protected async editActivity(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    this.menuOpen.set(false);
    const a = this.activity();
    if (!a) return;
    const ref = this.dialog.open(EditActivityDialog, {
      data: {
        currentName: a.name,
        currentSportType: a.sportType,
        currentActivityStatus: a.activityStatus ?? 'completed',
      },
      disableClose: true,
    });
    const result = await ref.afterClosed().toPromise();
    if (!result) return;
    if (result.name === a.name && result.sportType === a.sportType && result.activityStatus === (a.activityStatus ?? 'completed')) return;
    await this.repositories.activities.updateMetadata(a.id, {
      name: result.name,
      sportType: result.sportType,
      activityStatus: result.activityStatus,
    });
    this.dataRefresh.emitRefresh();
  }

  protected closePanel(): void {
    this.panelVisible.set(false);
    setTimeout(() => {
      this.mapInstance?.remove();
      this.mapInstance = null;
      this.mapInitialized.set(false);
      this.close.emit();
    }, 250);
  }
}
