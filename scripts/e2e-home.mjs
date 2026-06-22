// Screenshot the home/landing page and confirm study cards link into the viewer.
import { chromium } from "playwright";

const BASE = process.env.VIEWER_URL ?? "http://localhost:3005";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".home", { timeout: 30000 });
  await page.waitForSelector(".study-card, .study-browser-state", { timeout: 20000 });
  await page.waitForTimeout(800);

  const cards = await page.locator(".study-card").count();
  const firstHref = await page
    .locator(".study-card")
    .first()
    .getAttribute("href")
    .catch(() => null);

  await page.screenshot({ path: "scripts/e2e-home-shot.png" });
  console.log("STUDY_CARDS", cards);
  console.log("FIRST_HREF", firstHref);
  console.log("PAGE_ERRORS", errors.length ? errors.join(" | ") : "none");
  console.log("HOME_OK", cards > 0 ? "true" : "false");
} catch (error) {
  console.log("HOME_FAILED", error.message);
  await page.screenshot({ path: "scripts/e2e-home-fail.png" }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
