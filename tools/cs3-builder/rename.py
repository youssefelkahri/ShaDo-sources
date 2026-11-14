# Sets the packaged plugin's manifest name so sources don't collide. Args: <cs3 path> <name>
import sys, zipfile, json, os
path, name = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(path) as z:
    items = {n: z.read(n) for n in z.namelist()}
m = json.loads(items["manifest.json"].decode())
m["name"] = name
items["manifest.json"] = json.dumps(m).encode()
tmp = path + ".tmp"
with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
    for n, b in items.items():
        z.writestr(n, b)
os.replace(tmp, path)
