#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

NE_DIR="data/upstream/natural-earth"
mkdir -p "$NE_DIR"

################## Download Geographical Data ##################

# Read the version and selected dataset from the shared config.
VERSION=$(jq -er '.version' data/config.json)
DATASET=$(jq -er --arg name "${1:-}" '.datasets[$name]' data/config.json) || {
  echo "Usage: bash tools/download_geography.sh cities|countries|rivers"
  exit 1
}

BASE_URL="https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v${VERSION}"

if [[ "$1" == "rivers" ]]; then
  # Download the original shapefile, which preserves river IDs.
  mkdir -p "$NE_DIR/$DATASET"

  for EXT in shp shx dbf prj; do
    curl -fL "$BASE_URL/10m_physical/$DATASET.$EXT" -o "$NE_DIR/$DATASET/$DATASET.$EXT"
  done
  echo "Downloaded $DATASET — Natural Earth $VERSION > $NE_DIR/$DATASET/"
else
  # Cities and countries have suitable GeoJSON exports.
  curl -fL "$BASE_URL/geojson/$DATASET.geojson" -o "$NE_DIR/$DATASET.geojson"
  echo "Downloaded $DATASET — Natural Earth $VERSION > $NE_DIR/$DATASET.geojson"
fi
