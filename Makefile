CONFIG := data/config.json
UPSTREAM := data/upstream/natural-earth

CITIES := $(shell jq -r '.datasets.cities' $(CONFIG))
COUNTRIES := $(shell jq -r '.datasets.countries' $(CONFIG))
RIVERS := $(shell jq -r '.datasets.rivers' $(CONFIG))

.PHONY: all
all: search data etymology

.PHONY: data etymology
data: cities countries rivers
etymology: rules vidyut

# Cities
.PHONY: cities download-cities

cities: docs/data/cities.geojson docs/data/search/cities.json

download-cities:
	@bash tools/download_geography.sh cities

build/geography/cities.geojson: $(UPSTREAM)/$(CITIES).geojson tools/prepare_geography.py $(CONFIG)
	@python3 tools/prepare_geography.py cities

docs/data/cities.geojson: build/geography/cities.geojson data/names/cities.json data/mappings/cities.json tools/merge_names.py tools/generate_prakriya.py build/vidyut/release/manacitra-vidyut
	@python3 tools/merge_names.py cities


# Countries
.PHONY: countries download-countries

countries: docs/data/countries.geojson docs/data/search/countries.json

download-countries:
	@bash tools/download_geography.sh countries

build/geography/countries.geojson: $(UPSTREAM)/$(COUNTRIES).geojson tools/prepare_geography.py $(CONFIG)
	@python3 tools/prepare_geography.py countries

docs/data/countries.geojson: build/geography/countries.geojson data/names/countries.json data/mappings/countries.json tools/merge_names.py tools/generate_prakriya.py build/vidyut/release/manacitra-vidyut
	@python3 tools/merge_names.py countries

# Rivers
.PHONY: rivers download-rivers

rivers: docs/data/rivers.geojson docs/data/search/rivers.json

download-rivers:
	@bash tools/download_geography.sh rivers

build/geography/rivers.geojson: build/geography/rivers.raw.geojson tools/prepare_geography.py $(CONFIG)
	@python3 tools/prepare_geography.py rivers

docs/data/rivers.geojson: build/geography/rivers.geojson data/names/rivers.json data/mappings/rivers.json tools/merge_names.py tools/generate_prakriya.py build/vidyut/release/manacitra-vidyut
	@python3 tools/merge_names.py rivers

RIVER_SOURCE := $(UPSTREAM)/$(RIVERS)/$(RIVERS)
build/geography/rivers.raw.geojson: $(RIVER_SOURCE).shp $(RIVER_SOURCE).shx $(RIVER_SOURCE).dbf $(RIVER_SOURCE).prj $(CONFIG)
	@mkdir -p build/geography
	@ogr2ogr -overwrite -f GeoJSON -t_srs EPSG:4326 $@ $(RIVER_SOURCE).shp

# Etymology Rules
.PHONY: rules

rules: docs/data/rules/ashtadhyayi.json docs/data/rules/foreign.json

docs/data/rules/ashtadhyayi.json: data/rules/ashtadhyayi.json
	@mkdir -p docs/data/rules
	@cp $< $@

docs/data/rules/foreign.json: data/rules/foreign.json
	@mkdir -p docs/data/rules
	@cp $< $@

# Sanskrit generation uses a pinned native engine, never browser execution.
.PHONY: vidyut
vidyut: build/vidyut/release/manacitra-vidyut

build/vidyut/release/manacitra-vidyut: tools/vidyut_adapter/Cargo.toml tools/vidyut_adapter/Cargo.lock tools/vidyut_adapter/src/main.rs tools/vidyut_adapter/data/sutrapatha.tsv tools/vidyut_adapter/data/unadipatha.tsv tools/vidyut_adapter/data/dhatupatha.tsv tools/vidyut_adapter/data/linganushasanam.tsv tools/vidyut_adapter/data/varttikas.tsv
	@cargo build --locked --release --manifest-path tools/vidyut_adapter/Cargo.toml --target-dir build/vidyut

# Search only authored names; rebuild automatically with each dataset target.
.PHONY: search
search: docs/data/search/cities.json docs/data/search/countries.json docs/data/search/rivers.json

docs/data/search/%.json: data/names/%.json data/mappings/%.json build/geography/%.geojson tools/build_search.py
	@python3 tools/build_search.py $*
