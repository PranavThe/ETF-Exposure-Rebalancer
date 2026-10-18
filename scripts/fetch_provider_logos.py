"""Download a square logo for each ETF provider into frontend/public/logos/<id>.png.

    python3 scripts/fetch_provider_logos.py              # every provider below
    python3 scripts/fetch_provider_logos.py --only ark,spdr

Provider ids and display names come from frontend/lib/providers.ts; this script only knows each
provider's website. For each one it tries, in order: a pinned icon URL (set after reviewing the
result by eye), the icons the homepage declares (apple-touch-icon, icon, web manifest),
/apple-touch-icon.png, Google's favicon service, then DuckDuckGo's. It keeps the largest
raster image, trims plain margins and pads it to a transparent 128x128 PNG.
frontend/public/logos/SOURCES.md records where each file came from.

Needs Pillow (not a project dependency): run it with a Python that has it, for example the
system python3, or `pip install --target <dir> pillow` and set PYTHONPATH=<dir>.
After a run, copy the printed LOGOS line into frontend/lib/providers.ts.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import html.parser
import http.cookiejar
import io
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from PIL import Image, ImageChops
except ImportError:  # pragma: no cover - tool script
    sys.exit("Pillow is required: run with a Python that has it (see the docstring).")

ROOT = Path(__file__).resolve().parents[1]
PROVIDERS_TS = ROOT / "frontend" / "lib" / "providers.ts"
OUT = ROOT / "frontend" / "public" / "logos"
SIZE = 128
MIN_GOOD = 64  # below this many pixels on the short side, keep looking
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/130.0 Safari/537.36")

# provider id -> official website (the domain whose icon is the provider's mark).
# Every provider with five or more ETFs in the catalog, plus the allowlist's issuers.
DOMAINS: dict[str, str] = {
    "vanguard": "investor.vanguard.com",
    "ishares": "ishares.com",
    "spdr": "ssga.com",
    "invesco": "invesco.com",
    "schwab": "schwab.com",
    "firsttrust": "ftportfolios.com",
    "innovator": "innovatoretfs.com",
    "proshares": "proshares.com",
    "direxion": "direxion.com",
    "globalx": "globalxetfs.com",
    "leverageshares": "leverageshares.com",
    "wisdomtree": "wisdomtree.com",
    "graniteshares": "graniteshares.com",
    "vaneck": "vaneck.com",
    "defiance": "defianceetfs.com",
    "fidelity": "fidelity.com",
    "tradr": "tradretfs.com",
    "jpmorgan": "am.jpmorgan.com",
    "pacer": "paceretfs.com",
    "pgim": "pgim.com",
    "franklin": "franklintempleton.com",
    "corgi": "corgiinvest.com",
    "yieldmax": "yieldmaxetfs.com",
    "allianzim": "allianzim.com",
    "roundhill": "roundhillinvestments.com",
    "northerntrust": "northerntrust.com",
    "goldmansachs": "am.gs.com",
    "amplify": "amplifyetfs.com",
    "calamos": "calamos.com",
    "simplify": "simplify.us",
    "xtrackers": "etf.dws.com",
    "troweprice": "troweprice.com",
    "microsectors": "microsectors.com",
    "harbor": "harborcapital.com",
    "kraneshares": "kraneshares.com",
    "rex": "rexshares.com",
    "dimensional": "dimensional.com",
    "avantis": "avantisinvestors.com",
    "americancentury": "americancentury.com",
    "nuveen": "nuveen.com",
    "virtus": "virtus.com",
    "victory": "vcm.com",
    "capitalgroup": "capitalgroup.com",
    "columbia": "columbiathreadneedleus.com",
    "pimco": "pimco.com",
    "alliancebernstein": "alliancebernstein.com",
    "trueshares": "true-shares.com",
    "bny": "bny.com",
    "newyorklife": "newyorklifeinvestments.com",
    "alps": "alpsfunds.com",
    "horizonkinetics": "horizonkinetics.com",
    "horizon": "horizoninvestments.com",
    "hartford": "hartfordfunds.com",
    "bondbloxx": "bondbloxxetf.com",
    "cambria": "cambriafunds.com",
    "neos": "neosfunds.com",
    "johnhancock": "jhinvestments.com",
    "janushenderson": "janushenderson.com",
    "aptus": "aptusetfs.com",
    "sprott": "sprott.com",
    "principal": "principalam.com",
    "grayscale": "grayscale.com",
    "kurv": "kurvinvest.com",
    "alphaarchitect": "alphaarchitect.com",
    "neubergerberman": "nb.com",
    "advisorshares": "advisorshares.com",
    "fm": "fminvest.com",
    "vistashares": "vistashares.com",
    "tcw": "tcw.com",
    "ark": "ark-funds.com",
    "tema": "temaetfs.com",
    "mfs": "mfs.com",
    "matthews": "matthewsasia.com",
    "lifex": "lifexfunds.com",
    "federatedhermes": "federatedhermes.com",
    "abrdn": "aberdeeninvestments.com",
    "themes": "themesetfs.com",
    "sei": "seic.com",
    "strive": "strivefunds.com",
    "tuttle": "tuttlecap.com",
    "eatonvance": "eatonvance.com",
    "21shares": "21shares.com",
    "aam": "aamlive.com",
    "nomura": "nomuracapitalmanagement.com",
    "doubleline": "doubleline.com",
    "touchstone": "touchstoneinvestments.com",
    "bluemonte": "bluemontefunds.com",
    "ubs": "ubs.com",
    "nicholas": "nicholasx.com",
    "inspire": "inspireinvesting.com",
    "teucrium": "teucrium.com",
    "gmo": "gmo.com",
    "motleyfool": "fooletfs.com",
    "allspring": "allspringglobal.com",
    "brookstone": "brookstonecm.com",
    "russell": "russellinvestments.com",
    "bitwise": "bitwiseinvestments.com",
    "uscf": "uscfinvestments.com",
    "etc": "exchangetradedconcepts.com",
    "polen": "polencapital.com",
    "returnstacked": "returnstacked.com",
    "baron": "baroncapitalgroup.com",
    "rareview": "rareviewcapital.com",
    "vegashares": "vegashares.com",
    "cohensteers": "cohenandsteers.com",
    "lazard": "lazard.com",
    "gabelli": "gabelli.com",
    "truthsocial": "truth.fi",
    "monarch": "monarchfunds.com",
    "overlayshares": "lsfunds.com",
    "thornburg": "thornburg.com",
    "tortoise": "tortoisecapital.com",
    "thrivent": "thrivent.com",
    "timothy": "timothyplan.com",
    "abacus": "abacusfcf.com",
    "hedgeye": "hedgeye.com",
    "sgi": "sgiam.com",
    "pictet": "am.pictet",
    "frontier": "frontierasset.com",
    "zacks": "zacksetfs.com",
    "canary": "canary.capital",
    "sterling": "sterlingcapital.com",
    "reckoner": "reckonercapital.com",
    "fis": "faithinvestorservices.com",
    "guinness": "gafunds.com",
    "sofi": "sofi.com",
    "alger": "alger.com",
    "angeloak": "angeloakcapital.com",
    "bailliegifford": "bailliegifford.com",
    "main": "mainmgt.com",
    "max": "maxetns.com",
    "calvert": "calvert.com",
    "eventide": "eventideinvestments.com",
    "fundx": "fundx.com",
    "natixis": "im.natixis.com",
    "hotchkis": "hwcm.com",
    "man": "man.com",
    "morganstanley": "morganstanley.com",
    "oneascent": "oneascent.com",
    "rockefeller": "rockco.com",
    "spfunds": "sp-funds.com",
    "firsteagle": "firsteagle.com",
    "volatilityshares": "volatilityshares.com",
    "infracap": "infracapfunds.com",
    "precidian": "adrhedged.com",
    "twinoak": "twinoaketfs.com",
}

# Icon URLs pinned after looking at the results (the automatic pick was wrong or poor).
PINNED: dict[str, str] = {}

# Providers whose site offers no usable square mark; they keep the monogram.
SKIP: set[str] = set()


def opener() -> urllib.request.OpenerDirector:
    jar = http.cookiejar.CookieJar()
    o = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    o.addheaders = [("User-Agent", UA), ("Accept-Language", "en-US,en;q=0.8")]
    return o


def get(url: str, limit: int = 3_000_000, accept: str = "*/*") -> tuple[bytes, str, str] | None:
    """Return (body, final url, content type), or None on any failure."""
    try:
        req = urllib.request.Request(url, headers={"Accept": accept})
        with opener().open(req, timeout=20) as r:
            return r.read(limit), r.geturl(), r.headers.get("Content-Type", "")
    except Exception:
        return None


class IconLinks(html.parser.HTMLParser):
    """Collect <link rel=... href=... sizes=...> icon and manifest tags."""

    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str, int]] = []  # (rel, href, declared size)
        self.manifest: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "link":
            return
        a = {k.lower(): (v or "") for k, v in attrs}
        rel = a.get("rel", "").lower()
        href = a.get("href", "").strip()
        if not href:
            return
        if "manifest" in rel:
            self.manifest = href
        elif "icon" in rel and "mask-icon" not in rel:
            sizes = [int(n) for n in re.findall(r"(\d+)x\d+", a.get("sizes", ""))]
            self.links.append((rel, href, max(sizes) if sizes else 0))


def declared_icons(domain: str) -> list[str]:
    """Icon URLs the homepage declares, best-looking first."""
    for home in (f"https://{domain}/", f"https://www.{domain}/"):
        page = get(home, accept="text/html")
        if page and "html" in page[2].lower():
            break
    else:
        return []
    body, base, _ = page
    parser = IconLinks()
    try:
        parser.feed(body.decode("utf-8", "replace"))
    except Exception:
        pass
    found: list[tuple[int, str]] = []
    for rel, href, size in parser.links:
        bonus = 1000 if "apple-touch-icon" in rel else 0
        found.append((bonus + size, urllib.parse.urljoin(base, href)))
    if parser.manifest:
        manifest_url = urllib.parse.urljoin(base, parser.manifest)
        m = get(manifest_url, limit=500_000)
        if m:
            try:
                for icon in json.loads(m[0].decode("utf-8", "replace")).get("icons", []):
                    sizes = [int(n) for n in re.findall(r"(\d+)x\d+", icon.get("sizes", ""))]
                    found.append((max(sizes) if sizes else 0,
                                  urllib.parse.urljoin(manifest_url, icon["src"])))
            except Exception:
                pass
    root = f"{urllib.parse.urlsplit(base).scheme}://{urllib.parse.urlsplit(base).netloc}"
    found.append((900, root + "/apple-touch-icon.png"))
    found.append((899, root + "/apple-touch-icon-precomposed.png"))
    found.sort(key=lambda x: -x[0])
    return list(dict.fromkeys(url for _, url in found))


def load(url: str) -> Image.Image | None:
    if url.lower().split("?")[0].endswith(".svg"):
        return None  # Pillow cannot rasterize SVG
    got = get(url)
    if not got or "svg" in got[2].lower() or "html" in got[2].lower():
        return None
    try:
        img = Image.open(io.BytesIO(got[0]))
        if img.format == "ICO":  # several sizes in one file: take the largest
            img = img.ico.getimage(max(img.ico.sizes(), key=lambda s: s[0] * s[1]))
        img.load()
        return img.convert("RGBA")
    except Exception:
        return None


def trim(img: Image.Image) -> Image.Image:
    """Crop transparent margins, then plain white margins."""
    bbox = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox:
        img = img.crop(bbox)
    white = Image.new("RGBA", img.size, (255, 255, 255, 255))
    flat = Image.alpha_composite(white, img).convert("RGB")
    diff = ImageChops.difference(flat, Image.new("RGB", img.size, (255, 255, 255)))
    bbox = diff.convert("L").point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        img = img.crop(bbox)
    return img


def normalize(img: Image.Image) -> Image.Image:
    img = trim(img)
    scale = SIZE / max(img.size)
    w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    img = img.resize((w, h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(img, ((SIZE - w) // 2, (SIZE - h) // 2), img)
    return canvas


def best_logo(pid: str, domain: str) -> tuple[Image.Image, str] | None:
    candidates = [PINNED[pid]] if pid in PINNED else declared_icons(domain)
    best: tuple[int, Image.Image, str] | None = None
    for url in candidates:
        img = load(url)
        if img is None:
            continue
        side = min(trim(img).size)
        if best is None or side > best[0]:
            best = (side, img, url)
        if pid in PINNED or side >= 180:
            break
    if best is None or best[0] < MIN_GOOD:
        for url in (f"https://www.google.com/s2/favicons?domain={domain}&sz=256",
                    f"https://icons.duckduckgo.com/ip3/{domain}.ico"):
            img = load(url)
            if img is not None and min(img.size) > 16:
                side = min(trim(img).size)
                if best is None or side > best[0]:
                    best = (side, img, url)
    return (best[1], best[2]) if best else None


def provider_names() -> dict[str, str]:
    text = PROVIDERS_TS.read_text(encoding="utf-8")
    return {pid: name for pid, name in re.findall(r'\["([a-z0-9]+)", "([^"]+)", "', text)}


def read_sources() -> dict[str, tuple[str, str, str]]:
    path = OUT / "SOURCES.md"
    rows: dict[str, tuple[str, str, str]] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\| `(\w+)\.png` \| [^|]+ \| ([^|]+) \| <([^>]+)> \| ([\d-]+) \|", line)
            if m:
                rows[m.group(1)] = (m.group(2).strip(), m.group(3), m.group(4))
    return rows


def write_sources(rows: dict[str, tuple[str, str, str]], names: dict[str, str]) -> None:
    lines = [
        "# Provider logos",
        "",
        "Logos are trademarks of their owners, shown only to identify each fund's issuer.",
        "",
        "Fetched by `scripts/fetch_provider_logos.py`, normalized to 128x128 PNG. Provider ids and",
        "the rules that assign funds to them are in `frontend/lib/providers.ts`.",
        "",
        "| File | Provider | Domain | Source | Fetched |",
        "| --- | --- | --- | --- | --- |",
    ]
    for pid in sorted(rows, key=lambda p: names.get(p, p).lower()):
        domain, url, date = rows[pid]
        lines.append(f"| `{pid}.png` | {names.get(pid, pid)} | {domain} | <{url}> | {date} |")
    (OUT / "SOURCES.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--only", help="comma-separated provider ids")
    args = parser.parse_args(argv)
    names = provider_names()
    unknown = sorted(set(DOMAINS) - set(names))
    if unknown:
        print(f"not in providers.ts: {', '.join(unknown)}", file=sys.stderr)
    ids = args.only.split(",") if args.only else list(DOMAINS)
    OUT.mkdir(parents=True, exist_ok=True)
    rows = read_sources()
    today = dt.date.today().isoformat()
    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        results = pool.map(lambda p: None if p in SKIP else best_logo(p, DOMAINS[p]), ids)
    for pid, found in zip(ids, results):
        if pid in SKIP:
            (OUT / f"{pid}.png").unlink(missing_ok=True)
            rows.pop(pid, None)
            print(f"{pid:18} skipped")
            continue
        domain = DOMAINS[pid]
        if not found:
            print(f"{pid:18} NO LOGO ({domain})")
            continue
        img, url = found
        normalize(img).save(OUT / f"{pid}.png", optimize=True)
        rows[pid] = (domain, url, today)
        print(f"{pid:18} {img.width}x{img.height} {url}")
    rows = {pid: r for pid, r in rows.items() if (OUT / f"{pid}.png").exists()}
    write_sources(rows, names)
    ordered = [pid for pid in names if pid in rows]
    print("\nconst LOGOS = new Set<string>([" + ", ".join(f'"{p}"' for p in ordered) + "]);")
    return 0


if __name__ == "__main__":
    sys.exit(main())
