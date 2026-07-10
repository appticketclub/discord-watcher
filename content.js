(async function() {
  let _watcherStopped = false;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "STOP_CONTENT") {
      _watcherStopped = true;
      console.log("[Discord Watcher] Stop signal received");
    }
  });

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Wait a bit for background to save pendingAlert
  await sleep(1500);

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

  // Wait for page to fully load
  await sleep(3000);

  // Step 1: Click "See best available" if not already active
  const allButtons = Array.from(document.querySelectorAll("button"));
  const bestAvailableBtn = allButtons.find(
    btn => btn.textContent.trim().toLowerCase().includes("see best available") ||
           btn.textContent.trim().toLowerCase().includes("best available")
  );
  if (bestAvailableBtn) {
    bestAvailableBtn.click();
    console.log("[Discord Watcher] Clicked See best available");
    await sleep(2000);
  }

  // Step 2: Find category and click +
  const quantity = alert.quantity || 1;
  const categoryName = alert.section || null;

  let targetStepper = null;
  const steppers = document.querySelectorAll("[data-testid='quantityStepper']");

  if (categoryName && steppers.length > 0) {
    for (const stepper of steppers) {
      const li = stepper.closest("li");
      if (li) {
        const spans = li.querySelectorAll("span");
        for (const span of spans) {
          if (span.textContent.toLowerCase().includes(categoryName.toLowerCase())) {
            targetStepper = stepper;
            break;
          }
        }
      }
      if (targetStepper) break;
    }
  }

  // Fallback — first stepper
  if (!targetStepper && steppers.length > 0) {
    targetStepper = steppers[0];
    console.log("[Discord Watcher] Using first available category");
  }

  if (targetStepper) {
    const plusBtn = targetStepper.querySelector("button:last-child");
    if (plusBtn) {
      for (let i = 0; i < quantity; i++) {
      plusBtn.click();
      await sleep(400);
    }
      console.log(`[Discord Watcher] Clicked + ${quantity} times`);
    } else {
      console.log("[Discord Watcher] Plus button not found");
    }
  } else {
    console.log("[Discord Watcher] No stepper found");
  }

  // Step 3: Click Find Tickets
  await sleep(800);
  const findBtn = document.querySelector("[data-testid='findTicketsBtn']");
  if (findBtn) {
    findBtn.click();
    console.log("[Discord Watcher] Clicked Find Tickets, starting refresh loop...");
  } else {
    console.log("[Discord Watcher] Find Tickets button not found");
  }
  
  // Step 4 + 5: Handle popups and refresh loop
  await sleep(2000);

  let loopCount = 0;
  const MAX_LOOPS = 999;

  while (loopCount < MAX_LOOPS && isRunning()) {
    loopCount++;

    // Check checkout - success!
    if (window.location.href.includes("checkout")) {
      console.log("[Discord Watcher] 🎟️ SUCCESS - Checkout detected!");
      break;
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
          await sleep(500);
          break;
        }
      }
      await sleep(300);
      proceedBtn.click();
      console.log("[Discord Watcher] Clicked Proceed to Buy");
      await sleep(2000);
      continue;
    }

    // Check Get Tickets button - success!
    const getTicketsBtn = Array.from(document.querySelectorAll("button")).find(
      btn => btn.textContent.trim() === "Get Tickets"
    ) || document.querySelector("[data-bdd='offer-card-buy-button']");
    
    if (getTicketsBtn && getTicketsBtn.offsetParent !== null) {
      console.log("[Discord Watcher] 🎟️ Get Tickets found! Clicking...");
      getTicketsBtn.click();
      await sleep(3000);
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

    // Click Search Again or Find Tickets
    const searchAgainBtn = Array.from(document.querySelectorAll("button")).find(
      btn => btn.textContent.trim() === "Search Again"
    );
    if (searchAgainBtn) {
      searchAgainBtn.click();
      console.log(`[Discord Watcher] Cyklus #${loopCount} — Search Again | Ďalší za ${waitSec}s`);
      chrome.runtime.sendMessage({
        type: "CONTENT_LOG",
        text: `Cyklus #${loopCount} — Search Again | Ďalší za ${waitSec}s`,
        level: "info"
      }).catch(() => {});
    } else {
      const findTicketsBtn = document.querySelector("[data-testid='findTicketsBtn']");
      if (findTicketsBtn) {
        findTicketsBtn.click();
        console.log(`[Discord Watcher] Cyklus #${loopCount} — Find Tickets | Ďalší za ${waitSec}s`);
        chrome.runtime.sendMessage({
          type: "CONTENT_LOG",
          text: `Cyklus #${loopCount} — Find Tickets | Ďalší za ${waitSec}s`,
          level: "info"
        }).catch(() => {});
      }
    }

    await sleep(waitMs);
  }

  function isRunning() {
    return !_watcherStopped;
  }
})();