function log(msg, data) {
  console.log('[Trailroam:bg]', msg, data !== undefined ? data : '');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Received message type', message?.type);

  if (message?.type === 'TRAILROAM_SYNC_ACTIVITIES') {
    const activities = message.activities || [];
    log('Storing ' + activities.length + ' activities to chrome.storage.local');

    chrome.storage.local.set({ trailroam_sync_activities: activities }, () => {
      log('Stored in chrome.storage.local');
    });

    sendResponse({ received: activities.length });
    return true;
  }

  return true;
});
