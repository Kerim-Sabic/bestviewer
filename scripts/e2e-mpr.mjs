// Verify volume/MPR: load the synthetic CT phantom, switch to MPR, confirm 3
// orthogonal planes reconstruct and render.
//
//   node scripts/e2e-mpr.mjs
import { chromium } from "playwright";

const BASE = process.env.VIEWER_URL ?? "http://localhost:3005";
const STUDY = process.env.MPR_STUDY;
const SERIES = process.env.MPR_SERIES;

if (!STUDY || !SERIES) {
  console.log("Set MPR_STUDY and MPR_SERIES env vars (the CT phantom UIDs).");
  process.exit(2);
}

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

  // Switch to MPR (enabled for multi-slice volumes).
  const mprButton = page.locator(".layout-switch button", { hasText: "MPR" });
  await mprButton.waitFor({ state: "visible", timeout: 10000 });
  await mprButton.click();

  // Wait for three plane canvases to render.
  await page.waitForFunction(
    () => document.querySelectorAll(".mpr-grid .mpr-element canvas").length >= 3,
    { timeout: 45000 }
  );
  await page.waitForTimeout(1500);

  const planes = await page.evaluate(() =>
    [...document.querySelectorAll(".mpr-pane-label")].map((n) => n.textContent)
  );
  const status = await page.evaluate(
    () => document.querySelector(".mpr-stage .viewport-badges")?.textContent ?? ""
  );

  await page.screenshot({ path: "scripts/e2e-mpr-shot.png" });
  console.log("PLANES", JSON.stringify(planes));
  console.log("MPR_STATUS", status);
  console.log("CANVASES", await page.locator(".mpr-grid canvas").count());
  console.log("PAGE_ERRORS", errors.length ? errors.join(" | ") : "none");
  console.log("MPR_OK", planes.length === 3 ? "true" : "false");
} catch (error) {
  console.log("MPR_FAILED", error.message);
  await page.screenshot({ path: "scripts/e2e-mpr-fail.png" }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
