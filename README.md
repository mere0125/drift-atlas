# Drift Atlas

Drift Atlas is an interactive website for exploring historical NOAA surface-drifter tracks. A visitor can choose a place in the western North Atlantic, select a month, and find the drifters that passed nearby during 2024.

The site uses historical observations. It does not predict a future route or represent every current in the selected area.

## Prototype 1

The working prototype includes:

- all twelve months of the 2024 regional extract
- map-based location selection
- an adjustable search radius
- real spatial filtering of NOAA observations
- interactive monthly routes and individual drifter details
- a full-record follow mode with play/pause and a draggable timeline
- explicit before, near, and after stages around the selected place
- explicit drogue status and archive limitations
- route breaks wherever the regional extract has a gap longer than 12 hours

The project uses 2024 because it is the latest complete calendar year in the
NOAA delayed-mode quality-controlled source used by this prototype. The source
metadata currently reports coverage through June 18, 2025, so the interface is
explicitly historical rather than real time.

## Peer user test

The public [peer-test guide](peer-test.html) includes the project URL, author
contact, a two-sentence purpose statement, and four audience tasks.

## Open the website locally

The site loads local CSV and TopoJSON files, so it must run through a web server rather than by double-clicking `index.html`.

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765/`.

## Assignment document

Read [DATA_DOCUMENT.md](DATA_DOCUMENT.md) for the complete data sources, dimensions, licenses, descriptive statistics, validation findings, and planned fixes.

## Repository contents

- `index.html`, `styles.css`, `app.js`, `ocean.js` - the published interactive site
- `assets/` - credited NOAA photographs used by the narrative
- `vendor/` - local copies of D3 and topojson-client
- `data/` - the downloaded NOAA working extract, coastline data, and exact download record
- `analysis/` - descriptive-statistics tables, charts, validation results, and the executed notebook
- `scripts/` - reproducible Python analysis and notebook builder
- `THIRD_PARTY_LICENSES.md` - the license notice required by the redistributed map file

## Reproduce the analysis

```bash
python3 -m pip install -r requirements.txt
python3 scripts/analyze_data.py
python3 scripts/build_notebook.py
jupyter nbconvert --to notebook --execute analysis/drift_atlas_data_validation.ipynb \
  --output drift_atlas_data_validation.ipynb \
  --output-dir analysis
```

The source CSV is left unchanged. Cleaning decisions, including the treatment of NOAA fill values, happen in `scripts/analyze_data.py`.

