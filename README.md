# Trailroam for Strava

Chrome extension MVP for importing Strava activity data using the user's logged-in browser session, storing it locally, and showing routes on a map.

## Install as unpacked extension

1. Run `npm install` to install dependencies.
2. Run `npm run build && npm run package:extension` to build and prepare the extension.
3. Open Chrome and navigate to `chrome://extensions`.
4. Enable **Developer mode** (toggle in top-right).
5. Click **Load unpacked** and select the `dist/trailroam-for-strava/browser` directory.

The extension icon will appear in the toolbar. Click it to open the popup, then click **Open TrailRoam** to launch the full app.

## Log in to Strava

Navigate to [strava.com](https://www.strava.com) and log in normally. The extension uses your existing browser session — there is no separate Strava OAuth flow.

## Sync your activities

Click **Sync activities** from any of these locations:

- **Activities page** empty state
- **Map page** empty state
- **Settings page** — Sync activities card
- **Header** — Sync dropdown → Sync new activities or Sync missing routes

This opens `strava.com/dashboard` with a sync parameter. The extension fetches activity metadata and GPS routes directly in the Strava tab and saves them locally.

Already-synced activities are detected during pagination so only new activities are fetched.

## OpenFreeMap default map

The map uses [OpenFreeMap](https://openfreemap.org) as the built-in basemap — no API key is required. MapLibre GL JS renders the map with route lines overlaid. Later basemap providers (MapTiler, Geoapify, Stadia Maps) can be configured in Settings with user-provided API keys stored locally.

## Known limitations

- **MVP beta** — this is an early release. Features are limited and UI may change.
- **No cloud sync** — all data stays in your browser's IndexedDB. Clearing browser data will remove it.
- **No standalone OAuth** — you must be logged into Strava in your browser for sync to work.
- **Large route sets** — rendering hundreds of routes on the map may be slow. Use date and category filters to reduce visible routes.
- **Strava session required** — the extension cannot sync if you are logged out of Strava.

## Development

```bash
npm install
npm start          # Angular dev server
npm run build      # Production build
npm test           # Run tests
npm run check      # Build + package extension
```

## Extension permissions

The manifest requests only what is necessary:

| Permission | Reason |
|---|---|
| `storage` | IndexedDB (via Dexie.js) — stores activities, routes, settings locally. |
| `tabs` | Open Strava dashboard in a new tab via `chrome.tabs.create` when sync is triggered. |
| `https://strava.com/*` | Content script runs on strava.com to fetch same-origin API data during sync. |
| `https://tiles.openfreemap.org/*` | OpenFreeMap tile server for the default map basemap. |

No `<all_urls>` is used. No unnecessary hosts are requested.

## Privacy

Activity and GPS route data is stored only in this browser's IndexedDB. No data is uploaded to Trailroam servers. See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## Chrome Web Store listing

**Short description** (132 characters):

> Import Strava routes locally and view them together on one map. All data stays in your browser.

**Full description:**

> TrailRoam for Strava lets you import your Strava activities and view their GPS routes together on a single interactive map — without uploading your data anywhere.
>
> **Features:**
>
> - **Local-first:** All imported activities and GPS routes are stored in your browser's IndexedDB. Nothing is uploaded to any server.
> - **Full-page map:** Explore all your routes on a MapLibre map with OpenFreeMap — no API key required.
> - **Smart sync:** Opens Strava in a new tab and imports activities using your existing browser session. No separate OAuth setup needed.
> - **Incremental:** Only new activities are fetched during each sync — already-synced data is detected and skipped.
> - **Filter & find:** Filter routes by activity type and date. Click an activity to zoom to its route on the map.
> - **Route clustering:** At zoomed-out levels, routes are clustered into count circles for a clean overview.
> - **GPX export:** Download individual routes as GPX files for use in Garmin, Komoot, or other navigation apps.
> - **Share bundles:** Generate a shareable ZIP with a map screenshot + GPX files of selected routes.
>
> **How it works:**
>
> 1. Install the extension and log into Strava in your browser.
> 2. Click **Sync activities** — a Strava tab opens and imports your activities.
> 3. Open the TrailRoam app to see all your routes on the map.
> 4. Click any route to see details or filter by type and date.
>
> **Permissions explained:**
>
> - `storage` — stores activities and routes locally in IndexedDB.
> - `tabs` — opens the Strava dashboard in a new tab when you start a sync.
> - `strava.com` — the content script fetches activity data same-origin during sync.
> - `tiles.openfreemap.org` — loads the free map background tiles.
>
> **Privacy:** No data leaves your browser. See the full privacy policy at [PRIVACY.md](PRIVACY.md).
>
> **Known limitations:** MVP beta release. Requires a logged-in Strava session. No cloud backup. Large route sets may be slow — use filters to limit visible routes.
