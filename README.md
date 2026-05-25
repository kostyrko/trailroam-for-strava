# Trailroam for Strava

Chrome extension MVP for importing Strava activity data with the user's logged-in browser session, storing it locally, and showing routes in a full-page extension app.

This repository is currently set up as an Angular application. Chrome extension packaging is planned in later MVP tasks.

## MVP Constraints

- Chrome extension, not the full Trailroam app.
- Full-page extension app is the main UI; popup is only a launcher/status surface.
- No backend, cloud sync, Trailroam account, standalone Strava OAuth, or Strava client secret.
- Imported data is stored locally in the browser.
- MVP map stack is MapLibre GL JS with OpenFreeMap, with no API key required.

## Development

Install dependencies:

```bash
npm install
```

Run the Angular development server:

```bash
npm start
```

Build the app:

```bash
npm run build
```

Run tests:

```bash
npm test
```
