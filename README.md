# Drift Atlas

Drift Atlas is my final project for Data Visualization. The proposed site will let someone choose an ocean area and a month, then see which NOAA surface drifters passed through that place and where the water carried them.

This repository currently contains the data acquisition and validation stage of the project.

## Assignment document

Read [DATA_DOCUMENT.md](DATA_DOCUMENT.md) for the complete data sources, dimensions, licenses, descriptive statistics, validation findings, and planned fixes.

## Repository contents

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

