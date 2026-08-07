import re
p = "src/game/client/characters.ts"
src = open(p).read()
new = open(".newface.txt").read()
lines = src.split("\n")
start = next(i for i, l in enumerate(lines) if l.startswith("function faceSurfaceRaw("))
j = start - 1
while not lines[j].startswith("/**"):
    j -= 1
k = start
while lines[k] != "}":
    k += 1
print("replacing lines", j + 1, "to", k + 1)
lines[j:k + 1] = new.rstrip("\n").split("\n")
src = "\n".join(lines)
m = re.search(r"/\*\*\n \* The facial plate:.*?\n \*/\nconst PLATE: Curve = \[.*?\n\];\n\n", src, re.S)
assert m, "PLATE block not found"
src = src[:m.start()] + src[m.end():]
open(p, "w").write(src)
print("ok")
