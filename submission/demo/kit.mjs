// Demo kit: on-screen captions, a visible cursor, click ripples, highlight rings and title cards,
// plus frame capture from Chrome (CDP screencast) for a sharp MP4.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const OVERLAY = () => {
  if (document.getElementById("demo-root")) return;
  const css = `
  #demo-root{position:fixed;inset:0;pointer-events:none;z-index:2147483646;font-family:var(--font-geist),ui-sans-serif,system-ui,sans-serif}
  #demo-cursor{position:absolute;left:0;top:0;width:22px;height:22px;transform:translate(-3px,-2px);transition:left var(--d,600ms) cubic-bezier(.22,1,.36,1),top var(--d,600ms) cubic-bezier(.22,1,.36,1);filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))}
  .demo-ripple{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid #a6a1ff;animation:demo-ripple 650ms ease-out forwards}
  @keyframes demo-ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
  #demo-ring{position:absolute;border:2.5px solid #a6a1ff;border-radius:12px;box-shadow:0 0 0 6px rgba(122,115,240,.22),0 0 40px rgba(122,115,240,.35);opacity:0;transition:all 450ms cubic-bezier(.22,1,.36,1)}
  #demo-ring.on{opacity:1}
  #demo-cap{position:absolute;left:0;right:0;bottom:0;height:104px;padding:17px 36px 0;background:linear-gradient(180deg,#121218,#0b0b0d);border-top:1px solid rgba(166,161,255,.38);box-shadow:0 -12px 40px rgba(0,0,0,.45)}
  #demo-cap>div{transition:opacity 320ms,transform 320ms}
  #demo-cap.off>div{opacity:0;transform:translateY(6px)}
  #demo-cap .k{font:600 12.5px/1 var(--font-geist-mono),ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#a6a1ff}
  #demo-cap .t{margin-top:9px;font-size:25px;line-height:1.2;font-weight:600;color:#f4f4f8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #demo-cap .s{margin-top:5px;font-size:16.5px;line-height:1.35;color:#b9b9c6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  html.demo-band .h-dvh{height:calc(100dvh - 104px)!important}
  #demo-card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:radial-gradient(60% 60% at 50% 40%,rgba(122,115,240,.28),rgba(11,11,13,.97) 70%),#0b0b0d;opacity:0;transition:opacity 500ms}
  #demo-card.on{opacity:1}
  #demo-card .b{width:360px;height:118.3px;margin-bottom:10px;background:url(/brand/glean-logo.png) -47.2px -6.1px/454.1px auto no-repeat}
  #demo-card .t{margin-top:14px;font-size:30px;color:#d8d6ff;font-weight:500}
  #demo-card .s{margin-top:22px;font-size:18px;color:#a3a3b2;max-width:860px;line-height:1.5}`;
  const root = document.createElement("div");
  root.id = "demo-root";
  root.innerHTML = `<style>${css}</style><div id="demo-ring"></div><div id="demo-cap" class="off" style="display:none"><div class="k"></div><div class="t"></div><div class="s"></div></div><div id="demo-card"><div class="b"></div><div class="t"></div><div class="s"></div></div><svg id="demo-cursor" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  document.documentElement.appendChild(root);
};

export function makeKit(page, ctx) {
  let cursor = { x: 760, y: 420 };
  const ensure = async () => {
    await page.evaluate(OVERLAY);
    await page.evaluate(({ x, y }) => {
      const c = document.getElementById("demo-cursor");
      c.style.setProperty("--d", "0ms");
      c.style.left = x + "px";
      c.style.top = y + "px";
    }, cursor);
  };
  const hold = (ms) => page.waitForTimeout(ms);

  async function moveTo(x, y, ms = 650) {
    await ensure();
    await page.evaluate(({ x, y, ms }) => {
      const c = document.getElementById("demo-cursor");
      c.style.setProperty("--d", ms + "ms");
      c.style.left = x + "px";
      c.style.top = y + "px";
    }, { x, y, ms });
    await page.mouse.move(x, y, { steps: 12 });
    cursor = { x, y };
    await hold(ms);
  }
  async function center(locator) {
    await locator.scrollIntoViewIfNeeded();
    const b = await locator.boundingBox();
    if (!b) throw new Error("no box for " + locator);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
  }
  async function ripple() {
    await page.evaluate(({ x, y }) => {
      const r = document.createElement("div");
      r.className = "demo-ripple";
      r.style.left = x + "px";
      r.style.top = y + "px";
      document.getElementById("demo-root").appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, cursor);
  }
  async function click(locator, { ms = 650, after = 350 } = {}) {
    const { x, y } = await center(locator);
    await moveTo(x, y, ms);
    await ripple();
    await locator.click();
    await hold(after);
  }
  async function hover(locator, ms = 650) {
    const { x, y } = await center(locator);
    await moveTo(x, y, ms);
  }
  async function ring(locator, pad = 8) {
    await ensure();
    await locator.scrollIntoViewIfNeeded();
    const b = await locator.boundingBox();
    await page.evaluate(({ b, pad }) => {
      const r = document.getElementById("demo-ring");
      Object.assign(r.style, { left: b.x - pad + "px", top: b.y - pad + "px", width: b.width + 2 * pad + "px", height: b.height + 2 * pad + "px" });
      r.classList.add("on");
    }, { b, pad });
    await hold(450);
  }
  /** One ring around several elements (e.g. the rows a step is about). */
  async function ringAll(locators, pad = 6) {
    await ensure();
    const boxes = [];
    for (const l of locators) boxes.push(await l.boundingBox());
    const b = { x: Math.min(...boxes.map((r) => r.x)), y: Math.min(...boxes.map((r) => r.y)) };
    b.width = Math.max(...boxes.map((r) => r.x + r.width)) - b.x;
    b.height = Math.max(...boxes.map((r) => r.y + r.height)) - b.y;
    await page.evaluate(({ b, pad }) => {
      const r = document.getElementById("demo-ring");
      Object.assign(r.style, { left: b.x - pad + "px", top: b.y - pad + "px", width: b.width + 2 * pad + "px", height: b.height + 2 * pad + "px" });
      r.classList.add("on");
    }, { b, pad });
    await hold(450);
  }
  async function unring() {
    await page.evaluate(() => document.getElementById("demo-ring")?.classList.remove("on"));
    await hold(250);
  }
  async function caption(kicker, title, sub = "") {
    await ensure();
    await page.evaluate(() => {
      const c = document.getElementById("demo-cap");
      c.style.display = "";
      document.documentElement.classList.add("demo-band");
      c.classList.add("off");
    });
    await hold(280);
    await page.evaluate(({ kicker, title, sub }) => {
      const c = document.getElementById("demo-cap");
      c.querySelector(".k").textContent = kicker;
      c.querySelector(".t").textContent = title;
      c.querySelector(".s").textContent = sub;
      c.querySelector(".s").style.display = sub ? "" : "none";
      c.classList.remove("off");
    }, { kicker, title, sub });
    await hold(380);
  }
  async function uncaption() {
    await page.evaluate(() => document.getElementById("demo-cap")?.classList.add("off"));
    await hold(300);
  }
  /** Text overflowing the band, for the dry run to catch. */
  async function captionFits() {
    return page.evaluate(() => [...document.querySelectorAll("#demo-cap .t, #demo-cap .s")].every((e) => e.scrollWidth <= e.clientWidth + 1));
  }
  /** A full-screen title card: the site's own logo (served at /brand/glean-logo.png), a title and a line. */
  async function card(title, sub, ms) {
    await ensure();
    await page.evaluate(async ({ title, sub }) => {
      const c = document.getElementById("demo-card");
      const logo = new Image();
      logo.src = "/brand/glean-logo.png";
      await logo.decode();
      c.querySelector(".t").textContent = title;
      c.querySelector(".s").textContent = sub;
      c.classList.add("on");
      document.getElementById("demo-cursor").style.opacity = "0";
    }, { title, sub });
    await hold(ms);
  }
  async function uncard() {
    await page.evaluate(() => {
      document.getElementById("demo-card")?.classList.remove("on");
      document.getElementById("demo-cursor").style.opacity = "1";
    });
    await hold(550);
  }
  async function type(locator, text, delay = 45) {
    await click(locator);
    await page.keyboard.type(text, { delay });
  }
  return { ensure, hold, moveTo, click, hover, ring, ringAll, unring, caption, uncaption, captionFits, card, uncard, type };
}

/** Records the page through Chrome's screencast; stop() writes an MP4 with the real frame timings. */
export async function startCapture(ctx, page, dir = path.join(os.tmpdir(), "glean-demo-frames")) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const file = `${dir}/f${String(frames.length).padStart(6, "0")}.jpg`;
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId });
    } catch {}
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  return {
    frames,
    async stop(out) {
      await cdp.send("Page.stopScreencast").catch(() => {});
      const end = Date.now() / 1000;
      const lines = [];
      frames.forEach((f, i) => {
        const next = i + 1 < frames.length ? frames[i + 1].t : end;
        lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
      });
      lines.push(`file '${frames[frames.length - 1].file}'`);
      fs.writeFileSync(`${dir}/list.txt`, lines.join("\n"));
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`,
        "-vf", "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
        "-movflags", "+faststart", out]);
      return out;
    },
  };
}
