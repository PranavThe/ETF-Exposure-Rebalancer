import math

import pytest

from backend.analytics.rebalance import (
    CASH_OTHER,
    UNCLASSIFIED,
    build_plans,
    canonical_sector,
    distance,
    exposure,
    fund_sector_weights,
    normalize_target,
    solve_mix,
    suggestable,
)

from .golden import close

TECH = {"Technology": 1.0}
HEALTH = {"Health Care": 1.0}
BLEND_A = {"Technology": 0.6, "Health Care": 0.4}
BLEND_B = {"Technology": 0.2, "Health Care": 0.8}


def row(sector, value, asset_class="equity"):
    return {"sector": sector, "market_value": value, "asset_class": asset_class}


def by_ticker(plan):
    return {m.ticker: m for m in plan.moves}


def test_canonical_sector_maps_issuer_labels():
    assert canonical_sector("Information Technology") == "Technology"
    assert canonical_sector("Communication") == "Communication Services"
    assert canonical_sector("Cash and/or Derivatives") == CASH_OTHER
    assert canonical_sector("Unknown") == UNCLASSIFIED
    assert canonical_sector("Crypto Miners") == "Crypto Miners"  # unknown labels pass through


def test_fund_sector_weights_counts_cash_and_skips_non_positive_rows():
    w = fund_sector_weights([
        row("Information Technology", 600), row("Health Care", 300),
        row("Cash", 100, "cash"), row("Health Care", -50), row("Energy", 0),
    ])
    assert close(w["Technology"], 0.6) and close(w["Health Care"], 0.3) and close(w[CASH_OTHER], 0.1)
    assert set(w) == {"Technology", "Health Care", CASH_OTHER}


def test_exposure_and_distance():
    weights = {"T": TECH, "H": HEALTH, "X": {}}
    mix = exposure({"T": 750, "H": 250, "X": 1000}, weights)  # X has no data and is left out
    assert close(mix["Technology"], 0.75) and close(mix["Health Care"], 0.25)
    assert close(distance(mix, {"Technology": 0.5, "Health Care": 0.5}), 0.25)


def test_normalize_target_merges_aliases_and_rescales():
    t = normalize_target({"Information Technology": 30, "Technology": 30, "Health Care": 40})
    assert close(t["Technology"], 0.6) and close(t["Health Care"], 0.4)
    with pytest.raises(ValueError):
        normalize_target({"Technology": 0})


def test_solver_finds_an_exact_blend():
    # 0.5 * (60/40) + 0.5 * (20/80) = 40/60
    u = solve_mix([BLEND_A, BLEND_B], {"Technology": 0.4, "Health Care": 0.6},
                  anchor=[1.0, 0.0], lo=[0, 0], hi=[1, 1])
    assert math.isclose(u[0], 0.5, abs_tol=1e-6) and math.isclose(u[1], 0.5, abs_tol=1e-6)


def test_solver_respects_bounds():
    u = solve_mix([TECH, HEALTH], {"Health Care": 1.0}, anchor=[0.5, 0.5], lo=[0.3, 0], hi=[1, 1])
    assert math.isclose(u[0], 0.3, abs_tol=1e-6) and math.isclose(sum(u), 1.0, abs_tol=1e-9)


def test_rearrange_only_cannot_leave_a_single_held_fund():
    plans = build_plans({"T": 1000}, {"T": TECH, "H": HEALTH}, {"Technology": 0.5, "Health Care": 0.5})
    kinds = [p.kind for p in plans]
    # Rearranging one fund changes nothing, so only the plan that adds a new ETF is offered.
    assert kinds == ["rearrange_with_new"]
    plan = plans[0]
    moves = by_ticker(plan)
    assert moves["T"].action == "reduce" and moves["T"].amount == 500
    assert moves["H"].action == "add" and moves["H"].amount == 500
    assert plan.new_funds == ["H"]
    assert plan.distance < 1e-6 and math.isclose(plan.total_after, 1000)


def test_add_money_plan_never_reduces():
    plans = build_plans({"T": 1000}, {"T": TECH, "H": HEALTH},
                        {"Technology": 0.5, "Health Care": 0.5}, cash_change=1000)
    add_only = next(p for p in plans if p.kind == "add_money")
    assert all(m.action in ("add", "increase") for m in add_only.moves)
    assert by_ticker(add_only)["H"].amount == 1000
    assert math.isclose(sum(add_only.allocation.values()), 2000)
    assert add_only.distance < 1e-6


def test_withdraw_plan_only_reduces():
    plans = build_plans({"T": 600, "H": 400}, {"T": TECH, "H": HEALTH},
                        {"Technology": 0.5, "Health Care": 0.5}, cash_change=-200)
    reduce_only = next(p for p in plans if p.kind == "withdraw")
    assert [(m.ticker, m.action, m.amount) for m in reduce_only.moves] == [("T", "reduce", 200)]
    assert math.isclose(sum(reduce_only.allocation.values()), 800)


def test_starting_from_cash():
    plans = build_plans({}, {"T": TECH, "H": HEALTH}, {"Technology": 0.7, "Health Care": 0.3},
                        cash_change=10_000)
    assert [p.kind for p in plans] == ["start"]
    alloc = plans[0].allocation
    assert alloc == {"T": 7000, "H": 3000}


def test_new_fund_limit_and_rounding():
    weights = {f"F{i}": {f"S{i}": 1.0} for i in range(6)}
    weights["HELD"] = {"S0": 1.0}
    target = {f"S{i}": 1 / 6 for i in range(6)}
    plans = build_plans({"HELD": 999.99}, weights, target, max_new_funds=2)
    plan = next(p for p in plans if p.kind == "rearrange_with_new")
    assert len(plan.new_funds) <= 2
    assert math.isclose(sum(plan.allocation.values()), 999.99, abs_tol=1e-6)
    assert all(m.amount == round(m.amount) or m is plan.moves[0] for m in plan.moves)


def test_plans_never_move_away_from_the_target():
    weights = {"A": BLEND_A, "B": BLEND_B, "T": TECH, "H": HEALTH, "C": {CASH_OTHER: 1.0}}
    current = {"A": 3000, "C": 500}
    for target in ({"Technology": 0.9, "Health Care": 0.1}, {"Health Care": 1.0},
                   {"Technology": 0.3, "Health Care": 0.3, CASH_OTHER: 0.4}):
        before = distance(exposure(current, weights), normalize_target(target))
        for cash in (0, 1500, -1000):
            for plan in build_plans(current, weights, target, cash_change=cash):
                assert plan.distance <= before + 1e-9, (target, cash, plan.kind)
                assert math.isclose(sum(plan.allocation.values()), plan.total_after, abs_tol=1e-6)
                assert all(v >= 0 for v in plan.allocation.values())


def test_held_fund_without_data_is_kept_out_of_planning():
    plans = build_plans({"T": 1000, "NODATA": 5000}, {"T": TECH, "H": HEALTH},
                        {"Technology": 0.5, "Health Care": 0.5})
    for plan in plans:
        assert "NODATA" not in plan.allocation
        assert math.isclose(plan.total_before, 1000)


def test_suggestable_needs_the_allowlist_and_classified_holdings():
    weights = {
        "A": TECH,
        "B": {"Technology": 0.7, UNCLASSIFIED: 0.3},  # under 80% classified
        "C": {CASH_OTHER: 1.0},  # a bond fund: Cash & other counts as classified
        "D": HEALTH,  # not on the allowlist
        "E": {},  # no data
    }
    assert suggestable(weights, {"A", "B", "C", "E"}) == {"A", "C"}


def test_no_increase_funds_are_kept_or_reduced_never_increased():
    # Holding T and H; H is the only way to add Health Care, but it may not receive more money,
    # so the plans must bring in N (a mix of both) instead, and H never goes up.
    weights = {"T": TECH, "H": HEALTH, "N": {"Technology": 0.5, "Health Care": 0.5}}
    amounts = {"T": 8000, "H": 2000}
    plans = build_plans(amounts, weights, {"Technology": 0.5, "Health Care": 0.5}, no_increase={"H"})
    assert plans
    for p in plans:
        assert p.allocation.get("H", 0.0) <= 2000 + 1e-9
    assert any("N" in p.new_funds for p in plans)
    # Every held fund capped and nothing new allowed: no way to change anything.
    assert build_plans(amounts, weights, {"Technology": 0.5, "Health Care": 0.5}, max_new_funds=0,
                       no_increase={"T", "H"}) == []
