import { ImageResponse } from "next/og";

/**
 * THE APP ICON, DRAWN RATHER THAN STORED.
 *
 * Same reasoning as `opengraph-image.tsx`: this repository ships no binary
 * assets, and the reason is not purity — it is that the game opens from a link
 * with nothing to download. A PNG in the tree is the first stone in the
 * avalanche that rule exists to stop, and an icon is exactly the innocent-
 * looking first stone.
 *
 * 512 square, which is the size a manifest needs for an installable app and the
 * size Android uses to generate its own maskable variants. Next serves it at
 * `/icon` and links it as the favicon automatically.
 *
 * WHAT IS ON IT. Not the wordmark — at 48px on a home screen a nine-letter word
 * is a grey smear. The Sutton Hoo helm's face is the one shape in this game
 * that is recognisable at any size: the brow band, the two eye openings and the
 * nasal running down between them make a mask that reads as a face even when it
 * is smaller than a fingernail. Gilt on near-black, which is the palette
 * `globals.css` sets, and the same two colours the link card uses, so a player
 * who saw the unfurl recognises the icon.
 */

export const runtime = "nodejs";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // The ground is opaque and dark rather than transparent: a
          // transparent icon on a light home screen shows gilt on white, and
          // gilt on white is invisible.
          backgroundColor: "#0a0806",
          backgroundImage:
            "radial-gradient(120% 90% at 50% 118%, rgba(198,92,20,0.45), rgba(198,92,20,0) 62%)," +
            "linear-gradient(180deg, #191308 0%, #0f0c08 60%, #0a0806 100%)",
        }}
      >
        {/* The helm, as flat shapes. Drawn with divs rather than an SVG because
            Satori rasterises layout far more predictably than it does paths,
            and a mask that is four rectangles and two holes needs nothing
            cleverer. */}
        <div style={{ display: "flex", position: "relative", width: 352, height: 352 }}>
          {/* The bowl: a dome, flat-bottomed where the brow band crosses it. */}
          <div
            style={{
              position: "absolute", left: 26, top: 10, width: 300, height: 210,
              borderTopLeftRadius: 150, borderTopRightRadius: 150,
              background: "linear-gradient(180deg, #f6dda0 0%, #d9a441 55%, #8a6d28 100%)",
            }}
          />
          {/* The brow band, the widest thing on the helm and the line that says
              "helmet" before any other detail resolves. */}
          <div
            style={{
              position: "absolute", left: 8, top: 196, width: 336, height: 46,
              borderRadius: 8,
              background: "linear-gradient(180deg, #f6dda0 0%, #c8912f 60%, #7c5f1f 100%)",
            }}
          />
          {/* Two eye openings — the dark of the ground showing through, so they
              read as holes rather than as painted marks. */}
          <div style={{ position: "absolute", left: 64, top: 252, width: 92, height: 40, borderRadius: 20, background: "#0a0806" }} />
          <div style={{ position: "absolute", left: 196, top: 252, width: 92, height: 40, borderRadius: 20, background: "#0a0806" }} />
          {/* The cheeks, framing the nasal. */}
          <div style={{ position: "absolute", left: 30, top: 242, width: 60, height: 108, borderBottomLeftRadius: 26, background: "linear-gradient(180deg,#c8912f,#7c5f1f)" }} />
          <div style={{ position: "absolute", left: 262, top: 242, width: 60, height: 108, borderBottomRightRadius: 26, background: "linear-gradient(180deg,#c8912f,#7c5f1f)" }} />
          {/* The nasal, down the midline between the eyes. */}
          <div style={{ position: "absolute", left: 160, top: 236, width: 32, height: 116, borderRadius: 10, background: "linear-gradient(180deg,#f6dda0,#a8801f)" }} />
          {/* One garnet at the brow — the single point of the stone the whole
              palette is built around, and the only warm-red pixel on the icon. */}
          <div
            style={{
              position: "absolute", left: 160, top: 200, width: 32, height: 32, borderRadius: 16,
              background: "radial-gradient(circle at 34% 30%, #ffcfc4 0 14%, #c8323c 15% 44%, #7c1420 45% 78%, #3a070c 100%)",
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
