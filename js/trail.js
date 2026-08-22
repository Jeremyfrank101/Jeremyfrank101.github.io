// trail.js — the map of the Sahara, and the journey across it.
//
// Two screens over the data in sahara.js. The map is a real projection of
// north-west Africa with the caravan towns, oases and salt mines on it and
// the historical roads drawn between them. The journey is an Oregon Trail
// screen: you move from halt to halt, one to three things happen on each leg,
// and at every halt and at the end you are told where you are and why anyone
// ever came here.

const Trail = {
    host: null,
    onDone: null,

    // Map bounds, in degrees. Wide enough for Sijilmasa to Cairo and Timbuktu
    // to Tunis without the Sahel falling off the bottom.
    BOUNDS: { lon0: -18, lon1: 34, lat0: 9, lat1: 38 },
    W: 1000, H: 620,

    x(lon) { const b = this.BOUNDS; return (lon - b.lon0) / (b.lon1 - b.lon0) * this.W; },
    // Latitude increases upward, so the y axis is inverted.
    y(lat) { const b = this.BOUNDS; return this.H - (lat - b.lat0) / (b.lat1 - b.lat0) * this.H; },

    // A simplified but real coastline, so the map reads as somewhere.
    COAST_MED: [[-5.9,35.9],[-2.9,35.3],[0.6,35.8],[3.1,36.8],[5.8,36.9],[8.7,37.3],
                [10.2,36.8],[11.1,33.9],[13.2,32.9],[15.2,32.4],[19.9,30.4],[23.0,32.2],
                [25.2,31.6],[29.9,31.2],[33.0,31.1]],
    COAST_ATL: [[-5.9,35.9],[-8.0,33.3],[-9.8,30.4],[-11.0,28.0],[-13.0,27.7],[-15.0,24.5],
                [-16.0,21.0],[-16.5,18.0],[-17.0,15.0],[-16.5,12.5]],
    NIGER:     [[-8.0,12.6],[-6.3,13.4],[-4.55,13.9],[-4.2,14.5],[-3.4,15.9],[-3.0,16.7],
                [-1.5,17.0],[-0.35,16.97],[-0.04,16.27],[0.5,15.7],[1.3,14.5],[2.1,13.5]],

    // ---------- map ----------

    openMap(host, { accepted = [], onPick, onClose }) {
        this.host = host;
        const R = Sahara.ROUTES;

        const line = pts => pts.map(([lo, la]) => `${this.x(lo).toFixed(1)},${this.y(la).toFixed(1)}`).join(' ');
        const routePath = r => line(Sahara.legOf(r).map(id => {
            const p = Sahara.place(id); return [p.lon, p.lat];
        }));

        // Every place any route touches, so nothing is drawn that is not used.
        const used = new Set();
        R.forEach(r => Sahara.legOf(r).forEach(id => used.add(id)));

        const dot = id => {
            const p = Sahara.place(id);
            const cx = this.x(p.lon), cy = this.y(p.lat);
            const r = p.kind === 'city' ? 5.5 : p.kind === 'mine' ? 5 : 3.6;
            return `<g class="tr-place tr-${p.kind}" data-place="${id}" tabindex="0" role="button"
                       aria-label="${p.name}">
                <circle cx="${cx}" cy="${cy}" r="${r + 7}" class="tr-hit"></circle>
                <circle cx="${cx}" cy="${cy}" r="${r}" class="tr-dot"></circle>
                <text x="${cx + r + 4}" y="${cy + 3.5}" class="tr-label">${p.name}</text>
            </g>`;
        };

        host.innerHTML = `
        <div class="tr-map-screen">
            <header class="tr-head">
                <h2>The roads of the Sahara</h2>
                <p>Timbuktu, 1325. Every town, oasis and mine below is a real one, and every
                   road between them was really travelled. Choose a commission.</p>
                <button class="tr-btn tr-close" data-close>Back to town</button>
            </header>

            <div class="tr-map-wrap">
                <svg viewBox="0 0 ${this.W} ${this.H}" class="tr-map" role="img"
                     aria-label="Map of the Sahara and the Maghrib with caravan routes">
                    <defs>
                        <linearGradient id="tr-sand" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#e8cf9c"/><stop offset="55%" stop-color="#dcbb82"/>
                            <stop offset="100%" stop-color="#cfa96d"/>
                        </linearGradient>
                    </defs>
                    <rect width="${this.W}" height="${this.H}" fill="url(#tr-sand)"/>

                    <!-- sea -->
                    <polygon class="tr-sea" points="${line(this.COAST_MED)} ${this.W},0 0,0"/>
                    <polygon class="tr-sea" points="${line(this.COAST_ATL)} 0,${this.H} 0,0"/>
                    <polyline class="tr-coast" points="${line(this.COAST_MED)}"/>
                    <polyline class="tr-coast" points="${line(this.COAST_ATL)}"/>

                    <!-- the Niger, which is why Timbuktu is where it is -->
                    <polyline class="tr-river" points="${line(this.NIGER)}"/>
                    <text class="tr-water-label" x="${this.x(-6.5)}" y="${this.y(13.0)}">Niger</text>
                    <text class="tr-water-label tr-sea-label" x="${this.x(4)}" y="${this.y(37.4)}">Mediterranean Sea</text>
                    <text class="tr-region" x="${this.x(3)}" y="${this.y(23)}">S A H A R A</text>
                    <text class="tr-region tr-region-sm" x="${this.x(-6)}" y="${this.y(30.5)}">M A G H R I B</text>

                    <g class="tr-routes">
                        ${R.map(r => `<polyline class="tr-route ${accepted.includes(r.id) ? 'done' : ''}"
                                        data-route="${r.id}" points="${routePath(r)}"/>`).join('')}
                    </g>
                    <g class="tr-places">${[...used].map(dot).join('')}</g>
                </svg>
            </div>

            <div class="tr-legend">
                <span><i class="tr-key tr-key-city"></i>city</span>
                <span><i class="tr-key tr-key-oasis"></i>oasis or well</span>
                <span><i class="tr-key tr-key-mine"></i>salt or copper mine</span>
                <span class="tr-dim">Taoudenni and Agadez are absent on purpose — neither existed yet.</span>
            </div>

            <div class="tr-routelist">
                ${R.map(r => {
                    const km = Sahara.routeKm(r), days = Sahara.routeDays(r);
                    const dest = Sahara.place(r.to);
                    const done = accepted.includes(r.id);
                    return `<button class="tr-route-card ${done ? 'done' : ''}" data-pick="${r.id}">
                        <span class="tr-rc-top">
                            <strong>${r.name}</strong>
                            <span class="tr-rc-reward">${done ? 'delivered' : '+' + r.reward + ' cowries'}</span>
                        </span>
                        <span class="tr-rc-sum">${r.summary}</span>
                        <span class="tr-rc-meta">
                            to ${dest.name} · ${r.stops.length + 1} legs ·
                            ${km.toLocaleString()} km · about ${days} days
                        </span>
                        <span class="tr-rc-stops">${Sahara.legOf(r).map(id =>
                            `<i class="tr-chip tr-${Sahara.place(id).kind}">${Sahara.place(id).name}</i>`).join('<b>›</b>')}</span>
                    </button>`;
                }).join('')}
            </div>

            <div class="tr-tip" id="tr-tip" hidden></div>
        </div>`;

        // Hovering a place explains it; hovering a road highlights it.
        const tip = host.querySelector('#tr-tip');
        host.querySelectorAll('[data-place]').forEach(g => {
            const show = () => {
                const p = Sahara.place(g.dataset.place);
                tip.hidden = false;
                tip.innerHTML = `<strong>${p.name}</strong> <em>${p.kind}</em>
                                 <span>${p.note}</span>
                                 <span class="tr-tip-trade"><b>Traded:</b> ${p.trade}</span>`;
            };
            g.addEventListener('mouseenter', show);
            g.addEventListener('focus', show);
            g.addEventListener('mouseleave', () => { tip.hidden = true; });
            g.addEventListener('blur', () => { tip.hidden = true; });
        });
        host.querySelectorAll('[data-pick]').forEach(b => {
            const id = b.dataset.pick;
            const hi = on => host.querySelector(`[data-route="${id}"]`)?.classList.toggle('hot', on);
            b.addEventListener('mouseenter', () => hi(true));
            b.addEventListener('mouseleave', () => hi(false));
            b.addEventListener('click', () => onPick && onPick(id));
        });
        host.querySelector('[data-close]').addEventListener('click', () => onClose && onClose());
    },

    // ---------- journey ----------

    start(host, routeId, kit, onDone) {
        this.host = host;
        this.onDone = onDone;
        const route = Sahara.ROUTES.find(r => r.id === routeId);
        const seq = Sahara.legOf(route);

        this.j = {
            route, seq,
            leg: 0,                       // index of the leg being travelled
            day: 0,
            water: kit.water != null ? kit.water : 100,
            waterMax: kit.waterMax || 100,
            food: kit.food != null ? kit.food : 100,
            cowries: kit.cowries || 0,
            camels: kit.camels || 1,
            log: [],
            queue: [],
            dead: false,
            learned: []
        };
        this._buildLeg();
        this._advance();
    },

    // One to three events per leg, drawn from those that suit the terrain at
    // the far end of it.
    _buildLeg() {
        const j = this.j;
        const toId = j.seq[j.leg + 1];
        if (!toId) return;
        const kind = Sahara.place(toId).kind;
        const pool = Sahara.EVENTS.filter(e => !e.kinds || e.kinds.includes(kind));
        const n = 1 + Math.floor(Math.random() * 3);
        const picked = [];
        const bag = pool.slice();
        for (let i = 0; i < n && bag.length; i++) {
            picked.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
        }
        j.queue = picked;
        j.legKm = Sahara.dist(j.seq[j.leg], toId);
        j.legDays = Math.max(1, Math.round(j.legKm / 35));
        j.legProgress = 0;
    },

    _trackPct() {
        const j = this.j;
        const per = 100 / (j.seq.length - 1);
        return Math.min(100, j.leg * per + (j.legProgress || 0) * per);
    },

    _meter(label, v, max) {
        const pct = Math.max(0, Math.min(100, (v / max) * 100));
        return `<div class="tr-meter">
            <span>${label}</span>
            <span class="tr-bar ${pct < 25 ? 'low' : ''}"><i style="width:${pct}%"></i></span>
            <strong>${Math.round(v)}</strong>
        </div>`;
    },

    // Painting and advancing are kept apart on purpose. They were one method
    // to begin with, and because _render() ended by calling _step(), arriving
    // at a halt re-entered the stepper and advanced the leg a second time —
    // the caravan reached Taghaza and kept going into open sand.

    _render() {
        const j = this.j;
        const from = Sahara.place(j.seq[Math.max(0, j.leg)]);
        const toId = j.seq[j.leg + 1];
        const to = Sahara.place(toId || j.seq[j.leg]);
        const total = j.seq.length - 1;

        this.host.innerHTML = `
        <div class="tr-journey">
            <header class="tr-jhead">
                <div>
                    <h2>${j.route.name}</h2>
                    <p>${toId ? `${from.name} → ${to.name} · leg ${j.leg + 1} of ${total}`
                              : `Arrived at ${from.name} · ${total} legs`}</p>
                </div>
                <div class="tr-day">Day ${j.day}</div>
            </header>

            <div class="tr-track" aria-hidden="true">
                ${j.seq.map((id, i) => {
                    const p = Sahara.place(id);
                    const state = i < j.leg ? 'past' : i === j.leg ? 'here' : '';
                    return `<span class="tr-stop ${state} tr-${p.kind}" style="left:${(i / total) * 100}%">
                                <i></i><b>${p.name}</b></span>`;
                }).join('')}
                <span class="tr-caravan" style="left:${this._trackPct()}%">🐪</span>
            </div>

            <div class="tr-meters">
                ${this._meter('💧 Water', j.water, j.waterMax)}
                ${this._meter('🌾 Food', j.food, 100)}
                <div class="tr-meter"><span>🐚 Cowries</span><strong>${j.cowries.toLocaleString()}</strong></div>
                <div class="tr-meter"><span>🐪 Camels</span><strong>${j.camels}</strong></div>
            </div>

            <div class="tr-body" id="tr-body"></div>
            <div class="tr-log">${j.log.slice(-6).map(l => `<div>${l}</div>`).join('')}</div>
        </div>`;

        this._paintBody();
    },

    _paintBody() {
        const j = this.j;
        const body = this.host.querySelector('#tr-body');

        if (j.mode === 'final') return this._paintFinal(body);

        if (j.mode === 'event') {
            const ev = j.current;
            body.innerHTML = `
                <div class="tr-card tr-event">
                    <h3>${ev.title}</h3>
                    <p>${ev.text}</p>
                    <div class="tr-choices">
                        ${ev.choices.map((c, i) => `<button class="tr-btn" data-choice="${i}">${c.label}</button>`).join('')}
                    </div>
                </div>`;
            body.querySelectorAll('[data-choice]').forEach(b =>
                b.addEventListener('click', () => this._choose(ev, ev.choices[+b.dataset.choice])));
            return;
        }

        // a halt
        const here = Sahara.place(j.seq[j.leg]);
        const last = j.leg === j.seq.length - 1;
        body.innerHTML = `
            <div class="tr-card tr-halt tr-${here.kind}">
                <div class="tr-halt-tag">${last ? 'Journey’s end' : 'Halt'} · ${here.kind}</div>
                <h3>${here.name}</h3>
                <p>${here.note}</p>
                <p class="tr-trade"><b>Traded here:</b> ${here.trade}</p>
                ${last ? `<p class="tr-reward">Commission delivered · +${j.route.reward} cowries ·
                          ${j.day} days · ${Sahara.routeKm(j.route).toLocaleString()} km</p>` : ''}
                <button class="tr-btn tr-primary" data-go>${last ? 'See what this place is known for' : 'Load up and go on'}</button>
            </div>`;
        body.querySelector('[data-go]').addEventListener('click', () => {
            if (last) { j.mode = 'final'; j.won = true; this._render(); return; }
            this._buildLeg();
            this._advance();
        });
    },

    // Move the journey on: the next event on this leg, or the next halt.
    _advance() {
        const j = this.j;
        if (j.dead) { j.mode = 'final'; j.won = false; return this._render(); }

        if (j.queue.length) {
            j.current = j.queue.shift();
            j.mode = 'event';
            j.legProgress = 1 - (j.queue.length + 1) / 4;
            return this._render();
        }

        j.leg++;
        const here = Sahara.place(j.seq[j.leg]);
        j.day += j.legDays || 1;
        j.water = Math.max(0, j.water - (j.legDays || 1) * 3.2);
        j.food  = Math.max(0, j.food  - (j.legDays || 1) * 2.1);
        j.legProgress = 0;

        if (j.water <= 0 || j.food <= 0) { j.dead = true; j.mode = 'final'; j.won = false; return this._render(); }

        // what the halt itself can give you
        if (here.kind === 'oasis' || here.kind === 'city') {
            j.water = j.waterMax;
            j.food = Math.min(100, j.food + 25);
        } else if (here.kind === 'well') {
            j.water = Math.min(j.waterMax, j.water + 40);
        }
        j.mode = 'halt';
        this._render();
    },

    _choose(ev, c) {
        const j = this.j;
        if (c.cowries) j.cowries = Math.max(0, j.cowries + c.cowries);
        if (c.water)   j.water = Math.max(0, Math.min(j.waterMax, j.water + c.water));
        if (c.food)    j.food = Math.max(0, Math.min(100, j.food + c.food));
        if (c.days)    j.day = Math.max(0, j.day + c.days);

        // `risk` is the chance the choice costs a camel.
        if (c.risk && Math.random() < c.risk * (j.route.risk || 1)) {
            j.camels = Math.max(0, j.camels - 1);
            j.log.push(`<em>${ev.title}:</em> ${c.result} <b>A camel is lost.</b>`);
            if (j.camels <= 0) j.dead = true;
        } else {
            j.log.push(`<em>${ev.title}:</em> ${c.result}`);
        }
        if (j.water <= 0 || j.food <= 0) j.dead = true;
        this._advance();
    },

    _paintFinal(body) {
        const j = this.j;
        const dest = Sahara.place(j.route.to);
        body.innerHTML = `
            <div class="tr-card tr-final ${j.won ? 'won' : 'lost'}">
                ${j.won ? `
                    <h2>${dest.name}</h2>
                    <p class="tr-final-sub">${j.route.name} · ${j.day} days · ${Sahara.routeKm(j.route).toLocaleString()} km</p>
                    <p>${dest.note}</p>
                    <p class="tr-trade"><b>What it traded:</b> ${dest.trade}</p>
                    <p class="tr-reward">+${j.route.reward} cowries</p>
                ` : `
                    <h2>The caravan does not arrive</h2>
                    <p>${j.camels <= 0
                        ? 'The last camel is down and cannot be raised. What cannot be carried is left where it lies.'
                        : 'The water runs out between wells. This is how the desert usually does it — not in a storm, but quietly, a day short of the next well.'}</p>
                    <p class="tr-final-sub">${j.day} days out, on the ${j.route.name}.</p>
                `}
                <button class="tr-btn tr-primary" data-done>Return to Timbuktu</button>
            </div>`;
        body.querySelector('[data-done]').addEventListener('click', () =>
            this.onDone && this.onDone({
                won: j.won, reward: j.won ? j.route.reward : 0, routeId: j.route.id,
                cowries: j.cowries, camels: j.camels, days: j.day
            }));
    }
};
