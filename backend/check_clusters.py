#!/usr/bin/env python3
import json
import sqlite3

cache_file = '/Users/tanny/Documents/github/solo-silo/backend/cache/silos/default/people_cluster_cache.json'
with open(cache_file, 'r') as f:
    clusters = json.load(f)

conn = sqlite3.connect('/Users/tanny/Documents/github/solo-silo/backend/cache/silos/default/personalai.db')
cur = conn.cursor()
cur.execute("SELECT id, path FROM media_files")
paths = {row[0]: row[1] for row in cur.fetchall()}
conn.close()

# Look for suspicious clusters (with few photos)
print("Clusters with < 5 photos:")
for cluster in clusters:
    cid = cluster.get('id')
    photo_count = cluster.get('count', 0)
    photos = cluster.get('photos', [])
    
    if photo_count < 5:
        first_photo_id = photos[0].get('media_id') if photos else None
        path = paths.get(first_photo_id, 'NOT FOUND')
        filename = path.split('/')[-1] if path != 'NOT FOUND' else 'N/A'
        print(f"{cid}: {photo_count} photos")
