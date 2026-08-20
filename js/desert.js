// desert.js — "Sands of Mali": a first-person desert survival game set in
// Timbuktu, c. 1325, during the reign of Mansa Musa.
//
// Everything is procedural — no external models or textures — so the game is
// self-contained apart from js/vendor/three.min.js.

const DesertGame = {

    // ---------- Configuration ----------

    START_COWRIES: 1000,
    TOWN_RADIUS: 62,      // past this, you are in open desert
    SURVIVE_SECONDS: 30,  // how long the Sahara lets you live
    EYE_HEIGHT: 1.7,
    WALK_SPEED: 9,
    RUN_SPEED: 15,

    // Where the player starts. Ground clutter is kept clear of it, so this has
    // to be one shared constant rather than two that can drift apart.
    SPAWN: { x: 0, z: 26 },

    // Cowrie shells were the everyday currency of the Mali Empire, imported
    // from the Maldives; gold dust settled the large caravan accounts.
    PRODUCTS: [
        { id: 'food',  icon: '🌾', name: 'Dried Dates & Millet', price: 60, note: 'Enough to cross the empty stretch.' },
        { id: 'water', icon: '💧', name: 'Well Water',           price: 40, note: 'Drawn from the wells of Timbuktu.' },
        { id: 'skin',  icon: '🫗', name: 'Goatskin Water Bag',   price: 80, note: 'Sweats just enough to stay cool.' },
        { id: 'feed',  icon: '🌿', name: 'Camel Fodder',         price: 50, note: 'Dried grass and date pits.' },
        { id: 'shoes', icon: '👡', name: 'Leather Sandals',      price: 70, note: 'Stitched by Tuareg leatherworkers.' }
    ],

    CAMEL_PRICE: 500,

    // Real destinations of Malian caravans in the 14th century.
    QUESTS: [
        { id: 'taghaza',   name: 'Taghaza',   heading: 'north',      reward: 400, blurb: 'The salt mines. The houses there are built of salt blocks, and nothing grows. Bring back slabs and they will sell for their weight in the south.' },
        { id: 'walata',    name: 'Walata',    heading: 'north-west', reward: 350, blurb: 'The first town a caravan meets after the crossing. Ibn Battuta rested there. Carry cloth and return with dates.' },
        { id: 'sijilmasa', name: 'Sijilmasa', heading: 'north',      reward: 900, blurb: 'Beyond the desert in the Maghrib, where the gold road ends and the Mediterranean begins. Two months of sand, if you live.' },
        { id: 'gao',       name: 'Gao',       heading: 'east',       reward: 250, blurb: 'Downriver on the Niger, the Songhai city. An easy road by the water, and good prices for copper from Takedda.' },
        { id: 'djenne',    name: 'Djenné',    heading: 'south-west', reward: 200, blurb: 'The market that feeds Timbuktu. Gold comes up from Bambuk through its gates, and rice goes down.' },
        { id: 'niani',     name: 'Niani',     heading: 'south',      reward: 500, blurb: 'The seat of Mansa Musa himself. Carry word to the court, and the court pays well for word.' }
    ],

    // ---------- Lifecycle ----------

    mount(container) {
        // App.render() rebuilds #list-container whenever a modal closes, which
        // detaches our canvas. If that happened, tear down and rebuild rather
        // than leaving a live renderer pointed at an orphaned element.
        if (this.mounted) {
            if (this.container === container && document.body.contains(container)) return;
            this.unmount();
        }
        this.container = container;
        this.mounted = true;
        this.resetState();
        this._buildDOM();
        this._buildScene();
        this._bindInput();
        this._showIntro();
        this._lastTime = performance.now();
        this._loop = this._loop.bind(this);
        this._raf = requestAnimationFrame(this._loop);
    },

    unmount() {
        if (!this.mounted) return;
        this.mounted = false;
        cancelAnimationFrame(this._raf);
        this._unbindInput();
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss?.();
        }
        this.scene?.traverse(obj => {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material?.dispose();
        });
        this.scene = this.renderer = this.camera = null;
        if (this.container) this.container.innerHTML = '';
        this.container = null;
    },

    resetState() {
        this.state = 'intro'; // intro | playing | panel | dead
        this.cowries = this.START_COWRIES;
        this.owned = {};
        this.hasCamel = false;
        this.quest = null;
        this.exposure = 0;
        this.outside = false;
        this.activeNPC = null;
        // yaw 0 faces -Z, which looks up the plaza toward the palace
        this.yaw = 0;
        this.pitch = -0.04;
        this.pos = { x: this.SPAWN.x, y: 0, z: this.SPAWN.z };
        this.vel = { x: 0, z: 0 };
        this.keys = {};
        this.touchMove = { x: 0, y: 0 };
    },

    hasAllProducts() {
        return this.PRODUCTS.every(p => this.owned[p.id]);
    },

    // ---------- DOM ----------

    _buildDOM() {
        this.container.innerHTML = `
        <div class="dg-root">
            <canvas class="dg-canvas"></canvas>
            <div class="dg-grade"></div>
            <div class="dg-vignette"></div>
            <div class="dg-reticle"></div>

            <div class="dg-hud">
                <div class="dg-purse"><span class="dg-shell">🐚</span><span class="dg-cowries">0</span> cowries</div>
                <div class="dg-kit"></div>
            </div>

            <div class="dg-quest-banner hidden"></div>
            <div class="dg-timer hidden">
                <div class="dg-timer-label">Exposure</div>
                <div class="dg-timer-count">30</div>
                <div class="dg-timer-bar"><div class="dg-timer-fill"></div></div>
            </div>

            <div class="dg-prompt hidden"></div>
            <div class="dg-toast hidden"></div>

            <button class="dg-touch-interact hidden" type="button">Talk</button>
            <div class="dg-stick hidden"><div class="dg-stick-nub"></div></div>

            <div class="dg-overlay dg-intro">
                <div class="dg-card">
                    <div class="dg-kicker">Timbuktu · Mali Empire · 1325</div>
                    <h2>Sands of Mali</h2>
                    <p>Mansa Musa has returned from Mecca and the city is thick with builders, scholars and caravan men. You have <strong>1,000 cowries</strong> and an intention to trade across the Sahara.</p>
                    <p class="dg-hint">Provision yourself at the market, buy a camel, and take a commission from the scholar at Sankore. The gate guards will not let you leave unprovisioned — and the desert past the walls kills in half a minute.</p>
                    <div class="dg-controls-help">
                        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk</span>
                        <span><kbd>Shift</kbd> run</span>
                        <span>Mouse look</span>
                        <span><kbd>E</kbd> talk</span>
                        <span><kbd>Esc</kbd> release cursor</span>
                    </div>
                    <button class="dg-btn dg-begin" type="button">Enter the City</button>
                </div>
            </div>

            <div class="dg-overlay dg-panel hidden"><div class="dg-card dg-panel-card"></div></div>

            <div class="dg-overlay dg-death hidden">
                <div class="dg-card dg-death-card">
                    <div class="dg-death-sun">☀</div>
                    <h2>You did not reach the next well</h2>
                    <p class="dg-death-text"></p>
                    <button class="dg-btn dg-restart" type="button">Begin Again in Timbuktu</button>
                </div>
            </div>
        </div>`;

        const q = s => this.container.querySelector(s);
        this.dom = {
            root: q('.dg-root'),
            canvas: q('.dg-canvas'),
            vignette: q('.dg-vignette'),
            reticle: q('.dg-reticle'),
            cowries: q('.dg-cowries'),
            kit: q('.dg-kit'),
            questBanner: q('.dg-quest-banner'),
            timer: q('.dg-timer'),
            timerCount: q('.dg-timer-count'),
            timerFill: q('.dg-timer-fill'),
            prompt: q('.dg-prompt'),
            toast: q('.dg-toast'),
            intro: q('.dg-intro'),
            begin: q('.dg-begin'),
            panel: q('.dg-panel'),
            panelCard: q('.dg-panel-card'),
            death: q('.dg-death'),
            deathText: q('.dg-death-text'),
            restart: q('.dg-restart'),
            touchInteract: q('.dg-touch-interact'),
            stick: q('.dg-stick'),
            stickNub: q('.dg-stick-nub')
        };
        this.canvas = this.dom.canvas;

        this.dom.begin.addEventListener('click', () => this._begin());
        this.dom.restart.addEventListener('click', () => this._restart());

        if (this._isTouch()) {
            this.dom.stick.classList.remove('hidden');
            this.dom.root.classList.add('dg-touch');
            this.dom.touchInteract.addEventListener('click', () => this._interact());
        }

        this._renderHUD();
    },

    _isTouch() {
        return window.matchMedia('(hover: none)').matches || 'ontouchstart' in window;
    },

    // ---------- Scene ----------

    _buildScene() {
        const w = this.container.clientWidth || 800;
        const h = this.container.clientHeight || 500;

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(w, h, false);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        // Filmic tone mapping is most of the difference between "tech demo"
        // and "game": highlights roll off instead of clipping to white.
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.95;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0xeed9b0, 0.0048);

        this.camera = new THREE.PerspectiveCamera(72, w / h, 0.1, 1200);

        this._addSky();
        this._addLights();
        this._addGround();

        this.colliders = [];
        this.npcs = [];
        this.labels = [];
        this._buildTown();
        this._buildNPCs();
        this._buildCamel();
        this._addDust();

        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);
    },

    // ---------- Procedural textures ----------
    //
    // All generated white-on-white so material.color can tint them, which keeps
    // the per-building shade variation while adding surface detail.

    _makeGlowTexture() {
        if (this._glowTex) return this._glowTex;
        const S = 128;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
        g.addColorStop(0.00, 'rgba(255,255,255,1)');
        g.addColorStop(0.18, 'rgba(255,255,255,0.62)');
        g.addColorStop(0.42, 'rgba(255,255,255,0.18)');
        g.addColorStop(1.00, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, S, S);
        this._glowTex = new THREE.CanvasTexture(c);
        return this._glowTex;
    },

    // Draws a soft blob nine times so the tile wraps seamlessly.
    _wrapBlob(ctx, S, x, y, r, rgb, alpha) {
        for (const ox of [-S, 0, S]) {
            for (const oy of [-S, 0, S]) {
                const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
                g.addColorStop(0, `rgba(${rgb},${alpha})`);
                g.addColorStop(1, `rgba(${rgb},0)`);
                ctx.fillStyle = g;
                ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
            }
        }
    },

    _grain(ctx, S, amount) {
        const img = ctx.getImageData(0, 0, S, S);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            const n = (Math.random() - 0.5) * amount;
            d[i] += n; d[i + 1] += n; d[i + 2] += n;
        }
        ctx.putImageData(img, 0, 0);
    },

    // Mud brick: mottled weathering, horizontal coursing, rain streaks.
    _adobeTexture() {
        if (this._adobeTex) return this._adobeTex;
        const S = 512;   // walls are read from a metre away, so 256 smears
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, S, S);

        for (let i = 0; i < 240; i++) {
            const dark = Math.random() < 0.55;
            this._wrapBlob(ctx, S,
                Math.random() * S, Math.random() * S,
                16 + Math.random() * 64,
                dark ? '86,60,32' : '255,248,232',
                0.13 + Math.random() * 0.18);
        }

        // courses of brick, roughly every 30cm at our tile scale
        for (let y = 0; y < S; y += 60) {
            ctx.fillStyle = 'rgba(74,50,26,0.34)';
            ctx.fillRect(0, y, S, 4);
            ctx.fillStyle = 'rgba(255,250,236,0.26)';
            ctx.fillRect(0, y + 4, S, 2.8);
        }

        // vertical weathering streaks running down from the courses
        for (let i = 0; i < 60; i++) {
            const h = 68 + Math.random() * 220;
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, 'rgba(72,50,27,0.30)');
            g.addColorStop(1, 'rgba(72,50,27,0)');
            ctx.fillStyle = g;
            ctx.save();
            ctx.translate(Math.random() * S, Math.random() * S);
            ctx.fillRect(0, 0, 2 + Math.random() * 6, h);
            ctx.restore();
        }

        this._grain(ctx, S, 30);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this._adobeTex = tex;
        return tex;
    },

    // Sand: fine grain plus wind ripples.
    _sandTexture() {
        if (this._sandTex) return this._sandTex;
        const S = 256;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, S, S);

        for (let i = 0; i < 80; i++) {
            this._wrapBlob(ctx, S, Math.random() * S, Math.random() * S,
                14 + Math.random() * 44,
                Math.random() < 0.5 ? '132,96,52' : '255,250,236',
                0.09 + Math.random() * 0.12);
        }

        // wind ripples: paired dark/light sine bands, wrapping on both axes
        ctx.lineWidth = 2;
        for (let i = 0; i < 30; i++) {
            const y0 = (i / 30) * S;
            const wobble = 3 + Math.random() * 2.5;
            // Slight per-band phase and amplitude drift keeps the tile from
            // reading as corduroy when it repeats across the dunes.
            const phase = Math.random() * Math.PI * 2;
            const freq = 3 + Math.floor(Math.random() * 3);
            ctx.strokeStyle = 'rgba(120,86,44,0.13)';
            ctx.beginPath();
            for (let x = 0; x <= S; x += 4) {
                const y = y0 + Math.sin((x / S) * Math.PI * 2 * freq + phase) * wobble;
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,252,242,0.12)';
            ctx.beginPath();
            for (let x = 0; x <= S; x += 4) {
                const y = y0 + 2.6 + Math.sin((x / S) * Math.PI * 2 * freq + phase) * wobble;
                x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        this._grain(ctx, S, 26);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this._sandTex = tex;
        return tex;
    },

    // BoxGeometry gives every face 0..1 UVs, which stretches the tile on big
    // walls. Rescale per face so texel density is uniform across the town.
    _tileBoxUVs(geo, w, h, d, tile = 5) {
        const uv = geo.attributes.uv;
        const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
        for (let f = 0; f < 6; f++) {
            const [su, sv] = spans[f];
            for (let i = 0; i < 4; i++) {
                const k = f * 4 + i;
                uv.setXY(k, uv.getX(k) * su / tile, uv.getY(k) * sv / tile);
            }
        }
        uv.needsUpdate = true;
    },

    // Real banco walls lean inward as they rise. Pull the top ring in.
    _taperedBox(w, h, d, taper = 0.05) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            if (pos.getY(i) > 0) {
                pos.setX(i, pos.getX(i) * (1 - taper));
                pos.setZ(i, pos.getZ(i) * (1 - taper));
            }
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        this._tileBoxUVs(geo, w, h, d);
        return geo;
    },

    _addSky() {
        const c = document.createElement('canvas');
        c.width = 4; c.height = 512;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, 512);
        g.addColorStop(0.00, '#2c66a8');   // zenith
        g.addColorStop(0.38, '#6fa3cf');
        g.addColorStop(0.60, '#b8ccd8');
        g.addColorStop(0.74, '#eedcb4');   // dust band
        g.addColorStop(1.00, '#f4e2bd');   // horizon haze
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 4, 512);

        const tex = new THREE.CanvasTexture(c);
        tex.magFilter = THREE.LinearFilter;
        const sky = new THREE.Mesh(
            new THREE.SphereGeometry(600, 32, 20),
            // toneMapped:false — the gradient is already the look we want; running
            // it through ACES just desaturates it.
            new THREE.MeshBasicMaterial({
                map: tex, side: THREE.BackSide, fog: false,
                depthWrite: false, toneMapped: false
            })
        );
        this.scene.add(sky);

        // The sun: a hot core inside a broad atmospheric glow.
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this._makeGlowTexture(),
            color: 0xffedc4, transparent: true, opacity: 0.8,
            fog: false, depthWrite: false, toneMapped: false
        }));
        glow.scale.set(280, 280, 1);
        glow.position.set(-260, 165, -430);
        this.scene.add(glow);

        const core = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this._makeGlowTexture(),
            color: 0xfffbee, transparent: true, opacity: 1,
            fog: false, depthWrite: false, toneMapped: false
        }));
        core.scale.set(80, 80, 1);
        core.position.copy(glow.position);
        this.scene.add(core);
    },

    _addLights() {
        this.scene.add(new THREE.HemisphereLight(0xbcd4ee, 0x9a7040, 0.30));

        const sun = new THREE.DirectionalLight(0xffe7b8, 0.95);
        sun.position.set(-70, 90, -110);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        // Tight frustum around the town keeps shadow resolution usable.
        const s = 95;
        Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 10, far: 320 });
        sun.shadow.bias = -0.0016;
        sun.shadow.camera.updateProjectionMatrix();
        this.scene.add(sun);
        this.scene.add(new THREE.AmbientLight(0xffe0b4, 0.07));
    },

    // Dunes everywhere, flat where the town stands.
    groundHeight(x, z) {
        const d = Math.hypot(x, z);
        const inner = this.TOWN_RADIUS * 0.85, outer = this.TOWN_RADIUS * 1.9;
        let t = (d - inner) / (outer - inner);
        t = Math.max(0, Math.min(1, t));
        t = t * t * (3 - 2 * t); // smoothstep
        const dunes =
            Math.sin(x * 0.028) * 2.4 +
            Math.cos(z * 0.019) * 2.9 +
            Math.sin((x + z) * 0.0105) * 3.8 +
            Math.sin(x * 0.006 - z * 0.008) * 5.2;
        return dunes * t;
    },

    _addGround() {
        const geo = new THREE.PlaneGeometry(1000, 1000, 150, 150);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        const colors = [];
        const sandA = new THREE.Color(0xe3bc7d);   // sunlit dune crest
        const sandB = new THREE.Color(0xc0904f);   // trough
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            const y = this.groundHeight(x, z);
            pos.setY(i, y);
            const mix = Math.min(1, Math.max(0, (y + 6) / 14));
            const col = sandA.clone().lerp(sandB, 1 - mix);
            colors.push(col.r, col.g, col.b);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const sand = this._sandTexture();
        sand.repeat.set(58, 58);

        const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
            vertexColors: true,
            map: sand
        }));
        ground.receiveShadow = true;
        this.scene.add(ground);
    },

    // ---------- Sudano-Sahelian architecture ----------
    //
    // The Timbuktu style is mud brick (banco) with protruding palm-wood beams
    // called torons, tapering walls, and rounded parapet pinnacles.

    _adobe(shade = 0) {
        // Deliberately darker and browner than the sand so the town reads as a
        // silhouette against the dunes instead of dissolving into them.
        const base = new THREE.Color(0xa87d4e).offsetHSL(0, 0, shade);
        return new THREE.MeshLambertMaterial({ color: base, map: this._adobeTexture() });
    },

    _block(w, h, d, x, y, z, shade = 0, taper = 0.045) {
        const m = new THREE.Mesh(this._taperedBox(w, h, d, taper), this._adobe(shade));
        m.position.set(x, y + h / 2, z);
        m.castShadow = true;
        m.receiveShadow = true;
        return m;
    },

    // The signature protruding palm-wood roof beams.
    _addTorons(group, w, d, cx, cz, levels, len = 1.1) {
        const mat = new THREE.MeshLambertMaterial({ color: 0x4b3520 });
        const geo = new THREE.CylinderGeometry(0.16, 0.16, len, 6);
        geo.rotateZ(Math.PI / 2);
        const spacing = 3.0;
        levels.forEach(y => {
            for (let i = -Math.floor(w / 2 / spacing); i <= Math.floor(w / 2 / spacing); i++) {
                for (const side of [-1, 1]) {
                    const t = new THREE.Mesh(geo, mat);
                    t.position.set(cx + i * spacing, y, cz + side * (d / 2 + len / 2 - 0.15));
                    t.rotation.y = Math.PI / 2;
                    t.castShadow = true;
                    group.add(t);
                }
            }
            for (let i = -Math.floor(d / 2 / spacing); i <= Math.floor(d / 2 / spacing); i++) {
                for (const side of [-1, 1]) {
                    const t = new THREE.Mesh(geo, mat);
                    t.position.set(cx + side * (w / 2 + len / 2 - 0.15), y, cz + i * spacing);
                    t.castShadow = true;
                    group.add(t);
                }
            }
        });
    },

    // Rounded mud pinnacles along the roofline.
    _addParapet(group, w, d, cx, cz, y) {
        const mat = this._adobe(0.03);
        const geo = new THREE.ConeGeometry(0.34, 1.1, 7);
        const step = 2.2;
        const place = (x, z) => {
            const c = new THREE.Mesh(geo, mat);
            c.position.set(x, y + 0.55, z);
            c.castShadow = true;
            group.add(c);
        };
        for (let x = -w / 2; x <= w / 2 + 0.01; x += step) { place(cx + x, cz - d / 2); place(cx + x, cz + d / 2); }
        for (let z = -d / 2 + step; z <= d / 2 - step + 0.01; z += step) { place(cx - w / 2, cz + z); place(cx + w / 2, cz + z); }
    },

    _addDoor(group, w, h, x, y, z, rotY = 0) {
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, 0.3),
            new THREE.MeshLambertMaterial({ color: 0x3d2b18 })
        );
        door.position.set(x, y + h / 2, z);
        door.rotation.y = rotY;
        group.add(door);
    },

    _collider(x, z, w, d) {
        this.colliders.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
    },

    _buildTown() {
        const town = new THREE.Group();
        this.scene.add(town);

        // 1. Djinguereber Mosque — commissioned by Mansa Musa in 1327,
        //    reputedly designed by the Andalusian poet-architect es-Saheli.
        {
            const g = new THREE.Group();
            const w = 30, d = 20, x = -38, z = -6;
            g.add(this._block(w, 7.5, d, x, 0, z));
            this._addTorons(g, w, d, x, z, [3.0, 5.6]);
            this._addParapet(g, w, d, x, z, 7.5);
            // pyramidal minaret
            const min = this._block(7.5, 13, 7.5, x - w / 2 + 5, 0, z - d / 2 + 4.5, 0.02);
            g.add(min);
            const cap = new THREE.Mesh(new THREE.ConeGeometry(5.4, 5.5, 4), this._adobe(0.04));
            cap.position.set(x - w / 2 + 5, 15.6, z - d / 2 + 4.5);
            cap.rotation.y = Math.PI / 4;
            cap.castShadow = true;
            g.add(cap);
            this._addTorons(g, 7.5, 7.5, x - w / 2 + 5, z - d / 2 + 4.5, [5.5, 9.0, 12.2], 0.9);
            this._addDoor(g, 3.2, 4.4, x, 0, z + d / 2 + 0.05);
            town.add(g);
            this._collider(x, z, w, d);
            this._sign('Djinguereber Mosque', x, 9.4, z + d / 2 + 1);
        }

        // 2. Sankore Madrasa — the university quarter; its courtyard was said
        //    to be built to the dimensions of the Kaaba.
        {
            const g = new THREE.Group();
            const w = 19, d = 19, x = 34, z = -24;
            g.add(this._block(w, 6.5, d, x, 0, z, -0.02));
            this._addTorons(g, w, d, x, z, [2.8, 5.2]);
            this._addParapet(g, w, d, x, z, 6.5);
            const min = this._block(6.5, 9, 6.5, x, 6.5, z, 0.03);
            g.add(min);
            const cap = new THREE.Mesh(new THREE.ConeGeometry(4.7, 5, 4), this._adobe(0.05));
            cap.position.set(x, 18, z);
            cap.rotation.y = Math.PI / 4;
            cap.castShadow = true;
            g.add(cap);
            this._addTorons(g, 6.5, 6.5, x, z, [9, 12.5], 0.9);
            this._addDoor(g, 2.8, 4.2, x, 0, z + d / 2 + 0.05);
            town.add(g);
            this._collider(x, z, w, d);
            this._sign('Sankore Madrasa', x, 8.4, z + d / 2 + 1);
        }

        // 3. The Madugu — the mansa's palace compound.
        {
            const g = new THREE.Group();
            const w = 34, d = 15, x = 0, z = -42;
            g.add(this._block(w, 8.5, d, x, 0, z, 0.02));
            this._addTorons(g, w, d, x, z, [3.4, 6.2]);
            this._addParapet(g, w, d, x, z, 8.5);
            // corner towers
            [-1, 1].forEach(s => {
                const t = this._block(6, 12, 6, x + s * (w / 2 - 3), 0, z, 0.04);
                g.add(t);
                const cap = new THREE.Mesh(new THREE.ConeGeometry(4.3, 3.6, 4), this._adobe(0.05));
                cap.position.set(x + s * (w / 2 - 3), 13.8, z);
                cap.rotation.y = Math.PI / 4;
                cap.castShadow = true;
                g.add(cap);
            });
            this._addDoor(g, 4, 5.2, x, 0, z + d / 2 + 0.05);
            town.add(g);
            this._collider(x, z, w, d);
            this._sign("Madugu — Mansa's Palace", x, 10.4, z + d / 2 + 1);
        }

        // 4. Youbou-Ber — the great market.
        {
            const g = new THREE.Group();
            const w = 22, d = 16, x = 30, z = 20;
            g.add(this._block(w, 5.5, d, x, 0, z, -0.03));
            this._addTorons(g, w, d, x, z, [2.6]);
            this._addParapet(g, w, d, x, z, 5.5);
            this._addDoor(g, 5, 4, x, 0, z - d / 2 - 0.05);
            town.add(g);
            this._collider(x, z, w, d);
            this._sign('Youbou-Ber — Grand Market', x, 7.4, z - d / 2 - 1);
            // awnings out front
            for (let i = -1; i <= 1; i++) this._stall(town, x + i * 6.5, z - d / 2 - 6);
        }

        // 5. Caravanserai — where the Saharan caravans unloaded.
        {
            const g = new THREE.Group();
            const w = 24, d = 17, x = -30, z = 28;
            g.add(this._block(w, 6, d, x, 0, z, -0.01));
            this._addTorons(g, w, d, x, z, [2.8]);
            this._addParapet(g, w, d, x, z, 6);
            this._addDoor(g, 5.5, 4.4, x, 0, z - d / 2 - 0.05);
            town.add(g);
            this._collider(x, z, w, d);
            this._sign('Caravanserai', x, 7.9, z - d / 2 - 1);
            // camel pen fence
            const fenceMat = new THREE.MeshLambertMaterial({ color: 0x6b4f2f });
            for (let i = 0; i < 14; i++) {
                const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.5, 5), fenceMat);
                const a = (i / 14) * Math.PI * 2;
                p.position.set(x + 4 + Math.cos(a) * 9, 0.75, z - d / 2 - 9 + Math.sin(a) * 6);
                p.castShadow = true;
                g.add(p);
            }
        }

        this._addWell();
        this._addPalms();
        this._addGateMarkers();
        this._addGroundClutter();
    },

    // Rocks and dry scrub. Empty ground reads as an untextured plane no matter
    // how good the material is — scattered objects give the eye scale cues.
    _addGroundClutter() {
        // Deterministic scatter so the layout is stable between runs.
        let seed = 1337;
        const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

        // InstancedMesh keeps hundreds of props at a handful of draw calls,
        // which matters on phones far more than the triangle count does.
        const dummy = new THREE.Object3D();

        const rockGeos = [
            new THREE.DodecahedronGeometry(1, 0),
            new THREE.DodecahedronGeometry(1, 1),
            new THREE.IcosahedronGeometry(1, 0)
        ];
        const rockTints = [
            new THREE.Color(0x8f7d66), new THREE.Color(0x9c8a70), new THREE.Color(0x7d6b56)
        ];

        // Pre-roll placements so each geometry knows its instance count.
        const spots = [];
        for (let i = 0; i < 300; i++) {
            const a = rnd() * Math.PI * 2;
            const r = 14 + rnd() * 300;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const keep = Math.hypot(x, z) >= 16
                && Math.hypot(x - this.SPAWN.x, z - this.SPAWN.z) >= 11
                && !this._insideCollider(x, z, 3);
            spots.push({
                x, z, keep,
                geo: (rnd() * rockGeos.length) | 0,
                tint: (rnd() * rockTints.length) | 0,
                s: 0.18 + rnd() * (r > this.TOWN_RADIUS ? 1.5 : 0.5),
                sy: 0.5 + rnd() * 0.5,
                rx: rnd() * 3, ry: rnd() * 3, rz: rnd() * 3
            });
        }

        rockGeos.forEach((geo, gi) => {
            const mine = spots.filter(s => s.keep && s.geo === gi);
            if (!mine.length) return;
            const mesh = new THREE.InstancedMesh(
                geo,
                new THREE.MeshLambertMaterial({ flatShading: true }),
                mine.length
            );
            mine.forEach((s, i) => {
                dummy.position.set(s.x, this.groundHeight(s.x, s.z) + s.s * 0.35, s.z);
                dummy.scale.set(s.s, s.s * s.sy, s.s);
                dummy.rotation.set(s.rx, s.ry, s.rz);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
                mesh.setColorAt(i, rockTints[s.tint]);
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
        });

        // Dry scrub: crossed planes, cheap and reads well at a distance.
        const scrubPlacements = [];
        for (let i = 0; i < 190; i++) {
            const a = rnd() * Math.PI * 2;
            const r = 18 + rnd() * 260;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            // Scrub belongs out past the built-up ground, not in the market plaza.
            if (r < this.TOWN_RADIUS * 0.72) continue;
            if (Math.hypot(x - this.SPAWN.x, z - this.SPAWN.z) < 14) continue;
            if (this._insideCollider(x, z, 3)) continue;
            scrubPlacements.push({ x, z, h: 0.5 + rnd() * 0.8, rot: rnd() * Math.PI });
        }

        if (scrubPlacements.length) {
            const scrubMesh = new THREE.InstancedMesh(
                new THREE.PlaneGeometry(1, 1),
                new THREE.MeshLambertMaterial({
                    color: 0x8a8143, side: THREE.DoubleSide,
                    transparent: true, alphaTest: 0.5, map: this._scrubTexture()
                }),
                scrubPlacements.length * 2   // two crossed planes per bush
            );
            scrubPlacements.forEach((s, i) => {
                for (let k = 0; k < 2; k++) {
                    dummy.position.set(s.x, this.groundHeight(s.x, s.z) + s.h / 2, s.z);
                    dummy.rotation.set(0, s.rot + k * Math.PI / 2, 0);
                    dummy.scale.set(s.h * 1.6, s.h, 1);
                    dummy.updateMatrix();
                    scrubMesh.setMatrixAt(i * 2 + k, dummy.matrix);
                }
            });
            scrubMesh.instanceMatrix.needsUpdate = true;
            this.scene.add(scrubMesh);
        }
    },

    _insideCollider(x, z, pad = 0) {
        return this.colliders.some(c =>
            Math.abs(x - c.x) < c.hw + pad && Math.abs(z - c.z) < c.hd + pad);
    },

    _scrubTexture() {
        if (this._scrubTex) return this._scrubTex;
        const S = 64;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, S, S);
        ctx.strokeStyle = '#ffffff';
        ctx.lineCap = 'round';
        for (let i = 0; i < 26; i++) {
            const x0 = S / 2 + (Math.random() - 0.5) * S * 0.5;
            ctx.lineWidth = 1 + Math.random() * 1.6;
            ctx.beginPath();
            ctx.moveTo(x0, S);
            ctx.quadraticCurveTo(
                x0 + (Math.random() - 0.5) * 22, S * 0.5,
                x0 + (Math.random() - 0.5) * 40, S * (0.05 + Math.random() * 0.35)
            );
            ctx.stroke();
        }
        this._scrubTex = new THREE.CanvasTexture(c);
        return this._scrubTex;
    },

    _stall(parent, x, z) {
        const g = new THREE.Group();
        const postMat = new THREE.MeshLambertMaterial({ color: 0x6b4f2f });
        for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.6, 5), postMat);
            p.position.set(x + dx, 1.3, z + dz);
            p.castShadow = true;
            g.add(p);
        }
        const cloth = new THREE.Mesh(
            new THREE.BoxGeometry(4.8, 0.12, 4.8),
            new THREE.MeshLambertMaterial({ color: [0x9c3f2e, 0x2f5d7c, 0xb8892f][Math.abs(Math.round(x)) % 3] })
        );
        cloth.position.set(x, 2.65, z);
        cloth.castShadow = true;
        g.add(cloth);
        parent.add(g);
    },

    // The wells were what made Timbuktu worth stopping at.
    _addWell() {
        const g = new THREE.Group();
        const X = 6, Z = 4;

        const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.95, 20), this._adobe(-0.04));
        ring.position.set(X, 0.46, Z);
        ring.castShadow = true; ring.receiveShadow = true;
        g.add(ring);

        // dark shaft, so it reads as a hole rather than a drum
        const shaft = new THREE.Mesh(
            new THREE.CylinderGeometry(1.32, 1.32, 0.5, 20),
            new THREE.MeshBasicMaterial({ color: 0x140d06 })
        );
        shaft.position.set(X, 0.68, Z);
        g.add(shaft);

        const lip = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.13, 8, 22), this._adobe(0.03));
        lip.position.set(X, 0.94, Z);
        lip.rotation.x = Math.PI / 2;
        lip.castShadow = true;
        g.add(lip);

        // A-frame and windlass
        const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
        [-1, 1].forEach(s => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.5, 7), wood);
            post.position.set(X + s * 1.5, 1.25, Z);
            post.rotation.z = s * 0.13;
            post.castShadow = true;
            g.add(post);
        });
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 3.2, 7), wood);
        beam.position.set(X, 2.44, Z);
        beam.rotation.z = Math.PI / 2;
        beam.castShadow = true;
        g.add(beam);

        // rope and bucket
        const rope = new THREE.Mesh(
            new THREE.CylinderGeometry(0.022, 0.022, 1.15, 5),
            new THREE.MeshLambertMaterial({ color: 0xcbb68d })
        );
        rope.position.set(X + 0.35, 1.88, Z);
        g.add(rope);
        const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.3, 10), wood);
        bucket.position.set(X + 0.35, 1.18, Z);
        bucket.castShadow = true;
        g.add(bucket);

        this.scene.add(g);
        this._collider(X, Z, 3.2, 3.2);
    },

    // ---------- Atmosphere ----------
    //
    // Airborne dust. Cheap (one Points draw) and it does more for the sense of
    // heat and distance than any amount of extra geometry.
    _addDust() {
        const COUNT = 900;
        const pos = new Float32Array(COUNT * 3);
        this._dustSpan = 150;
        for (let i = 0; i < COUNT; i++) {
            pos[i * 3]     = (Math.random() - 0.5) * this._dustSpan;
            pos[i * 3 + 1] = Math.random() * 14;
            pos[i * 3 + 2] = (Math.random() - 0.5) * this._dustSpan;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.26,
            map: this._makeGlowTexture(),
            color: 0xfaeacb,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
            blending: THREE.NormalBlending,
            sizeAttenuation: true
        });

        this.dust = new THREE.Points(geo, mat);
        this.dust.frustumCulled = false;
        this.scene.add(this.dust);
    },

    // Drifts the dust on the wind and keeps the cloud centred on the player so
    // a small particle count covers the whole world.
    _updateDust(dt) {
        if (!this.dust) return;
        const p = this.dust.geometry.attributes.position;
        const span = this._dustSpan, half = span / 2;
        const a = p.array;
        for (let i = 0; i < a.length; i += 3) {
            a[i]     += dt * 2.6;                                   // wind, +X
            a[i + 1] += dt * 0.25 * Math.sin((a[i] + a[i + 2]) * 0.1);
            a[i + 2] += dt * 0.8;

            // wrap into the box centred on the player
            if (a[i]     - this.pos.x >  half) a[i]     -= span;
            if (a[i]     - this.pos.x < -half) a[i]     += span;
            if (a[i + 2] - this.pos.z >  half) a[i + 2] -= span;
            if (a[i + 2] - this.pos.z < -half) a[i + 2] += span;
            if (a[i + 1] > 14) a[i + 1] = 0;
            if (a[i + 1] < 0) a[i + 1] = 14;
        }
        p.needsUpdate = true;
    },

    _addPalms() {
        const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a34 });
        const frondMat = new THREE.MeshLambertMaterial({ color: 0x4e6b2f, side: THREE.DoubleSide });
        const spots = [[-14, 14], [16, -6], [-8, -22], [22, 34], [-42, 12], [44, 4], [-20, 44], [12, 40]];
        spots.forEach(([x, z]) => {
            const g = new THREE.Group();
            const h = 5 + (Math.abs(x * z) % 3);
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, h, 6), trunkMat);
            trunk.position.set(x, h / 2, z);
            trunk.castShadow = true;
            g.add(trunk);
            for (let i = 0; i < 7; i++) {
                const f = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), frondMat);
                const a = (i / 7) * Math.PI * 2;
                f.position.set(x + Math.cos(a) * 1.5, h + 0.2, z + Math.sin(a) * 1.5);
                f.rotation.set(-0.5, -a, 0.25);
                f.castShadow = true;
                g.add(f);
            }
            this.scene.add(g);
            this._collider(x, z, 1, 1);
        });
    },

    // Cairns marking where the town ends and the Sahara starts.
    _addGateMarkers() {
        const mat = this._adobe(-0.06);
        for (let i = 0; i < 28; i++) {
            const a = (i / 28) * Math.PI * 2;
            const x = Math.cos(a) * this.TOWN_RADIUS;
            const z = Math.sin(a) * this.TOWN_RADIUS;
            const c = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 6), mat);
            c.position.set(x, this.groundHeight(x, z) + 1.1, z);
            c.castShadow = true;
            this.scene.add(c);
        }
    },

    // ---------- Signage & labels ----------

    _makeLabelTexture(text, sub) {
        const pad = 26, fs = 44, subFs = 28;
        const probe = document.createElement('canvas').getContext('2d');
        probe.font = `600 ${fs}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        const w1 = probe.measureText(text).width;
        probe.font = `500 ${subFs}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        const w2 = sub ? probe.measureText(sub).width : 0;

        const c = document.createElement('canvas');
        c.width = Math.ceil(Math.max(w1, w2)) + pad * 2;
        c.height = sub ? 118 : 76;
        const ctx = c.getContext('2d');

        ctx.fillStyle = 'rgba(38, 24, 12, 0.78)';
        const r = 16;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.arcTo(c.width, 0, c.width, c.height, r);
        ctx.arcTo(c.width, c.height, 0, c.height, r);
        ctx.arcTo(0, c.height, 0, 0, r);
        ctx.arcTo(0, 0, c.width, 0, r);
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#f6e2be';
        ctx.font = `600 ${fs}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(text, c.width / 2, sub ? 48 : 52);
        if (sub) {
            ctx.fillStyle = '#d5b184';
            ctx.font = `500 ${subFs}px -apple-system, "Segoe UI", Roboto, sans-serif`;
            ctx.fillText(sub, c.width / 2, 92);
        }
        const tex = new THREE.CanvasTexture(c);
        tex.minFilter = THREE.LinearFilter;
        return { tex, aspect: c.width / c.height };
    },

    // sizeAttenuation:false pins a sprite to a constant fraction of the
    // viewport, the way a nameplate should behave. Without it a label that
    // reads well at 30m fills the screen at 3m.
    // screen height fraction ≈ scale.y / tan(fov/2) / 2
    _screenSprite(tex, aspect, screenFrac) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, transparent: true, depthTest: true, sizeAttenuation: false
        }));
        const h = screenFrac * 2 * Math.tan(THREE.MathUtils.degToRad(72 / 2));
        sp.scale.set(h * aspect, h, 1);
        return sp;
    },

    _sign(text, x, y, z) {
        const { tex, aspect } = this._makeLabelTexture(text);
        const sp = this._screenSprite(tex, aspect, 0.030);
        sp.position.set(x, y, z);
        this.scene.add(sp);
        this.labels.push({ sprite: sp, fadeStart: 38, fadeEnd: 62 });
        return sp;
    },

    // Labels are useful up close and clutter the horizon at range.
    _updateLabels() {
        for (const l of this.labels) {
            const d = Math.hypot(l.sprite.position.x - this.pos.x, l.sprite.position.z - this.pos.z);
            const t = (d - l.fadeStart) / (l.fadeEnd - l.fadeStart);
            const o = 1 - Math.max(0, Math.min(1, t));
            l.sprite.material.opacity = o;
            l.sprite.visible = o > 0.01;
        }
    },

    // ---------- NPCs ----------

    // A boubou-clad figure: wide robe, sleeves, shoulder shawl, turban.
    _person(robeColor, turbanColor) {
        const g = new THREE.Group();
        const robeMat = new THREE.MeshLambertMaterial({ color: robeColor });
        const shawlMat = new THREE.MeshLambertMaterial({
            color: new THREE.Color(robeColor).offsetHSL(0, 0.04, -0.08)
        });
        const skinMat = new THREE.MeshLambertMaterial({ color: 0x6b4426 });
        const clothMat = new THREE.MeshLambertMaterial({ color: turbanColor });

        // The boubou flares from the shoulders to the ground.
        const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.80, 1.52, 14), robeMat);
        robe.position.y = 0.76;
        robe.castShadow = true;
        robe.receiveShadow = true;
        g.add(robe);

        // hem, slightly proud of the robe so it catches a shadow line
        const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.84, 0.1, 14), shawlMat);
        hem.position.y = 0.05;
        hem.castShadow = true;
        g.add(hem);

        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.40, 0.5, 12), robeMat);
        torso.position.y = 1.68;
        torso.castShadow = true;
        g.add(torso);

        // shawl draped over the shoulders
        const shawl = new THREE.Mesh(new THREE.SphereGeometry(0.40, 14, 10), shawlMat);
        shawl.position.y = 1.80;
        shawl.scale.set(1.05, 0.52, 0.92);
        shawl.castShadow = true;
        g.add(shawl);

        // sleeves
        [-1, 1].forEach(s => {
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.16, 0.66, 8), robeMat);
            arm.position.set(s * 0.34, 1.52, 0);
            arm.rotation.z = s * 0.20;
            arm.castShadow = true;
            g.add(arm);
            const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), skinMat);
            hand.position.set(s * 0.42, 1.20, 0);
            g.add(hand);
        });

        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.12, 8), skinMat);
        neck.position.y = 1.97;
        g.add(neck);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 12), skinMat);
        head.position.y = 2.10;
        head.scale.set(0.92, 1.1, 1);
        head.castShadow = true;
        g.add(head);

        // Tagelmust: wound band plus a crown and a tail down the back.
        const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.062, 8, 16), clothMat);
        wrap.position.y = 2.17;
        wrap.rotation.x = Math.PI / 2;
        wrap.castShadow = true;
        g.add(wrap);

        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.163, 12, 10), clothMat);
        crown.position.y = 2.21;
        crown.scale.y = 0.72;
        crown.castShadow = true;
        g.add(crown);

        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.05), clothMat);
        tail.position.set(0, 1.98, -0.15);
        tail.rotation.x = -0.18;
        tail.castShadow = true;
        g.add(tail);

        return g;
    },

    _buildNPCs() {
        const defs = [
            // Stands in the open in front of the market stalls, not inside one.
            { id: 'merchant', name: 'Fatoumata Cissé', role: 'Provisioner',  robe: 0xb5622f, turban: 0xe8d9bb, x: 24,  z: 1,   face: -2.5 },
            { id: 'camels',   name: 'Amadou ag Ibrahim', role: 'Camel Trader', robe: 0x2f4d7a, turban: 0x3c66a0, x: -22, z: 16,  face: 2.2 },
            { id: 'scholar',  name: 'Sidi al-Bakri',  role: 'Scholar of Sankore', robe: 0xefe4cc, turban: 0xd8c49a, x: 27, z: -13, face: -2.6 }
        ];

        defs.forEach(d => {
            const g = this._person(d.robe, d.turban);
            g.position.set(d.x, this.groundHeight(d.x, d.z), d.z);
            g.rotation.y = d.face;
            this.scene.add(g);

            const { tex, aspect } = this._makeLabelTexture(d.name, d.role);
            const sp = this._screenSprite(tex, aspect, 0.034);
            sp.position.set(d.x, this.groundHeight(d.x, d.z) + 2.72, d.z);
            this.scene.add(sp);
            this.labels.push({ sprite: sp, fadeStart: 22, fadeEnd: 40 });

            this.npcs.push({ ...d, group: g, label: sp });
            this._collider(d.x, d.z, 1.2, 1.2);
        });
    },

    // ---------- Camel ----------

    // A dromedary, built along +X so atan2-based heading works directly.
    _buildCamel() {
        const g = new THREE.Group();
        const hide = new THREE.MeshLambertMaterial({ color: 0xbe956a });
        const hideDark = new THREE.MeshLambertMaterial({ color: 0xa07a52 });

        const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), hide);
        body.scale.set(1.55, 0.86, 0.78);
        body.position.y = 1.72;
        body.castShadow = true;
        body.receiveShadow = true;
        g.add(body);

        // chest, deeper than the hindquarters
        const chest = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), hide);
        chest.scale.set(1.0, 1.0, 0.86);
        chest.position.set(0.82, 1.72, 0);
        chest.castShadow = true;
        g.add(chest);

        const hump = new THREE.Mesh(new THREE.SphereGeometry(0.56, 14, 12), hide);
        hump.position.set(-0.16, 2.38, 0);
        hump.scale.set(1.15, 1.0, 0.92);
        hump.castShadow = true;
        g.add(hump);

        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.33, 1.5, 10), hide);
        neck.position.set(1.34, 2.42, 0);
        neck.rotation.z = -0.62;
        neck.castShadow = true;
        g.add(neck);

        const headGrp = new THREE.Group();
        headGrp.position.set(1.86, 3.02, 0);
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), hide);
        skull.scale.set(1.05, 0.95, 0.9);
        skull.castShadow = true;
        headGrp.add(skull);
        const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.15, 0.44, 8), hide);
        muzzle.position.set(0.26, -0.10, 0);
        muzzle.rotation.z = -1.25;
        muzzle.castShadow = true;
        headGrp.add(muzzle);
        [-1, 1].forEach(s => {
            const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.15, 6), hideDark);
            ear.position.set(-0.10, 0.21, s * 0.13);
            headGrp.add(ear);
        });
        g.add(headGrp);

        // Legs with a knee break, so they read as legs rather than posts.
        const legAt = (lx, lz, front) => {
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.95, 7), hide);
            upper.position.set(lx, 1.22, lz);
            upper.rotation.z = front ? 0.07 : -0.07;
            upper.castShadow = true;
            g.add(upper);
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.062, 0.86, 6), hide);
            lower.position.set(lx + (front ? 0.05 : -0.05), 0.44, lz);
            lower.castShadow = true;
            g.add(lower);
            const foot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), hideDark);
            foot.scale.set(1.1, 0.5, 1);
            foot.position.set(lx + (front ? 0.06 : -0.06), 0.07, lz);
            g.add(foot);
        };
        legAt(0.78, 0.42, true); legAt(0.78, -0.42, true);
        legAt(-0.80, 0.44, false); legAt(-0.80, -0.44, false);

        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.02, 0.7, 5), hideDark);
        tail.position.set(-1.52, 1.62, 0);
        tail.rotation.z = 0.5;
        g.add(tail);

        // Saddle: blanket, wooden frame, and slung packs.
        const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.1, 1.5),
            new THREE.MeshLambertMaterial({ color: 0x8c2f2a }));
        blanket.position.set(-0.14, 2.66, 0);
        blanket.castShadow = true;
        g.add(blanket);

        const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.86),
            new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
        saddle.position.set(-0.14, 2.82, 0);
        saddle.castShadow = true;
        g.add(saddle);

        [-1, 1].forEach(s => {
            const pack = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.5, 0.3),
                new THREE.MeshLambertMaterial({ color: 0xb08a52 }));
            pack.position.set(-0.34, 2.16, s * 0.74);
            pack.castShadow = true;
            g.add(pack);
        });

        g.visible = false;
        this.scene.add(g);
        this.camel = g;
        this.camelPos = { x: -18, z: 20 };
        this._camelHeading = undefined;
    },

    // ---------- Input ----------

    _bindInput() {
        this._onKeyDown = e => {
            if (!this.mounted) return;
            const k = e.key.toLowerCase();
            this.keys[k] = true;
            if (k === 'e' && this.state === 'playing') { e.preventDefault(); this._interact(); }
            if (['w', 'a', 's', 'd', ' '].includes(k) && this.state === 'playing') e.preventDefault();
        };
        this._onKeyUp = e => { this.keys[e.key.toLowerCase()] = false; };

        this._onMouseMove = e => {
            if (this.state !== 'playing' || document.pointerLockElement !== this.canvas) return;
            this.yaw -= e.movementX * 0.0022;
            this.pitch -= e.movementY * 0.0022;
            this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));
        };

        this._onCanvasClick = () => {
            if (this.state === 'playing' && document.pointerLockElement !== this.canvas) {
                this._grabMouse();
            }
        };

        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        document.addEventListener('mousemove', this._onMouseMove);
        this.canvas.addEventListener('click', this._onCanvasClick);

        if (this._isTouch()) this._bindTouch();
    },

    _bindTouch() {
        const stick = this.dom.stick, nub = this.dom.stickNub;
        let stickId = null, lookId = null, lastLook = null, origin = null;

        this._onTouchStart = e => {
            if (this.state !== 'playing') return;
            for (const t of e.changedTouches) {
                const r = stick.getBoundingClientRect();
                const inStick = t.clientX >= r.left - 30 && t.clientX <= r.right + 30 &&
                                t.clientY >= r.top - 30 && t.clientY <= r.bottom + 30;
                if (inStick && stickId === null) {
                    stickId = t.identifier;
                    origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                } else if (lookId === null) {
                    lookId = t.identifier;
                    lastLook = { x: t.clientX, y: t.clientY };
                }
            }
        };
        this._onTouchMove = e => {
            if (this.state !== 'playing') return;
            for (const t of e.changedTouches) {
                if (t.identifier === stickId && origin) {
                    const dx = t.clientX - origin.x, dy = t.clientY - origin.y;
                    const max = 46;
                    const len = Math.hypot(dx, dy) || 1;
                    const cl = Math.min(len, max);
                    const nx = (dx / len) * cl, ny = (dy / len) * cl;
                    nub.style.transform = `translate(${nx}px, ${ny}px)`;
                    this.touchMove.x = nx / max;
                    this.touchMove.y = ny / max;
                } else if (t.identifier === lookId && lastLook) {
                    this.yaw -= (t.clientX - lastLook.x) * 0.006;
                    this.pitch -= (t.clientY - lastLook.y) * 0.006;
                    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));
                    lastLook = { x: t.clientX, y: t.clientY };
                }
            }
            e.preventDefault();
        };
        this._onTouchEnd = e => {
            for (const t of e.changedTouches) {
                if (t.identifier === stickId) {
                    stickId = null; origin = null;
                    this.touchMove.x = this.touchMove.y = 0;
                    nub.style.transform = 'translate(0,0)';
                } else if (t.identifier === lookId) { lookId = null; lastLook = null; }
            }
        };

        this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', this._onTouchEnd);
        this.canvas.addEventListener('touchcancel', this._onTouchEnd);
        stick.addEventListener('touchstart', this._onTouchStart, { passive: false });
        stick.addEventListener('touchmove', this._onTouchMove, { passive: false });
        stick.addEventListener('touchend', this._onTouchEnd);
    },

    _unbindInput() {
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        document.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('resize', this._onResize);
        this.canvas?.removeEventListener('click', this._onCanvasClick);
    },

    _onResize() {
        if (!this.renderer || !this.container) return;
        const w = this.container.clientWidth, h = this.container.clientHeight;
        if (!w || !h) return;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    },

    // ---------- Flow ----------

    _begin() {
        this.dom.intro.classList.add('hidden');
        this.state = 'playing';
        this._grabMouse();
    },

    _restart() {
        this.dom.death.classList.add('hidden');
        this.resetState();
        this.state = 'playing';
        if (this.camel) this.camel.visible = false;
        this.camelPos = { x: -18, z: 20 };
        this.dom.vignette.style.opacity = 0;
        this.dom.timer.classList.add('hidden');
        this.dom.questBanner.classList.add('hidden');
        this._renderHUD();
        this._grabMouse();
    },

    _die(reason) {
        this.state = 'dead';
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
        this.dom.deathText.textContent = reason;
        this.dom.death.classList.remove('hidden');
        this.dom.timer.classList.add('hidden');
    },

    _toast(msg) {
        const t = this.dom.toast;
        t.textContent = msg;
        t.classList.remove('hidden');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
    },

    // ---------- Interaction ----------

    // requestPointerLock throws (sync in older Chrome, rejected promise in
    // newer) when the document can't take the lock — embedded in an iframe,
    // not the active document, or the user just pressed Esc. Mouse look simply
    // doesn't engage in that case; it must never break the calling handler.
    _grabMouse() {
        if (this._isTouch() || !this.canvas) return;
        try {
            const r = this.canvas.requestPointerLock();
            if (r && typeof r.catch === 'function') r.catch(() => {});
        } catch (e) {
            /* pointer lock unavailable — keyboard movement still works */
        }
    },

    _nearestNPC() {
        let best = null, bestD = 4.2;
        for (const n of this.npcs) {
            const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z);
            if (d < bestD) { bestD = d; best = n; }
        }
        return best;
    },

    _interact() {
        const npc = this._nearestNPC();
        if (!npc) return;
        this.activeNPC = npc;
        this.state = 'panel';
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
        this._renderPanel();
        this.dom.panel.classList.remove('hidden');
    },

    _closePanel() {
        this.dom.panel.classList.add('hidden');
        this.activeNPC = null;
        if (this.state === 'panel') {
            this.state = 'playing';
            this._grabMouse();
        }
    },

    _renderPanel() {
        const npc = this.activeNPC;
        if (!npc) return;
        let body = '';

        if (npc.id === 'merchant') {
            body = `
            <p class="dg-speech">"Peace be upon you. You'll not last three days out there on hope alone — take what the caravans take."</p>
            <div class="dg-shop">${this.PRODUCTS.map(p => {
                const owned = !!this.owned[p.id];
                const afford = this.cowries >= p.price;
                return `<div class="dg-item ${owned ? 'owned' : ''}">
                    <span class="dg-item-icon">${p.icon}</span>
                    <span class="dg-item-body">
                        <span class="dg-item-name">${p.name}</span>
                        <span class="dg-item-note">${p.note}</span>
                    </span>
                    ${owned
                        ? '<span class="dg-owned">✓ packed</span>'
                        : `<button class="dg-buy" data-buy="${p.id}" ${afford ? '' : 'disabled'}>${p.price} 🐚</button>`}
                </div>`;
            }).join('')}</div>
            ${this.hasAllProducts() ? '<p class="dg-ready">Fully provisioned. The gate guards will let you pass.</p>' : ''}`;
        }

        else if (npc.id === 'camels') {
            body = `
            <p class="dg-speech">"A good bull camel drinks his fill and walks ten days after. Cheaper than burying you."</p>
            <div class="dg-shop">
                <div class="dg-item ${this.hasCamel ? 'owned' : ''}">
                    <span class="dg-item-icon">🐪</span>
                    <span class="dg-item-body">
                        <span class="dg-item-name">Bull Camel</span>
                        <span class="dg-item-note">Saddled, watered, and used to the Taghaza road.</span>
                    </span>
                    ${this.hasCamel
                        ? '<span class="dg-owned">✓ yours</span>'
                        : `<button class="dg-buy" data-buy="camel" ${this.cowries >= this.CAMEL_PRICE ? '' : 'disabled'}>${this.CAMEL_PRICE} 🐚</button>`}
                </div>
            </div>
            ${this.hasCamel ? '<p class="dg-ready">He follows you now. Mind that he keeps up.</p>' : ''}`;
        }

        else {
            body = `
            <p class="dg-speech">"Timbuktu keeps more books than gold, but the gold pays for the books. Choose a road and I will write you a commission."</p>
            <div class="dg-quests">${this.QUESTS.map(q => {
                const taken = this.quest && this.quest.id === q.id;
                return `<div class="dg-quest ${taken ? 'taken' : ''}">
                    <div class="dg-quest-head">
                        <span class="dg-quest-name">${q.name}</span>
                        <span class="dg-quest-dir">${q.heading}</span>
                    </div>
                    <p class="dg-quest-blurb">${q.blurb}</p>
                    <div class="dg-quest-foot">
                        <span class="dg-quest-reward">${q.reward} 🐚 on delivery</span>
                        ${taken
                            ? '<span class="dg-owned">✓ accepted</span>'
                            : `<button class="dg-buy" data-quest="${q.id}">Accept</button>`}
                    </div>
                </div>`;
            }).join('')}</div>`;
        }

        this.dom.panelCard.innerHTML = `
            <button class="dg-close" type="button" aria-label="Close">✕</button>
            <div class="dg-kicker">${npc.role}</div>
            <h3>${npc.name}</h3>
            ${body}
            <div class="dg-purse-line">Purse: <strong>${this.cowries.toLocaleString()}</strong> cowries</div>`;

        this.dom.panelCard.querySelector('.dg-close').addEventListener('click', () => this._closePanel());
        this.dom.panelCard.querySelectorAll('[data-buy]').forEach(b =>
            b.addEventListener('click', () => this._buy(b.dataset.buy)));
        this.dom.panelCard.querySelectorAll('[data-quest]').forEach(b =>
            b.addEventListener('click', () => this._acceptQuest(b.dataset.quest)));
    },

    _buy(id) {
        if (id === 'camel') {
            if (this.hasCamel || this.cowries < this.CAMEL_PRICE) return;
            this.cowries -= this.CAMEL_PRICE;
            this.hasCamel = true;
            this.camel.visible = true;
            this._toast('The camel is yours. He follows at your heel.');
        } else {
            const p = this.PRODUCTS.find(x => x.id === id);
            if (!p || this.owned[id] || this.cowries < p.price) return;
            this.cowries -= p.price;
            this.owned[id] = true;
            this._toast(`${p.name} — packed.`);
            if (this.hasAllProducts()) {
                this._toast('Fully provisioned. The gate guards will let you pass.');
            }
        }
        this._renderHUD();
        this._renderPanel();
    },

    _acceptQuest(id) {
        const q = this.QUESTS.find(x => x.id === id);
        if (!q) return;
        this.quest = q;
        this.dom.questBanner.innerHTML = `<span class="dg-quest-label">Commission</span> ${q.name} · <span class="dg-quest-heading">${q.heading}</span>`;
        this.dom.questBanner.classList.remove('hidden');
        this._toast(`Commission accepted: ${q.name}, to the ${q.heading}.`);
        this._renderPanel();
    },

    _renderHUD() {
        this.dom.cowries.textContent = this.cowries.toLocaleString();
        this.dom.kit.innerHTML = this.PRODUCTS.map(p =>
            `<span class="dg-kit-item ${this.owned[p.id] ? 'has' : ''}" title="${p.name}">${p.icon}</span>`
        ).join('') + `<span class="dg-kit-item dg-kit-camel ${this.hasCamel ? 'has' : ''}" title="Camel">🐪</span>`;
    },

    // ---------- Simulation ----------

    _update(dt) {
        if (this.state !== 'playing') return;

        // --- movement ---
        let fwd = 0, strafe = 0;
        if (this.keys['w'] || this.keys['arrowup']) fwd += 1;
        if (this.keys['s'] || this.keys['arrowdown']) fwd -= 1;
        if (this.keys['a'] || this.keys['arrowleft']) strafe -= 1;
        if (this.keys['d'] || this.keys['arrowright']) strafe += 1;
        if (this.touchMove.x || this.touchMove.y) {
            strafe += this.touchMove.x;
            fwd -= this.touchMove.y;
        }

        const mag = Math.hypot(fwd, strafe);
        if (mag > 1) { fwd /= mag; strafe /= mag; }

        const speed = (this.keys['shift'] ? this.RUN_SPEED : this.WALK_SPEED);
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        // yaw 0 looks down -Z
        const dx = (-sin * fwd + cos * strafe) * speed * dt;
        const dz = (-cos * fwd - sin * strafe) * speed * dt;

        let nx = this.pos.x + dx, nz = this.pos.z + dz;
        ({ x: nx, z: nz } = this._resolveCollisions(nx, nz));

        // --- the gate: unprovisioned travellers are turned back ---
        const distNew = Math.hypot(nx, nz);
        if (distNew > this.TOWN_RADIUS && !this.hasAllProducts()) {
            const k = this.TOWN_RADIUS / distNew;
            nx *= k; nz *= k;
            if (!this._gateWarned || performance.now() - this._gateWarned > 3000) {
                this._gateWarned = performance.now();
                this._toast('A gate guard turns you back: "Not without provisions, traveller."');
            }
        }

        this.pos.x = nx;
        this.pos.z = nz;
        this.pos.y = this.groundHeight(nx, nz);

        // --- camera ---
        this.camera.position.set(this.pos.x, this.pos.y + this.EYE_HEIGHT, this.pos.z);
        this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

        // --- camel follows ---
        if (this.hasCamel) this._updateCamel(dt);

        this._updateLabels();
        this._updateDust(dt);

        // --- exposure ---
        const dist = Math.hypot(this.pos.x, this.pos.z);
        const wasOutside = this.outside;
        this.outside = dist > this.TOWN_RADIUS;

        if (this.outside) {
            if (!wasOutside) {
                this.exposure = 0;
                this.dom.timer.classList.remove('hidden');
                this._toast(this.hasCamel
                    ? 'You pass the last cairn, camel in tow. The city falls behind.'
                    : 'You pass the last cairn on foot. The city falls behind.');
            }
            this.exposure += dt;
            const left = Math.max(0, this.SURVIVE_SECONDS - this.exposure);
            this.dom.timerCount.textContent = Math.ceil(left);
            this.dom.timerFill.style.width = (left / this.SURVIVE_SECONDS * 100) + '%';
            this.dom.vignette.style.opacity = Math.min(0.85, this.exposure / this.SURVIVE_SECONDS);
            if (left <= 0) this._die(this._deathText());
        } else if (wasOutside) {
            this.exposure = 0;
            this.dom.timer.classList.add('hidden');
            this.dom.vignette.style.opacity = 0;
            this._toast('Back within the cairns. The wells are close.');
        }

        // --- interaction prompt ---
        const npc = this._nearestNPC();
        this.dom.reticle.classList.toggle('active', !!npc);
        if (npc) {
            this.dom.prompt.innerHTML = this._isTouch()
                ? `Speak with <strong>${npc.name}</strong>`
                : `<kbd>E</kbd> speak with <strong>${npc.name}</strong>`;
            this.dom.prompt.classList.remove('hidden');
            this.dom.touchInteract.classList.toggle('hidden', !this._isTouch());
        } else {
            this.dom.prompt.classList.add('hidden');
            this.dom.touchInteract.classList.add('hidden');
        }
    },

    _deathText() {
        const where = this.quest ? `on the road to ${this.quest.name}` : 'with no road in mind';
        const beast = this.hasCamel
            ? 'Your camel stands over you a while, then walks on alone.'
            : 'You had no camel, and no shade but your own shadow.';
        return `The heat took you ${where}, out past the last cairn of Timbuktu. ${beast}`;
    },

    _resolveCollisions(x, z) {
        const r = 0.6;
        for (const c of this.colliders) {
            const dx = x - c.x, dz = z - c.z;
            const px = c.hw + r - Math.abs(dx);
            const pz = c.hd + r - Math.abs(dz);
            if (px > 0 && pz > 0) {
                // push out along the shallower axis
                if (px < pz) x = c.x + Math.sign(dx || 1) * (c.hw + r);
                else z = c.z + Math.sign(dz || 1) * (c.hd + r);
            }
        }
        return { x, z };
    },

    // The camel trails at your shoulder rather than steering at your face, so
    // it stays out of the view and reads as being led.
    _updateCamel(dt) {
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);   // player forward
        const rx = -fz, rz = fx;                                    // player right
        const tx = this.pos.x - fx * 3.6 + rx * 2.2;
        const tz = this.pos.z - fz * 3.6 + rz * 2.2;

        const dx = tx - this.camelPos.x, dz = tz - this.camelPos.z;
        const d = Math.hypot(dx, dz);
        const deadzone = 0.6;

        if (d > deadzone) {
            const step = Math.min(d - deadzone, this.WALK_SPEED * 1.05 * dt);
            this.camelPos.x += (dx / d) * step;
            this.camelPos.z += (dz / d) * step;
            this._camelHeading = Math.atan2(dx, dz) - Math.PI / 2;
        }

        // ease toward the heading so it doesn't snap around when you turn
        if (this._camelHeading !== undefined) {
            let diff = this._camelHeading - this.camel.rotation.y;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            this.camel.rotation.y += diff * Math.min(1, dt * 6);
        }

        this.camel.position.set(
            this.camelPos.x,
            this.groundHeight(this.camelPos.x, this.camelPos.z),
            this.camelPos.z
        );
        // gait bob, only while actually walking
        if (d > deadzone) {
            this.camel.position.y += Math.abs(Math.sin(performance.now() * 0.008)) * 0.07;
        }
    },

    _loop() {
        if (!this.mounted) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - this._lastTime) / 1000);
        this._lastTime = now;
        this._update(dt);
        this.renderer.render(this.scene, this.camera);
        this._raf = requestAnimationFrame(this._loop);
    },

    _showIntro() {
        this.camera.position.set(this.pos.x, this.EYE_HEIGHT, this.pos.z);
        this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
};
