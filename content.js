(async function() {
  let _watcherStopped = false;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "STOP_CONTENT") {
      _watcherStopped = true;
    }
  });

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) { observer.disconnect(); resolve(el); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
    });
  }

  function waitForButton(textMatch, timeout = 5000) {
    return new Promise((resolve) => {
      const check = () => {
        const btn = Array.from(document.querySelectorAll("button")).find(
          b => b.textContent.trim().toLowerCase().includes(textMatch.toLowerCase()) && b.offsetParent !== null
        );
        if (btn) return btn;
        return null;
      };
      const found = check();
      if (found) return resolve(found);
      const observer = new MutationObserver(() => {
        const btn = check();
        if (btn) { observer.disconnect(); resolve(btn); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
    });
  }

  // Check if we're already on checkout page - send webhook immediately 
  if (window.location.href.includes("checkout")) { 
    console.log("[Discord Watcher] 🎟️ Checkout page detected on load!"); 
    // Send webhook first 
    try { 
      const webhookData = await new Promise(resolve => 
        chrome.storage.local.get(["filters"], resolve) 
      ); 
      const webhook = webhookData.filters?.discordWebhook; 
      const tmAccount = webhookData.filters?.tmAccount; 
      if (webhook) { 
        await fetch(webhook, { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ 
            content: `✅ **LÍSTKY NÁJDENÉ!** 🎟️\n🛒 **Checkout link:**\n${window.location.href}\n\n${tmAccount ? `👤 **Nakupuješ pod účtom:** ${tmAccount}\n` : ""}⚡ Rýchlo klikni a zaplať!` 
          }) 
        }).catch(() => {}); 
      } 
    } catch(e) {} 

    // Release mutex - tickets found in basket 
    chrome.runtime.sendMessage({ type: "CHECKOUT_REACHED" }).catch(() => {}); 

    // Play sound after short delay 
    await sleep(500); 
    try { 
      const ac = new AudioContext(); 
      const o = ac.createOscillator(); 
      const g = ac.createGain(); 
      o.connect(g); g.connect(ac.destination); 
      o.frequency.value = 880; 
      g.gain.setValueAtTime(0.5, ac.currentTime); 
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.8); 
      o.start(); o.stop(ac.currentTime + 0.8); 
      setTimeout(() => { 
        const o2 = ac.createOscillator(); 
        const g2 = ac.createGain(); 
        o2.connect(g2); g2.connect(ac.destination); 
        o2.frequency.value = 1100; 
        g2.gain.setValueAtTime(0.5, ac.currentTime); 
        g2.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.8); 
        o2.start(); o2.stop(ac.currentTime + 0.8); 
      }, 400); 
    } catch(e) {} 

    return; // Stop here, no need to continue 
  } 
 
  // Wait for pendingAlert
  await sleep(500);

  const alertData = await new Promise(resolve =>
    chrome.storage.local.get(["pendingAlert"], resolve)
  );

  if (!alertData.pendingAlert) {
    console.log("[Discord Watcher] No pending alert, skipping.");
    return;
  }

  const alert = alertData.pendingAlert;
  console.log("[Discord Watcher] Auto selecting tickets:", alert);
  chrome.storage.local.remove(["pendingAlert"]);

  // Step 0: Check for Queue and join if present
  const joinQueueBtn = document.querySelector("[data-bdd='lobby-card-CTAButton']") ||
    Array.from(document.querySelectorAll("button")).find(
      btn => btn.textContent.trim().toLowerCase().includes("join the queue")
    );

  if (joinQueueBtn) {
    joinQueueBtn.click();
    console.log("[Discord Watcher] Joined the queue!");
    // Wait for queue to finish and redirect to ticket selection
    await sleep(3000);
  }

  // Step 1: Wait for page and click "See best available"
  const bestAvailableBtn = await waitForButton("see best available", 8000);
  if (bestAvailableBtn) {
    bestAvailableBtn.click();
    console.log("[Discord Watcher] Clicked See best available");
  }

  // Step 2: Wait for steppers and click +
  await waitForElement("[data-testid='quantityStepper']", 5000);
  await sleep(300);

  const storageData = await new Promise(resolve => 
    chrome.storage.local.get(["filters"], resolve) 
  ); 
  const maxQty = storageData.filters?.maxQty || 2; 
  const availableQty = alert.quantity || 99; 
  const quantity = Math.min(availableQty, maxQty); 

  // Map TopSellCZ section names to Ticketmaster names
  const sectionMapping = {
    "Zitplaatsen": ["Reserved Seating", "Zitplaatsen", "Seated"],
    "Staanplaatsen": ["General Admission", "Standing", "Staanplaatsen", "Floor"],
    "Aisle Seating": ["Aisle Seating", "Gangpadstoelen"],
    "Golden Circle": ["Golden Circle", "VIP"],
  };

  const rawSection = alert.section || null;
  let categoryNames = rawSection ? [rawSection] : [];

  // Add mapped alternatives
  if (rawSection) {
    for (const [key, alternatives] of Object.entries(sectionMapping)) {
      if (rawSection.toLowerCase().includes(key.toLowerCase())) {
        categoryNames = [...new Set([...categoryNames, ...alternatives])];
        break;
      }
    }
  }

  let targetStepper = null;
  const steppers = document.querySelectorAll("[data-testid='quantityStepper']");

  if (categoryNames.length > 0 && steppers.length > 0) {
    for (const stepper of steppers) {
      const li = stepper.closest("li");
      if (li) {
        const spans = li.querySelectorAll("span");
        for (const span of spans) {
          const spanText = span.textContent.toLowerCase();
          if (categoryNames.some(name => spanText.includes(name.toLowerCase()))) {
            targetStepper = stepper;
            break;
          }
        }
      }
      if (targetStepper) break;
    }
  }

  if (!targetStepper && steppers.length > 0) {
    targetStepper = steppers[0];
  }

  if (targetStepper) {
    const plusBtn = targetStepper.querySelector("button:last-child");
    if (plusBtn) {
      for (let i = 0; i < quantity; i++) {
        plusBtn.click();
        await sleep(200);
      }
      console.log(`[Discord Watcher] Clicked + ${quantity} times`);
    }
  }

  // Step 3: Click Find Tickets
  const findBtn = await waitForButton("find tickets", 3000);
  if (findBtn) {
    findBtn.click();
    console.log("[Discord Watcher] Clicked Find Tickets, starting refresh loop...");
  }

  // Refresh loop
  let loopCount = 0;
  let stuckCount = 0;
  const MAX_LOOPS = 999;
  const MAX_STUCK = 5; // 5 cycles with no button found = stuck

  while (loopCount < MAX_LOOPS && !_watcherStopped) {
    loopCount++;

    if (window.location.href.includes("checkout")) {
      console.log("[Discord Watcher] 🎟️ SUCCESS - Checkout detected!");
      
      // Send Discord webhook notification
      try {
        const webhookData = await new Promise(resolve => 
          chrome.storage.local.get(["filters"], resolve)
        );
        const webhook = webhookData.filters?.discordWebhook;
        const tmAccount = webhookData.filters?.tmAccount;
        if (webhook) {
          await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: `✅ **LÍSTKY NÁJDENÉ!** 🎟️\n🛒 **Checkout link:**\n${window.location.href}\n\n${tmAccount ? `👤 **Nakupuješ pod účtom:** ${tmAccount}\n` : ""}⚡ Rýchlo klikni a zaplať!`
            })
          }).catch(() => {});
        }
      } catch(e) {}

      // Release mutex - tickets found in basket 
      chrome.runtime.sendMessage({ type: "CHECKOUT_REACHED" }).catch(() => {}); 

      // Play sound
      try {
        const ac = new AudioContext();
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.5, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.8);
        o.start(); o.stop(ac.currentTime + 0.8);
        setTimeout(() => {
          const o2 = ac.createOscillator();
          const g2 = ac.createGain();
          o2.connect(g2); g2.connect(ac.destination);
          o2.frequency.value = 1100;
          g2.gain.setValueAtTime(0.5, ac.currentTime);
          g2.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.8);
          o2.start(); o2.stop(ac.currentTime + 0.8);
        }, 400);
      } catch(e) {}
      break;
    }

    // Check if we're in queue - wait
    const inQueue = document.querySelector("[data-bdd='lobby-card-CTAButton']") ||
      Array.from(document.querySelectorAll("button")).find(
        btn => btn.textContent.trim().toLowerCase().includes("join the queue")
      );
    if (inQueue) {
      console.log("[Discord Watcher] In queue, waiting...");
      await sleep(5000);
      continue;
    }

    // Handle Important Information popup
    const proceedBtn = Array.from(document.querySelectorAll("button")).find(
      btn => btn.textContent.trim().toLowerCase().includes("proceed to buy")
    );
    if (proceedBtn) {
      const checkboxSelectors = ["input[type='checkbox']", "[role='checkbox']", "label input", "label span[class*='Checkbox']"];
      for (const selector of checkboxSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const label = el.closest("label") || el.parentElement;
          if (label) label.click(); else el.click();
          await sleep(300);
          break;
        }
      }
      await sleep(200);
      proceedBtn.click();
      console.log("[Discord Watcher] Clicked Proceed to Buy");
      await sleep(1500);
      continue;
    }

    // Check Get Tickets
    const getTicketsBtn = Array.from(document.querySelectorAll("button")).find(
      btn => btn.textContent.trim() === "Get Tickets"
    ) || document.querySelector("[data-bdd='offer-card-buy-button']");

    if (getTicketsBtn && getTicketsBtn.offsetParent !== null) {
      console.log("[Discord Watcher] 🎟️ Get Tickets found! Clicking...");
      getTicketsBtn.click();
      await sleep(2000);
      continue;
    }

    // Get interval
    const intervalData = await new Promise(resolve =>
      chrome.storage.local.get(["intervalMin", "intervalMax"], resolve)
    );
    const minMs = (intervalData.intervalMin || 5) * 1000;
    const maxMs = (intervalData.intervalMax || 12) * 1000;
    const waitMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    const waitSec = Math.round(waitMs / 1000);

    // Wait for Search Again or Find Tickets to appear
    const searchAgainBtn = Array.from(document.querySelectorAll("button")).find(
      btn => btn.textContent.trim() === "Search Again"
    );
    const findTicketsBtn = document.querySelector("[data-testid='findTicketsBtn']");

    // Count stuck cycles
    if (!searchAgainBtn && !findTicketsBtn && !getTicketsBtn) {
      stuckCount++;
      console.log(`[Discord Watcher] No buttons found, stuck count: ${stuckCount}/${MAX_STUCK}`);
      chrome.runtime.sendMessage({
        type: "CONTENT_LOG",
        text: `⚠️ Nenašiel som tlačidlá (${stuckCount}/${MAX_STUCK})`,
        level: "error"
      }).catch(() => {});

      if (stuckCount >= MAX_STUCK) {
        console.log("[Discord Watcher] STUCK - releasing mutex and closing tab");
        chrome.runtime.sendMessage({ type: "STUCK_RELEASE" }).catch(() => {});
        // Close this tab after short delay
        await sleep(2000);
        window.close();
        return;
      }

      await sleep(3000);
      continue;
    } else {
      stuckCount = 0; // reset counter when button found
    }

    if (searchAgainBtn) {
      searchAgainBtn.click();
      console.log(`[Discord Watcher] Cyklus #${loopCount} — Search Again | Ďalší za ${waitSec}s`);
      chrome.runtime.sendMessage({ type: "CONTENT_LOG", text: `Cyklus #${loopCount} — Search Again | Ďalší za ${waitSec}s`, level: "info" }).catch(() => {});
    } else if (findTicketsBtn) {
      findTicketsBtn.click();
      console.log(`[Discord Watcher] Cyklus #${loopCount} — Find Tickets | Ďalší za ${waitSec}s`);
      chrome.runtime.sendMessage({ type: "CONTENT_LOG", text: `Cyklus #${loopCount} — Find Tickets | Ďalší za ${waitSec}s`, level: "info" }).catch(() => {});
    }

    await sleep(waitMs);
  }

  // Release mutex when loop ends normally
  chrome.runtime.sendMessage({ type: "CHECKOUT_REACHED" }).catch(() => {});
})();
