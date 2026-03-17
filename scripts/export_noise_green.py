"""
Export noise + greenery data for the geluid-groen-viewer.

Run from the repo root:
    python scripts/export_noise_green.py

Reads: /home/thijsradijs/ruimtelijke-assistent/src/backend/data/volledige_tijdreeks_delta
Writes: data/geluid_groen.json
"""

import json
import os
import duckdb

DELTA_PATH = os.path.expanduser(
    "~/ruimtelijke-assistent/src/backend/data/volledige_tijdreeks_delta"
)
OUTPUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "geluid_groen.json")

conn = duckdb.connect()

rows = conn.execute(f"""
    SELECT
        h3_id                                                   AS h3,
        gemeentenaam                                            AS gemeente,
        ROUND(geluid_lden, 1)                                   AS db,
        ROUND(hitte, 1)                                         AS hitte,
        ROUND(lichtemissie, 1)                                  AS licht,
        loofbos_fraction + naaldbos_fraction                    AS boom,
        gras_in_primair_bebouwd_gebied_fraction                 AS gras,
        bebouwing_in_primair_bebouwd_gebied_fraction            AS bebouwing,
        aantal_inwoners_sum                                     AS inwoners,
        gemiddelde_woz_waarde_woning_area_weighted_average      AS woz
    FROM delta_scan('{DELTA_PATH}')
    WHERE year_int = 2023
      AND aantal_inwoners_sum > 5
      AND geluid_lden IS NOT NULL
    ORDER BY geluid_lden DESC
""").fetchall()

cols = ["h3", "gemeente", "db", "hitte", "licht", "boom", "gras", "bebouwing", "inwoners", "woz"]
data = [dict(zip(cols, r)) for r in rows]

os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
with open(OUTPUT, "w") as f:
    json.dump(data, f, separators=(",", ":"))

print(f"Exported {len(data):,} rows → {OUTPUT}")
size = os.path.getsize(OUTPUT) / 1024
print(f"File size: {size:.0f} KB")
# Print some stats
dbs = [r["db"] for r in data if r["db"]]
above = sum(1 for d in dbs if d > 53)
print(f"Above WHO 53dB: {above:,} ({100*above/len(dbs):.1f}%)")
