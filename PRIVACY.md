# TrailRoam for Strava — Privacy Policy

**Last updated:** June 2026

## Data collection

TrailRoam for Strava does **not** collect, store, or transmit any personal data. The extension has no accounts, no backend servers, and no analytics.

## Local storage

All data — imported Strava activities, GPS routes, and app settings — is stored **only in your browser's IndexedDB** using Dexie.js. This data never leaves your device unless you explicitly export it (e.g., GPX download or JSON backup).

You can inspect stored data at any time by opening Chrome DevTools (F12) → Application → IndexedDB → `trailroam_for_strava`.

## Network requests

The extension makes only the following network requests:

1. **Strava API calls** — When you initiate a sync, the extension fetches activity metadata and GPS route data from `strava.com` via your logged-in browser session. These calls are same-origin (the content script runs on `strava.com`).
2. **Map tile requests** — The map uses OpenFreeMap as the default basemap. Tile requests are sent to `tiles.openfreemap.org` to render the map background. No route or activity data is included in these requests.
3. **Nothing else** — No telemetry, no analytics, no third-party services.

## Data deletion

You can delete all synced data at any time from the extension's Settings page (**Clear synced local data**). This removes all activities, routes, and sync state from your browser. Settings are retained unless you choose a full reset.

## Third-party services

| Service | Purpose | Data shared |
|---|---|---|
| Strava (strava.com) | Activity sync | Activity metadata and GPS routes (fetched same-origin via your browser session) |
| OpenFreeMap (tiles.openfreemap.org) | Map tile rendering | None — only map tile coordinates |

## Changes to this policy

If this policy changes, the version will be updated at the top of this document.

## Contact

For questions about this privacy policy, open an issue on the [GitHub repository](https://github.com/trailroam/trailroam-for-strava).
