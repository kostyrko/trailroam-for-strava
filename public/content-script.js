function log(msg, data) {
  console.log('[Trailroam:cs]', msg, data !== undefined ? data : '');
}

function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

async function fetchActivityList(page, perPage) {
  var url = '/athlete/training_activities?new_activity_only=false&per_page=' + perPage + '&page=' + page;
  var response = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  if (!response.ok) return null;
  try {
    var data = await response.json();
    if (data && Array.isArray(data.models)) return data.models;
    if (Array.isArray(data)) return data;
    return null;
  } catch { return null; }
}

async function fetchActivityRoute(activityId) {
  var url = '/api/v3/activities/' + activityId + '/streams?keys=latlng&key_by_type=true';
  var response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

async function runSync() {
  log('Sync started');
  setStatus('Fetching your activities from Strava...');

  try {
    var page = 1;
    var perPage = 100;
    var rawActivities = [];
    var hasMore = true;

    while (hasMore) {
      var activities = await fetchActivityList(page, perPage);
      if (!activities || activities.length === 0) break;
      rawActivities = rawActivities.concat(activities);
      hasMore = activities.length === perPage;
      page++;
    }

    log('Fetched ' + rawActivities.length + ' activities from Strava');
    setStatus('Fetched ' + rawActivities.length + ' activities. Now fetching routes...');

    var activitiesWithRoutes = [];
    var CONCURRENCY = 3;

    for (var k = 0; k < rawActivities.length; k += CONCURRENCY) {
      var batch = rawActivities.slice(k, k + CONCURRENCY);
      var batchResults = await Promise.all(batch.map(function (a) {
        return fetchActivityRoute(a.id).then(function (routeData) {
          return { activity: a, routeData: routeData };
        });
      }));

      for (var r = 0; r < batchResults.length; r++) {
        activitiesWithRoutes.push(batchResults[r]);
      }

      setStatus('Fetched routes for ' + Math.min(k + CONCURRENCY, rawActivities.length) + '/' + rawActivities.length + ' activities');
    }

    log('Fetched routes for ' + activitiesWithRoutes.length + ' activities');
    setStatus('Sending all data to Trailroam...');

    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({
        type: 'TRAILROAM_IMPORT',
        activities: rawActivities,
        routes: activitiesWithRoutes.map(function (item) {
          return { activityId: item.activity.id, routeData: item.routeData };
        })
      }, function (response) {
        if (chrome.runtime.lastError) {
          log('Send error', chrome.runtime.lastError);
          setStatus('Error: could not send data.');
          reject(chrome.runtime.lastError);
          return;
        }
        log('Background response', response);
        if (response && response.ok) {
          setStatus('Sync complete! ' + response.importedCount + ' activities, ' + response.routeCount + ' routes. You can close this tab and reload Trailroam.');
        } else {
          setStatus('Sync completed with issues. Check the background console for details.');
        }
        resolve();
      });
    });
  } catch (err) {
    log('Sync error', err);
    setStatus('Sync error: ' + err.message);
  }
}

function setStatus(msg) {
  var el = document.getElementById('trailroam-sync-status');
  if (el) el.textContent = msg;
}

if (getUrlParam('trailroamSync') === 'true') {
  log('trailroamSync detected');
  document.title = 'Trailroam Sync';
  document.body.innerHTML =
    '<div style="font-family: system-ui, sans-serif; padding: 40px; text-align: center;">' +
    '<h1>Syncing to Trailroam</h1>' +
    '<p id="trailroam-sync-status">Starting...</p>' +
    '</div>';
  runSync();
}
