// Gallery screenshots for Devpost: 3:2, 2x pixel density, no overlays.
// The phone shots are joined into 08-phone.png, and 00-cover.png is a frame of the demo video (needs ffmpeg).
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");

const BASE = process.env.BASE || "https://glean-etf.vercel.app";
const OUT = process.env.OUT || new URL("../media", import.meta.url).pathname;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const section = (heading) => page.locator("section", { has: page.getByRole("heading", { name: heading, exact: true }) });
const shot = async (name) => {
  await page.mouse.move(1430, 950); // keep hover effects out of the picture
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("saved", name);
};

// 1 · Landing hero
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await shot("01-landing");

// 2 · App overview: example portfolio, a target from Scythe, the plan
await page.goto(BASE + "/app", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Try an example portfolio" }).click();
await page.waitForSelector('input[aria-label="Target for Technology"]', { timeout: 30000 });
await page.waitForTimeout(1500);
await page.getByLabel("Message Scythe").fill("Less tech, more health care");
await page.keyboard.press("Enter");
await page.waitForFunction(() => {
  const sec = [...document.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === "Scythe");
  return sec && !sec.querySelector(".typing-dot") && sec.innerText.includes("→");
}, null, { timeout: 45000 });
await section("Suggested moves").locator("tbody tr").first().waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await shot("02-overview");

// 3 · Companies
await page.getByRole("tab", { name: "Companies" }).click();
await page.waitForFunction(() => /biggest companies are/.test(document.body.innerText), null, { timeout: 30000 });
await shot("03-companies");
await page.getByRole("tab", { name: "Sectors" }).click();

// 4 · Fund details: fee + What's inside?
await page.getByRole("button", { name: "Show details for IYW", exact: true }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /What.s inside/ }).first().click();
await page.waitForFunction(() => /from this fund.s holdings/i.test(document.body.innerText), null, { timeout: 45000 });
await shot("04-whats-inside");
await page.getByRole("button", { name: "Hide details for IYW", exact: true }).click();
await page.waitForTimeout(500);

// 5 · Why these moves? (second plan, with new ETFs)
const addNew = page.getByRole("tab", { name: /Add new ETFs/ });
if (await addNew.count()) await addNew.click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: /Why these moves/ }).click();
await page.waitForFunction(() => /Written by Gemini/.test(document.body.innerText), null, { timeout: 45000 });
await page.waitForTimeout(1200);
await shot("05-why-these-moves");
await page.getByRole("button", { name: "Close explanation" }).click();
await page.waitForTimeout(700);

// 6 · Before you act
await page.getByText("Before you act: what this plan leaves out").click();
await page.waitForTimeout(900);
await page.locator("details[open]").last().scrollIntoViewIfNeeded();
await shot("06-before-you-act");

// 7 · Methodology
await page.goto(BASE + "/methodology", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await shot("07-methodology");

// 8 · Phone screens, composed later
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const p = await phone.newPage();
await p.goto(BASE + "/app", { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Try an example portfolio" }).click();
await p.waitForSelector('input[aria-label="Target for Technology"]', { timeout: 30000 });
await p.waitForTimeout(3500); // the "Example portfolio loaded" toast has gone
await p.screenshot({ path: `${OUT}/phone-1.png` });
const mix = p.locator("section", { has: p.getByRole("heading", { name: "Your sector mix", exact: true }) });
await mix.scrollIntoViewIfNeeded();
await p.getByLabel("Target for Technology").focus();
for (let i = 0; i < 40; i++) await p.keyboard.press("ArrowLeft");
await p.waitForTimeout(1800);
await mix.evaluate((el) => el.scrollIntoView({ block: "start" }));
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/phone-2.png` });
const moves = p.locator("section", { has: p.getByRole("heading", { name: "Suggested moves", exact: true }) });
await moves.locator("tbody tr").first().waitFor({ timeout: 30000 });
await moves.evaluate((el) => el.scrollIntoView({ block: "start" }));
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/phone-3.png` });
console.log("saved phone shots; page errors:", errors.length ? errors : "none");
await browser.close();

// Three phone screens side by side on a 3:2 canvas.
const frame = (i) => `[${i}]scale=-1:1680,pad=iw+4:ih+4:2:2:color=0x2d2d33[p${i}]`;
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x0b0b0d:s=2880x1920",
  ...[1, 2, 3].flatMap((i) => ["-i", `${OUT}/phone-${i}.png`]),
  "-filter_complex", `${[1, 2, 3].map(frame).join(";")};[0][p1]overlay=156:118[x];[x][p2]overlay=1052:118[y];[y][p3]overlay=1948:118,format=rgb24`,
  "-frames:v", "1", `${OUT}/08-phone.png`]);
for (const i of [1, 2, 3]) fs.rmSync(`${OUT}/phone-${i}.png`);
console.log("saved 08-phone");

// The cover is the demo's opening title card, cropped to 3:2.
const video = `${OUT}/glean-demo.mp4`;
if (fs.existsSync(video)) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "2.8", "-i", video, "-frames:v", "1",
    "-vf", "crop=1620:1080:150:0,scale=1500:1000:flags=lanczos", `${OUT}/00-cover.png`]);
  console.log("saved 00-cover");
}
