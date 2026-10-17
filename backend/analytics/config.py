"""Analytics thresholds. All weights and effects are fractions (0.01 = 1 pp)."""

# Part of every event id; bump it when a threshold or rule below changes.
CONFIG_VERSION = "1"

# Per-holding status: INCREASED / DECREASED when abs(adj_share_change) reaches this.
POSITION_SHARE_THRESHOLD = 0.05
# POSITION_INCREASED / POSITION_DECREASED events also need abs(activity_effect) >= this.
POSITION_ACTIVITY_THRESHOLD = 0.001
# SECTOR_INCREASE / SECTOR_DECREASE when abs(drift) >= this.
SECTOR_DRIFT_THRESHOLD = 0.01
# CONCENTRATION_INCREASE / CONCENTRATION_DECREASE when abs(top-N share change) >= this.
CONCENTRATION_THRESHOLD = 0.01

TOP_N = 10
# DEMO has only 4 holdings, so a top-10 share is always 100%. SPEC §10 evaluates it with top-2.
TOP_N_BY_FUND = {"DEMO": 2}

# Fewer common holdings than this and the flow factor falls back to 1.0.
MIN_FLOW_SECURITIES = 3

# Suspected corporate action: r or 1/r within SPLIT_RATIO_TOLERANCE of a ratio below,
# and (p_B / p_A) * r within SPLIT_PRICE_TOLERANCE of 1.
SPLIT_RATIOS = (2, 3, 4, 5, 10, 20)
SPLIT_RATIO_TOLERANCE = 0.01
SPLIT_PRICE_TOLERANCE = 0.10

UNKNOWN_SECTOR = "Unknown"

# Slack for float noise when a value sits exactly on a threshold (e.g. 1.05 / 1.0 - 1).
EPSILON = 1e-12


def top_n_for(fund: str) -> int:
    return TOP_N_BY_FUND.get(fund.upper(), TOP_N)
