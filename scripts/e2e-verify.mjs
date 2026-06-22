// End-to-end UI verification: drive the real canvas click -> AI mask loop.
// Loads the US series, places a point prompt on the image, runs inference
// against the live GPU service, and confirms a labelmap rendered.
//
//   node scripts/e2e-verify.mjs
import { chromium } from "playwright";

const BASE = process.env.VIEWER_URL ?? "http://localhost:3005";
const STUDY =
  process.env.E2E_STUDY ?? "1.3.6.1.4.1.5962.1.2.13.20040826185059.5457";
const SERIES =
  process.env.E2E_SERIES ?? "1.3.6.1.4.1.5962.1.3.13.1.20040826185059.5457";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("CONSOLE " + m.text());
});

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".reading-room", { timeout: 30000 });

  // Load the series via the manual UID form (deterministic).
  await page.getByText("Manual UID load").click();
  await page.getByLabel("Study Instance UID").fill(STUDY);
  await page.getByLabel("Series Instance UID").fill(SERIES);
  await page.getByRole("button", { name: "Load Series" }).click();

  await page.waitForSelector(".cornerstone-element canvas", { timeout: 30000 });
  await page.waitForTimeout(1800); // let the first frame paint

  // Wait for the AI model menu to populate from the live service.
  await page.waitForFunction(
    () => {
      const s = document.querySelector(".ai-panel select");
      return s && s.options.length > 0 && s.options[0].value;
    },
    { timeout: 20000 }
  );
  await page.selectOption(".ai-panel select", "medsam2");

  // Enable point prompt and click the image center via the overlay.
  await page
    .locator(".ai-panel .segmented-control button", { hasText: "Point" })
    .first()
    .click();
  const overlay = page.locator(".ai-overlay");
  const box = await overlay.boundingBox();
  await overlay.click({
    position: { x: box.width * 0.5, y: box.height * 0.52 }
  });

  const promptCount = await page.evaluate(() => {
    const dds = [...document.querySelectorAll(".ai-provenance div")];
    const p = dds.find((d) => d.querySelector("dt")?.textContent === "Prompts");
    return p?.querySelector("dd")?.textContent ?? "0";
  });

  // Run inference and wait for provenance (latency) to resolve -> mask written.
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.waitForFunction(
    () => {
      const dds = [...document.querySelectorAll(".ai-provenance div")];
      const lat = dds.find((d) => d.querySelector("dt")?.textContent === "Latency");
      return /ms/.test(lat?.querySelector("dd")?.textContent ?? "");
    },
    { timeout: 60000 }
  );

  const readout = await page.evaluate(() => {
    const grab = (label) => {
      const dds = [...document.querySelectorAll(".ai-provenance div")];
      const d = dds.find((x) => x.querySelector("dt")?.textContent === label);
      return d?.querySelector("dd")?.textContent ?? "";
    };
    return {
      status: document.querySelector(".ai-status-row strong")?.textContent ?? "",
      prompts: grab("Prompts"),
      confidence: grab("Confidence"),
      latency: grab("Latency"),
      model: grab("Model")
    };
  });

  await page.screenshot({ path: "scripts/e2e-shot.png" });

  console.log("PROMPTS_AFTER_CLICK", promptCount);
  console.log("RESULT", JSON.stringify(readout));
  console.log("PAGE_ERRORS", errors.length ? errors.join(" | ") : "none");
  console.log("E2E_OK", /ms/.test(readout.latency) ? "true" : "false");
} catch (error) {
  console.log("E2E_FAILED", error.message);
  console.log("PAGE_ERRORS", errors.join(" | "));
  await page.screenshot({ path: "scripts/e2e-fail.png" }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
