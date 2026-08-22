# Painted art for Wrath

Drop a `manifest.json` in this folder and the named characters stop being drawn
procedurally. Nothing here is required — with no manifest the game renders
exactly as it always has, and that stays true for ever. The procedural renderer
is the fallback, not a stopgap.

## The brief

Everything below exists so painted art sits on the same ground, in the same
light, as the backdrops it stands in front of.

| | |
|---|---|
| **Facing** | Right. Facing left is mirrored by the engine — don't supply both. |
| **Light** | Key from the **upper right**, warm (`#fff2c8`-ish); shadows drift cool/blue. This agrees with `Iliad.SUN = [548, 58]`. |
| **Background** | Transparent. |
| **Shadow** | None. The engine draws the contact shadow so it lands on the ground plane correctly at every stage. |
| **Poses** | All six: `ready`, `attack`, `cast`, `hurt`, `win`, `fallen`. A character missing any one of them stays fully procedural — half a character would mean switching renderers mid-fight. |
| **Size** | Author at 3× (750 × 744 px per cell) to match the engine's internal supersampling. Any resolution works; `scale` tells the engine what you chose. |

The figure is about seven and a half heads tall. `fallen` is a body on the
ground, not a crouch.

## Coordinates

The engine thinks in *figure units* with the origin **between the feet, on the
ground line**. The procedural figure occupies 160 units left of that point, 90
right, 190 above and 58 below.

`x`/`y`/`w`/`h` and `anchor` are all in **source pixels**; `scale` is source
pixels per figure unit. The **anchor is the point in your image that belongs on
the ground line between the feet** — get this right and the figure will not
hover, which is the single most common way this goes wrong.

## manifest.json

```json
{
  "version": 1,
  "characters": {
    "Hector": {
      "sheet": "hector.webp",
      "scale": 3,
      "lighting": "baked",
      "frames": {
        "ready":  { "x":    0, "y": 0, "w": 750, "h": 744, "anchor": [480, 570] },
        "attack": { "x":  750, "y": 0, "w": 750, "h": 744, "anchor": [480, 570] },
        "cast":   { "x": 1500, "y": 0, "w": 750, "h": 744, "anchor": [480, 570] },
        "hurt":   { "x": 2250, "y": 0, "w": 750, "h": 744, "anchor": [480, 570] },
        "win":    { "x": 3000, "y": 0, "w": 750, "h": 744, "anchor": [480, 570] },
        "fallen": { "x": 3750, "y": 0, "w": 750, "h": 744, "anchor": [480, 570] }
      }
    }
  }
}
```

Keys are display names, matching `Iliad.ROSTER[].name` and `Iliad.BUILDS`:
`Achilles`, `Hector`, `Ajax the Greater`, `Diomedes`, `Teucer`, `Lycaon`,
`Patroclus`, `Scamander`, `Ares`, `Apollo`, `Aphrodite`.

`lighting` is `"baked"` (default) or `"engine"`. Baked means your art already
has its highlights painted in, so the engine's rim/bounce/outline passes are
skipped. Choose `"engine"` only for flat, unlit art — running those passes over
already-lit art doubles every highlight, and that is the usual reason a sprite
swap looks worse than what it replaced.

## Getting a template

The procedural renderer can export itself as a correctly-formed atlas, which
gives you the exact silhouette, proportions, pose set and anchor to paint
against. In the browser console, with Wrath open:

```js
Sprites.template('Hector')
```

It downloads `hector.png` and prints the matching manifest entry. Paint over the
cells, keep the anchors, and it will drop straight in.

## Checking your work

```js
Sprites.load().then(() => console.log(Sprites._notes, Object.keys(Sprites.chars)))
```

Every skipped character says why. To compare against the procedural version at
any time, pass `{ procedural: true }` in the draw options.

## Where these files live

In this repo, deliberately — Pages serves them from a CDN with no auth
round-trip, and art versions atomically with the code that positions it. Eleven
characters at six poses runs to roughly a megabyte as WebP, which is not worth
moving to object storage.
