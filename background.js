const SUPABASE_URL = "https://eoeiuohwxulkgppjaogk.supabase.co";
let supabaseKey = null;
let isWatching = false;
let watchInterval = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_WATCHING") {
    supabaseKey = msg.supabaseKey;
    isWatching = true;
    chrome.storage.local.set({ isWatching: true, supabaseKey: msg.supabaseKey });
    startWatching();
    sendResponse({ ok: true });
  }

  if (msg.type === "STOP_WATCHING") {
    isWatching = false;
    if (watchInterval) clearInterval(watchInterval);
    chrome.storage.local.set({ isWatching: false });
    sendResponse({ ok: true });
  }

  if (msg.type === "GET_STATUS") {
    sendResponse({ isWatching });
  }

  return true;
});

async function checkAlerts() {
  if (!supabaseKey) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/discord_alerts?is_processed=eq.false&order=created_at.desc&limit=5`, {
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
      }
    });
    const alerts = await res.json();
    if (!alerts || alerts.length === 0) return;

    for (const alert of alerts) {
      // Mark as processed
      await fetch(`${SUPABASE_URL}/rest/v1/discord_alerts?id=eq.${alert.id}`, {
        method: "PATCH",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({ is_processed: true })
      });

      // Open link in new tab
      if (alert.event_url) {
        chrome.tabs.create({ url: alert.event_url });
        
        // Show notification
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "🎟️ Nový Discord Alert!",
          message: alert.event_name ?? alert.event_url,
          priority: 2,
          requireInteraction: true,
        });
      }
    }
  } catch(e) {
    console.error("[Discord Watcher]", e);
  }
}

function startWatching() {
  if (watchInterval) clearInterval(watchInterval);
  watchInterval = setInterval(checkAlerts, 5000);
  checkAlerts();
}

// Restore state on startup
chrome.storage.local.get(["isWatching", "supabaseKey"], (data) => {
  if (data.isWatching && data.supabaseKey) {
    supabaseKey = data.supabaseKey;
    isWatching = true;
    startWatching();
  }
});
