# Global Climate and Wildfire Data Visualization

Course project website for:
- STATS 401: Data Acquisition and Visualization
- Duke Kunshan University
- Group 10: Ziyue Yin, Xin Jiang, Yitong Zhou

## TL;DR
Simply access [https://larry-ziyue-yin.github.io/global_climate_and_wildfire_data_visualization/](https://larry-ziyue-yin.github.io/global_climate_and_wildfire_data_visualization/) to view the visualization via web!

## Project Overview

This repository contains an interactive website that explores global climate indicators and wildfire detections across multiple coordinated visualizations.

Current pages:
- `website/intro.html`: project introduction, data overview, visualization guide
- `website/vis1.html`: two-panel annual wildfire detections (stacked bars) + switchable climate trend line
- `website/vis2.html`: global wildfire map + rotating globe with year/month/day playback
- `website/vis3.html`: country-level bubble plot (CO2 vs temperature change, bubble size by population)
- `website/vis4.html`: climate-wildfire correlation matrix with year-range slider and insight panel
- `website/vis5.html`: California wildfire word cloud with sentiment coloring and Top-N control

Key interactions:
- `vis1`: year-hover linkage between top bar panel and bottom climate panel, with per-year tooltip summary
- `vis2`: timeline playback plus globe rotation controls
- `vis3`: year playback and region/country filters
- `vis4`: dual-handle year-range slider and animated range playback
- `vis5`: Top-N slider, sentiment legend, and term-level hover details

## Repository Structure

- `website/`: HTML/CSS/JS for the website
- `website/js/bar.js`: logic for Visualization 1
- `website/js/vis2.js`: logic for Visualization 2
- `website/js/vis3.js`: logic for Visualization 3
- `website/js/vis4.js`: logic for Visualization 4
- `website/js/vis5.js`: logic for Visualization 5
- `data/preprocessed/`: preprocessed CSVs used directly by website pages
- `data/co2/`: OWID CO2 dataset used by Visualization 3
- `scripts/build_vis2_fire_samples.py`: script to generate vis2 sampled point files
- `index.html`: root entry page that redirects to `website/intro.html`
- `.nojekyll`: ensures GitHub Pages serves files directly

## Data Used by Each Visualization

- Visualization 1 (`vis1`)
  - `data/preprocessed/wildfire_count_by_year_type.csv`
  - `data/preprocessed/global_co2_by_year.csv`
  - `data/preprocessed/global_tem_by_year.csv`
  - `data/preprocessed/global_precip_by_year.csv`

- Visualization 2 (`vis2`)
  - `data/preprocessed/vis2/fire_points_YYYY.csv`
  - `data/preprocessed/vis2/sample_summary.csv`
  - `data/preprocessed/wildfire_count_by_year_type.csv`

- Visualization 3 (`vis3`)
  - `data/co2/owid-co2-data.csv`
  - `data/preprocessed/vis3/country_to_region.csv`

- Visualization 4 (`vis4`)
  - `data/preprocessed/wildfire_count_by_year_type.csv`
  - `data/preprocessed/global_co2_by_year.csv`
  - `data/preprocessed/global_tem_by_year.csv`
  - `data/preprocessed/global_precip_by_year.csv`

- Visualization 5 (`vis5`)
  - `data/preprocessed/vis5/sentiment_analysis_wildfire_cleaned.csv`

## Important Note About Raw Wildfire Data

The website does **not** require `data/wild_fire_nasa/` to render online.

- `data/wild_fire_nasa/` is only needed when rebuilding vis2 sampled files from raw yearly archives.
- For GitHub Pages deployment, committed preprocessed CSVs are sufficient.

## Git LFS Note

Git LFS is disabled for this project because GitHub Pages needs to serve real CSV content to browser-side scripts.

- Current `.gitattributes` keeps normal text tracking and does not apply LFS filters to `data/`.

## Run Locally

Use any static server from repository root.

Example with Python:

```bash
python3 -m http.server 5500
```

Then open:
- `http://127.0.0.1:5500/website/intro.html`

## GitHub Pages Deployment

1. Go to `Settings` -> `Pages`.
2. Set `Source` to `Deploy from a branch`.
3. Select branch `main`.
4. Select folder `/(root)`.
5. Save and wait for deployment.

Site root:
- `https://<your-username>.github.io/<repo-name>/`

Because `index.html` redirects, site root should open `website/intro.html`.

## Update vis2 Data (Yearly Samples)

If you have new raw yearly wildfire archives, regenerate vis2 sampled files:

1. Put yearly files in `data/wild_fire_nasa/` with names like `fire_archive_SV-C2_2025.csv`.
2. Update `YEARS` in `scripts/build_vis2_fire_samples.py` if needed.
3. Run:

```bash
python3 scripts/build_vis2_fire_samples.py
```

This updates:
- `data/preprocessed/vis2/fire_points_YYYY.csv`
- `data/preprocessed/vis2/sample_summary.csv`

Then commit updated preprocessed files to make them available on GitHub Pages.
