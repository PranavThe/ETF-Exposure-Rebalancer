"""Sector exposure of a portfolio of ETFs, and plans that move it toward a mix the user chooses.

All weights are fractions (0.25 = 25%) and amounts are dollars. A plan never says what mix to
want; it only works out which ETFs to add, increase or reduce to reach the mix the user asked for.

The core is a small bounded least-squares problem: choose each ETF's share u_j of the portfolio
(u >= 0, sum u = 1, optional per-ETF bounds) to minimise

    || W u - target ||^2 + SMOOTHING * || u - current ||^2

where W[s][j] is ETF j's weight in sector s. The second term prefers smaller moves when two
answers reach the target equally well. It is solved with accelerated projected gradient (FISTA).
"""

import math
from dataclasses import dataclass, field
from typing import Iterable, Mapping

CASH_OTHER = "Cash & other"
UNCLASSIFIED = "Unclassified"

# Canonical sector names, in display order.
SECTORS = (
    "Technology", "Health Care", "Financials", "Consumer Discretionary", "Consumer Staples",
    "Communication Services", "Industrials", "Energy", "Utilities", "Materials", "Real Estate",
    CASH_OTHER, UNCLASSIFIED,
)

# Issuer and reference labels for the same sector, mapped to one name.
SECTOR_ALIASES = {
    "information technology": "Technology",
    "technology": "Technology",
    "health care": "Health Care",
    "healthcare": "Health Care",
    "financials": "Financials",
    "financial": "Financials",
    "consumer discretionary": "Consumer Discretionary",
    "consumer cyclical": "Consumer Discretionary",
    "consumer staples": "Consumer Staples",
    "consumer defensive": "Consumer Staples",
    "communication services": "Communication Services",
    "communication": "Communication Services",
    "communications": "Communication Services",
    "telecommunications": "Communication Services",
    "telecommunication services": "Communication Services",
    "industrials": "Industrials",
    "energy": "Energy",
    "utilities": "Utilities",
    "materials": "Materials",
    "basic materials": "Materials",
    "real estate": "Real Estate",
    "cash and/or derivatives": CASH_OTHER,
    "cash": CASH_OTHER,
    "cash & other": CASH_OTHER,
    "funds": CASH_OTHER,
    "unknown": UNCLASSIFIED,
    "": UNCLASSIFIED,
}

# Only breaks ties between equally good answers in favour of smaller moves; reaching the target
# always comes first, so exact answers stay exact (e.g. $7,000 / $3,000, not $6,998 / $3,002).
SMOOTHING = 1e-7
MAX_ITERATIONS = 500
SHORTLIST_SIZE = 12  # candidate new ETFs considered per plan
MIN_POSITION = 0.01  # positions below 1% of the portfolio are dropped rather than suggested
MIN_GAIN = 0.005  # each new ETF must bring the plan at least 0.5 pp closer to the target

# The only ETFs a plan may propose adding: plain, liquid, non-leveraged index ETFs a beginner would
# recognise (broad U.S. market, size and style, dividend, international, the sector families from
# SPDR, Vanguard and iShares, core bonds and T-bills). Users can hold any ETF; this list only limits
# what plans suggest. The API reads it through `routes.plans.suggestable_etfs`, which tests override.
SUGGESTABLE_ETFS = frozenset({
    # Broad U.S. market, size and style
    "VTI", "VOO", "IVV", "SPY", "ITOT", "SCHB", "QQQ", "RSP", "IWM", "IJH", "IJR", "VB", "VO",
    "VUG", "VTV",
    # Dividend
    "SCHD", "DGRO",
    # International
    "VEA", "VXUS", "IEFA", "EFA", "VWO", "IEMG", "ACWI",
    # Sectors: SPDR, Vanguard, iShares
    "XLK", "XLV", "XLF", "XLY", "XLP", "XLC", "XLI", "XLE", "XLU", "XLB", "XLRE",
    "VGT", "VHT", "VFH", "VCR", "VDC", "VOX", "VIS", "VDE", "VPU", "VAW", "VNQ",
    "IYW", "IYH", "IYF", "IYC", "IYK", "IYZ", "IYJ", "IYE", "IDU", "IYM", "IYR",
    # Bonds and T-bills
    "BND", "AGG", "SGOV",
})
# A fund is suggested only when at least this share of its mix has a known sector (or is
# Cash & other), so a plan never leans on a fund whose holdings we could not classify.
MIN_CLASSIFIED = 0.8


def canonical_sector(name: str | None) -> str:
    key = (name or "").strip().lower()
    if key in SECTOR_ALIASES:
        return SECTOR_ALIASES[key]
    return (name or "").strip() or UNCLASSIFIED


def sector_order(sector: str) -> tuple[int, str]:
    return (SECTORS.index(sector) if sector in SECTORS else len(SECTORS) - 2, sector)


def fund_sector_weights(rows: Iterable[Mapping]) -> dict[str, float]:
    """An ETF's sector mix from its holdings: market value by sector over total market value.

    Rows need asset_class, market_value and sector. Non-equity rows count as Cash & other.
    Rows with no positive market value are ignored, as in the portfolio analysis endpoint.
    """
    totals: dict[str, float] = {}
    for r in rows:
        value = r["market_value"] or 0.0
        if value <= 0:
            continue
        sector = canonical_sector(r["sector"]) if r["asset_class"] == "equity" else CASH_OTHER
        totals[sector] = totals.get(sector, 0.0) + value
    grand = math.fsum(totals.values())
    return {s: v / grand for s, v in totals.items()} if grand > 0 else {}


def yearly_fee(amounts: Mapping[str, float], ratios: Mapping[str, float]) -> tuple[float, float]:
    """Dollars a year in fund fees for `amounts` (expense ratios are fractions), and the dollars
    whose fee is known; funds without a known fee are left out of both."""
    known = {t: a for t, a in amounts.items() if a > 0 and t in ratios}
    return math.fsum(a * ratios[t] for t, a in known.items()), math.fsum(known.values())


def classified_share(mix: Mapping[str, float]) -> float:
    """Share of a fund's mix with a known sector, Cash & other included."""
    return math.fsum(w for s, w in mix.items() if s != UNCLASSIFIED)


def suggestable(weights: Mapping[str, Mapping[str, float]], allowed: Iterable[str]) -> set[str]:
    """Funds a plan may add: on the allowlist, with at least MIN_CLASSIFIED of their mix classified."""
    allowed = set(allowed)
    return {t for t, mix in weights.items()
            if t in allowed and mix and classified_share(mix) >= MIN_CLASSIFIED}


def exposure(amounts: Mapping[str, float], weights: Mapping[str, Mapping[str, float]]) -> dict[str, float]:
    """Portfolio sector mix: dollars in each ETF times its sector weights, over the covered total.

    ETFs without holdings data are left out, so the mix describes the part we can see.
    """
    covered = {t: a for t, a in amounts.items() if a > 0 and weights.get(t)}
    total = math.fsum(covered.values())
    mix: dict[str, float] = {}
    if total <= 0:
        return mix
    for ticker, amount in covered.items():
        for sector, w in weights[ticker].items():
            mix[sector] = mix.get(sector, 0.0) + amount * w / total
    return mix


def distance(a: Mapping[str, float], b: Mapping[str, float]) -> float:
    """Share of the portfolio sitting in a different sector than wanted (half the L1 distance)."""
    return 0.5 * math.fsum(abs(a.get(s, 0.0) - b.get(s, 0.0)) for s in set(a) | set(b))


def normalize_target(target: Mapping[str, float]) -> dict[str, float]:
    """Canonical sector names, non-negative, summing to 1."""
    merged: dict[str, float] = {}
    for sector, w in target.items():
        if w > 0:
            key = canonical_sector(sector)
            merged[key] = merged.get(key, 0.0) + w
    total = math.fsum(merged.values())
    if total <= 0:
        raise ValueError("target must have at least one positive weight")
    return {s: w / total for s, w in merged.items()}


def _project(y: list[float], lo: list[float], hi: list[float]) -> list[float]:
    """Euclidean projection onto {u : sum u = 1, lo <= u <= hi} by bisection on the shift."""
    a = min(yi - h for yi, h in zip(y, hi)) - 1.0
    b = max(yi - l for yi, l in zip(y, lo)) + 1.0
    for _ in range(100):
        mid = (a + b) / 2
        if math.fsum(min(max(yi - mid, l), h) for yi, l, h in zip(y, lo, hi)) > 1.0:
            a = mid
        else:
            b = mid
    tau = (a + b) / 2
    return [min(max(yi - tau, l), h) for yi, l, h in zip(y, lo, hi)]


def _solve_linear(a: list[list[float]], b: list[float]) -> list[float]:
    """Gaussian elimination with partial pivoting (the systems here are at most ~30 x 30)."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(m[r][col]))
        m[col], m[pivot] = m[pivot], m[col]
        if abs(m[col][col]) < 1e-300:
            raise ArithmeticError("singular system")
        for r in range(col + 1, n):
            f = m[r][col] / m[col][col]
            if f:
                for k in range(col, n + 1):
                    m[r][k] -= f * m[col][k]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        x[r] = (m[r][n] - math.fsum(m[r][k] * x[k] for k in range(r + 1, n))) / m[r][r]
    return x


def solve_mix(
    columns: list[Mapping[str, float]],
    target: Mapping[str, float],
    anchor: list[float],
    lo: list[float],
    hi: list[float],
    smoothing: float = SMOOTHING,
) -> list[float]:
    """Portfolio shares u for ETFs with sector mixes `columns`, closest to `target` (see module doc).

    Minimises 1/2 u'Qu - c'u with Q = W'W + smoothing*I and c = W't + smoothing*anchor, subject to
    sum u = 1 and lo <= u <= hi.
    """
    n = len(columns)
    sectors = sorted(set(target).union(*columns))
    w = [[col.get(s, 0.0) for col in columns] for s in sectors]
    t = [target.get(s, 0.0) for s in sectors]
    q = [[math.fsum(w[k][i] * w[k][j] for k in range(len(sectors))) + (smoothing if i == j else 0.0)
          for j in range(n)] for i in range(n)]
    c = [math.fsum(w[k][i] * t[k] for k in range(len(sectors))) + smoothing * anchor[i] for i in range(n)]
    eps = 1e-12

    u = _project([max(a, 0.0) for a in anchor] if any(anchor) else [1.0 / n] * n, lo, hi)
    # Working set: each ETF is free, or pinned at its lower ("lo") or upper ("hi") bound.
    pinned = {i: ("lo" if u[i] <= lo[i] + eps else "hi") for i in range(n)
              if u[i] <= lo[i] + eps or u[i] >= hi[i] - eps}
    if len(pinned) == n:  # keep at least one free variable so the budget constraint can move
        pinned.pop(max(range(n), key=lambda i: hi[i] - lo[i]))

    for _ in range(MAX_ITERATIONS):
        free = [i for i in range(n) if i not in pinned]
        fixed = [i for i in range(n) if i in pinned]
        rhs = [c[i] - math.fsum(q[i][j] * u[j] for j in fixed) for i in free]
        budget = 1.0 - math.fsum(u[j] for j in fixed)
        kkt = [[q[i][j] for j in free] + [1.0] for i in free] + [[1.0] * len(free) + [0.0]]
        solution = _solve_linear(kkt, rhs + [budget])
        proposal, nu = solution[:-1], solution[-1]

        # Step toward the proposal, stopping at the first bound it would cross.
        step, blocking = 1.0, None
        for k, i in enumerate(free):
            d = proposal[k] - u[i]
            if d < -eps and proposal[k] < lo[i] - eps:
                ratio = (lo[i] - u[i]) / d
                if ratio < step:
                    step, blocking = ratio, (i, "lo")
            elif d > eps and proposal[k] > hi[i] + eps:
                ratio = (hi[i] - u[i]) / d
                if ratio < step:
                    step, blocking = ratio, (i, "hi")
        for k, i in enumerate(free):
            u[i] += step * (proposal[k] - u[i])
        if blocking is not None:
            i, side = blocking
            u[i] = lo[i] if side == "lo" else hi[i]
            pinned[i] = side
            continue

        # The proposal is feasible: check the multipliers of the pinned bounds.
        grad = [math.fsum(q[i][j] * u[j] for j in range(n)) - c[i] + nu for i in range(n)]
        worst, release = -1e-14, None
        for i, side in pinned.items():
            multiplier = grad[i] if side == "lo" else -grad[i]
            if multiplier < worst:
                worst, release = multiplier, i
        if release is None:
            break
        del pinned[release]
    return [min(max(x, l), h) for x, l, h in zip(u, lo, hi)]


@dataclass
class Move:
    ticker: str
    action: str  # add | increase | reduce | remove
    amount: float  # dollars, always positive
    before: float
    after: float


@dataclass
class Plan:
    kind: str
    title: str
    summary: str
    total_before: float
    total_after: float
    allocation: dict[str, float]
    moves: list[Move]
    exposure: dict[str, float]
    distance: float
    new_funds: list[str] = field(default_factory=list)


def _shortlist(weights: Mapping[str, Mapping[str, float]], held: set[str],
               gap: Mapping[str, float], size: int, exclude: set[str]) -> list[str]:
    """New ETFs that point most toward the target, scored by alignment with the gap."""
    scored = []
    for ticker, mix in weights.items():
        if ticker in held or ticker in exclude or not mix:
            continue
        scored.append((-math.fsum(gap.get(s, 0.0) * w for s, w in mix.items()), ticker))
    return [ticker for _, ticker in sorted(scored)[:size]]


def _shares(
    active: list[str],
    amounts: Mapping[str, float],
    weights: Mapping[str, Mapping[str, float]],
    target: Mapping[str, float],
    total_after: float,
    floor_current: bool,
    cap_current: bool,
    no_increase: frozenset[str] = frozenset(),
) -> dict[str, float] | None:
    """Shares of `active` closest to the target, or None when the bounds leave no way to sum to 1."""
    anchor = [amounts.get(t, 0.0) / total_after for t in active]
    # Add-only plans keep every ETF at least where it is; reduce-only plans cap it there, and ETFs in
    # `no_increase` are always capped there.
    lo = anchor if floor_current else [0.0] * len(active)
    hi = [a if cap_current or t in no_increase else 1.0 for t, a in zip(active, anchor)]
    if math.fsum(lo) > 1 + 1e-9 or math.fsum(hi) < 1 - 1e-9:
        return None
    return dict(zip(active, solve_mix([weights[t] for t in active], target, anchor, lo, hi)))


def _pick_new(
    base: list[str],
    pool: list[str],
    amounts: Mapping[str, float],
    weights: Mapping[str, Mapping[str, float]],
    target: Mapping[str, float],
    total_after: float,
    floor_current: bool,
    max_new: int,
    no_increase: frozenset[str] = frozenset(),
) -> list[str]:
    """Up to `max_new` ETFs from `pool`, added one at a time, each the one that helps most.

    An ETF is only added if it brings the plan at least MIN_GAIN closer to the target.
    """
    def fit(tickers: list[str]) -> float:
        share = _shares(tickers, amounts, weights, target, total_after, floor_current, False, no_increase)
        return math.inf if share is None else distance(exposure(share, weights), target)

    chosen: list[str] = []
    best = fit(base) if base else math.inf
    for _ in range(max_new):
        trials = [(fit(base + chosen + [t]), t) for t in pool if t not in chosen]
        if not trials:
            break
        d, ticker = min(trials)
        if d > best - MIN_GAIN:
            break
        best = d
        chosen.append(ticker)
    return chosen


def _allocate(
    amounts: Mapping[str, float],
    weights: Mapping[str, Mapping[str, float]],
    target: Mapping[str, float],
    candidates: list[str],
    total_after: float,
    floor_current: bool,
    cap_current: bool,
    max_new: int,
    no_increase: frozenset[str] = frozenset(),
) -> dict[str, float]:
    """Dollar allocation over `candidates` totalling `total_after`, after pruning tiny positions."""
    held = {t for t, a in amounts.items() if a > 0}
    base = [t for t in candidates if t in held]
    pool = [t for t in candidates if t not in held]
    active = base + (_pick_new(base, pool, amounts, weights, target, total_after, floor_current, max_new,
                               no_increase)
                     if pool and max_new > 0 else [])
    share: dict[str, float] = {}
    for _ in range(len(candidates) + 1):
        if not active:
            return {}
        solved = _shares(active, amounts, weights, target, total_after, floor_current, cap_current, no_increase)
        if solved is None:
            return {}
        share = solved
        drop = {t for t in active if t not in held and share[t] < MIN_POSITION}
        if not floor_current and not cap_current:
            # Held ETFs that would end up tiny are removed outright rather than left as dust.
            drop |= {t for t in active if t in held and 0 < share[t] < MIN_POSITION}
        if not drop:
            break
        active = [t for t in active if t not in drop]
    return {t: share[t] * total_after for t in active}


def _round(allocation: dict[str, float], amounts: Mapping[str, float], total_after: float) -> dict[str, float]:
    """Whole dollars; changes under $1 are dropped; the rounding residual goes to the largest move
    among the positions that stay open, so a removed fund never keeps a stray dollar."""
    tickers = set(allocation) | {t for t, a in amounts.items() if a > 0}
    out = {}
    for t in tickers:
        before = amounts.get(t, 0.0)
        after = allocation.get(t, 0.0)
        out[t] = before if abs(after - before) < 1.0 else float(round(after))
    residual = total_after - math.fsum(out.values())
    if abs(residual) >= 0.005:
        kept = [t for t in tickers if out[t] > 0] or list(tickers)
        biggest = max(kept, key=lambda t: (abs(out[t] - amounts.get(t, 0.0)), out[t]))
        out[biggest] += residual
    return {t: v for t, v in out.items() if v > 0.005 or amounts.get(t, 0.0) > 0}


def _moves(allocation: Mapping[str, float], amounts: Mapping[str, float]) -> list[Move]:
    moves = []
    for t in set(allocation) | set(amounts):
        before, after = amounts.get(t, 0.0), allocation.get(t, 0.0)
        if abs(after - before) < 0.5:
            continue
        if before <= 0:
            action = "add"
        elif after <= 0.005:
            action = "remove"
        else:
            action = "increase" if after > before else "reduce"
        moves.append(Move(t, action, abs(after - before), before, max(after, 0.0)))
    order = {"reduce": 0, "remove": 0, "increase": 1, "add": 1}
    return sorted(moves, key=lambda m: (order[m.action], -m.amount, m.ticker))


def build_plans(
    amounts: Mapping[str, float],
    weights: Mapping[str, Mapping[str, float]],
    target: Mapping[str, float],
    cash_change: float = 0.0,
    max_new_funds: int = 2,
    never_suggest: Iterable[str] = (),
    no_increase: Iterable[str] = (),
) -> list[Plan]:
    """Up to two plans toward `target`.

    `amounts` are the dollars in each ETF the user holds; `weights` are sector mixes for every ETF
    with holdings data; `cash_change` is money the user adds (positive) or takes out (negative).
    ETFs in `never_suggest` (e.g. test fixtures) can be held but are never proposed as new.
    ETFs in `no_increase` can be kept or reduced but never get more money.
    Held ETFs without data are kept as they are and left out of exposure.
    """
    target = normalize_target(target)
    covered = {t: a for t, a in amounts.items() if a > 0 and weights.get(t)}
    total = math.fsum(covered.values())
    total_after = total + cash_change
    if total_after <= 0:
        return []
    held = set(covered)
    current = exposure(covered, weights)
    gap = {s: target.get(s, 0.0) - current.get(s, 0.0) for s in set(target) | set(current)}
    shortlist = _shortlist(weights, held, gap, SHORTLIST_SIZE, set(never_suggest))
    held_list = sorted(held)
    before_distance = distance(current, target) if held else 1.0

    specs = []  # (kind, title, candidates, floor_current, cap_current, max_new)
    if cash_change > 0 and not held:
        specs.append(("start", f"Invest {_dollars(cash_change)}", shortlist, False, False, max_new_funds))
    elif cash_change > 0:
        specs.append(("add_money", f"Invest {_dollars(cash_change)} without reducing anything",
                      held_list + shortlist, True, False, max_new_funds))
        specs.append(("add_and_rearrange", f"Invest {_dollars(cash_change)} and rearrange",
                      held_list + shortlist, False, False, max_new_funds))
    elif cash_change < 0:
        specs.append(("withdraw", f"Take out {_dollars(-cash_change)} only by reducing",
                      held_list, False, True, 0))
        specs.append(("withdraw_and_rearrange", f"Take out {_dollars(-cash_change)} and rearrange",
                      held_list + shortlist, False, False, max_new_funds))
    elif held:
        specs.append(("rearrange", "Rearrange the ETFs you own", held_list, False, False, 0))
        specs.append(("rearrange_with_new", "Rearrange and add new ETFs",
                      held_list + shortlist, False, False, max_new_funds))

    plans = []
    for kind, title, candidates, floor_current, cap_current, max_new in specs:
        if not candidates:
            continue
        raw = _allocate(covered, weights, target, candidates, total_after,
                        floor_current, cap_current, max_new, frozenset(no_increase))
        if not raw:
            continue
        allocation = _round(raw, covered, total_after)
        if any(p.allocation == allocation for p in plans):
            continue  # e.g. no new ETF helps, so "rearrange with new" equals "rearrange"
        moves = _moves(allocation, covered)
        if not moves:
            continue  # nothing to do with these ETFs
        after = exposure(allocation, weights)
        after_distance = distance(after, target)
        if held and after_distance >= before_distance - 1e-9:
            continue  # show only plans that get closer; small improvements still count
        new_funds = sorted(t for t in allocation if t not in held and allocation[t] > 0)
        moved = math.fsum(m.amount for m in moves if m.action in ("reduce", "remove"))
        summary = _summary(kind, moves, moved, before_distance, after_distance, held)
        plans.append(Plan(kind, title, summary, total, total_after, allocation, moves, after,
                          after_distance, new_funds))
    return plans


def _dollars(x: float) -> str:
    return f"${x:,.0f}"


def _summary(kind: str, moves: list[Move], moved: float, before: float, after: float,
             held: set[str]) -> str:
    if not moves:
        return "You're already as close to your target as these ETFs allow."
    reach = (f"Gets you to within {after * 100:.1f} pp of your target"
             if after > 0.0005 else "Matches your target")
    start = f" (now {before * 100:.1f} pp away)" if held else ""
    shifted = f"; moves {_dollars(moved)} out of current holdings" if moved >= 0.5 else ""
    return f"{reach}{start}{shifted}."
