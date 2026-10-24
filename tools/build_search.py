"""Build a small name-only search index; never index reference/English metadata."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def aliases(record):
    result = []
    def add(value):
        if isinstance(value, str) and value.strip() and value.strip() not in result:
            result.append(value.strip())
    add(record.get('name_native'))
    for family in record.get('name_families', []):
        add(family.get('pronunciation'))
    for name in record.get('names', []) + record.get('name_families', []):
        add(name.get('name'))
        add(name.get('label'))
        for etymology in name.get('etymologies', []):
            descendants = etymology.get('descendants') or []
            nodes = descendants.get('nodes', []) if isinstance(descendants, dict) else descendants
            for node in nodes:
                add(node.get('form'))
                add(node.get('label'))
                add(node.get('pronunciation'))
                if node.get('parts'):
                    add(''.join(part.get('text', '') for part in node['parts']))
    return result


def position(feature):
    p = feature['properties']
    if isinstance(p.get('LABEL_X'), (int, float)) and isinstance(p.get('LABEL_Y'), (int, float)):
        return [p['LABEL_X'], p['LABEL_Y']]
    def points(coords):
        if len(coords) >= 2 and isinstance(coords[0], (int, float)):
            yield coords[:2]
        else:
            for child in coords:
                yield from points(child)
    pts = list(points((feature.get('geometry') or {}).get('coordinates', [])))
    return pts[len(pts)//2] if pts else None


def build(root, dataset):
    records = json.loads((root / f'data/names/{dataset}.json').read_text())
    mappings = json.loads((root / f'data/mappings/{dataset}.json').read_text())
    geography = json.loads((root / f'build/geography/{dataset}.geojson').read_text())
    centers = {}
    for feature in geography['features']:
        identifier = feature['properties']['place_id']
        identifier = mappings.get(identifier, identifier)
        if identifier not in centers:
            center = position(feature)
            if center is not None:
                centers[identifier] = center
    index = []
    for identifier, record in records.items():
        names = aliases(record)
        if not names or identifier not in centers:
            continue
        primary = next((n.get('name') for n in record.get('names', []) if n.get('primary') and n.get('name')), names[0])
        index.append(dict(id=identifier, dataset=dataset, title=primary, aliases=names, center=centers[identifier]))
    return index


if __name__ == '__main__':
    dataset = sys.argv[1]
    if dataset not in ('cities', 'countries', 'rivers'):
        raise SystemExit('Expected cities, countries or rivers')
    output = ROOT / f'docs/data/search/{dataset}.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    index = build(ROOT, dataset)
    output.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'Indexed {len(index)} places for {dataset}')
