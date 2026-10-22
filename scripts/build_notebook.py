#!/usr/bin/env python3
"""Build the reproducible data-validation notebook for Drift Atlas."""

from __future__ import annotations

import json
from pathlib import Path

import nbformat as nbf


PROJECT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_PATH = PROJECT_DIR / "analysis" / "drift_atlas_data_validation.ipynb"
RESULTS_PATH = PROJECT_DIR / "analysis" / "validation_results.json"


def main() -> None:
    results = json.loads(RESULTS_PATH.read_text(encoding="utf-8"))
    notebook = nbf.v4.new_notebook()
    notebook["metadata"]["kernelspec"] = {
        "display_name": "Drift Atlas Data",
        "language": "python",
        "name": "drift-atlas-data",
    }

    notebook["cells"] = [
        nbf.v4.new_markdown_cell(
            """# Drift Atlas data validation

## tl;dr

The downloaded 2024 western North Atlantic extract contains **65,625 six-hour position records from 150 drifters**. IDs, timestamps and coordinates are complete, and no duplicate `ID + time` keys were found. NOAA uses `-999999` as a velocity fill value in 83 rows, so the analysis converts those values to missing before calculating speed. Sea-surface temperature is missing in 6,690 rows. Coverage varies considerably by month and place, which means the final interface must show the track count and search window with every result.
"""
        ),
        nbf.v4.new_markdown_cell(
            """## Context and methods

This notebook checks the working extract planned for the first Drift Atlas prototype.

- Source: NOAA Global Drifter Program, 6-hour interpolated quality-controlled data
- Source page: https://erddap.aoml.noaa.gov/gdp/erddap/info/drifter_6hour_qc/index.html
- DOI: https://doi.org/10.25921/7ntx-z961
- Accessed: October 22, 2026
- Time filter: January 1 through December 31, 2024 UTC
- Geographic filter: 30°N to 50°N and 75°W to 40°W
- Grain: one quality-controlled, interpolated position estimate for one drifter at one six-hour timestamp

### Key assumptions

The regional query only returns positions inside the selected bounding box. A gap in one drifter's local record may therefore mean that the instrument left the box and later returned. It does not automatically mean NOAA failed to collect data.
"""
        ),
        nbf.v4.new_markdown_cell("## Data"),
        nbf.v4.new_code_cell(
            """%matplotlib inline
from pathlib import Path
import json
import sys
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

project_dir = Path.cwd()
if not (project_dir / "scripts").exists():
    project_dir = project_dir.parent
sys.path.insert(0, str(project_dir))

from scripts.analyze_data import load_data, numeric_summary

data = load_data()
results = json.loads((project_dir / "analysis/validation_results.json").read_text())

print(f"Rows: {len(data):,}")
print(f"Downloaded columns: {results['columns_in_download']}")
print(f"Unique drifters: {data['ID'].nunique():,}")
print(f"Time range: {data['time'].min()} to {data['time'].max()}")
data.head()"""
        ),
        nbf.v4.new_markdown_cell("## Results"),
        nbf.v4.new_markdown_cell("### 1. Completeness, uniqueness and validity"),
        nbf.v4.new_code_cell(
            """quality_checks = pd.DataFrame({
    "check": [
        "Exact duplicate source rows",
        "Duplicate ID + time keys",
        "Missing IDs",
        "Missing timestamps",
        "Missing latitude",
        "Missing longitude",
        "Velocity fill-value rows converted to missing",
        "Missing sea-surface temperature",
    ],
    "rows": [
        results["exact_duplicate_rows"],
        results["duplicate_id_time_rows"],
        results["missing_by_column"]["ID"],
        results["missing_by_column"]["time"],
        results["missing_by_column"]["latitude"],
        results["missing_by_column"]["longitude"],
        results["raw_velocity_fill_value_rows"],
        results["missing_by_column"]["sst"],
    ],
})
quality_checks["share_pct"] = quality_checks["rows"] / len(data) * 100
quality_checks"""
        ),
        nbf.v4.new_markdown_cell("### 2. Numerical variables"),
        nbf.v4.new_code_cell(
            """summary = numeric_summary(data)
summary[[
    "description", "count", "missing", "minimum", "p25", "median",
    "mean", "p75", "maximum", "range", "std_dev", "skewness"
]].round(3)"""
        ),
        nbf.v4.new_code_cell(
            """plt.style.use("default")
fig, ax = plt.subplots(figsize=(8.5, 4.8))
speed = data["speed_m_s"].dropna()
shown = speed[speed <= speed.quantile(0.995)]
ax.hist(shown, bins=45, color="#6bcfc7", edgecolor="#163447", linewidth=0.4)
ax.axvline(speed.median(), color="#d76043", linewidth=2, label=f"Median {speed.median():.3f} m/s")
ax.set_title("Observed horizontal speed has a long right tail", loc="left", weight="bold")
ax.set_xlabel("Horizontal speed (m/s), through the 99.5th percentile")
ax.set_ylabel("Position records")
ax.legend(frameon=False)
ax.grid(axis="y", alpha=0.2)
plt.tight_layout()
plt.show()"""
        ),
        nbf.v4.new_markdown_cell(
            "The speed distribution is right-skewed. Values above the IQR fence are unusual relative to the rest of this extract, but none exceeds 3 m/s after NOAA's fill values are removed. I keep these observations because the data have already passed NOAA quality control and fast currents can occur."
        ),
        nbf.v4.new_markdown_cell("### 3. Time coverage"),
        nbf.v4.new_code_cell(
            """monthly = (
    data.groupby("month", as_index=False)
    .agg(positions=("ID", "size"), unique_drifters=("ID", "nunique"))
)
monthly"""
        ),
        nbf.v4.new_code_cell(
            """fig, ax = plt.subplots(figsize=(10, 4.8))
ax.bar(monthly["month"], monthly["positions"], color="#1d5fa7")
ax.set_title("The number of records changes through the year", loc="left", weight="bold")
ax.set_ylabel("Six-hour position records")
ax.tick_params(axis="x", rotation=45)
ax.grid(axis="y", alpha=0.2)
plt.tight_layout()
plt.show()"""
        ),
        nbf.v4.new_code_cell(
            """ordered = data.sort_values(["ID", "time"]).copy()
ordered["gap_hours"] = ordered.groupby("ID")["time"].diff().dt.total_seconds() / 3600
pd.Series({
    "transitions longer than 6 hours": int(ordered["gap_hours"].gt(6).sum()),
    "largest gap in hours": float(ordered["gap_hours"].max()),
})"""
        ),
        nbf.v4.new_markdown_cell(
            "There are 149 within-drifter transitions longer than six hours. Because this is a geographically filtered extract, these gaps can occur when a drifter leaves the box and later re-enters. The final visualization should break the line at long gaps instead of drawing a straight segment across unobserved space."
        ),
        nbf.v4.new_markdown_cell("### 4. Geographic and drogue coverage"),
        nbf.v4.new_code_cell(
            """fig, ax = plt.subplots(figsize=(9, 6))
plot_sample = data.iloc[::max(1, len(data) // 15000)]
colors = {"attached": "#1d5fa7", "lost": "#d76043"}
for status, group in plot_sample.groupby("drogue_status"):
    ax.scatter(group["longitude"], group["latitude"], s=4, alpha=0.4,
               c=colors.get(status, "#8a9497"), label=status)
ax.set_title("Coverage is uneven within the search box", loc="left", weight="bold")
ax.set_xlabel("Longitude")
ax.set_ylabel("Latitude")
ax.legend(title="Drogue status", frameon=False, markerscale=3)
ax.grid(alpha=0.2)
plt.tight_layout()
plt.show()"""
        ),
        nbf.v4.new_code_cell(
            """status_table = data["drogue_status"].value_counts().rename_axis("status").reset_index(name="positions")
status_table["share_pct"] = status_table["positions"] / len(data) * 100
status_table"""
        ),
        nbf.v4.new_markdown_cell(
            """## Takeaways

1. The working extract is manageable at about 6.1 MB and is large enough to test search, filtering and route selection.
2. The route keys are clean: there are no duplicate `ID + time` combinations and no missing IDs, times or coordinates.
3. `-999999` must be treated as a fill value before calculating velocity or speed. The raw download remains unchanged, and the cleaning step is documented in code.
4. Sea-surface temperature is absent in about 10.2% of rows, so temperature should remain optional in the interface.
5. About 71.8% of positions in this extract occur after the drifter's recorded drogue-loss date. The site must show drogue status because these tracks respond more strongly to wind and waves.
6. Coverage changes by month and location. Every search result should display its date window, area and number of matching tracks.
"""
        ),
    ]

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    nbf.write(notebook, OUTPUT_PATH)
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
