// Verify a study splits into selectable cines (one per loop/instance).
import { chromium } from "playwright";

const BASE = process.env.VIEWER_URL ?? "http://localhost:3005";
const STUDY =
  process.env.E2E_STUDY ??
  "1.2.840.113663.1500.1.451818155.1.1.20250911.111717.696";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));

try {
  await page.goto(`${BASE}/viewer/${encodeURIComponent(STUDY)}`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForSelector(".reading-room", { timeout: 30000 });
  await page.waitForSelector(".cine-card", { timeout: 30000 });
  await page.waitForSelector(".cornerstone-element canvas", { timeout: 30000 });
  await page.waitForTimeout(2500); // let thumbnails + first loop render

  const cines = await page.locator(".cine-card").count();
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll(".cine-card-body strong")]
      .slice(0, 4)
      .map((n) => n.textContent)
  );
  const thumbs = await page.locator(".cine-card-thumb img").count();
  const firstFrames = await page.evaluate(() => {
    const t = document.querySelector(".dicom-stack-viewport, .viewport-stage");
    const badge = document.querySelector(".viewport-badges");
    return badge ? badge.textContent : "";
  });

  // Click the 3rd cine to confirm switching loops works.
  if (cines >= 3) {
    await page.locator(".cine-card").nth(2).click();
    await page.waitForTimeout(1500);
  }

  await page.screenshot({ path: "scripts/e2e-cines-shot.png" });
  console.log("CINES", cines, "THUMBS", thumbs, "LABELS", JSON.stringify(labels));
  console.log("VIEWPORT_BADGE", JSON.stringify(firstFrames));
  console.log("PAGE_ERRORS", errors.length ? errors.join(" | ") : "none");
  console.log("CINES_OK", cines > 1 ? "true" : "false");
} catch (error) {
  console.log("CINES_FAILED", error.message);
  await page.screenshot({ path: "scripts/e2e-cines-fail.png" }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
