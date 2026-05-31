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
    if (data && Array.isArray(data.models)) return data;
    if (Array.isArray(data)) return { models: data };
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
    var perPage = 20;
    var rawActivities = [];
    var total = Infinity;

    while (rawActivities.length < total) {
      var result = await fetchActivityList(page, perPage);
      if (!result || !Array.isArray(result.models) || result.models.length === 0) break;
      rawActivities = rawActivities.concat(result.models);
      if (result.total !== undefined) total = result.total;
      page++;
      setStatus('Fetching your activities from Strava (' + rawActivities.length + '/' + total + ')...');
    }

    log('Fetched ' + rawActivities.length + ' activities from Strava');
    setStatus('Fetched ' + rawActivities.length + ' activities. Now fetching routes...');

    var activitiesWithRoutes = [];
    var skippedRoutes = 0;
    var CONCURRENCY = 3;

    for (var k = 0; k < rawActivities.length; k += CONCURRENCY) {
      var batch = rawActivities.slice(k, k + CONCURRENCY);
      var batchResults = await Promise.all(batch.map(function (a) {
        return fetchActivityRoute(a.id).then(function (routeData) {
          var hasGps = routeData && routeData.latlng && Array.isArray(routeData.latlng.data) && routeData.latlng.data.length > 0;
          return { activity: a, routeData: hasGps ? routeData : null, hasGps: hasGps };
        });
      }));

      for (var r = 0; r < batchResults.length; r++) {
        var br = batchResults[r];
        activitiesWithRoutes.push(br);
        if (!br.hasGps) skippedRoutes++;
      }

      setStatus('Fetched routes for ' + Math.min(k + CONCURRENCY, rawActivities.length) + '/' + rawActivities.length + ' activities');
    }

    var routeCount = activitiesWithRoutes.length - skippedRoutes;
    log('Fetched routes: ' + routeCount + ' with GPS, ' + skippedRoutes + ' without GPS');
    setStatus('Sending all data to Trailroam...');

    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({
        type: 'TRAILROAM_IMPORT',
        activities: rawActivities,
        routes: activitiesWithRoutes.map(function (item) {
          return { activityId: item.activity.id, routeData: item.hasGps ? item.routeData : null };
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
          setStatus('Sync complete! ' + response.importedCount + ' activities' + (skippedRoutes > 0 ? (', ' + (response.importedCount - skippedRoutes) + ' with routes, ' + skippedRoutes + ' without GPS') : '') + '. You can close this tab and reload Trailroam.');
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
