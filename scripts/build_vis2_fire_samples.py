#!/usr/bin/env python3
"""Build lightweight wildfire point samples for vis2 map/globe rendering.

Reads large yearly NASA VIIRS fire archives and outputs reservoir samples so
the frontend can animate by year without loading tens of millions of rows.
Run from repository root.
"""

from __future__ import annotations

import csv
import random
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
INPUT_DIR = REPO_ROOT / "data" / "wild_fire_nasa"
OUTPUT_DIR = REPO_ROOT / "data" / "preprocessed" / "vis2"
YEARS = [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]
SAMPLE_SIZE = 15000
SEED_BASE = 401

SOURCE_COLUMNS = ["latitude", "longitude", "acq_date", "type", "frp", "brightness"]
OUT_COLUMNS = ["year", "latitude", "longitude", "type", "acq_date", "frp", "brightness"]


def sanitize_row(row: dict[str, str], year: int) -> dict[str, str] | None:
    try:
        lat = float(row["latitude"])
        lon = float(row["longitude"])
    except (TypeError, ValueError, KeyError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None

    out = {
        "year": str(year),
        "latitude": f"{lat:.5f}",
        "longitude": f"{lon:.5f}",
        "type": str(row.get("type", "")).strip(),
        "acq_date": str(row.get("acq_date", "")).strip(),
        "frp": str(row.get("frp", "")).strip(),
        "brightness": str(row.get("brightness", "")).strip(),
    }
    return out


def reservoir_sample(csv_path: Path, year: int, sample_size: int, seed: int) -> tuple[list[dict[str, str]], int]:
    rng = random.Random(seed)
    sample: list[dict[str, str]] = []
    valid_count = 0

    with csv_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row_out = sanitize_row(row, year)
            if row_out is None:
                continue
            valid_count += 1
            if len(sample) < sample_size:
                sample.append(row_out)
            else:
                j = rng.randrange(valid_count)
                if j < sample_size:
                    sample[j] = row_out

    return sample, valid_count


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    summary_rows: list[dict[str, str]] = []

    for year in YEARS:
        input_path = INPUT_DIR / f"fire_archive_SV-C2_{year}.csv"
        if not input_path.exists():
            print(f"[skip] missing {input_path}")
            continue

        sample, valid_count = reservoir_sample(
            csv_path=input_path,
            year=year,
            sample_size=SAMPLE_SIZE,
            seed=SEED_BASE + year,
        )

        output_path = OUTPUT_DIR / f"fire_points_{year}.csv"
        with output_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=OUT_COLUMNS)
            writer.writeheader()
            writer.writerows(sample)

        summary_rows.append(
            {
                "year": str(year),
                "valid_rows": str(valid_count),
                "sample_rows": str(len(sample)),
                "sample_ratio": f"{(len(sample) / valid_count if valid_count else 0):.8f}",
                "source_file": input_path.name,
            }
        )
        print(f"[ok] {year}: valid={valid_count}, sample={len(sample)} -> {output_path}")

    summary_path = OUTPUT_DIR / "sample_summary.csv"
    with summary_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["year", "valid_rows", "sample_rows", "sample_ratio", "source_file"],
        )
        writer.writeheader()
        writer.writerows(summary_rows)
    print(f"[ok] wrote {summary_path}")


if __name__ == "__main__":
    main()
