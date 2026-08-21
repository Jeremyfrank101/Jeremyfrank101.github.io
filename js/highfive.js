// highfive.js — "High Five": a top-down room, Zelda 1 style, shared live with
// everyone else signed in right now.
//
// Rendering is 2D canvas at a fixed low resolution scaled up with smoothing
// off, so the pixel art stays crisp and blocky. Sprites are drawn from string
// art at load, which keeps the whole game asset-free.
//
// Multiplayer rides Supabase Realtime broadcast. The presence API accepts
// track() on this project but never populates presenceState(), so who-is-here
// is derived from the position broadcasts instead: a "hello" on join, a "bye"
// on leave, and a 12Hz position ping that doubles as a heartbeat. Anyone who
// stops pinging is dropped after a few seconds, which also covers a tab that
// closed without saying goodbye.

const HighFive = {
    // Internal resolution. The canvas is scaled to fit, so the world is the
    // same size for everyone regardless of window.
    W: 320,
    H: 200,
    TILE: 16,
    SPEED: 62,           // px per second
    TOUCH_DIST: 13,      // how close counts as a high five
    COOLDOWN: 2200,      // ms before the same pair can high five again
    SEND_HZ: 12,

    CHANNEL: 'highfive-room',

    // 16x16 pixel art. '.' is transparent; other characters index the palette.
    // One body, three palettes and three hats, so the three options read as
    // clearly different people at a glance.
    ART: [
        '....HHHHHH......',
        '...HHHHHHHH.....',
        '...HSSSSSSH.....',
        '...SSKSSKSS.....',
        '...SSSSSSSS.....',
        '....SSMMSS......',
        '.....SSSS.......',
        '...BBBBBBBB.....',
        '..BBBBBBBBBB....',
        '..SBBBBBBBBS....',
        '..SBBBBBBBBS....',
        '...BBBBBBBB.....',
        '...BB....BB.....',
        '...PP....PP.....',
        '...PP....PP.....',
        '..FFF....FFF....'
    ],

    SPRITES: [
        { id: 'ochre',  name: 'Ochre',  hat: '#e0703a', body: '#d9552f', skin: '#8a5a3c', pants: '#3d3a52', feet: '#2b2733' },
        { id: 'teal',   name: 'Teal',   hat: '#2fa5a5', body: '#2f8f9e', skin: '#c98f63', pants: '#334', feet: '#222b33' },
        { id: 'violet', name: 'Violet', hat: '#8f5fd0', body: '#7048b8', skin: '#6b4426', pants: '#2f2b40', feet: '#241f30' }
    ],

    mounted: false,
    players: {},      // other people, keyed by user id
    _lastSent: 0,
    _flashes: [],     // floating "High five!" texts
    _cooldowns: {},

    // ---------- lifecycle ----------

    mount(container) {
        if (this.mounted) {
            if (this.container === container && document.body.contains(container)) return;
            this.unmount();
        }
        this.container = container;
        this.mounted = true;
        this.players = {};
        this._flashes = [];
        this._cooldowns = {};
        this.keys = {};
        this.touchVec = { x: 0, y: 0 };
        this.me = {
            x: this.W / 2,
            y: this.H / 2 + 24,
            facing: 'down',
            step: 0,
            sprite: this._rememberedSprite()
        };

        this._buildDOM();
        this._buildSprites();
        this._buildNPC();
        this._bindInput();

        this._last = performance.now();
        this._loop = this._loop.bind(this);
        this._raf = requestAnimationFrame(this._loop);
    },

    unmount() {
        if (!this.mounted) return;
        this.mounted = false;
        cancelAnimationFrame(this._raf);
        this._unbindInput();
        this._leaveChannel();
        if (this.container) this.container.innerHTML = '';
        this.container = null;
    },

    _rememberedSprite() {
        try { return localStorage.getItem('highfive_sprite') || null; } catch { return null; }
    },

    _rememberSprite(id) {
        try { localStorage.setItem('highfive_sprite', id); } catch (e) { /* private mode */ }
    },

    // ---------- DOM ----------

    _buildDOM() {
        this.container.innerHTML = `
        <div class="hf-root">
            <canvas class="hf-canvas" width="${this.W}" height="${this.H}"></canvas>

            <div class="hf-hud">
                <div class="hf-pill hf-here"><span class="hf-dot"></span><span class="hf-count">1</span> here</div>
                <div class="hf-pill hf-score">🙌 <span class="hf-total">0</span></div>
            </div>

            <div class="hf-roster"></div>
            <div class="hf-stick hidden"><div class="hf-stick-nub"></div></div>

            <div class="hf-overlay hf-pick">
                <div class="hf-card">
                    <h2>High Five</h2>
                    <p>Pick who you want to be. You will appear in the room with everyone else signed in right now — walk into someone to high five them.</p>
                    <div class="hf-sprites">
                        ${this.SPRITES.map(s => `
                            <button class="hf-sprite" data-sprite="${s.id}">
                                <canvas width="64" height="64" data-preview="${s.id}"></canvas>
                                <span>${s.name}</span>
                            </button>`).join('')}
                    </div>
                    <p class="hf-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows to move</p>
                </div>
            </div>
        </div>`;

        const q = s => this.container.querySelector(s);
        this.dom = {
            root: q('.hf-root'),
            canvas: q('.hf-canvas'),
            count: q('.hf-count'),
            total: q('.hf-total'),
            roster: q('.hf-roster'),
            pick: q('.hf-pick'),
            stick: q('.hf-stick'),
            nub: q('.hf-stick-nub')
        };
        this.ctx = this.dom.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        this.score = 0;

        this.container.querySelectorAll('[data-sprite]').forEach(b =>
            b.addEventListener('click', () => this._choose(b.dataset.sprite)));

        if (this._isTouch()) {
            this.dom.stick.classList.remove('hidden');
            this.dom.root.classList.add('hf-touch');
        }
    },

    _isTouch() {
        return window.matchMedia('(hover: none)').matches || 'ontouchstart' in window;
    },

    _choose(id) {
        this.me.sprite = id;
        this._rememberSprite(id);
        this.dom.pick.classList.add('hidden');
        this._joinChannel();
    },

    // ---------- sprite rendering ----------

    _buildSprites() {
        this.sheets = {};
        for (const s of this.SPRITES) {
            const c = document.createElement('canvas');
            c.width = 16; c.height = 16;
            const ctx = c.getContext('2d');
            const map = { H: s.hat, S: s.skin, B: s.body, P: s.pants, F: s.feet, K: '#1b1b22', M: '#5c3a2e' };
            this.ART.forEach((row, y) => {
                [...row].forEach((ch, x) => {
                    if (ch === '.') return;
                    ctx.fillStyle = map[ch] || '#000';
                    ctx.fillRect(x, y, 1, 1);
                });
            });
            this.sheets[s.id] = c;

            // preview in the picker, scaled 4x
            const pv = this.container.querySelector(`[data-preview="${s.id}"]`);
            if (pv) {
                const p = pv.getContext('2d');
                p.imageSmoothingEnabled = false;
                p.drawImage(c, 0, 0, 64, 64);
            }
        }
    },

    _spriteFor(id) {
        return this.sheets[id] || this.sheets[this.SPRITES[0].id];
    },

    // ---------- the NPC ----------
    //
    // Deterministic wander from a fixed seed, so everyone in the room sees
    // Bakary in roughly the same place without needing to sync him.

    _buildNPC() {
        this.npc = { x: this.W / 2, y: 64, facing: 'down', name: 'Bakary', sprite: 'ochre', t: 0, step: 0 };
    },

    _updateNPC(dt) {
        const n = this.npc;
        n.t += dt;
        const tx = this.W / 2 + Math.sin(n.t * 0.35) * 70;
        const ty = 62 + Math.cos(n.t * 0.24) * 30;
        const dx = tx - n.x, dy = ty - n.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.6) {
            const step = Math.min(d, 34 * dt);
            n.x += (dx / d) * step;
            n.y += (dy / d) * step;
            n.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
            n.step += dt * 8;
        }
    },

    // ---------- realtime ----------

    _joinChannel() {
        const user = Auth.getUser();
        if (!user || !Auth.client) { this._offline = true; return; }
        this.myId = user.id;
        this.myName = user.username || 'someone';

        this.channel = Auth.client.channel(this.CHANNEL);

        const upsert = (payload) => {
            if (!payload || payload.id === this.myId) return null;
            const p = this.players[payload.id] || (this.players[payload.id] = {
                x: this.W / 2, y: this.H / 2, facing: 'down', step: 0
            });
            if (payload.x !== undefined) { p.x = payload.x; p.y = payload.y; }
            if (payload.facing) p.facing = payload.facing;
            if (payload.sprite) p.sprite = payload.sprite;
            if (payload.name) p.name = payload.name;
            p.seen = performance.now();
            return p;
        };

        this.channel
            .on('broadcast', { event: 'hello' }, ({ payload }) => {
                if (!upsert(payload)) return;
                this._renderRoster();
                // Answer a newcomer so they learn about us immediately rather
                // than waiting for our next position ping. reply:true stops
                // the two of us greeting each other forever.
                if (!payload.reply) this._sayHello(true);
            })
            .on('broadcast', { event: 'move' }, ({ payload }) => {
                const known = !!this.players[payload?.id];
                const p = upsert(payload);
                if (p) p.step = (p.step || 0) + 0.6;
                if (p && !known) this._renderRoster();
            })
            .on('broadcast', { event: 'bye' }, ({ payload }) => {
                if (!payload || payload.id === this.myId) return;
                delete this.players[payload.id];
                this._renderRoster();
            })
            .on('broadcast', { event: 'hifive' }, ({ payload }) => {
                // The other side initiated: celebrate here too, so both
                // players see the same moment.
                if (payload.to !== this.myId) return;
                this._celebrate(payload.x, payload.y, payload.fromName);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') this._sayHello(false);
            });
    },

    _sayHello(isReply) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast', event: 'hello',
            payload: {
                id: this.myId, name: this.myName, sprite: this.me.sprite,
                x: Math.round(this.me.x), y: Math.round(this.me.y),
                facing: this.me.facing, reply: !!isReply
            }
        });
    },

    _leaveChannel() {
        if (this.channel) {
            try {
                this.channel.send({ type: 'broadcast', event: 'bye', payload: { id: this.myId } });
                this.channel.unsubscribe();
            } catch (e) { /* already gone */ }
            this.channel = null;
        }
    },

    _renderRoster() {
        const others = Object.values(this.players);
        this.dom.count.textContent = others.length + 1;
        const names = others.map(p => p.name).filter(Boolean);
        this.dom.roster.innerHTML = names.length
            ? `<div class="hf-pill hf-names">${names.map(n => this._esc(n)).join(' · ')}</div>`
            : `<div class="hf-pill hf-names hf-alone">No one else online — Bakary is keeping you company</div>`;
    },

    _broadcastMove() {
        if (!this.channel) return;
        const now = performance.now();
        if (now - this._lastSent < 1000 / this.SEND_HZ) return;
        this._lastSent = now;
        this.channel.send({
            type: 'broadcast', event: 'move',
            payload: {
                id: this.myId,
                name: this.myName,
                sprite: this.me.sprite,
                x: Math.round(this.me.x), y: Math.round(this.me.y),
                facing: this.me.facing
            }
        });
    },

    // ---------- high fives ----------

    _checkTouches() {
        const now = performance.now();

        const tryPair = (key, other, name) => {
            const d = Math.hypot(other.x - this.me.x, other.y - this.me.y);
            if (d > this.TOUCH_DIST) return;
            if (this._cooldowns[key] && now - this._cooldowns[key] < this.COOLDOWN) return;
            this._cooldowns[key] = now;

            this._celebrate((this.me.x + other.x) / 2, (this.me.y + other.y) / 2 - 10, name);

            if (this.channel && key !== 'npc') {
                this.channel.send({
                    type: 'broadcast', event: 'hifive',
                    payload: {
                        to: key, fromName: this.myName,
                        x: Math.round(other.x), y: Math.round(other.y)
                    }
                });
            }
        };

        tryPair('npc', this.npc, this.npc.name);
        Object.entries(this.players).forEach(([id, p]) => tryPair(id, p, p.name));
    },

    _celebrate(x, y, withWhom) {
        this._flashes.push({ x, y, t: 0, text: 'High five!', who: withWhom });
        this.score++;
        this.dom.total.textContent = this.score;
        this._playSlap();
    },

    // A clap: a short filtered noise burst for the slap, plus two bright
    // tones for the ring. Generated so the game ships without audio files.
    _playSlap() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            this._audio = this._audio || new AC();
            const ac = this._audio;
            if (ac.state === 'suspended') ac.resume();
            const t0 = ac.currentTime;

            const len = Math.floor(ac.sampleRate * 0.14);
            const buf = ac.createBuffer(1, len, ac.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) {
                d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 5);
            }
            const noise = ac.createBufferSource();
            noise.buffer = buf;
            const bp = ac.createBiquadFilter();
            bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
            const ng = ac.createGain();
            ng.gain.setValueAtTime(0.5, t0);
            ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
            noise.connect(bp).connect(ng).connect(ac.destination);
            noise.start(t0);

            [880, 1320].forEach((f, i) => {
                const o = ac.createOscillator();
                const g = ac.createGain();
                o.type = 'triangle';
                o.frequency.setValueAtTime(f, t0 + i * 0.05);
                g.gain.setValueAtTime(0.0001, t0 + i * 0.05);
                g.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.05 + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.05 + 0.20);
                o.connect(g).connect(ac.destination);
                o.start(t0 + i * 0.05);
                o.stop(t0 + i * 0.05 + 0.22);
            });
        } catch (e) { /* audio is a nicety, never a failure */ }
    },

    // ---------- input ----------

    _bindInput() {
        this._onKey = (e, down) => {
            const k = e.key.toLowerCase();
            if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) {
                this.keys[k] = down;
                if (this.mounted && Apps.current === 'highfive') e.preventDefault();
            }
        };
        this._kd = e => this._onKey(e, true);
        this._ku = e => this._onKey(e, false);
        document.addEventListener('keydown', this._kd);
        document.addEventListener('keyup', this._ku);

        if (this._isTouch()) this._bindTouch();
    },

    _bindTouch() {
        const stick = this.dom.stick, nub = this.dom.nub;
        let id = null, origin = null;
        this._ts = e => {
            const t = e.changedTouches[0];
            const r = stick.getBoundingClientRect();
            id = t.identifier;
            origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            e.preventDefault();
        };
        this._tm = e => {
            for (const t of e.changedTouches) {
                if (t.identifier !== id || !origin) continue;
                const dx = t.clientX - origin.x, dy = t.clientY - origin.y;
                const max = 42, len = Math.hypot(dx, dy) || 1, cl = Math.min(len, max);
                const nx = (dx / len) * cl, ny = (dy / len) * cl;
                nub.style.transform = `translate(${nx}px, ${ny}px)`;
                this.touchVec = { x: nx / max, y: ny / max };
            }
            e.preventDefault();
        };
        this._te = () => {
            id = null; origin = null;
            this.touchVec = { x: 0, y: 0 };
            nub.style.transform = 'translate(0,0)';
        };
        stick.addEventListener('touchstart', this._ts, { passive: false });
        stick.addEventListener('touchmove', this._tm, { passive: false });
        stick.addEventListener('touchend', this._te);
        stick.addEventListener('touchcancel', this._te);
    },

    _unbindInput() {
        document.removeEventListener('keydown', this._kd);
        document.removeEventListener('keyup', this._ku);
    },

    // ---------- simulation ----------

    _update(dt) {
        if (!this.dom.pick.classList.contains('hidden')) return;   // still picking

        let dx = 0, dy = 0;
        if (this.keys['a'] || this.keys['arrowleft'])  dx -= 1;
        if (this.keys['d'] || this.keys['arrowright']) dx += 1;
        if (this.keys['w'] || this.keys['arrowup'])    dy -= 1;
        if (this.keys['s'] || this.keys['arrowdown'])  dy += 1;
        dx += this.touchVec.x; dy += this.touchVec.y;

        const mag = Math.hypot(dx, dy);
        if (mag > 1) { dx /= mag; dy /= mag; }

        if (dx || dy) {
            this.me.x += dx * this.SPEED * dt;
            this.me.y += dy * this.SPEED * dt;
            this.me.facing = Math.abs(dx) > Math.abs(dy)
                ? (dx > 0 ? 'right' : 'left')
                : (dy > 0 ? 'down' : 'up');
            this.me.step += dt * 9;
        }

        // walls
        const m = this.TILE + 4;
        this.me.x = Math.max(m, Math.min(this.W - m, this.me.x));
        this.me.y = Math.max(m + 6, Math.min(this.H - m, this.me.y));

        this._updateNPC(dt);
        this._checkTouches();
        this._broadcastMove();

        // drop players who stopped broadcasting (tab closed without presence)
        const now = performance.now();
        Object.entries(this.players).forEach(([k, p]) => {
            if (p.seen && now - p.seen > 6000) { delete this.players[k]; this._renderRoster(); }
        });

        for (const f of this._flashes) f.t += dt;
        this._flashes = this._flashes.filter(f => f.t < 1.6);
    },

    // ---------- rendering ----------

    _draw() {
        const ctx = this.ctx;
        const T = this.TILE;

        // floor
        ctx.fillStyle = '#caa877';
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        for (let y = 0; y < this.H; y += T) {
            for (let x = 0; x < this.W; x += T) {
                if (((x / T) + (y / T)) % 2 === 0) ctx.fillRect(x, y, T, T);
            }
        }

        // walls: a solid band with a lighter cap, Zelda-style
        ctx.fillStyle = '#6b4f34';
        ctx.fillRect(0, 0, this.W, T + 6);
        ctx.fillRect(0, this.H - T, this.W, T);
        ctx.fillRect(0, 0, T, this.H);
        ctx.fillRect(this.W - T, 0, T, this.H);
        ctx.fillStyle = '#8a6a47';
        ctx.fillRect(0, T + 2, this.W, 4);
        ctx.fillRect(0, this.H - T, this.W, 3);
        ctx.fillRect(T - 3, 0, 3, this.H);
        ctx.fillRect(this.W - T, 0, 3, this.H);

        // a rug, so the empty room has a centre
        ctx.fillStyle = 'rgba(180, 90, 70, 0.30)';
        ctx.fillRect(this.W / 2 - 40, this.H / 2 - 22, 80, 44);
        ctx.strokeStyle = 'rgba(120, 60, 45, 0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.W / 2 - 40, this.H / 2 - 22, 80, 44);

        // everyone, sorted by y so the nearer sprite overlaps
        const cast = [
            { ...this.npc, label: this.npc.name, npc: true },
            ...Object.values(this.players).map(p => ({ ...p, label: p.name })),
            { ...this.me, label: 'You', me: true }
        ].sort((a, b) => a.y - b.y);

        for (const c of cast) this._drawChar(c);

        // floating high-five text
        for (const f of this._flashes) {
            const alpha = 1 - (f.t / 1.6);
            const y = f.y - f.t * 22;
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#3a2411';
            ctx.fillText(f.text, f.x + 1, y + 1);
            ctx.fillStyle = '#ffe38a';
            ctx.fillText(f.text, f.x, y);
            ctx.globalAlpha = 1;
        }
    },

    _drawChar(c) {
        const ctx = this.ctx;
        const sheet = this._spriteFor(c.sprite);
        const bob = Math.abs(Math.sin(c.step || 0)) * 1.5;
        const x = Math.round(c.x - 8);
        const y = Math.round(c.y - 16 - bob);

        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y + 1, 6, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Facing left just mirrors the sprite; there is only one pose, which
        // is honest to the era being imitated.
        if (c.facing === 'left') {
            ctx.save();
            ctx.translate(x + 16, y);
            ctx.scale(-1, 1);
            ctx.drawImage(sheet, 0, 0);
            ctx.restore();
        } else {
            ctx.drawImage(sheet, x, y);
        }

        // name tag
        ctx.font = '7px monospace';
        ctx.textAlign = 'center';
        const label = c.label || '';
        const w = ctx.measureText(label).width + 6;
        ctx.fillStyle = c.me ? 'rgba(70,40,15,0.82)' : (c.npc ? 'rgba(30,60,40,0.8)' : 'rgba(25,35,70,0.8)');
        ctx.fillRect(Math.round(c.x - w / 2), y - 10, Math.round(w), 9);
        ctx.fillStyle = '#ffeec8';
        ctx.fillText(label, c.x, y - 3.5);
    },

    _fit() {
        // Keep the canvas pixel-perfect: integer scale where it fits.
        const cw = this.container.clientWidth, chh = this.container.clientHeight;
        if (!cw || !chh) return;
        const scale = Math.max(1, Math.min(Math.floor(cw / this.W), Math.floor(chh / this.H)));
        this.dom.canvas.style.width = (this.W * scale) + 'px';
        this.dom.canvas.style.height = (this.H * scale) + 'px';
    },

    _loop() {
        if (!this.mounted) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        this._update(dt);
        this._draw();
        this._fit();
        this._raf = requestAnimationFrame(this._loop);
    },

    _esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }
};
