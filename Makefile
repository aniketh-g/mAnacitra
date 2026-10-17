CONFIG := data/config.json
UPSTREAM := data/upstream/natural-earth

CITIES := $(shell jq -r '.datasets.cities' $(CONFIG))
COUNTRIES := $(shell jq -r '.datasets.countries' $(CONFIG))
RIVERS := $(shell jq -r '.datasets.rivers' $(CONFIG))

# Cities
.PHONY: cities download-cities

cities: docs/data/cities.geojson

download-cities:
	@bash tools/download_geography.sh cities

build/geography/cities.geojson: $(UPSTREAM)/$(CITIES).geojson tools/prepare_geography.py $(CONFIG)
	@python3 tools/prepare_geography.py cities

docs/data/cities.geojson: build/geography/cities.geojson data/names/cities.json tools/merge_names.py
	@python3 tools/merge_names.py cities


# Countries
.PHONY: countries download-countries

countries: docs/data/countries.geojson

download-countries:
	@bash tools/download_geography.sh countries

build/geography/countries.geojson: $(UPSTREAM)/$(COUNTRIES).geojson tools/prepare_geography.py $(CONFIG)
	@python3 tools/prepare_geography.py countries

docs/data/countries.geojson: build/geography/countries.geojson data/names/countries.json tools/merge_names.py
	@python3 tools/merge_names.py countries

# Rivers
.PHONY: rivers download-rivers

rivers: docs/data/rivers.geojson

download-rivers:
	@bash tools/download_geography.sh rivers

build/geography/rivers.geojson: build/geography/rivers.raw.geojson tools/prepare_geography.py $(CONFIG)
	@python3 tools/prepare_geography.py rivers

docs/data/rivers.geojson: build/geography/rivers.geojson data/names/rivers.json tools/merge_names.py
	@python3 tools/merge_names.py rivers

RIVER_SOURCE := $(UPSTREAM)/$(RIVERS)/$(RIVERS)
build/geography/rivers.raw.geojson: $(RIVER_SOURCE).shp $(RIVER_SOURCE).shx $(RIVER_SOURCE).dbf $(RIVER_SOURCE).prj $(CONFIG)
	@mkdir -p build/geography
	@ogr2ogr -overwrite -f GeoJSON -t_srs EPSG:4326 $@ $(RIVER_SOURCE).shp