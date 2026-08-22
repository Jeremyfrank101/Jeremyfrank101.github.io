// sprites.js — optional painted art for Wrath, loaded from a manifest.
//
// The game draws its fighters procedurally and always will: that path is the
// fallback and it is never removed. This module lets painted or pre-rendered
// art stand in for it, one character at a time, without the game code knowing
// which it got.
//
// The contract is the one drawWarrior already implies. A figure is drawn in
// "figure units" with the origin between the feet on the ground line: the
// procedural renderer reaches 160 units left of that point, 190 above, and the
// buffer is 250 x 248. A sprite frame therefore needs a picture and an anchor,
// and nothing else.
//
//   art/warriors/manifest.json
//   {
//     "version": 1,
//     "characters": {
//       "Hector": {
//         "sheet": "hector.webp",     // relative to the manifest
//         "scale": 3,                 // source pixels per figure unit
//         "lighting": "baked",        // "baked" | "engine"
//         "frames": {
//           "ready":  { "x": 0,   "y": 0, "w": 750, "h": 744, "anchor": [480, 570] },
//           "attack": { "x": 750, "y": 0, "w": 750, "h": 744, "anchor": [480, 570] },
//           ...one for each of ready/attack/cast/hurt/win/fallen
//         }
//       }
//     }
//   }
//
// x/y/w/h and anchor are all in source pixels; `scale` converts them to figure
// units, so art can be delivered at any resolution. `lighting` says whether the
// art already has its highlights painted in ("baked", the default) or wants the
// engine's rim/bounce/outline passes run over it ("engine") — running those over
// already-lit art doubles every highlight, which is the usual way this looks
// wrong.
//
// Art is expected to be lit from the upper right to agree with Iliad.SUN, drawn
// facing right (facing left is mirrored), with a transparent background and no
// contact shadow: the engine draws the shadow so it sits on the ground plane
// correctly at every stage.

const Sprites = {
    BASE: 'art/warriors/',
    POSES: ['ready', 'attack', 'cast', 'hurt', 'win', 'fallen'],

    loaded: false,          // a load has been attempted and has settled
    chars: {},              // id -> { frames, lighting } for complete characters
    _loading: null,
    _notes: [],             // human-readable account of what happened

    // Load is safe to call repeatedly and never rejects. No manifest is the
    // expected case, not an error: the game simply stays procedural.
    load(base) {
        if (this._loading) return this._loading;
        if (base) this.BASE = base;
        this._loading = this._load().catch(e => {
            this._note(`load failed: ${e && e.message ? e.message : e}`);
            this.loaded = true;
        });
        return this._loading;
    },

    async _load() {
        this._notes = [];
        let manifest;
        try {
            const res = await fetch(this.BASE + 'manifest.json', { cache: 'no-cache' });
            if (!res.ok) { this._note(`no manifest (${res.status}) — staying procedural`); this.loaded = true; return; }
            manifest = await res.json();
        } catch (e) {
            this._note('no manifest — staying procedural');
            this.loaded = true;
            return;
        }

        const entries = Object.entries(manifest.characters || {});
        await Promise.all(entries.map(([id, def]) => this._loadChar(id, def)));
        this.loaded = true;
        this._note(`${Object.keys(this.chars).length} of ${entries.length} characters using painted art`);
    },

    // A character is sprite-backed only if every pose is present and the sheet
    // decodes. Half a character would mean switching renderers mid-fight, which
    // looks far worse than either renderer on its own.
    async _loadChar(id, def) {
        const missing = this.POSES.filter(p => !(def.frames || {})[p]);
        if (missing.length) return this._note(`${id}: skipped, missing ${missing.join(', ')}`);

        let img;
        try {
            img = await this._image(this.BASE + def.sheet);
        } catch (e) {
            return this._note(`${id}: sheet ${def.sheet} failed to load`);
        }

        const scale = def.scale || 1;
        const frames = {};
        for (const pose of this.POSES) {
            const f = def.frames[pose];
            const a = f.anchor || [0, 0];
            frames[pose] = {
                img,
                sx: f.x, sy: f.y, sw: f.w, sh: f.h,
                // figure units
                dw: f.w / scale, dh: f.h / scale,
                ax: a[0] / scale, ay: a[1] / scale
            };
        }
        this.chars[id] = { frames, lighting: def.lighting === 'engine' ? 'engine' : 'baked' };
    },

    _image(src) {
        return new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error(src));
            im.src = src;
        });
    },

    _note(msg) { this._notes.push(msg); console.info('[Sprites] ' + msg); },

    has(id) { return !!this.chars[id]; },

    // The one call the renderer makes. Null means "draw it yourself".
    frame(id, pose) {
        const c = this.chars[id];
        if (!c) return null;
        const f = c.frames[pose] || c.frames.ready;
        return f ? { ...f, lighting: c.lighting } : null;
    },

    // ---------- authoring aid ----------
    //
    // Renders the procedural fighter into a correctly-formed atlas and hands
    // back the PNG and the manifest entry for it. That gives an artist the
    // exact silhouette, proportions, pose set and anchor to paint against, and
    // gives this module a fixture to be tested with. Dev tool: call it from the
    // console, it is not wired to any button.
    //
    //   Sprites.template('Hector')   // -> downloads hector.png + prints JSON
    template(id, opts = {}) {
        if (typeof Iliad === 'undefined') throw new Error('Iliad not loaded');
        const scale = opts.scale || Iliad.SS;         // author at 3x by default
        const W = 250, H = 248, ox = 160, oy = 190;   // figure units, from drawWarrior
        const named = (Iliad.ROSTER || []).find(h => h.name === id);
        const pal = opts.palette || (named && named.palette) || Iliad.ROSTER[0].palette;

        const sheet = document.createElement('canvas');
        sheet.width = W * scale * this.POSES.length;
        sheet.height = H * scale;
        const sc = sheet.getContext('2d');

        const frames = {};
        this.POSES.forEach((pose, i) => {
            const cell = document.createElement('canvas');
            cell.width = W * scale; cell.height = H * scale;
            const cc = cell.getContext('2d');
            cc.scale(scale, scale);
            // Anchor sits at (ox, oy) inside the cell, which is where
            // drawWarrior puts the feet. `procedural` is essential: without it
            // a character that already has art would export its own sprite
            // back out again instead of the figure to paint over.
            Iliad.drawWarrior(cc, pal, pose, 1, ox, oy, 0, null,
                              { id, plain: true, procedural: true });
            sc.drawImage(cell, i * W * scale, 0);
            frames[pose] = { x: i * W * scale, y: 0, w: W * scale, h: H * scale,
                             anchor: [ox * scale, oy * scale] };
        });

        const entry = { sheet: `${id.toLowerCase().replace(/\W+/g, '-')}.png`,
                        scale, lighting: 'baked', frames };
        const json = JSON.stringify({ version: 1, characters: { [id]: entry } }, null, 2);
        console.log(json);

        sheet.toBlob(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = entry.sheet;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        });
        return { canvas: sheet, entry, json };
    }
};
