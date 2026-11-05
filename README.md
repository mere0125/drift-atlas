# Drift Atlas

Drift Atlas is an immersive ocean interface for exploring historical NOAA surface-drifter tracks. A visitor chooses a place in the western North Atlantic and a month in 2024, finds nearby instruments, then follows an individual regional record in the same ocean scene.

The site uses historical observations. It does not predict a future route or represent every current in the selected area.

## Prototype 1

The working prototype includes:

- a full-screen Three.js ocean with reflected sky, layered water normals, moving swells and a simplified floating instrument
- a separate introduction and source document accessed through About this project
- an archive search chart opened over the sea
- direct location and route selection on a Three.js sea chart
- actual Natural Earth coastlines, geographic graticules, rotation and zoom controls
- faint same-month records as coverage context, with search matches highlighted
- all twelve months of the 2024 regional extract
- map-based location selection
- an adjustable search radius
- real spatial filtering of NOAA observations
- interactive monthly routes and individual drifter details
- a full-record follow mode with play/pause and a draggable timeline
- explicit before, near, and after stages around the selected place
- explicit drogue status and archive limitations
- route breaks wherever the regional extract has a gap longer than 12 hours

The animated water and weather are illustrative. In follow mode, the drifter
and its route use a local Mercator frame calculated from the actual record.
The same geographic frame is used by the sea chart, the selected record and
the flat-chart alternative. The live scene uses the more detailed Natural
Earth 1:50m coastline as a translucent annotation; it is not a terrain or
bathymetry model. Settings and the route index open from a compact instrument
rail. A quiet mode hides text and controls while leaving the scene visible.
The sea chart can be rotated, zoomed
with a wheel or pinch gesture, and reset with the view controls.
Waterline and overhead views, pause/resume for the water, and the historical
record timeline are separate controls. The waterline camera can also be
rotated and moved closer to the instrument. Playback is accelerated.

Waterline view shows the previous 14 days of track, while Sea chart retains
the full visible 2024 regional record. The selected track conforms visually
to the illustrative waves without changing its geographic coordinates.
Line subdivision is a rendering operation and does not create observations.

The project uses 2024 because it is the latest complete calendar year in the
NOAA delayed-mode quality-controlled source used by this prototype. The source
metadata currently reports coverage through June 18, 2025, so the interface is
explicitly historical rather than real time.

## Peer user test

The public [peer-test guide](peer-test.html) includes the project URL, a short
purpose statement and four audience tasks. Personal contact details are not
displayed on that public page; the Courseworks PDF contains the author
information requested for the class submission.

## Open the website locally

The site loads local CSV and TopoJSON files, so it must run through a web server rather than by double-clicking `index.html`.

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765/`.

## Assignment document

Read [DATA_DOCUMENT.md](DATA_DOCUMENT.md) for the complete data sources, dimensions, licenses, descriptive statistics, validation findings, and planned fixes.

## Repository contents

- `index.html`, `styles.css`, `app.js`, `ocean.js`, `atlas-scene.js`, `experience.js` - the published interactive site
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

