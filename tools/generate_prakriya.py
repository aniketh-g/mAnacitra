"""Compile Sanskrit grammar requests; never write to data/names.

The engine binary is built by Make. Cache keys include its contents, so changing
Vidyut or this adapter cannot reuse a stale derivation.
"""
import copy
import hashlib
import json
import subprocess
from pathlib import Path


class Generator:
    def __init__(self, root):
        self.root = Path(root)
        self.binary = self.root / "build/vidyut/release/manacitra-vidyut"
        self.cache = self.root / "build/prakriya-cache"
        self.version = None
        self.results = {}

    def derive(self, request):
        if not isinstance(request, dict) or "input" not in request:
            raise ValueError("Sanskrit prakriyA must be null or an object containing input")
        if self.version is None:
            if not self.binary.exists():
                raise ValueError("Vidyut adapter is missing. Run make vidyut first.")
            self.version = hashlib.sha256(self.binary.read_bytes()).hexdigest()
        encoded = json.dumps(request, ensure_ascii=False, sort_keys=True)
        key = hashlib.sha256((self.version + encoded).encode()).hexdigest()
        if key in self.results:
            return self.results[key]
        path = self.cache / f"{key}.json"
        if path.exists():
            result = json.loads(path.read_text(encoding="utf-8"))
        else:
            process = subprocess.run([str(self.binary)], input=encoded, text=True,
                                     capture_output=True, timeout=120)
            if process.returncode:
                raise ValueError(process.stderr.strip() or "Vidyut adapter failed")
            result = json.loads(process.stdout)
            self.cache.mkdir(parents=True, exist_ok=True)
            temp = path.with_suffix(".tmp")
            temp.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            temp.replace(path)
        self.results[key] = result
        return result


def prepare_records(records, dataset, root):
    records = copy.deepcopy(records)
    generator = Generator(root)
    legacy_path = Path(root) / "data/legacy-prakriya.json"
    legacy = json.loads(legacy_path.read_text(encoding="utf-8")) if legacy_path.exists() else {}
    for record_id, record in records.items():
        for name in record.get("names", []):
            for index, etymology in enumerate(name.get("etymologies", [])):
                request = etymology.get("prakriyA")
                key = json.dumps([dataset, record_id, name.get("name", ""), index], ensure_ascii=False)
                if request is None:
                    # Lossless transitional fallback, outside the new authored schema.
                    saved = legacy.get(key, {})
                    etymology["prakriyA"] = saved.get("prakriyA", [])
                    if saved:
                        etymology["prakriyA_origin"] = "legacy"
                    continue
                try:
                    generated = generator.derive(request)
                except (ValueError, subprocess.TimeoutExpired) as error:
                    raise ValueError(f"{dataset}/{record_id}/{name.get('name')}/etymology {index + 1}: {error}") from error
                etymology["prakriyA"] = generated["prakriyA"]
                etymology["prakriyA_rules"] = generated["rules"]
                etymology["prakriyA_result"] = generated["result"]
                etymology["prakriyA_origin"] = generated["engine"]
    return records
