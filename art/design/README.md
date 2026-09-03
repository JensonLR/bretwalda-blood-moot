# The design canvas

`bretwalda-design-system.html` is a BUILD ARTEFACT — a two-megabyte editor with
the artboards seeded into it — and is deliberately not tracked. The artboards
and `canvas.json` beside it are the source, and the canvas is rebuilt from them:

    node "<claude design skill>/seed-canvas.mjs" \
      --template "<claude design skill>/payload.template.html" \
      --out bretwalda-design-system.html --title "Bretwalda Design System" \
      --artboard Main.dc.html --artboard Components.dc.html \
      --artboard Menu.dc.html --artboard Hud.dc.html \
      --image face-huscarl.jpg --image face-warden.jpg \
      --image face-runekeeper.jpg --image face-berserker.jpg \
      --canvas canvas.json

Then republish it to the SAME artifact so the link the owner holds keeps working.

Every value on these boards is lifted from `src/app/globals.css`, which is the
system of record. If the two ever disagree, the stylesheet is right and the
board is stale — the boards describe the game, they do not govern it.

The four faces are the shipped class portraits downsampled to 220 px; regenerate
them with `sips -Z 220 -s format jpeg -s formatOptions 72` off
`BRETWALDA - Blood Moot/Assets/StreamingAssets/portrait-<cls>.png`.
