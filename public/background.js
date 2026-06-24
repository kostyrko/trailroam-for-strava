function log(msg, data) {
  console.log('[Trailroam:bg]', msg, data !== undefined ? data : '');
}

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

var STORE_ACTIVITIES_TYPE = 'TRAILROAM_STORE_ACTIVITIES';

function forwardToApp(type, payload) {
  chrome.runtime.sendMessage({ type: type, payload: payload }).catch(function () {
    log('No app tab to receive message');
  });
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return true;

  if (message.type === 'TRAILROAM_GET_SYNCED_IDS') {
    var appMsg = { type: 'TRAILROAM_GET_SYNCED_IDS', payload: {} };
    chrome.runtime.sendMessage(appMsg).then(function (response) {
      sendResponse(response || { syncedIds: [] });
    }).catch(function () {
      sendResponse({ syncedIds: [] });
    });
    return true;
  }

  if (message.type === 'TRAILROAM_GET_MISSING_ACTIVITIES') {
    var appMessage = { type: 'TRAILROAM_GET_MISSING_ACTIVITIES', payload: {} };
    chrome.runtime.sendMessage(appMessage).then(function (response) {
      sendResponse(response || { activityIds: [] });
    }).catch(function () {
      sendResponse({ activityIds: [] });
    });
    return true;
  }

  if (message.type === 'TRAILROAM_IMPORT') {
    var activities = message.activities || [];
    var routes = message.routes || [];
    log('Received TRAILROAM_IMPORT: ' + activities.length + ' activities, ' + routes.length + ' route results');

    // First send activities
    var hasRoutes = routes.length > 0;
    forwardToApp(STORE_ACTIVITIES_TYPE, { activities: activities, routes: [], isFinalBatch: !hasRoutes });

    // Then send routes in chunks of 50 to avoid message size limits
    var CHUNK = 50;
    var totalChunks = Math.ceil(routes.length / CHUNK);
    for (var i = 0; i < routes.length; i += CHUNK) {
      var chunk = routes.slice(i, i + CHUNK);
      var isLast = (i / CHUNK) + 1 >= totalChunks;
      forwardToApp(STORE_ACTIVITIES_TYPE, { activities: [], routes: chunk, isFinalBatch: isLast });
    }

    sendResponse({ ok: true, importedCount: activities.length, routeCount: routes.length });
    return true;
  }

  return true;
});
