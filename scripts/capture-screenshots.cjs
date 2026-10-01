// Capture README screenshots from a running demo stack (see scripts/seed_demo.py).
//
//   node scripts/capture-screenshots.cjs <frontend-url> <ma_session cookie value> [out-dir]
//
// Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`
// anywhere on NODE_PATH). The cookie is set on the frontend host, which is also
// the backend host in the demo setup (127.0.0.1, different ports).
const { chromium } = require("playwright");
const path = require("path");

const [base = "http://127.0.0.1:4140", cookie, outDir = "docs/images"] = process.argv.slice(2);
if (!cookie) throw new Error("usage: capture-screenshots.cjs <frontend-url> <cookie> [out-dir]");

async function shoot(browser, { name, scheme = "light", width = 1440, height = 900, go }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    reducedMotion: "reduce",
  });
  const host = new URL(base).hostname;
  await ctx.addCookies([{ name: "ma_session", value: cookie, domain: host, path: "/" }]);
  const page = await ctx.newPage();
  await go(page);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log("saved", file);
  await ctx.close();
}

async function openMeeting(page, tab) {
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.getByText(/اسپرینت ۲۴/).first().click();
  await page.waitForURL(/\/meetings\//);
  await page.waitForLoadState("networkidle");
  if (tab) await page.getByRole("button", { name: tab }).first().click();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await shoot(browser, { name: "dashboard", go: (p) => p.goto(base + "/", { waitUntil: "networkidle" }) });
    await shoot(browser, { name: "meeting-summary", go: (p) => openMeeting(p) });
    await shoot(browser, { name: "meeting-minutes-dark", scheme: "dark", go: (p) => openMeeting(p, "صورتجلسه") });
    await shoot(browser, { name: "meeting-chat-dark", scheme: "dark", go: (p) => openMeeting(p, "چت با جلسه") });
    await shoot(browser, { name: "mobile-actions", width: 390, height: 844, go: (p) => openMeeting(p, "اقدامات") });
  } finally {
    await browser.close();
  }
})();
