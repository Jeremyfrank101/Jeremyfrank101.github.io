# CozyHome — project notes

A personal multi-app website served by GitHub Pages from this repo at
<https://jeremyfrank101.github.io>. Seven apps behind one sign-in, sharing a
Supabase backend.

## Ground rules

**No build step.** Vanilla JS, plain CSS, `<script>` tags in `index.html`.
Libraries are vendored in `js/vendor/` (`supabase.min.js` 2.45.4, `three.min.js`
r149). Do not introduce npm, bundlers or a framework — Node is not installed on
this machine, and Pages serves the repo verbatim.

**Adding a file means editing `index.html`.** New JS needs a `<script>` tag, new
CSS a `<link>`, a new app a screen `<div>`. Load order matters: `ui.js` and
`sync.js` before anything that uses them.

**Local dev**: `python3 -m http.server 8765` from the repo root, then
<http://localhost:8765/index.html>. One is usually already running.

**Comments explain why, not what.** Match the density and voice of the
surrounding code. Several comments record bugs that cost hours — do not tidy
them away.

## The apps

| id | Name | Files |
|---|---|---|
| `cozyhome` | CozyHome — inventory & projects | `app.js`, `store.js`, `views.js` |
| `health` | CozyHealth — food, movement, mind | `cozyhealth.js` |
| `cookbook` | CozyCookBook — recipes | `cookbook.js` |
| `kge` | KGE Stories — English/Kannada/Greek | `kge.js`, `kge-stories.js` |
| `iliad` | Wrath — Iliad duels | `iliad.js`, `sprites.js` |
| `mali` | Sands of Mali — Sahara trading | `desert.js`, `trail.js`, `sahara.js` |
| `highfive` | High Five — multiplayer room | `highfive.js` |

Shared: `apps.js` (shell/picker), `auth.js`, `sync.js`, `ui.js`, `palette.js`
(⌘K), `modals.js`, `themes.js`.

## Supabase

Project `lazrgdyptxthibwvfqvc`. The **anon/publishable key is meant to ship in
client code** and lives in `js/auth.js` — that is fine. The **`service_role` key
must never appear in the browser, in chat, or in git**; it bypasses RLS
entirely.

Schemas: `public` (CozyHome, sharing, `iliad_runs`), `cozyhealth`,
`CozyCookBookSchema`, and an empty duplicate `cozyhome` that should be dropped.

**PostgREST matches schema names literally** — it is `CozyCookBookSchema`, not
lowercase. Getting this wrong produces a confusing 404.

**RLS is owner-scoped everywhere.** Helpers are `SECURITY DEFINER` with a pinned
`search_path`. Per-user tables use composite primary keys. CozyHealth holds
weight, mood and journal entries and must never run on open `anon` policies.

**Starter cookbooks are owned by nobody**: `folders.user_id` / `recipes.user_id`
have an FK to `auth.users`, so rather than invent a service account those
columns allow NULL and `is_public` carries the meaning. The owner policies
compare `auth.uid() = user_id`, which never matches NULL, so library content is
read-only to everyone. A check constraint holds the invariant both ways.

## Writes go through the queue

Never call Supabase directly for a write. Use:

```js
Sync.enqueueWrite({ schema, table, action, payload, match })  // insert|upsert|update|delete
```

Reads stay synchronous off a write-through cache. Ids are client-generated
(`Sync.newId()`) so an optimistic row and the stored row are identical and a
retry collides on the primary key — **23505 means success**. A structured
PostgREST error means the request arrived and was rejected, so it is terminal
and gets dropped rather than blocking the queue (`Sync.dropped`).

Ordering uses fractional indexing (`UI.between`, `UI.GAP = 1024`). Destructive
actions use `UI.undo` rather than a confirm dialog, committing on `pagehide`.

## Traps that have already cost time

- **Every render is an `innerHTML` swap.** It destroys drag state and blocks
  animation. Never re-render mid-gesture; use `UI.reconcile` for keyed updates.
- **Explicit column lists go stale.** `cookbook.js` lists recipe columns to
  leave the `image_data` blob on the server. A column missing from that list
  arrives as `undefined` with no error — this silently broke recipe ordering
  for weeks (`position` was never selected).
- **Recipe lines are objects**, `{id, name, isChecked}` and
  `{id, text, isChecked}`. Bare strings render blank.
- **Blender: `matrix_world` is stale** until the depsgraph runs, so `swing()`
  in `render_hoplite.py` calls `view_layer.update()` first. Without it every
  `rot=` argument is silently discarded.
- **Do not hand-transcribe generated SQL.** Doing so silently dropped a row.
  Generate, apply, then checksum the result against the source file.

## Testing

Drive the real app in Chrome via the `mcp__claude-in-chrome__*` tools and assert
on state, not screenshots alone. Known harness artifacts, none of them bugs:

- rAF is fully suspended in a backgrounded tab (`document.hidden`), so game
  loops appear frozen.
- `const` globals are not on `window`; use `iframe.contentWindow.eval`.
- `resize_window` does not change the page viewport — test mobile with a
  390px-wide iframe.
- CDP `Runtime.evaluate` times out at 45s; run long work in the background.
- Images are cached even when the manifest is not; bust with `?v=`.

Verify writes reached Postgres (`Sync.pendingCount() === 0`, then query back),
and verify RLS by attempting a forbidden write from the browser and asserting
zero rows affected.

## Wrath art pipeline

The procedural canvas renderer in `iliad.js` is **the permanent fallback**, not
a stopgap. `js/sprites.js` can overlay painted art per character from
`art/warriors/manifest.json`; see `art/warriors/README.md` for the contract
(six poses, facing right, anchored between the feet, `lighting: baked|engine`).

`tools/render_hoplite.py` renders six poses from headless Blender;
`tools/pack_atlas.py` trims, packs and emits the manifest with anchors derived,
never measured. `Sprites.template('Hector')` exports the procedural figure as a
correctly-formed atlas for an artist to paint over.

**Status: the pipeline works, the art does not.** A figure built from Blender
primitives is a mannequin and looks worse than the procedural renderer, so no
manifest is committed and the build output is gitignored.

**Most promising route: PixelLab** (MCP registered at project scope). It solves
the consistency problem the Blender attempt could not, and pixel art is far
closer to the game's existing look than a smooth 3D render. Mapping notes:

- `create_character` gives 4 or 8 *rotations* of one standing figure, 16–128 px,
  `view: "side"` matching the duel framing. Poses come from
  `create_character_state`, which applies an edit ("lunging with a spear")
  across every rotation — so one base character plus five states covers the six
  poses, and identity holds. Budget 2–5 minutes per generation, 6 per fighter.
- **Resolution changes the compositing.** The 3× supersample in `drawWarrior`
  exists because the figure is drawn with smooth curves. Real pixel art wants
  `imageSmoothingEnabled = false` and integer scaling. A 128 px character is
  close to the ~136 figure-unit height the game already uses, so the manifest
  would carry `scale: 1` and the sprite path needs a nearest-neighbour branch.
- `create_portrait_character` is the easy win for the 11 prelude portraits.
- **Style risk worth checking early**: the backdrops are smooth gradients with
  bloom, so hard-pixel characters may clash. Test one fighter in-scene before
  committing to eleven.

Also worth building regardless of where the art comes from: normal/AO/emissive
passes from Blender so the engine lights sprites with its own `SUN` instead of
relying on baked highlights.

## PixelLab

An AI pixel-art studio, ~70 tools over MCP. Docs: `https://api.pixellab.ai/mcp/docs`.
Generation is asynchronous everywhere — submit, get an id, poll (`get_character`,
`get_image`, `get_portrait_character`); downloads need no re-authentication
because the UUID is the access key.

**Start with High Five, not Wrath.** `highfive.js` is already 16×16 pixel art
built procedurally in `_buildSprites()`, with a single pose the code admits is
"honest to the era being imitated". `create_character` at 16–32 px with 4 or 8
directions replaces that one function and gives real facings instead of a
mirrored sprite. It is cheap, self-contained, and carries no style risk — which
makes it the honest test of output quality before spending 66 jobs on Wrath.

What maps where:

| App | Tools |
|---|---|
| High Five | `create_character` (16–32 px, 4/8 directions) — swaps out `_buildSprites()` |
| Wrath | `create_character` + `create_character_state` for the six poses; `create_portrait_character` for the 11 prelude portraits; `animate_character` if static poses are ever replaced by frames at `_advancePose`; `create_ui_asset`; `create_font` |
| Sands of Mali | `create_topdown_tileset`, `create_path_tiles`, `create_building_kit`; `create_map_object` + `place_map_object`/`move_map_object`; `create_image_pro` for the 18 event cards and the destination-city pages |
| The rest | `create_ui_asset` for picker icons (currently emoji), `create_image_pixflux` for food icons across the 542-entry library (currently SF Symbol names), small illustrations per KGE story |

Freeform: `create_image_pixflux` / `pixen` / `pro` (Pro adds reference images,
style matching, 20–40 candidates), plus `edit_image` and `inpaint_image` to fix
a result rather than reroll it.

Constraints that shape the plan:

- **2–5 minutes per generation.** Wrath is 11 fighters × 6 poses = 66 jobs,
  hours of wall time and real credits. Never batch the whole roster blind.
- **128 px ceiling** on characters (160 for portraits). Fine for pixel art.
- **Costs credits**; `get_balance` and `list_jobs` before a large run.

## Environment

Blender 5.2 LTS at `/Applications/Blender.app`, blender-mcp addon permanently
enabled, MCP server registered at user scope (`uvx blender-mcp`); headless
Blender works without the MCP. PixelLab MCP registered at project scope
(`https://api.pixellab.ai/mcp`, docs at `/mcp/docs`). **Both need a Claude Code
restart before their tools are callable.** `uv` and Pillow are installed.
Homebrew, ImageMagick, `cwebp` and Node are **not**.

## Picking up next

Agreed plan, in order:

1. **High Five sprites via PixelLab** — generate a character at 16–32 px with
   directions, replace `_buildSprites()` in `highfive.js`, and judge the output
   quality on something cheap.
2. If that looks good, **one Wrath fighter**: base character plus five
   `create_character_state` poses, packed with `tools/pack_atlas.py`, dropped in
   and screenshotted beside a procedural opponent — the same comparison that
   settled the Blender attempt. Requires the nearest-neighbour branch in
   `sprites.js` first (see the Wrath section).
3. Only then the other ten fighters, and the prelude portraits.

## Outstanding

- Rotate the GitHub PAT that was pasted into a chat transcript on disk.
- Enable Supabase leaked-password protection.
- Drop the empty duplicate `cozyhome` schema.
- Clear ~12 test accounts from Authentication → Users.
- Kannada in KGE Stories needs a native speaker's review before anyone relies
  on it; the Modern Greek is solid.
