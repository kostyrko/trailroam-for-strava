function log(msg, data) {
  console.log('[Trailroam:cs]', msg, data !== undefined ? data : '');
}

function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

async function fetchActivityList(page, perPage) {
  const url = '/athlete/training_activities?new_activity_only=false&per_page=' + perPage + '&page=' + page;
  const response = await fetch(url, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  if (!response.ok) return null;
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    if (data && Array.isArray(data.models)) return data.models;
    if (Array.isArray(data)) return data;
    return null;
  } catch {
    return null;
  }
}

async function fetchActivityRoute(activityId) {
  const url = '/api/v3/activities/' + activityId + '/streams?keys=latlng&key_by_type=true';
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) return null;
    return null;
  }
  return response.json();
}

async function runSync() {
  log('Sync started');

  try {
    let page = 1;
    const perPage = 100;
    let allActivities = [];
    let hasMore = true;

    while (hasMore) {
      const activities = await fetchActivityList(page, perPage);
      if (!activities || activities.length === 0) break;
      allActivities = allActivities.concat(activities);
      hasMore = activities.length === perPage;
      page++;
    }

    log('Fetched ' + allActivities.length + ' activities');

    if (allActivities.length > 0) {
      chrome.runtime.sendMessage({
        type: 'TRAILROAM_SYNC_ACTIVITIES',
        activities: allActivities
      }, () => {
        log('Background acknowledged');
      });
      log('Sent ' + allActivities.length + ' activities to background');
    }

    const statusEl = document.getElementById('trailroam-sync-status');
    if (statusEl) {
      statusEl.textContent = 'Fetched ' + allActivities.length + ' activities. Reload Trailroam app to see them.';
    }
  } catch (err) {
    log('Sync error', err);
    const statusEl = document.getElementById('trailroam-sync-status');
    if (statusEl) {
      statusEl.textContent = 'Sync error: ' + err.message;
    }
  }
}

if (getUrlParam('trailroamSync') === 'true') {
  log('trailroamSync detected');

  document.title = 'Trailroam Sync';
  document.body.innerHTML =
    '<div style="font-family: system-ui, sans-serif; padding: 40px; text-align: center;">' +
    '<h1>Syncing to Trailroam</h1>' +
    '<p id="trailroam-sync-status">Fetching your activities from Strava...</p>' +
    '</div>';

  runSync();
}
