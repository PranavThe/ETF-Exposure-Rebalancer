// The Glean demo. RECORD=1 records an MP4; otherwise it is a dry run that checks every step.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

import { makeKit, startCapture } from "./kit.mjs";

const BASE = process.env.BASE || "https://glean-etf.vercel.app";
const RECORD = process.env.RECORD === "1";
const OUT = process.env.OUT || new URL("../media/glean-demo.mp4", import.meta.url).pathname;
const t0 = Date.now();
const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${m}`);
function must(ok, what) {
  if (!ok) throw new Error(`CHECK FAILED: ${what}`);
  log(`ok  ${what}`);
}

const browser = await chromium.launch();
// 1728x972 at 1920/1728 = a 1920x1080 frame, text 11% larger than a plain 1080p capture. Captions sit
// in a 104 px band under the app, so they never cover it.
const ctx = await browser.newContext({ viewport: { width: 1728, height: 972 }, deviceScaleFactor: 1920 / 1728 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const k = makeKit(page, ctx);
const app = (sel) => page.locator(sel);
const fits = [];
const _caption = k.caption;
k.caption = async (...a) => { await _caption(...a); if (!(await k.captionFits())) fits.push(a[1]); };
const section = (heading) => page.locator("section", { has: page.getByRole("heading", { name: heading, exact: true }) });

await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const capture = RECORD ? await startCapture(ctx, page) : null;

// 0 · Title
await k.card("Glean", "See what your ETFs really hold", "A one-screen tool for first-time investors: your real sector mix, the companies inside your funds, and the exact moves to the mix you want.", 4800);
await k.uncard();

// 1 · The problem (landing page)
await k.caption("The problem", "Owning three ETFs can feel diversified", "But funds often hold the same big companies. Glean looks inside every fund you own.");
await k.hold(2600);
await page.mouse.wheel(0, 700);
await k.hold(1500);
await page.mouse.wheel(0, -700);
await k.hold(900);
const cta = app("a.site-cta").first();
must(await cta.isVisible(), "landing call-to-action visible");
await k.click(cta, { after: 200 });
await page.waitForURL(/\/app/, { timeout: 20000 });
await page.getByRole("button", { name: "Try an example portfolio" }).waitFor({ timeout: 20000 });
await k.hold(600);

// 2 · Holdings
await k.caption("Step 1 · Your ETFs", "Enter the ETFs you own and the dollars in each", "Here: an example $10,000 portfolio. An S&P 500 fund (IVV), a tech fund (IYW) and ARK Innovation (ARKK).");
await k.hold(1500);
await k.click(page.getByRole("button", { name: "Try an example portfolio" }), { after: 300 });
await page.waitForSelector('input[aria-label="Target for Technology"]', { timeout: 30000 });
await k.hold(2200);
const techRow = section("Your sector mix").locator("li", { hasText: "Technology" }).first();
const techNow = (await techRow.innerText()).match(/(\d+(?:\.\d)?)%/)?.[1];
must(Number(techNow) > 40, `Technology share read from the page: ${techNow}%`);

// 3 · Real mix
await k.ring(section("Your sector mix").locator("svg[role=img]").first(), 10);
await k.caption("Step 2 · Your real sector mix", `Looking inside all three funds: ${techNow}% of this money is in Technology`, "Every holding comes from SEC filings and issuer files, added up by sector.");
await k.hold(3600);
await k.unring();

// 4 · Companies
await k.click(page.getByRole("tab", { name: "Companies" }), { after: 300 });
await page.waitForFunction(() => /biggest companies are/.test(document.body.innerText), null, { timeout: 30000 });
await k.hold(900);
const compText = await section("Your sector mix").innerText();
const top10 = compText.match(/biggest companies are\s*([\d.]+%)/)?.[1];
const overlap = compText.match(/IVV\s*&\s*IYW overlap\s*([\d.]+%)|IYW\s*&\s*IVV overlap\s*([\d.]+%)/);
const firstCo = section("Your sector mix").locator("ol li").first();
const firstName = (await firstCo.locator("span.truncate").first().innerText()).trim();
const firstFunds = await firstCo.locator("span.rounded.bg-panel-2").count();
must(top10 && firstName, `companies view: top 10 = ${top10}, #1 = ${firstName} in ${firstFunds} funds`);
await k.ring(section("Your sector mix").locator("ol").first(), 6);
await k.caption("Step 3 · Hidden overlap", `Your 10 biggest companies are ${top10} of your money`,
  `${firstName} sits in ${firstFunds === 3 ? "all three" : firstFunds} of your funds${overlap ? `, and IVV and IYW overlap ${overlap[1] || overlap[2]}` : ""}. Each company is counted once across your ETFs.`);
await k.hold(4400);
await k.unring();
await k.click(page.getByRole("tab", { name: "Sectors" }), { after: 300 });

// 5 · Fees + What's inside (Gemini)
await k.click(page.getByRole("button", { name: "Show details for IYW", exact: true }), { after: 600 });
const feeLine = section("Holdings").locator("p", { hasText: "Yearly fee" }).first();
await feeLine.waitFor({ timeout: 10000 });
const feeText = (await feeLine.innerText()).replace(/\s+/g, " ");
const feePct = feeText.match(/Yearly fee ([\d.]+%)/)?.[1];
const feeUsd = feeText.match(/about (\$[\d,.]+)/)?.[1];
must(feePct && feeUsd, `fee read from the page: ${feePct}, ${feeUsd}`);
await k.ring(feeLine, 6);
await k.caption("Step 4 · Fees, from the SEC filing", `IYW costs ${feePct} a year: about ${feeUsd} on your $3,000`, "Every fund's fee links to the filing it comes from.");
await k.hold(3400);
await k.unring();
await k.click(page.getByRole("button", { name: /What.s inside/ }).first(), { after: 300 });
await k.caption("Step 4 · What's inside? (Gemini)", "Gemini describes the fund in plain words", "Written from the fund's real holdings, sectors and fee, for someone new to investing.");
await page.waitForFunction(() => /from this fund.s holdings/i.test(document.body.innerText), null, { timeout: 45000 });
const inside = section("Holdings").locator("div.rounded-md.border", { hasText: /holdings/i }).last();
const insideText = await inside.innerText();
must(/Gemini/.test(insideText), "What's inside? written by Gemini");
await k.ring(inside, 6);
await k.hold(5200);
await k.unring();
await k.click(page.getByRole("button", { name: "Hide details for IYW", exact: true }), { after: 500 });

// 6 · Scythe (Gemini)
const scythe = section("Scythe");
await k.caption("Step 5 · Say the mix you want", "Tell Scythe in your own words", "Gemini reads the request. Glean's own code does the math, so the target always adds up to 100%.");
await k.hold(1400);
await k.type(page.getByLabel("Message Scythe"), "Less tech, more health care", 55);
await k.hold(300);
await page.keyboard.press("Enter");
await page.waitForFunction(() => {
  const sec = [...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === "Scythe");
  return sec && !sec.querySelector(".typing-dot") && sec.innerText.includes("→");
}, null, { timeout: 45000 });
await k.hold(500);
const reply = (await scythe.locator("p").allInnerTexts()).filter((t) => t.includes("→")).at(-1) ?? "";
must(/Technology/.test(reply) && /Health Care/.test(reply), `Scythe reply: ${reply.slice(0, 120)}`);
must((await scythe.innerText()).includes("Gemini"), "Scythe shows it is connected to Gemini");
await k.ring(scythe.locator("p", { hasText: "→" }).last(), 8);
await k.hold(3000);
await k.unring();
await k.ring(section("Your sector mix").locator("ul").first(), 6);
await k.caption("Step 5 · Your target", "The target updates: green and red bars show each change", "Prefer to drag? Every sector has its own handle.");
await k.hold(2200);
const fin = page.getByLabel("Target for Financials");
const fb = await fin.boundingBox();
const val = Number(await fin.inputValue());
const hx = fb.x + fb.width * val, hy = fb.y + fb.height / 2;
await k.moveTo(hx, hy, 600);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(hx + i * 4, hy);
  await page.evaluate(({ x, y }) => { const c = document.getElementById("demo-cursor"); c.style.setProperty("--d", "0ms"); c.style.left = x + "px"; c.style.top = y + "px"; }, { x: hx + i * 4, y: hy });
  await k.hold(45);
}
await page.mouse.up();
await k.hold(1600);
await k.unring();

// 7 · Moves
const moves = section("Suggested moves");
await moves.locator("tbody tr").first().waitFor({ timeout: 30000 });
await k.hold(1200);
const tabs = await page.getByRole("tab", { name: /match/ }).allInnerTexts();
must(tabs.length >= 1, `plan tabs: ${tabs.map((t) => t.replace(/\s+/g, " ")).join(" | ")}`);
const feeMove = (await moves.innerText()).match(/Yearly fund fees\s*(\$[\d,.]+)\s*→\s*(\$[\d,.]+)/);
await k.ring(moves.locator("table"), 6);
await k.caption("Step 6 · The moves", "Exact dollar moves, using only the money you already have",
  `Each move is Add, Increase, Reduce or Remove, in exact dollars.${feeMove ? ` Yearly fund fees: ${feeMove[1]} → ${feeMove[2]}.` : ""}`);
await k.hold(4200);
await k.unring();
const addNew = page.getByRole("tab", { name: /Add new ETFs/ });
if (await addNew.count()) {
  await k.click(addNew, { after: 600 });
  const adds = moves.locator("tbody tr", { has: page.locator("span", { hasText: /^Add$/ }) });
  const n = await adds.count();
  must(n >= 1, `second plan adds ${n} new ETF(s): ${(await adds.allInnerTexts()).map((t) => t.split("\n")[1]).join(", ")}`);
  await adds.last().scrollIntoViewIfNeeded();
  await k.hold(300);
  const added = (await adds.allInnerTexts()).map((t) => t.split("\n").map((x) => x.trim()).filter(Boolean)[1]).join(" and ");
  await k.ringAll([adds.first(), adds.last()], 4);
  await k.caption("Step 6 · The moves", `A second plan adds ${added} to get closer`, "New funds only come from a fixed list of plain, low-cost index ETFs. Never paid placements.");
  await k.hold(3800);
  await k.unring();
}

// 8 · Why these moves? (Gemini)
await k.click(page.getByRole("button", { name: /Why these moves/ }), { after: 300 });
await k.caption("Step 7 · Why these moves? (Gemini)", "Gemini explains the plan in plain words", "Glean computes every number first; the AI only explains them, and never says what you should do.");
await page.waitForFunction(() => /Written by Gemini/.test(document.body.innerText), null, { timeout: 45000 });
await k.hold(700);
const why = moves.locator("div.rounded-lg.border").last();
await why.scrollIntoViewIfNeeded();
await k.ring(why, 6);
await k.hold(6500);
await k.unring();

// 9 · Before you act
const before = page.getByText("Before you act: what this plan leaves out");
await k.click(before, { after: 500 });
await page.locator("details[open]").last().scrollIntoViewIfNeeded();
await k.hold(400);
await k.ring(page.locator("details[open]").last(), 6);
await k.caption("Step 8 · Before you act", "Taxes, costs, data dates and the AI's role: always one click away", "Glean does the math. You make the decisions. It is not investment advice.");
await k.hold(5200);
await k.unring();

// 10 · Use it, save it, tabs
await moves.locator("button", { hasText: "Use these amounts" }).scrollIntoViewIfNeeded();
await k.click(moves.getByRole("button", { name: "Use these amounts" }), { after: 900 });
await k.caption("Step 9 · Try it and keep it", "Preview the result. Nothing is ever sent to a broker", "Your portfolio saves to a private link, with no account needed.");
await k.hold(2600);
await page.waitForFunction(() => document.querySelector("header")?.innerText.includes("Saved"), null, { timeout: 20000 });
await k.click(page.getByRole("button", { name: /^Rename / }).first(), { after: 200 });
await page.getByLabel("Portfolio name").fill("");
await page.keyboard.type("Retirement", { delay: 70 });
await page.keyboard.press("Enter");
await k.hold(1300);
const tabName = await page.locator('[role="tablist"][aria-label^="Open portfolios"] [role="tab"]').first().innerText();
must(tabName.includes("Retirement"), `tab renamed: ${tabName}`);
await k.ring(page.locator('[role="tablist"][aria-label^="Open portfolios"]').first(), 4);
await k.caption("Step 9 · Try it and keep it", "Keep several portfolios side by side", "Name them, share them, and come back any time.");
await k.hold(3000);
await k.unring();
await k.uncaption();

// 11 · End card
await k.card("Glean", "See what you really own. Choose the mix you want.", "glean-etf.vercel.app  ·  Built with the Gemini API  ·  Based on dated ETF holdings. Not investment advice.", 5200);

must(fits.length === 0, `every caption fits its band (${fits.join(" | ")})`);
must(errors.length === 0, `no page errors (${errors.join(" | ").slice(0, 200)})`);
if (capture) {
  log(`frames: ${capture.frames.length}`);
  await capture.stop(OUT);
  log(`wrote ${OUT}`);
}
log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await browser.close();
