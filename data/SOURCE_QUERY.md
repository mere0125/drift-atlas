# Download record

Accessed October 22, 2026.

## NOAA Global Drifter Program data

The working CSV was downloaded from NOAA AOML's ERDDAP server with this query:

```text
https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/drifter_6hour_qc.csv?ID%2Ctime%2Clatitude%2Clongitude%2Cve%2Cvn%2Csst%2Cdrogue_lost_date&time%3E=2024-01-01T00%3A00%3A00Z&time%3C=2024-12-31T18%3A00%3A00Z&latitude%3E=30&latitude%3C=50&longitude%3E=-75&longitude%3C=-40&orderBy(%22ID%2Ctime%22)
```

Filters:

- Time: January 1 through December 31, 2024 UTC
- Latitude: 30 to 50 degrees north, inclusive
- Longitude: 75 to 40 degrees west, inclusive
- Sort order: drifter ID, then time

Requested variables: `ID`, `time`, `latitude`, `longitude`, `ve`, `vn`, `sst`, and `drogue_lost_date`.

The second line of NOAA's CSV stores units rather than an observation. The analysis skips that line but does not alter the downloaded file.

- File: `noaa_gdp_6hour_western_north_atlantic_2024.csv`
- Size: 6,126,559 bytes
- SHA-256: `900f7233f0b4ae73d5e3196bcab222af00fe86e8772d568360e0a6a048db1a98`

## Coastline data

The map background uses the `land-110m.json` file from world-atlas 2.0.2, a prebuilt TopoJSON version of Natural Earth land polygons.

```text
https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json
```

- File: `land-110m.json`
- Size: 55,207 bytes
- SHA-256: `ead5f68119c49a9250902e7da303bcb209341bbb8fefe7369a439b48b704658a`

