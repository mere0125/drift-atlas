#!/usr/bin/env python3
"""Reproduce the Drift Atlas data profile and validation outputs."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import matplotlib

if __name__ == "__main__":
    matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = PROJECT_DIR / "data" / "noaa_gdp_6hour_western_north_atlantic_2024.csv"
OUTPUT_DIR = PROJECT_DIR / "analysis"
CHART_DIR = OUTPUT_DIR / "charts"


def load_data() -> pd.DataFrame:
    # ERDDAP writes a units row directly below the header. It is metadata, not an
    # observation, so the analysis skips that second row.
    data = pd.read_csv(DATA_PATH, skiprows=[1], dtype={"ID": "string"})
    data["time"] = pd.to_datetime(data["time"], utc=True, errors="coerce")
    data["drogue_lost_date"] = pd.to_datetime(
        data["drogue_lost_date"], utc=True, errors="coerce"
    )

    # NOAA documents -999999 as a fill value for several numeric fields. Keep
    # the downloaded CSV unchanged, but treat those sentinels as missing during
    # analysis so they cannot create impossible speeds or distort averages.
    raw_velocity_fill_value_rows = int(
        (data["ve"].le(-100000) | data["vn"].le(-100000)).sum()
    )
    data.attrs["raw_velocity_fill_value_rows"] = raw_velocity_fill_value_rows
    for column in ["ve", "vn", "sst"]:
        data.loc[data[column].le(-100000), column] = np.nan
    data["speed_m_s"] = np.hypot(data["ve"], data["vn"])
    data["month"] = data["time"].dt.strftime("%Y-%m")

    uncertain = data["drogue_lost_date"].eq(pd.Timestamp("1970-01-01", tz="UTC"))
    data["drogue_status"] = np.select(
        [
            uncertain,
            data["drogue_lost_date"].isna(),
            data["drogue_lost_date"].gt(data["time"]),
            data["drogue_lost_date"].le(data["time"]),
        ],
        ["uncertain", "attached", "attached", "lost"],
        default="unknown",
    )

    # A 5-degree grid is used only to summarize spatial coverage. The source
    # does not contain named geographic regions.
    data["lat_bin_start"] = (np.floor(data["latitude"] / 5) * 5).astype(int)
    data["lon_bin_start"] = (np.floor(data["longitude"] / 5) * 5).astype(int)
    data["grid_cell"] = (
        data["lat_bin_start"].astype(str)
        + " to "
        + (data["lat_bin_start"] + 5).astype(str)
        + " N, "
        + (-data["lon_bin_start"]).astype(str)
        + " to "
        + (-(data["lon_bin_start"] + 5)).astype(str)
        + " W"
    )
    return data


def numeric_summary(data: pd.DataFrame) -> pd.DataFrame:
    variables = ["latitude", "longitude", "ve", "vn", "sst", "speed_m_s"]
    labels = {
        "latitude": "Latitude (degrees north)",
        "longitude": "Longitude (degrees east)",
        "ve": "Eastward velocity (m/s)",
        "vn": "Northward velocity (m/s)",
        "sst": "Sea-surface temperature (deg C)",
        "speed_m_s": "Horizontal speed (m/s, derived)",
    }
    rows = []
    for variable in variables:
        values = data[variable].dropna()
        q1 = values.quantile(0.25)
        q3 = values.quantile(0.75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        outliers = values.lt(lower) | values.gt(upper)
        rows.append(
            {
                "variable": variable,
                "description": labels[variable],
                "count": int(values.count()),
                "missing": int(data[variable].isna().sum()),
                "minimum": float(values.min()),
                "p25": float(q1),
                "median": float(values.median()),
                "mean": float(values.mean()),
                "p75": float(q3),
                "maximum": float(values.max()),
                "range": float(values.max() - values.min()),
                "std_dev": float(values.std()),
                "skewness": float(values.skew()),
                "iqr_outlier_count": int(outliers.sum()),
                "iqr_outlier_rate_pct": float(outliers.mean() * 100),
            }
        )
    return pd.DataFrame(rows)


def make_outputs(data: pd.DataFrame) -> dict:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CHART_DIR.mkdir(parents=True, exist_ok=True)

    summary = numeric_summary(data)
    summary.to_csv(OUTPUT_DIR / "numeric_summary.csv", index=False)

    monthly = (
        data.groupby("month", as_index=False)
        .agg(positions=("ID", "size"), unique_drifters=("ID", "nunique"))
        .sort_values("month")
    )
    monthly.to_csv(OUTPUT_DIR / "monthly_coverage.csv", index=False)

    spatial = (
        data.groupby(["grid_cell", "lat_bin_start", "lon_bin_start"], as_index=False)
        .agg(positions=("ID", "size"), unique_drifters=("ID", "nunique"))
        .sort_values(["positions", "grid_cell"], ascending=[False, True])
    )
    spatial.to_csv(OUTPUT_DIR / "spatial_coverage_5deg.csv", index=False)

    per_drifter = (
        data.groupby("ID", as_index=False)
        .agg(
            first_position=("time", "min"),
            last_position=("time", "max"),
            positions=("time", "size"),
            min_latitude=("latitude", "min"),
            max_latitude=("latitude", "max"),
            min_longitude=("longitude", "min"),
            max_longitude=("longitude", "max"),
            median_speed_m_s=("speed_m_s", "median"),
        )
        .sort_values("positions", ascending=False)
    )
    per_drifter.to_csv(OUTPUT_DIR / "drifter_summary.csv", index=False)

    sorted_data = data.sort_values(["ID", "time"]).copy()
    sorted_data["gap_hours"] = (
        sorted_data.groupby("ID")["time"].diff().dt.total_seconds().div(3600)
    )
    long_gaps = sorted_data["gap_hours"].gt(6)

    key_duplicates = data.duplicated(["ID", "time"], keep=False)
    exact_duplicates = data[
        ["ID", "time", "latitude", "longitude", "ve", "vn", "sst", "drogue_lost_date"]
    ].duplicated(keep=False)

    coordinate_bounds_ok = bool(
        data["latitude"].between(30, 50, inclusive="both").all()
        and data["longitude"].between(-75, -40, inclusive="both").all()
    )
    regular_clock = bool(data["time"].dt.hour.isin([0, 6, 12, 18]).all())

    speed_q1 = data["speed_m_s"].quantile(0.25)
    speed_q3 = data["speed_m_s"].quantile(0.75)
    speed_upper = speed_q3 + 1.5 * (speed_q3 - speed_q1)
    speed_outliers = data["speed_m_s"].gt(speed_upper)

    file_hash = hashlib.sha256(DATA_PATH.read_bytes()).hexdigest()
    results = {
        "source_file": str(DATA_PATH.relative_to(PROJECT_DIR)),
        "sha256": file_hash,
        "download_size_bytes": DATA_PATH.stat().st_size,
        "rows": int(len(data)),
        "source_columns": [
            "ID",
            "time",
            "latitude",
            "longitude",
            "ve",
            "vn",
            "sst",
            "drogue_lost_date",
        ],
        "columns_in_download": 8,
        "unique_drifters": int(data["ID"].nunique()),
        "earliest_time": data["time"].min().isoformat(),
        "latest_time": data["time"].max().isoformat(),
        "latitude_min": float(data["latitude"].min()),
        "latitude_max": float(data["latitude"].max()),
        "longitude_min": float(data["longitude"].min()),
        "longitude_max": float(data["longitude"].max()),
        "exact_duplicate_rows": int(exact_duplicates.sum()),
        "duplicate_id_time_rows": int(key_duplicates.sum()),
        "invalid_or_missing_time_rows": int(data["time"].isna().sum()),
        "coordinate_bounds_ok": coordinate_bounds_ok,
        "positions_on_expected_6hour_clock": regular_clock,
        "missing_by_column": {
            column: int(value) for column, value in data.isna().sum().items()
        },
        "missing_rate_pct_by_source_column": {
            column: float(data[column].isna().mean() * 100)
            for column in [
                "ID",
                "time",
                "latitude",
                "longitude",
                "ve",
                "vn",
                "sst",
                "drogue_lost_date",
            ]
        },
        "raw_velocity_fill_value_rows": int(data.attrs["raw_velocity_fill_value_rows"]),
        "drogue_status_counts": {
            str(key): int(value)
            for key, value in data["drogue_status"].value_counts().items()
        },
        "drogue_status_rate_pct": {
            str(key): float(value)
            for key, value in (data["drogue_status"].value_counts(normalize=True) * 100).items()
        },
        "unique_5degree_grid_cells": int(data["grid_cell"].nunique()),
        "most_observed_month": str(monthly.loc[monthly["positions"].idxmax(), "month"]),
        "most_observed_month_positions": int(monthly["positions"].max()),
        "least_observed_month": str(monthly.loc[monthly["positions"].idxmin(), "month"]),
        "least_observed_month_positions": int(monthly["positions"].min()),
        "most_observed_grid_cell": str(spatial.iloc[0]["grid_cell"]),
        "most_observed_grid_cell_positions": int(spatial.iloc[0]["positions"]),
        "least_observed_grid_cell": str(spatial.iloc[-1]["grid_cell"]),
        "least_observed_grid_cell_positions": int(spatial.iloc[-1]["positions"]),
        "within_drifter_gaps_over_6h": int(long_gaps.sum()),
        "maximum_within_drifter_gap_hours": float(sorted_data["gap_hours"].max()),
        "speed_iqr_upper_fence_m_s": float(speed_upper),
        "speed_iqr_outlier_rows": int(speed_outliers.sum()),
        "speed_iqr_outlier_rate_pct": float(
            speed_outliers.sum() / data["speed_m_s"].notna().sum() * 100
        ),
        "speed_over_3_m_s_rows": int(data["speed_m_s"].gt(3).sum()),
    }
    (OUTPUT_DIR / "validation_results.json").write_text(
        json.dumps(results, indent=2), encoding="utf-8"
    )

    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "font.size": 11,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.facecolor": "#f3f0e7",
            "figure.facecolor": "#f3f0e7",
            "axes.edgecolor": "#163447",
            "axes.labelcolor": "#163447",
            "xtick.color": "#163447",
            "ytick.color": "#163447",
        }
    )

    fig, ax = plt.subplots(figsize=(10, 4.8))
    ax.bar(monthly["month"], monthly["positions"], color="#1d5fa7")
    ax.set_title("Positions in the 2024 working extract by month", loc="left", weight="bold")
    ax.set_ylabel("Six-hour position records")
    ax.set_xlabel("")
    ax.tick_params(axis="x", rotation=45)
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(CHART_DIR / "monthly_positions.png", dpi=180)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8.5, 4.8))
    clipped = data.loc[data["speed_m_s"].le(data["speed_m_s"].quantile(0.995)), "speed_m_s"]
    ax.hist(clipped, bins=45, color="#6bcfc7", edgecolor="#163447", linewidth=0.4)
    ax.axvline(data["speed_m_s"].median(), color="#d76043", linewidth=2, label="Median")
    ax.set_title("Most observed speeds are low, with a long right tail", loc="left", weight="bold")
    ax.set_xlabel("Horizontal speed (m/s), shown through the 99.5th percentile")
    ax.set_ylabel("Position records")
    ax.legend(frameon=False)
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(CHART_DIR / "speed_distribution.png", dpi=180)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(9, 6))
    sample = data.iloc[:: max(1, len(data) // 15000)]
    status_colors = {"attached": "#1d5fa7", "lost": "#d76043", "uncertain": "#163447", "unknown": "#9aa7a9"}
    for status, group in sample.groupby("drogue_status"):
        ax.scatter(
            group["longitude"],
            group["latitude"],
            s=4,
            alpha=0.4,
            c=status_colors.get(status, "#9aa7a9"),
            label=status,
        )
    ax.set_title("Spatial coverage of the western North Atlantic extract", loc="left", weight="bold")
    ax.set_xlabel("Longitude")
    ax.set_ylabel("Latitude")
    ax.legend(title="Drogue status", frameon=False, markerscale=3)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(CHART_DIR / "spatial_coverage.png", dpi=180)
    plt.close(fig)

    return results


def main() -> None:
    data = load_data()
    results = make_outputs(data)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
