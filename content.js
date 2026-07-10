(async function() {
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
    console.log("[Discord Watcher] Clicked Find Tickets");
  } else {
    console.log("[Discord Watcher] Find Tickets button not found");
  }
})();
