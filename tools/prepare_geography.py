import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Settings for each geographic dataset.
DATASETS = {
    "rivers": {
        "id_field": "ne_id",
        "keep": {
            # Identifiers and classification
            "ne_id", "wikidataid", "rivernum", "featurecla",
            # Label importance and notes
            "scalerank", "min_zoom", "min_label", "label", "note",
        },
    },
    "countries": {
        "id_field": "NE_ID",
        "keep": {
            # Identifiers
            "NE_ID", "WIKIDATAID",
            "ISO_A2", "ISO_A3", "ISO_N3",
            "ISO_A2_EH", "ISO_A3_EH", "UN_A3",

            # Classification and geographic context
            "featurecla", "TYPE", "LEVEL",
            "SOVEREIGNT", "SOV_A3",
            "GEOUNIT", "GU_A3", "SUBUNIT", "SU_A3",
            "CONTINENT", "REGION_UN", "SUBREGION", "REGION_WB",
            "FORMAL_EN", "FORMAL_FR", "ABBREV", "POSTAL",
            "BRK_GROUP", "NOTE_BRK",

            # Population
            "POP_EST", "POP_YEAR", "POP_RANK",

            # Label placement and importance
            "LABEL_X", "LABEL_Y", "LABELRANK", "scalerank",
            "MIN_ZOOM", "MIN_LABEL", "MAX_LABEL",
        },
    },
    "cities": {
        "id_field": "NE_ID",
        "keep": {
            # Identifiers
            "NE_ID", "GEONAMESID", "WIKIDATAID", "WOF_ID",
            # Location
            "LATITUDE", "LONGITUDE", "ISO_A2", "SOV_A3",
            # City status
            "FEATURECLA", "CAPIN", "CAPALT", "WORLDCITY", "MEGACITY",
            # Population and map importance
            "POP2025", "POP_MAX", "POP_MIN",
            "MIN_ZOOM", "SCALERANK", "LABELRANK", "NATSCALE",
            # Additional context
            "TIMEZONE", "NOTE",
        },
    },
}

# Select the dataset.
if len(sys.argv) != 2 or sys.argv[1] not in DATASETS:
    raise SystemExit(f"Choose a dataset: {', '.join(DATASETS)}")

dataset = sys.argv[1]
config = DATASETS[dataset]

settings = json.loads((ROOT / "data/config.json").read_text(encoding="utf-8"))
source_name = settings["datasets"][dataset]
SOURCE = ROOT / "data/upstream/natural-earth" / f"{source_name}.geojson"
if dataset == "rivers":
    SOURCE = ROOT / "build/geography/rivers.raw.geojson"
OUTPUT = ROOT / "build/geography" / f"{dataset}.geojson"

data = json.loads(SOURCE.read_text(encoding="utf-8"))

# Preserve geometry, all names, all ADM fields, and selected metadata.
for feature in data["features"]:
    props = feature["properties"]
    feature["properties"] = {
        key: value for key, value in props.items()
        if key in config["keep"] or "NAME" in key.upper() or key.upper().startswith("ADM")
    }
    feature["properties"]["place_id"] = (
        f"natural-earth:{props[config['id_field']]}"
    )

# Write readable generated data.
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(
    json.dumps(data, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(f"Prepared geography for {len(data['features'])} {dataset} > {OUTPUT}")