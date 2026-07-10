// Auto ticket selector - runs when Ticketmaster page loads
(async function() {
  // Only run if we came from a Discord alert
  const alertData = await new Promise(resolve =>
    chrome.storage.local.get(["pendingAlert"], resolve)
  );

  if (!alertData.pendingAlert) return;

  const alert = alertData.pendingAlert;
  console.log("[Discord Watcher] Auto selecting tickets:", alert);

  // Clear pending alert
  chrome.storage.local.remove(["pendingAlert"]);

  // Wait for page to load
  await sleep(3000);

  // Step 1: Click "See best available" if not already active
  const bestAvailableBtn = Array.from(document.querySelectorAll("button")).find(
    btn => btn.textContent.includes("See best available") ||
           btn.textContent.includes("best available")
  );
  if (bestAvailableBtn && bestAvailableBtn.getAttribute("aria-pressed") !== "true") {
    bestAvailableBtn.click();
    console.log("[Discord Watcher] Clicked See best available");
    await sleep(1500);
  }

  // Step 2: Find the right category and click + button N times
  const quantity = alert.quantity || 1;
  const categoryName = alert.section || null; // e.g. "Zitplaatsen", "Reserved Seating"

  const steppers = document.querySelectorAll("[data-testid='quantityStepper']");

  let targetStepper = null;

  if (categoryName) {
    // Try to find matching category
    for (const stepper of steppers) {
      const li = stepper.closest("li");
      if (li) {
        const nameEl = li.querySelector("span");
        if (nameEl && nameEl.textContent.toLowerCase().includes(categoryName.toLowerCase())) {
          targetStepper = stepper;
          break;
        }
      }
    }
  }

  // Fallback — use first available stepper
  if (!targetStepper && steppers.length > 0) {
    targetStepper = steppers[0];
  }

  if (targetStepper) {
    const plusBtn = targetStepper.querySelector("button:last-child");
    if (plusBtn) {
      for (let i = 0; i < quantity; i++) {
        plusBtn.click();
        await sleep(300);
      }
      console.log(`[Discord Watcher] Clicked + ${quantity} times`);
    }
  }

  // Step 3: Click Find Tickets
  await sleep(500);
  const findBtn = document.querySelector("[data-testid='findTicketsBtn']");
  if (findBtn) {
    findBtn.click();
    console.log("[Discord Watcher] Clicked Find Tickets");
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
