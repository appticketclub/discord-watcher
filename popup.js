const SUPABASE_URL = "https://eoeiuohwxulkgppjaogk.supabase.co";

const els = {
  licenseKey: document.getElementById("licenseKey"),
  userEmail: document.getElementById("userEmail"),
  activateBtn: document.getElementById("activateBtn"),
  licenseMsg: document.getElementById("licenseMsg"),
  licenseSection: document.getElementById("licenseSection"),
  settingsSection: document.getElementById("settingsSection"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  statusLog: document.getElementById("statusLog"),
};

chrome.storage.local.get(["licenseKey", "userEmail", "isWatching"], async (data) => {
  if (data.userEmail) els.userEmail.value = data.userEmail;
  if (data.licenseKey) {
    els.licenseKey.value = data.licenseKey;
    try {
      const res = await fetch(`https://app.ticketclub.vip/api/extension/verify?key=${encodeURIComponent(data.licenseKey)}&email=${encodeURIComponent(data.userEmail)}`);
      const text = await res.text();
      if (text.startsWith("VALID")) showActivated(data.isWatching);
    } catch {}
  }
});

els.activateBtn.addEventListener("click", async () => {
  const key = els.licenseKey.value.trim();
  const email = els.userEmail.value.trim();
  if (!key || !email) {
    els.licenseMsg.textContent = "Zadejte email a klíč";
    els.licenseMsg.style.color = "#f87171";
    return;
  }
  els.licenseMsg.textContent = "Ověřuji...";
  els.licenseMsg.style.color = "#a0a0a0";
  try {
    await chrome.storage.local.remove(["profileId"]);
    const profileId = "profile_" + Math.random().toString(36).substr(2, 16) + "_" + Date.now();
    await chrome.storage.local.set({ profileId });
    const res = await fetch(`https://app.ticketclub.vip/api/extension/verify?key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}&profileId=${encodeURIComponent(profileId)}&forceActivate=true`);
    const text = await res.text().then(t => t.trim());
    if (text.startsWith("VALID")) {
      await chrome.storage.local.set({ licenseKey: key, userEmail: email });
      els.licenseMsg.textContent = "✓ Licencia platná";
      els.licenseMsg.style.color = "#34d399";
      showActivated(false);
    } else {
      els.licenseMsg.textContent = "✗ Neplatný kľúč";
      els.licenseMsg.style.color = "#f87171";
    }
  } catch {
    els.licenseMsg.textContent = "✗ Chyba pripojenia";
    els.licenseMsg.style.color = "#f87171";
  }
});

els.startBtn.addEventListener("click", async () => {
  const data = await new Promise(resolve => chrome.storage.local.get(["licenseKey"], resolve));
  // Use anon key for Supabase
  const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvZWl1b2h3eHVsa2dwcGphb2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMTgzMDcsImV4cCI6MjA5NTc5NDMwN30.VqMaEwmxrDllKn_c5d6lqr5PF_RLp2w_j8gbMUGDiII";
  chrome.runtime.sendMessage({ type: "START_WATCHING", supabaseKey }, () => {
    els.startBtn.classList.add("hidden");
    els.stopBtn.classList.remove("hidden");
    els.statusDot.className = "status-dot running";
    els.statusText.textContent = "Sleduje alerty...";
    addLog("Watcher spustený!", "success");
  });
});

els.stopBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_WATCHING" }, () => {
    els.startBtn.classList.remove("hidden");
    els.stopBtn.classList.add("hidden");
    els.statusDot.className = "status-dot active";
    els.statusText.textContent = "Aktívny";
    addLog("Watcher zastavený.", "error");
  });
});

function showActivated(isWatching) {
  els.licenseSection.classList.add("hidden");
  els.settingsSection.classList.remove("hidden");
  els.statusDot.className = "status-dot active";
  els.statusText.textContent = "Aktívny";
  if (isWatching) {
    els.startBtn.classList.add("hidden");
    els.stopBtn.classList.remove("hidden");
    els.statusDot.className = "status-dot running";
    els.statusText.textContent = "Sleduje alerty...";
  }
}

function addLog(text, level = "") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${level}`;
  entry.textContent = `[${new Date().toLocaleTimeString("cs-CZ")}] ${text}`;
  els.statusLog.insertBefore(entry, els.statusLog.firstChild);
  if (els.statusLog.children.length > 30) els.statusLog.removeChild(els.statusLog.lastChild);
}
