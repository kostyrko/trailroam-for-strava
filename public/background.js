function log(msg, data) {
  console.log('[Trailroam:bg]', msg, data !== undefined ? data : '');
}

var STORE_ACTIVITIES_TYPE = 'TRAILROAM_STORE_ACTIVITIES';

function forwardToApp(type, payload) {
  chrome.runtime.sendMessage({ type: type, payload: payload }).catch(function () {
    log('No app tab to receive message');
  });
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return true;

  if (message.type === 'TRAILROAM_IMPORT') {
    var activities = message.activities || [];
    var routes = message.routes || [];
    log('Received TRAILROAM_IMPORT: ' + activities.length + ' activities, ' + routes.length + ' route results');

    // First send activities
    forwardToApp(STORE_ACTIVITIES_TYPE, { activities: activities, routes: [] });

    // Then send routes in chunks of 50 to avoid message size limits
    var CHUNK = 50;
    for (var i = 0; i < routes.length; i += CHUNK) {
      var chunk = routes.slice(i, i + CHUNK);
      forwardToApp(STORE_ACTIVITIES_TYPE, { activities: [], routes: chunk });
    }

    sendResponse({ ok: true, importedCount: activities.length, routeCount: routes.length });
    return true;
  }

  return true;
});
