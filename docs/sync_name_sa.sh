#!/bin/bash
# Update NAME_SA for countries/cities and name_sa for regions

FILES=("countries.geojson" "regions.geojson" "cities.geojson" "rivers.geojson")

for FILE in "${FILES[@]}"; do
    if [[ -f "$FILE" ]]; then
        TMP="$(mktemp)"
        FIELD="NAME_SA"

        jq --arg field "$FIELD" '
        .features |= map(
            .properties[$field] = (
                if .properties.names_sanskrit and (.properties.names_sanskrit | length > 0)
                then .properties.names_sanskrit[0].name
                else ""
                end
            )
        )
        ' "$FILE" > "$TMP"

        mv "$TMP" "$FILE"
        echo "$FIELD synced in $FILE"
    else
        echo "File not found: $FILE"
    fi
done
