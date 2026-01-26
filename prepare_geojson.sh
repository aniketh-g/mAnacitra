#!/bin/bash

# Path to your local Natural Earth zip
FILE_NAME="ne_10m_rivers_lake_centerlines"
ZIP_FILE="./$FILE_NAME.zip"

# Temporary folder to unzip
SHAPE_DIR="./$FILE_NAME"
mkdir -p "$SHAPE_DIR"

# Unzip
unzip -o "$ZIP_FILE" -d "$SHAPE_DIR"

# Find the .shp file (should be only one)
SHP_FILE=$(find "$SHAPE_DIR" -name "*.shp" | head -n1)

# Convert to GeoJSON
GEOJSON_FILE="$FILE_NAME.geojson"
ogr2ogr -f GeoJSON "$GEOJSON_FILE" "$SHP_FILE"

# Add names_sanskrit array and NAME_SA using jq
jq '
.features |= map(
  .properties += {
    "names_sanskrit": [
      {
        "name": "",
        "iast": "",
        "notes": "",
        "confidence": 1.0,
        "primary": true
      }
    ],
    "NAME_SA": ""
  }
)
' "$GEOJSON_FILE" > tmp.geojson && mv tmp.geojson "$GEOJSON_FILE"


echo "Done! GeoJSON with names_sanskrit added: $GEOJSON_FILE"
