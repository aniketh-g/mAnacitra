"""Generate small map properties and individually fetched detail records."""
import json
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
def build(root, dataset):
    base = root / "docs/data"
    data = json.loads((base / f"{dataset}.geojson").read_text())
    directory = base / "details" / dataset
    directory.mkdir(parents=True, exist_ok=True)
    keep = set("place_id name_record_id NAME_SA ADM0_A3 LABEL_X LABEL_Y MIN_LABEL MAX_LABEL MIN_ZOOM LABELRANK FEATURECLA SCALERANK min_zoom min_label scalerank name".split())
    written = set()
    for feature in data["features"]:
        props = feature["properties"]
        key = str(props.get("name_record_id") or props["place_id"])
        if key not in written:
            detail = {k: props[k] for k in ("names_sanskrit", "name_families", "description", "NAME_NATIVE", "NAME_EN") if k in props}
            (directory / (quote(key, safe="") + ".json")).write_text(json.dumps(detail, ensure_ascii=False, separators=(",", ":")))
            written.add(key)
        feature["properties"] = {k: v for k, v in props.items() if k in keep}
    (base / f"{dataset}.map.geojson").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))

if __name__ == "__main__":
    if sys.argv[1] not in ("cities", "countries", "rivers"):
        raise SystemExit("Unknown dataset")
    build(ROOT, sys.argv[1])
