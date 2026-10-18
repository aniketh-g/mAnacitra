import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Select the dataset from the command line.
if len(sys.argv) != 2 or sys.argv[1] not in {"cities", "countries", "rivers"}:
    raise SystemExit("Usage: python3 tools/merge_names.py cities|countries|rivers")

dataset = sys.argv[1]
GEOGRAPHY = ROOT / "build/geography" / f"{dataset}.geojson"
NAMES = ROOT / "data/names" / f"{dataset}.json"
MAPPING = ROOT / "data/mappings" / f"{dataset}.json"
OUTPUT = ROOT / "docs/data" / f"{dataset}.geojson"

# Read inputs without modifying them.
data = json.loads(GEOGRAPHY.read_text(encoding="utf-8"))
records = json.loads(NAMES.read_text(encoding="utf-8"))
mapping = json.loads(MAPPING.read_text(encoding="utf-8"))
geographic_ids = {f["properties"]["place_id"] for f in data["features"]}
for geographic_id, record_id in mapping.items():
    if geographic_id not in geographic_ids:
        raise ValueError(f"Mapping has no geography: {geographic_id}")
    if not isinstance(record_id, str) or record_id not in records:
        raise ValueError(f"Mapping target not found: {geographic_id} -> {record_id}")
    if geographic_id in records and geographic_id != record_id:
        raise ValueError(f"Remove duplicate names entry after consolidating: {geographic_id}")
matched = set()

# Attach names to each feature. Multiple features can share a place ID.
for feature in data["features"]:
    props = feature["properties"]
    place_id = props["place_id"]
    record_id = mapping.get(place_id, place_id)
    record = records.get(record_id, {})
    props["name_record_id"] = record_id
    props["description"] = record.get("description", "")
    props["name_families"] = record.get("name_families", [])
    names = record.get("names", [])
    props["NAME_NATIVE"] = record.get("name_native", "")
    props["NAME_EN"] = record.get(
        "name_en", props.get("NAME_EN") or props.get("name_en") or ""
    )
    primary = [name for name in names if name.get("primary")]

    if names and len(primary) != 1:
        raise ValueError(f"{place_id}: exactly one name must be primary")

    props["names_sanskrit"] = names
    props["NAME_SA"] = primary[0]["name"] if primary else ""
    matched.add(record_id)

# Catch handwritten entries with no matching geographic feature.
unmatched = set(records) - matched
if unmatched:
    raise ValueError(f"Names without geography: {sorted(unmatched)}")

# Compare the new data with the previous output.
def group_places(features):
    places = {}
    for feature in features:
        place_id = feature["properties"]["place_id"]
        places.setdefault(place_id, []).append(feature)
    return places

previous = {}
if OUTPUT.exists():
    old_data = json.loads(OUTPUT.read_text(encoding="utf-8"))
    previous = group_places(old_data["features"])

current = group_places(data["features"])

added = len(current.keys() - previous.keys())
removed = len(previous.keys() - current.keys())
updated = sum(
    current[place_id] != previous[place_id]
    for place_id in current.keys() & previous.keys()
)

# Write only the generated website data.
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(
    json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
    encoding="utf-8",
)

print(f"Merged names for {len(current)} {dataset}: {updated} updated, {added} added, {removed} removed. > {OUTPUT}")