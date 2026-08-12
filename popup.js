const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvZWl1b2h3eHVsa2dwcGphb2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMTgzMDcsImV4cCI6MjA5NTc5NDMwN30.VqMaEwmxrDllKn_c5d6lqr5PF_RLp2w_j8gbMUGDiII";

const els = {
  licenseKey: document.getElementById("licenseKey"),
  userEmail: document.getElementById("userEmail"),
  activateBtn: document.getElementById("activateBtn"),
  licenseMsg: document.getElementById("licenseMsg"),
  licenseSection: document.getElementById("licenseSection"),
  settingsSection: document.getElementById("settingsSection"),
  settingsPanel: document.getElementById("settingsPanel"),
  settingsBtn: document.getElementById("settingsBtn"),
  backBtn: document.getElementById("backBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  toggleBtn: document.getElementById("toggleBtn"),
  timerBar: document.getElementById("timerBar"),
  timerText: document.getElementById("timerText"),
  statusLog: document.getElementById("statusLog"),
  blacklist: document.getElementById("blacklist"),
  whitelist: document.getElementById("whitelist"),
  minTickets: document.getElementById("minTickets"),
  maxQty: document.getElementById("maxQty"),
  maxPrice: document.getElementById("maxPrice"),
  intervalMin: document.getElementById("intervalMin"),
  intervalMax: document.getElementById("intervalMax"),
  pauseAfterCycles: document.getElementById("pauseAfterCycles"),
  pauseDuration: document.getElementById("pauseDuration"),
  discordWebhook: document.getElementById("discordWebhook"),
  tmAccount: document.getElementById("tmAccount"),
};

let timerInterval = null;
let startTime = null;

// Load saved data
chrome.storage.local.get(["licenseKey", "userEmail", "isWatching", "watcherStartTime", "filters", "channels"], async (data) => {
  if (data.userEmail) els.userEmail.value = data.userEmail;
  if (data.licenseKey) {
    els.licenseKey.value = data.licenseKey;
    try {
      const res = await fetch(`https://app.ticketclub.vip/api/extension/verify?key=${encodeURIComponent(data.licenseKey)}&email=${encodeURIComponent(data.userEmail)}`);
      const text = await res.text();
      if (text.startsWith("VALID")) {
        showActivated(data.isWatching, data.watcherStartTime);
      }
    } catch {
      // If verify fails, still show UI based on stored state
      if (data.isWatching !== undefined) {
        showActivated(data.isWatching, data.watcherStartTime);
      }
    }
  }
  // Load filters
  if (data.filters) {
    els.blacklist.value = data.filters.blacklist || "";
    els.whitelist.value = data.filters.whitelist || "";
    els.minTickets.value = data.filters.minTickets || 1;
    els.maxQty.value = data.filters.maxQty || 2;
    els.maxPrice.value = data.filters.maxPrice || 500;
    els.intervalMin.value = data.filters.intervalMin || 5;
    els.intervalMax.value = data.filters.intervalMax || 12;
    els.pauseAfterCycles.value = data.filters?.pauseAfterCycles || 0;
    els.pauseDuration.value = data.filters?.pauseDuration || 60;
    els.discordWebhook.value = data.filters.discordWebhook || "";
    els.tmAccount.value = data.filters.tmAccount || "";
  }
  // Load channels
  ["NL","DE","ES","WORLD","TEST"].forEach(ch => {
    const el = document.getElementById(`ch_${ch}`);
    if (el) el.checked = !data.channels || data.channels[ch] !== false;
  });
});

// Activate button
els.activateBtn.addEventListener("click", async () => {
  const key = els.licenseKey.value.trim();
  const email = els.userEmail.value.trim();
  if (!key || !email) { els.licenseMsg.textContent = "Zadejte email a klíč"; els.licenseMsg.style.color = "#f87171"; return; }
  els.licenseMsg.textContent = "Ověřuji..."; els.licenseMsg.style.color = "#a0a0a0";
  try {
    await chrome.storage.local.remove(["profileId"]);
    const profileId = "profile_" + Math.random().toString(36).substr(2, 16) + "_" + Date.now();
    await chrome.storage.local.set({ profileId });
    const res = await fetch(`https://app.ticketclub.vip/api/extension/verify?key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}&profileId=${encodeURIComponent(profileId)}&forceActivate=true`);
    const text = (await res.text()).trim();
    if (text.startsWith("VALID")) {
      await chrome.storage.local.set({ licenseKey: key, userEmail: email });
      els.licenseMsg.textContent = "✓ Licencia platná"; els.licenseMsg.style.color = "#34d399";
      showActivated(false, null);
    } else {
      els.licenseMsg.textContent = "✗ Neplatný kľúč"; els.licenseMsg.style.color = "#f87171";
    }
  } catch { els.licenseMsg.textContent = "✗ Chyba pripojenia"; els.licenseMsg.style.color = "#f87171"; }
});

// Toggle watcher
els.toggleBtn.addEventListener("click", async () => {
  const data = await new Promise(resolve => chrome.storage.local.get(["isWatching"], resolve));
  if (data.isWatching) {
    // Stop
    chrome.runtime.sendMessage({ type: "STOP_WATCHING" }, () => {
      chrome.storage.local.remove(["watcherStartTime"]);
      setWatcherUI(false);
      addLog("Watcher zastavený.", "error");
    });
  } else {
    // Start
    const now = Date.now();
    // Reset all state before starting
    chrome.storage.local.remove(["isRefreshing", "reloadCount"]);

    // Then start watching
    chrome.runtime.sendMessage({ type: "START_WATCHING", supabaseKey: SUPABASE_KEY }, () => {
      chrome.storage.local.set({ watcherStartTime: now });
      setWatcherUI(true, now);
      addLog("Watcher spustený!", "success");
    });
  }
});

// Settings
els.settingsBtn.addEventListener("click", () => {
  els.settingsSection.classList.add("hidden");
  els.settingsPanel.classList.remove("hidden");
});

els.backBtn.addEventListener("click", () => {
  els.settingsPanel.classList.add("hidden");
  els.settingsSection.classList.remove("hidden");
});

els.saveSettingsBtn.addEventListener("click", () => {
  const filters = {
    blacklist: els.blacklist.value.trim(),
    whitelist: els.whitelist.value.trim(),
    minTickets: parseInt(els.minTickets.value) || 1,
    maxQty: parseInt(els.maxQty.value) || 2,
    maxPrice: parseFloat(els.maxPrice.value) || 500,
    intervalMin: parseInt(els.intervalMin.value) || 5,
    intervalMax: parseInt(els.intervalMax.value) || 12,
    pauseAfterCycles: parseInt(els.pauseAfterCycles.value) || 0,
    pauseDuration: parseInt(els.pauseDuration.value) || 60,
    discordWebhook: els.discordWebhook.value.trim(),
    tmAccount: els.tmAccount.value.trim(),
  };
  const channels = {};
  ["NL","DE","ES","WORLD","TEST"].forEach(ch => {
    channels[ch] = document.getElementById(`ch_${ch}`).checked;
  });
  chrome.storage.local.set({ filters, channels });
  chrome.runtime.sendMessage({ type: "UPDATE_FILTERS", filters, channels });
  els.settingsPanel.classList.add("hidden");
  els.settingsSection.classList.remove("hidden");
  addLog("Nastavenia uložené ✓", "success");
});

function setWatcherUI(running, startTimeMs) {
  if (running) {
    els.toggleBtn.textContent = "⏹ Zastaviť Watcher";
    els.toggleBtn.classList.add("stop");
    els.statusDot.className = "status-dot running";
    els.statusText.textContent = "Sleduje alerty...";
    els.timerBar.classList.remove("hidden");
    startTimer(startTimeMs || Date.now());
  } else {
    els.toggleBtn.textContent = "▶ Spustiť Watcher";
    els.toggleBtn.classList.remove("stop");
    els.statusDot.className = "status-dot active";
    els.statusText.textContent = "Aktívny";
    els.timerBar.classList.add("hidden");
    if (timerInterval) clearInterval(timerInterval);
  }
}

function startTimer(startMs) {
  if (timerInterval) clearInterval(timerInterval);
  startTime = startMs;
  function update() {
    const diff = Date.now() - startTime;
    const h = Math.floor(diff / 3600000).toString().padStart(2, "0");
    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0");
    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
    els.timerText.textContent = `${h}:${m}:${s}`;
  }
  update();
  timerInterval = setInterval(update, 1000);
}

function showActivated(isWatching, startTimeMs) {
  els.licenseSection.classList.add("hidden");
  els.settingsSection.classList.remove("hidden");
  setWatcherUI(isWatching, startTimeMs);
}

function addLog(text, level = "") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${level}`;
  entry.textContent = `[${new Date().toLocaleTimeString("cs-CZ")}] ${text}`;
  els.statusLog.insertBefore(entry, els.statusLog.firstChild);
  if (els.statusLog.children.length > 50) els.statusLog.removeChild(els.statusLog.lastChild);
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "ALERT_OPENED") addLog(`🎟️ Otvorený: ${msg.event_name || msg.url}`, "success");
  if (msg.type === "ALERT_FILTERED") addLog(`🚫 Filtrovaný: ${msg.event_name}`, "info");
  if (msg.type === "CONTENT_LOG") addLog(msg.text, msg.level || "info");
});
