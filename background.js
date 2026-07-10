const SUPABASE_URL = "https://eoeiuohwxulkgppjaogk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvZWl1b2h3eHVsa2dwcGphb2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMTgzMDcsImV4cCI6MjA5NTc5NDMwN30.VqMaEwmxrDllKn_c5d6lqr5PF_RLp2w_j8gbMUGDiII";
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
  const key = supabaseKey || SUPABASE_KEY;
  if (!key) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/discord_alerts?is_processed=eq.false&order=created_at.desc&limit=5`, {
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
      }
    });
    const alerts = await res.json();
    if (!alerts || alerts.length === 0) return;

    for (const alert of alerts) {
      // Mark as processed
      await fetch(`${SUPABASE_URL}/rest/v1/discord_alerts?id=eq.${alert.id}`, {
        method: "PATCH",
        headers: {
          "apikey": key,
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({ is_processed: true })
      });

      // Open link in new tab
      if (alert.event_url) {
        // Save alert data for content script
        await new Promise(resolve =>
          chrome.storage.local.set({ pendingAlert: {
            quantity: alert.quantity,
            section: alert.section,
            price_min: alert.price_min,
            event_name: alert.event_name
          }}, resolve)
        );
        
        chrome.tabs.create({ url: alert.event_url });
        
        // Show notification
        chrome.notifications.create("alert_" + Date.now(), {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "🎟️ Nový Discord Alert!",
          message: alert.event_name ?? alert.event_url,
          priority: 2,
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
