# Drift Atlas - data document

Accessed and analyzed October 22, 2026  
Mere Cui

## What I am planning to make

Drift Atlas will let a visitor choose an ocean area and a month, then find NOAA surface drifters that passed through that place. The result will not be a forecast or a live tracker. It will be a way to explore recorded surface-current paths and compare what happened to different instruments near the same place.

My pitch used NOAA's one-hour data to test the idea. For the final project I am switching the main source to NOAA's quality-controlled six-hour product. NOAA describes this version as suitable for larger-scale ocean processes, and the lower temporal resolution makes a full-year regional extract manageable without pretending that I need hour-by-hour precision.

## 1. Data sources

### Main source - NOAA Global Drifter Program

**Dataset:** Global Drifter Program - 6 Hour Interpolated QC Drifter Data  
**Producer:** NOAA Atlantic Oceanographic and Meteorological Laboratory, Global Drifter Program, Drifter Data Assembly Center  
**Dataset page:** [NOAA ERDDAP metadata and download interface](https://erddap.aoml.noaa.gov/gdp/erddap/info/drifter_6hour_qc/index.html)  
**DOI:** [10.25921/7ntx-z961](https://doi.org/10.25921/7ntx-z961)  
**Accessed:** October 22, 2026

The full dataset contains quality-controlled observations from satellite-tracked surface drifting buoys. NOAA interpolates the records to six-hour intervals using kriging. The source includes drifter identity, position, estimated eastward and northward velocity, sea-surface temperature when available, and information about when the drifter lost its underwater drogue. The drogue matters because it helps the instrument follow water at roughly 15 meters depth; after it is lost, wind and waves have a stronger effect on the path.

The full archive is too large to place in this repository, so I downloaded a working extract for the first version of the project:

- January 1 through December 31, 2024 UTC
- 30°N to 50°N
- 75°W to 40°W
- Eight variables needed for the planned interface

The exact ERDDAP request, file hashes, and download notes are recorded in [`data/SOURCE_QUERY.md`](data/SOURCE_QUERY.md). I downloaded the file successfully; it is 6,126,559 bytes, or about 6.1 MB.

### Supporting source - Natural Earth land boundaries

**Dataset:** Natural Earth 1:110m land polygons, distributed as `world-atlas` TopoJSON  
**Producers:** Natural Earth contributors; TopoJSON package maintained by Mike Bostock  
**File:** [world-atlas 2.0.2 land-110m.json](https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json)  
**Package information:** [world-atlas](https://www.npmjs.com/package/world-atlas)  
**Accessed:** October 22, 2026

This small file will draw land behind the drifter paths. It contains generalized global land polygons, not ocean observations. I downloaded and opened it successfully; it is 55,207 bytes.

## 2. Size and structure

### NOAA working extract

| Property | Result |
| --- | --- |
| Observation rows | 65,625 |
| Downloaded columns | 8 |
| Unique drifters | 150 |
| File format | CSV, with a header and a second metadata row for units |
| What one row represents | One quality-controlled, six-hour position estimate for one drifter |
| Time coverage | 2024-01-01 00:00 UTC to 2024-12-31 18:00 UTC |
| Realized latitude range | 30.000°N to 49.999°N |
| Realized longitude range | 74.999°W to 40.000°W |

The full NOAA source currently reports global coverage from February 15, 1979 through June 18, 2025. Its metadata was modified March 31, 2026. NOAA describes the product as delayed-mode data updated quarterly. It does not publish an exact date for the next update, so I will not claim that Drift Atlas is live or real-time.

#### Important columns

| Column | Type | Meaning | How I will use it |
| --- | --- | --- | --- |
| `ID` | Text identifier | NOAA Global Drifter Program buoy ID | Group observations into individual paths |
| `time` | UTC date-time | Time of the six-hour estimate | Filter by month and order each path |
| `latitude` | Decimal number | Latitude in degrees north | Position and spatial search |
| `longitude` | Decimal number | Longitude in degrees east; western longitudes are negative | Position and spatial search |
| `ve` | Decimal number | Eastward velocity component | Direction and derived horizontal speed |
| `vn` | Decimal number | Northward velocity component | Direction and derived horizontal speed |
| `sst` | Decimal number | Sea-surface bulk temperature in °C | Optional context, only where available |
| `drogue_lost_date` | UTC date-time or fill value | Recorded date of drogue loss; a fill value means it was still attached | Label each position as drogued or undrogued |

I derive `speed_m_s = sqrt(ve² + vn²)`. Month, drogue status, and a five-degree grid cell are also derived for validation; they are not extra source columns.

### Natural Earth coastline file

This source is not a table, so row and column counts are not meaningful. It is a TopoJSON `Topology` with one `land` object. That object is a `GeometryCollection` containing one global `MultiPolygon`, encoded with 130 shared arcs. Its bounding box is 180°W to 180°E and approximately 85.61°S to 83.65°N. The coastline is intentionally generalized for a world-scale map and should not be treated as a precise shoreline survey. It has no time field and no update schedule attached to this fixed version.

## 3. License and allowed use

### NOAA data

The NOAA dataset is licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). It can be copied, redistributed, and adapted, including for commercial use, as long as attribution is given, a link to the license is included, and changes are indicated. The project will use NOAA's requested acknowledgement and identify the geographic and temporal subset.

Planned citation:

> Lumpkin, Rick; Centurioni, Luca (2019). Global Drifter Program quality-controlled 6-hour interpolated data from ocean surface drifting buoys. Western North Atlantic 2024 subset. NOAA National Centers for Environmental Information. Dataset. https://doi.org/10.25921/7ntx-z961. Accessed October 22, 2026.

### Coastline data

Natural Earth states that its map data are in the public domain, with no required attribution or restrictions on modification, redistribution, or commercial use. I will still add the courtesy credit “Made with Natural Earth.” The downloaded `world-atlas` distribution is released under the [ISC License](https://github.com/topojson/world-atlas/blob/master/LICENSE), so its copyright and permission notice is included in [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md). Natural Earth's terms are available [here](https://www.naturalearthdata.com/about/terms-of-use/).

## 4. Descriptive statistics

The complete machine-readable results are in [`analysis/numeric_summary.csv`](analysis/numeric_summary.csv), and the executed analysis is in [`analysis/drift_atlas_data_validation.ipynb`](analysis/drift_atlas_data_validation.ipynb).

### Numerical variables

| Variable | Valid n | Missing | Min | 25th percentile | Median | Mean | 75th percentile | Max | Range | Std. dev. | Shape |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Latitude, °N | 65,625 | 0 | 30.000 | 32.670 | 35.962 | 36.683 | 39.582 | 49.999 | 19.999 | 4.823 | Moderately right-skewed |
| Longitude, °E | 65,625 | 0 | -74.999 | -65.645 | -55.829 | -56.544 | -47.440 | -40.000 | 34.999 | 10.275 | Approximately symmetric |
| Eastward velocity, m/s | 65,542 | 83 | -1.642 | -0.130 | 0.021 | 0.059 | 0.194 | 2.426 | 4.068 | 0.343 | Right-skewed |
| Northward velocity, m/s | 65,542 | 83 | -2.805 | -0.141 | 0.005 | 0.012 | 0.157 | 2.208 | 5.014 | 0.306 | Slightly right-skewed |
| Sea-surface temperature, °C | 58,935 | 6,690 | 0.167 | 20.101 | 23.236 | 22.372 | 26.418 | 32.015 | 31.848 | 5.295 | Left-skewed |
| Derived horizontal speed, m/s | 65,542 | 83 | 0.000 | 0.158 | 0.272 | 0.354 | 0.445 | 2.969 | 2.969 | 0.300 | Strongly right-skewed |

Horizontal speed has a long right tail. Using the usual 1.5 × IQR rule, 4,171 records, or 6.36% of valid speeds, are statistical outliers above 0.876 m/s. I am not deleting them automatically: the source is already a NOAA Level 2 quality-controlled product, none of the cleaned speeds exceeds 3 m/s, and fast surface currents can be real. I will flag extreme values during design testing instead of treating “unusual” as “wrong.”

### Drifters and drogue status

There are 150 unique drifter IDs. A typical drifter contributes 390 positions in this regional extract; the mean is 437.5. The middle half contributes between 192.75 and 616.5 positions. The minimum is one position and the maximum is 1,464, with a standard deviation of 327.5 positions. Four drifters have fewer than ten positions, including one with only a single point.

The derived drogue-status counts are:

| Status at observation time | Positions | Share |
| --- | ---: | ---: |
| Drogue already lost | 47,111 | 71.79% |
| Drogue attached | 18,514 | 28.21% |

The 8,892 blank `drogue_lost_date` cells do not mean “unknown.” NOAA defines the fill value as “drogue still attached.” Treating those blanks as ordinary missing data would incorrectly remove valid observations.

### Time coverage

All timestamps fall on the expected 00:00, 06:00, 12:00, or 18:00 UTC clock. Every month of 2024 is represented, but not equally. September has the most records, with 8,639 positions; April has the fewest, with 2,010. This difference reflects how many drifters were inside the selected area, not a direct measure of data quality.

There are 149 within-drifter jumps longer than six hours, and the longest is 5,538 hours. Because the query only keeps positions inside the geographic box, a long gap can occur when a drifter leaves the box and later returns. The interface must break the line at these gaps instead of drawing a false straight path across months of unobserved travel.

### Geographic coverage

The observations occupy 30 derived five-degree grid cells. The most represented cell, 35°N to 40°N and 75°W to 70°W, contains 4,754 positions. Coverage is much thinner near some edges of the query. A few boundary cells contain only one record, partly because points exactly on the eastern boundary at 40°W fall into the next five-degree bin. I will use the grid only to describe coverage, not as an analytical region or a claim about ocean conditions.

### What a typical observation looks like

One source row identifies a drifter, a UTC timestamp, its latitude and longitude, two velocity components, sea-surface temperature if available, and the recorded drogue-loss date. A typical speed is close to the median of 0.272 m/s, but there is no single “typical route”: the number of records per drifter and the places occupied both vary substantially.

## 5. Validation findings and planned fixes

| Finding | Evidence | What I will do |
| --- | --- | --- |
| NOAA fill values appear in velocity fields | 83 rows contain `-999999` in `ve` or `vn` | Keep the raw CSV unchanged; convert the sentinel to missing before calculating speed |
| Temperature is incomplete | 6,690 rows, 10.19%, have no usable `sst` | Make temperature optional and never impute it |
| Blank drogue-loss dates have a documented meaning | 8,892 rows have the source fill value, which NOAA defines as still attached | Translate the field into an explicit attached/lost label |
| Regional paths have time gaps | 149 within-drifter transitions are longer than six hours | Split route lines at gaps; never connect them across unseen time |
| A few drifters barely enter the selected region | Four drifters have fewer than ten positions; one has one | Show a point instead of inventing a line and display the record count |
| Coverage is uneven by month and place | Monthly records range from 2,010 to 8,639; grid counts are also uneven | Always show the selected date, area, and number of matching drifters |
| The source is delayed, not real-time | Source coverage ends June 18, 2025, while metadata was modified March 31, 2026 | Label the project as a historical archive and show the source coverage date |
| No duplicate route keys were found | Zero duplicate `ID + time` pairs and zero exact duplicate source rows | Retain the current key and repeat this check after future downloads |
| Required route fields are complete and valid | No missing IDs, times, latitude, or longitude; all points fall inside the requested bounds | Keep these checks in the reproducible script |

The most important thing I learned is that the data should not be drawn as uninterrupted trails. The raw archive is clean enough to support the project, but spatial filtering creates discontinuities, and drogue status changes how a path should be interpreted. Both facts need to appear in the visual design rather than being hidden in a methods note.

## Reproducing the analysis

The raw source files remain in `data/`. The cleaning and validation code is in [`scripts/analyze_data.py`](scripts/analyze_data.py). It produces the CSV summaries, validation JSON, and charts in `analysis/`.

```bash
python3 -m pip install -r requirements.txt
python3 scripts/analyze_data.py
```

The executed notebook provides a readable audit trail: [`analysis/drift_atlas_data_validation.ipynb`](analysis/drift_atlas_data_validation.ipynb).

## Source links

- [NOAA Global Drifter Program six-hour dataset metadata](https://erddap.aoml.noaa.gov/gdp/erddap/info/drifter_6hour_qc/index.html)
- [NOAA Global Drifter Program data page](https://www.aoml.noaa.gov/phod/gdp/data.php)
- [NOAA drifter data FAQ](https://www.aoml.noaa.gov/phod/gdp/data_faq.php)
- [Dataset DOI](https://doi.org/10.25921/7ntx-z961)
- [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)
- [Natural Earth terms of use](https://www.naturalearthdata.com/about/terms-of-use/)
- [world-atlas license](https://github.com/topojson/world-atlas/blob/master/LICENSE)
