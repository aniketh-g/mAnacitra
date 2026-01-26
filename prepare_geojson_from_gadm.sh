#!/bin/bash

# Paths
GPKG="gadm41_410/gadm_410.gpkg"
OUT="regions.geojson"
LAYER="gadm_410"

# Step 1: Convert GPKG to GeoJSON
ogr2ogr -f GeoJSON "$OUT" "$GPKG" "$LAYER"

# Step 2: Add names_sanskrit array and NAME_SA to each feature
# This uses jq to insert default Sanskrit fields
jq '
.features |= map(
    .properties.names_sanskrit = [
        {
            "name": "",
            "iast": "",
            "notes": "",
            "confidence": 1.0,
            "primary": true
        }
    ] |
    .properties.NAME_SA = .properties.names_sanskrit[0].name
)
' "$OUT" > tmp.geojson && mv tmp.geojson "$OUT"

echo "Converted $GPKG → $OUT with Sanskrit fields."
