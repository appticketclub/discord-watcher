const SUPABASE_URL = "https://eoeiuohwxulkgppjaogk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvZWl1b2h3eHVsa2dwcGphb2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMTgzMDcsImV4cCI6MjA5NTc5NDMwN30.VqMaEwmxrDllKn_c5d6lqr5PF_RLp2w_j8gbMUGDiII";
let supabaseKey = null;
let isWatching = false;
let watchInterval = null;

let filters = { blacklist: "", whitelist: "", minTickets: 1, maxPrice: 500, intervalMin: 5, intervalMax: 12, discordWebhook: "", tmAccount: "" };
let channels = { NL: true, DE: true, ES: true, WORLD: true, TEST: true };
let isRefreshing = false;

// Create keep-alive alarm on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
  console.log("[Discord Watcher] Keep-alive alarm created");
});

// Also create on startup in case it was lost
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
});

// Recreate alarm if it doesn't exist
chrome.alarms.get("keepAlive", (alarm) => {
  if (!alarm) {
    chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    console.log("[Discord Watcher] Keep-alive tick - checking alerts...");
    chrome.storage.local.get(["isWatching", "supabaseKey", "isRefreshing"], (data) => {
      if (data.isWatching) {
        supabaseKey = data.supabaseKey || SUPABASE_KEY;
        isWatching = true;
        isRefreshing = data.isRefreshing || false;
        checkAlerts();
      }
    });
  }
});

// Load saved filters on startup
chrome.storage.local.get(["filters", "channels"], (data) => {
  if (data.filters) filters = data.filters;
  if (data.channels) channels = data.channels;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_WATCHING") {
    supabaseKey = msg.supabaseKey;
    isWatching = true;
    isRefreshing = false;
    chrome.storage.local.set({ isWatching: true, supabaseKey: msg.supabaseKey, isRefreshing: false });
    
    // Load filters first then start
    chrome.storage.local.get(["filters", "channels"], (data) => {
      if (data.filters) filters = data.filters;
      if (data.channels) channels = data.channels;
      startWatching();
    });
    
    sendResponse({ ok: true });
  }

  // Reset mutex ONLY when checkout is reached (tickets found)
  if (msg.type === "CHECKOUT_REACHED") {
    isRefreshing = false;
    chrome.storage.local.set({ isRefreshing: false });
    console.log("[Discord Watcher] Checkout reached, mutex released");
    sendResponse({ ok: true });
  }

  if (msg.type === "STUCK_RELEASE") {
    isRefreshing = false;
    chrome.storage.local.set({ isRefreshing: false });
    console.log("[Discord Watcher] Stuck detected, mutex released");
    sendResponse({ ok: true });
  }

  // Also reset if watcher is stopped manually
  if (msg.type === "STOP_WATCHING") {
    isRefreshing = false;
    chrome.storage.local.set({ isRefreshing: false });
    isWatching = false;
    if (watchInterval) clearInterval(watchInterval);
    chrome.storage.local.set({ isWatching: false });
    
    // Stop content script in active tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: "STOP_CONTENT" }).catch(() => {});
      });
    });
    
    sendResponse({ ok: true });
  }

  if (msg.type === "GET_STATUS") {
    sendResponse({ isWatching });
  }

  if (msg.type === "UPDATE_FILTERS") {
    filters = msg.filters;
    channels = msg.channels;
    chrome.storage.local.set({ filters, channels });
    sendResponse({ ok: true });
  }

  return true;
});

async function checkAlerts() {
  const key = supabaseKey || SUPABASE_KEY;
  if (!key || !isWatching) return;
  try {
    const localData = await new Promise(resolve =>
      chrome.storage.local.get(["processedAlerts"], resolve)
    );
    const processedAlerts = new Set(localData.processedAlerts || []);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/discord_alerts?created_at=gte.${oneHourAgo}&order=created_at.desc&limit=20`, {
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
      }
    });
    const alerts = await res.json();
    if (!alerts || alerts.length === 0) return;

    for (const alert of alerts) {
      if (processedAlerts.has(alert.id)) continue;

      processedAlerts.add(alert.id);
      const processedArray = [...processedAlerts].slice(-100);
      chrome.storage.local.set({ processedAlerts: processedArray });

      if (alert.channel_name && !channels[alert.channel_name]) {
        chrome.runtime.sendMessage({ type: "ALERT_FILTERED", event_name: alert.event_name + " (kanál)" });
        continue;
      }

      if (filters.whitelist) {
        const whitelist = filters.whitelist.split("\n").map(s => s.trim().toLowerCase()).filter(Boolean);
        if (whitelist.length > 0) {
          const name = (alert.event_name || "").toLowerCase();
          if (!whitelist.some(w => name.includes(w))) {
            chrome.runtime.sendMessage({ type: "ALERT_FILTERED", event_name: alert.event_name + " (whitelist)" });
            continue;
          }
        }
      }

      if (filters.blacklist) {
        const blacklist = filters.blacklist.split("\n").map(s => s.trim().toLowerCase()).filter(Boolean);
        const name = (alert.event_name || "").toLowerCase();
        if (blacklist.some(b => name.includes(b))) {
          chrome.runtime.sendMessage({ type: "ALERT_FILTERED", event_name: alert.event_name + " (blacklist)" });
          continue;
        }
      }

      if (alert.quantity && alert.quantity < filters.minTickets) {
        chrome.runtime.sendMessage({ type: "ALERT_FILTERED", event_name: alert.event_name + " (málo lístkov)" });
        continue;
      }

      if (alert.price_min && alert.price_min > filters.maxPrice) {
        chrome.runtime.sendMessage({ type: "ALERT_FILTERED", event_name: alert.event_name + " (vysoká cena)" });
        continue;
      }

      if (alert.event_url) {
        if (isRefreshing) {
          console.log("[Discord Watcher] Already refreshing, skipping:", alert.event_name);
          continue;
        }

        isRefreshing = true;
        chrome.storage.local.set({ isRefreshing: true });

        const pendingAlertData = {
          id: alert.id,
          quantity: alert.quantity,
          section: alert.section,
          price_min: alert.price_min,
          event_name: alert.event_name
        };

        let eventUrl = alert.event_url;
        if (eventUrl && eventUrl.includes('ticketmaster')) {
          const separator = eventUrl.includes('?') ? '&' : '?';
          eventUrl = `${eventUrl}${separator}language=en-us`;
        }

        // Use Promise to ensure storage is written before tab opens
        await new Promise((resolve) => {
          chrome.storage.local.set({ pendingAlert: pendingAlertData }, resolve);
        });

        // Verify it was saved
        const verify = await new Promise(resolve =>
          chrome.storage.local.get(["pendingAlert"], resolve)
        );
        console.log("[Discord Watcher] pendingAlert saved:", !!verify.pendingAlert);

        chrome.tabs.create({ url: eventUrl });

        chrome.notifications.create("alert_" + Date.now(), {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "🎟️ Nový Discord Alert!",
          message: alert.event_name ?? alert.event_url,
          priority: 2,
        });
        chrome.runtime.sendMessage({ type: "ALERT_OPENED", event_name: alert.event_name, url: alert.event_url });
        
        if (filters.discordWebhook) {
          try {
            const fields = [
              { name: "URL", value: alert.event_url, inline: false },
              { name: "Počet lístkov", value: alert.quantity?.toString() || "-" , inline: true },
              { name: "Sekcia", value: alert.section || "-" , inline: true },
              { name: "Min. cena", value: alert.price_min ? `${alert.price_min}€` : "-" , inline: true },
              { name: "Kanál", value: alert.channel_name || "-" , inline: true }
            ];
            if (filters.tmAccount) {
              fields.push({ name: "Účet na Ticketmaster", value: filters.tmAccount, inline: true });
            }
            await fetch(filters.discordWebhook, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                embeds: [{
                  title: "🎟️ Nový Discord Alert!",
                  description: `**${alert.event_name || "Neznáma akcia"}**`,
                  fields: fields,
                  color: 2067273
                }]
              })
            });
          } catch (e) {
            console.error("[Discord Watcher] Failed to send webhook:", e);
          }
        }
      }
    }
  } catch(e) {
    console.error("[Discord Watcher] Error:", e);
  }
}

function startWatching() {
  if (watchInterval) clearInterval(watchInterval);
  watchInterval = setInterval(checkAlerts, 5000);
  checkAlerts();
}

// Restore state on startup
chrome.storage.local.get(["isWatching", "supabaseKey", "isRefreshing"], (data) => {
  if (data.isWatching && data.supabaseKey) {
    supabaseKey = data.supabaseKey;
    isWatching = true;
    isRefreshing = data.isRefreshing || false;
    startWatching();
  }
});

chrome.storage.local.get(["isRefreshing"], (data) => {
  isRefreshing = data.isRefreshing || false;
});
