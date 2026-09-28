#!/usr/bin/env sh
# Example CI helper shipped with the original skill. DevDigest's importer lists
# this file as ignored and never executes it — that is the point of the sample.
grep -rn "app\.\(get\|post\|put\|delete\)(" server/src/modules | grep -v "/v[0-9]" || true
