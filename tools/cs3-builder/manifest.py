# Builds my-sources/plugins.json listing every built source (a CloudStream repository manifest).
import json, glob, os
root = os.environ.get("GITHUB_WORKSPACE", ".")
base = "https://raw.githubusercontent.com/youssefelkahri/ShaDo-sources/main/my-sources"
out = []
for recipe in sorted(glob.glob(os.path.join(root, "my-sources", "*.json"))):
    r = json.load(open(recipe))
    name = r.get("name", "KageSite")
    slug = "".join(c for c in name if c.isalnum())
    if not os.path.exists(os.path.join(root, "my-sources", slug + ".cs3")):
        continue
    out.append({
        "url": f"{base}/{slug}.cs3", "status": 1, "version": int(r.get("version", 1)),
        "name": name, "internalName": slug, "authors": ["Youssef"],
        "description": "مصدر من موقعه (Kage)",
        "repositoryUrl": "https://github.com/youssefelkahri/ShaDo-sources",
        "language": "ar", "tvTypes": ["TvSeries", "Movie", "Anime"], "apiVersion": 1,
    })
json.dump(out, open(os.path.join(root, "my-sources", "plugins.json"), "w"), ensure_ascii=False, indent=2)
print(f"{len(out)} sources")
