// Full echo flow: load a multi-frame loop, propagate an AI segment across the
// cardiac cycle, then compute LV Fractional Area Change. Screenshots the result.
//
//   node scripts/e2e-cardiac.mjs
import { chromium } from "playwright";

const BASE = process.env.VIEWER_URL ?? "http://localhost:3005";
const STUDY =
  process.env.LOOP_STUDY ??
  "1.2.826.0.1.3680043.2.1143.3365540476747857567072393009509418480";
const SERIES =
  process.env.LOOP_SERIES ??
  "1.2.826.0.1.3680043.2.1143.3712364435022872412969836992152438492";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));

try {
  await page.goto(`${BASE}/viewer/${encodeURIComponent(STUDY)}`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForSelector(".reading-room", { timeout: 30000 });
  await page.waitForSelector(".cornerstone-element canvas", { timeout: 30000 });
  await page.waitForTimeout(1500);

  await page.waitForFunction(
    () => {
      const s = document.querySelector(".ai-panel select");
      return s && s.options.length > 0 && s.options[0].value;
    },
    { timeout: 20000 }
  );
  await page.selectOption(".ai-panel select", "sam2.1");

  // Enable propagation (track across the cardiac cycle).
  await page
    .locator(".checkbox-row", { hasText: "Track across cine" })
    .locator("input")
    .check();

  // Point prompt on the structure, then run.
  await page
    .locator(".ai-panel .segmented-control button", { hasText: "Point" })
    .first()
    .click();
  const overlay = page.locator(".ai-overlay");
  const box = await overlay.boundingBox();
  await overlay.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await page.getByRole("button", { name: "Run", exact: true }).click();

  await page.waitForFunction(
    () => {
      const dds = [...document.querySelectorAll(".ai-provenance div")];
      const lat = dds.find((d) => d.querySelector("dt")?.textContent === "Latency");
      const inlineError = document.querySelector(".ai-inline-error");
      return (
        /ms/.test(lat?.querySelector("dd")?.textContent ?? "") || inlineError !== null
      );
    },
    { timeout: 60000 }
  );

  const runError = await page.evaluate(
    () => document.querySelector(".ai-panel .ai-inline-error")?.textContent ?? ""
  );
  if (runError) {
    throw new Error("Run reported: " + runError);
  }

  // Compute LV function from the tracked loop.
  await page.getByRole("button", { name: "Compute from tracked loop" }).click();
  await page.waitForSelector(".function-metric-value", { timeout: 15000 });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => ({
    fac: document.querySelector(".function-metric-value")?.textContent ?? "",
    ed: document.querySelectorAll(".function-stat dd")[0]?.textContent ?? "",
    es: document.querySelectorAll(".function-stat dd")[1]?.textContent ?? "",
    sparkline: document.querySelectorAll(".function-spark-line").length
  }));

  await page.screenshot({ path: "scripts/e2e-cardiac-shot.png" });
  console.log("CARDIAC", JSON.stringify(result));
  console.log("PAGE_ERRORS", errors.length ? errors.join(" | ") : "none");
  console.log("CARDIAC_OK", result.fac && result.sparkline > 0 ? "true" : "false");
} catch (error) {
  console.log("CARDIAC_FAILED", error.message);
  await page.screenshot({ path: "scripts/e2e-cardiac-fail.png" }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
