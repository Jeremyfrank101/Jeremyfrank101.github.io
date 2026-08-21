// cozyhealth.js — CozyHealth: food, movement, mind and body tracking.
//
// Recreated for the web from the existing `cozyhealth` Postgres schema, which
// was built for an iOS app. That schema keyed rows on a device_id; the web
// version scopes everything to owner_id = auth.uid() instead, so an account's
// health data follows the person rather than the device.
//
// Unlike CozyHome this app reads mostly "today" and "recent", so it queries on
// demand per tab instead of hydrating everything up front.

const CozyHealth = {
    SCHEMA: 'cozyhealth',

    TABS: [
        { id: 'today', label: 'Today' },
        { id: 'food',  label: 'Food'  },
        { id: 'move',  label: 'Move'  },
        { id: 'mind',  label: 'Mind'  },
        { id: 'body',  label: 'Body'  }
    ],

    MEAL_TYPES: ['Breakfast', 'Lunch', 'Dinner', 'Snack'],
    WORKOUT_TYPES: ['Run', 'Walk', 'Strength', 'Cycle', 'Swim', 'Yoga', 'Sport', 'Other'],
    INTENSITIES: ['Easy', 'Moderate', 'Hard', 'All Out'],

    // The serving categories the schema tracks, in the order the app shows them.
    SERVINGS: [
        { key: 'animal_protein_servings',    label: 'Animal protein', icon: '🍗', good: true },
        { key: 'plant_protein_servings',     label: 'Plant protein',  icon: '🫘', good: true },
        { key: 'vegetables_servings',        label: 'Vegetables',     icon: '🥦', good: true },
        { key: 'fruits_servings',            label: 'Fruit',          icon: '🍎', good: true },
        { key: 'whole_grains_servings',      label: 'Whole grains',   icon: '🌾', good: true },
        { key: 'fiber_servings',             label: 'Fibre',          icon: '🌿', good: true },
        { key: 'unsaturated_fat_servings',   label: 'Unsat. fat',     icon: '🫒', good: true },
        { key: 'saturated_fat_servings',     label: 'Sat. fat',       icon: '🧈', good: false },
        { key: 'simple_carbs_servings',      label: 'Simple carbs',   icon: '🍬', good: false },
        { key: 'alcohol_servings',           label: 'Alcohol',        icon: '🍷', good: false }
    ],

    // Rough daily targets, used only to draw progress — not medical advice.
    TARGETS: { calories: 2000, protein_grams: 90, vegetables_servings: 5, fiber_grams: 30 },

    // Micronutrients, with the FDA adult Daily Value used as the reference so
    // the bars mean something. `limit: true` marks the ones you want to stay
    // under rather than reach. Omega-3 has no official DV; 500mg combined
    // EPA+DHA is the usual dietary recommendation. Not medical advice.
    MICROS: [
        { keys: ['calcium_mg'],    label: 'Calcium',   unit: 'mg', dv: 1300 },
        { keys: ['iron_mg'],       label: 'Iron',      unit: 'mg', dv: 18 },
        { keys: ['potassium_mg'],  label: 'Potassium', unit: 'mg', dv: 4700 },
        { keys: ['vitamin_a_mcg'], label: 'Vitamin A', unit: 'µg', dv: 900 },
        { keys: ['vitamin_c_mg'],  label: 'Vitamin C', unit: 'mg', dv: 90 },
        { keys: ['vitamin_d_mcg'], label: 'Vitamin D', unit: 'µg', dv: 20 },
        { keys: ['folate_mcg'],    label: 'Folate',    unit: 'µg', dv: 400 },
        { keys: ['choline_mg'],    label: 'Choline',   unit: 'mg', dv: 550 },
        { keys: ['omega3_dha_mg', 'omega3_epa_mg'], label: 'Omega-3', unit: 'mg', dv: 500 },
        { keys: ['sodium_mg'],     label: 'Sodium',    unit: 'mg', dv: 2300, limit: true },
        { keys: ['sugar_grams'],   label: 'Sugar',     unit: 'g',  dv: 50,   limit: true }
    ],

    // Every nutrient column an entry can carry, so totals() can sum them all.
    MICRO_KEYS: ['sodium_mg', 'sugar_grams', 'calcium_mg', 'iron_mg', 'potassium_mg',
                 'vitamin_a_mcg', 'vitamin_c_mg', 'vitamin_d_mcg', 'folate_mcg',
                 'choline_mg', 'omega3_dha_mg', 'omega3_epa_mg'],

    mounted: false,
    tab: 'today',
    viewing: null,      // null = your own log; otherwise a user id shared with you

    // How much of a food a tap logs. Kept on the app rather than in the markup
    // so it survives a re-render, and reset to one whole serving after each
    // log so the common case stays a single tap.
    amount: { value: 100, unit: 'percent' },
    UNIT_DEFAULTS: { percent: 100, gram: 100, serving: 1 },

    // Library column -> meal_entries column. The micros were in both tables
    // all along but quickAdd only ever copied the macros, so every logged
    // library food silently dropped its sodium, calcium, iron and vitamins.
    LIB_TO_ENTRY: {
        calories: 'calories', protein_grams: 'protein_grams', carbs_grams: 'carbs_grams',
        fat_grams: 'fat_grams', fiber_grams: 'fiber_grams', sugar_grams: 'sugar_grams',
        sodium_mg: 'sodium_mg', vitamin_a_mcg: 'vitamin_a_mcg', vitamin_c_mg: 'vitamin_c_mg',
        vitamin_d_mcg: 'vitamin_d_mcg', calcium_mg: 'calcium_mg', iron_mg: 'iron_mg',
        potassium_mg: 'potassium_mg', folate_mcg: 'folate_mcg', choline_mg: 'choline_mg',
        omega3_dha_mg: 'omega3_dha_mg', omega3_epa_mg: 'omega3_epa_mg',
        animal_protein: 'animal_protein_servings', plant_protein: 'plant_protein_servings',
        saturated_fat: 'saturated_fat_servings', unsaturated_fat: 'unsaturated_fat_servings',
        whole_grains: 'whole_grains_servings', vegetables: 'vegetables_servings',
        fruits: 'fruits_servings', simple_carbs: 'simple_carbs_servings',
        fiber: 'fiber_servings', alcohol: 'alcohol_servings'
    },
    people: {},         // user id -> { email, username }
    shares: [],
    data: { meals: [], workouts: [], mind: [], meditations: [], measurements: [], library: [], profile: null },

    // ---------- lifecycle ----------

    mount(container) {
        if (this.mounted) {
            if (this.container === container && document.body.contains(container)) return;
            this.unmount();
        }
        this.container = container;
        this.mounted = true;
        this._buildDOM();
        this.refresh();
    },

    unmount() {
        if (!this.mounted) return;
        this.mounted = false;
        if (this._timerId) { clearInterval(this._timerId); this._timerId = null; }
        if (this.container) this.container.innerHTML = '';
        this.container = null;
    },

    db(table) {
        return Auth.client.schema(this.SCHEMA).from(table);
    },

    uid() { return Auth.getUser()?.id || null; },

    // Whose log the screen is currently showing.
    subjectId() { return this.viewing || this.uid(); },
    isOwnLog()  { return !this.viewing; },

    subjectName() {
        if (this.isOwnLog()) return this.data.profile?.username || 'You';
        const p = this.people[this.viewing];
        return p ? (p.username || p.email) : 'them';
    },

    // People who have shared their log with me.
    sharedWithMe() {
        return this.shares.filter(s => s.shared_with_id === this.uid());
    },

    // People I have shared my log with.
    sharedByMe() {
        return this.shares.filter(s => s.owner_id === this.uid());
    },

    // ---------- data ----------

    async refresh() {
        if (!Auth.client || !this.uid()) return;
        this._setBusy(true);
        try {
            await this._loadShares();

            const subject = this.subjectId();
            const since = new Date(Date.now() - 30 * 864e5).toISOString();
            const own = q => q.eq('owner_id', subject);
            const [meals, workouts, mind, meditations, measurements, library, profile] = await Promise.all([
                own(this.db('meal_entries').select('*').gte('date', since)).order('date', { ascending: false }),
                own(this.db('workouts').select('*').gte('date', since)).order('date', { ascending: false }),
                own(this.db('mind_entries').select('*').gte('date', since)).order('date', { ascending: false }),
                own(this.db('meditation_sessions').select('*').gte('date', since)).order('date', { ascending: false }),
                own(this.db('profile_measurements').select('*')).order('date', { ascending: false }).limit(60),
                this.db('generic_meals').select('*').order('name'),
                this.db('user_profiles').select('*').eq('owner_id', subject).maybeSingle()
            ]);

            const err = [meals, workouts, mind, meditations, measurements, library, profile].find(r => r.error);
            if (err) throw err.error;

            this.data = {
                meals: meals.data || [],
                workouts: workouts.data || [],
                mind: mind.data || [],
                meditations: meditations.data || [],
                measurements: measurements.data || [],
                library: library.data || [],
                profile: profile.data || null
            };

            if (!this.data.profile && this.isOwnLog()) await this._ensureProfile();
            this._error = null;
        } catch (e) {
            console.error('[CozyHealth] load failed', e);
            this._error = e.message || String(e);
        }
        this._setBusy(false);
        this.render();
    },

    async _loadShares() {
        const uid = this.uid();
        const { data, error } = await Auth.client.from('shares')
            .select('*').eq('resource_type', 'health');
        if (error) { console.warn('[CozyHealth] shares load failed', error); return; }
        this.shares = data || [];

        const ids = new Set();
        this.shares.forEach(s => { ids.add(s.owner_id); ids.add(s.shared_with_id); });
        ids.delete(uid);
        if (!ids.size) return;
        const { data: people } = await Auth.client.from('profiles')
            .select('user_id,email,username').in('user_id', [...ids]);
        (people || []).forEach(p => { this.people[p.user_id] = p; });
    },

    async shareHealth(email) {
        const { data: found, error: e1 } = await Auth.client
            .rpc('find_user_by_email', { p_email: email });
        if (e1) throw new Error(e1.message);
        const person = Array.isArray(found) ? found[0] : found;
        if (!person) throw new Error(`No CozyHome account uses ${email}.`);

        const { error } = await Auth.client.from('shares').insert({
            resource_type: 'health',
            resource_id: this.uid(),      // you share your own log
            owner_id: this.uid(),
            shared_with_id: person.user_id
        });
        if (error) {
            if (error.code === '23505') throw new Error('Already shared with that person.');
            throw new Error(error.message);
        }
        await this.refresh();
    },

    async unshareHealth(shareId) {
        const { error } = await Auth.client.from('shares').delete().eq('id', shareId);
        if (error) throw new Error(error.message);
        await this.refresh();
    },

    async viewPerson(id) {
        this.viewing = id || null;
        this.tab = 'today';
        this.container.querySelectorAll('[data-tab]').forEach(x =>
            x.classList.toggle('active', x.dataset.tab === 'today'));
        await this.refresh();
    },

    async _ensureProfile() {
        const user = Auth.getUser();
        const { data, error } = await this.db('user_profiles').insert({
            owner_id: user.id,
            device_id: 'web:' + user.id,
            user_id: user.id,
            username: user.username || 'You'
        }).select().single();
        if (error) { console.warn('[CozyHealth] could not create profile', error); return; }
        this.data.profile = data;
    },

    // ---------- helpers ----------

    isToday(iso) {
        return new Date(iso).toDateString() === new Date().toDateString();
    },

    todayMeals()   { return this.data.meals.filter(m => this.isToday(m.date)); },
    todayWorkouts(){ return this.data.workouts.filter(w => this.isToday(w.date)); },
    todayMind()    { return this.data.mind.find(m => this.isToday(m.date)) || null; },

    totals(meals) {
        const t = { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0, fiber_grams: 0 };
        this.SERVINGS.forEach(s => { t[s.key] = 0; });
        this.MICRO_KEYS.forEach(k => { t[k] = 0; });
        for (const m of meals) {
            for (const k of Object.keys(t)) t[k] += Number(m[k]) || 0;
        }
        return t;
    },

    // ---------- micronutrients ----------

    // A meal contributes no micros at all when it was typed by hand — the
    // manual form only asks for calories and macros — or when it was logged
    // from the library before entries started carrying micros. Worth saying
    // out loud, because otherwise the day just looks deficient.
    _microGaps(meals) {
        return meals.filter(m => !this.MICRO_KEYS.some(k => Number(m[k]) > 0));
    },

    _microPanel(meals, t) {
        if (!meals.length) return '';
        const rows = this.MICROS.map(mi => {
            const total = mi.keys.reduce((n, k) => n + (Number(t[k]) || 0), 0);
            const pct = mi.dv ? (total / mi.dv) * 100 : 0;
            return { ...mi, total, pct };
        });
        if (!rows.some(r => r.total > 0)) return '';

        const gaps = this._microGaps(meals);
        return `
        <div class="chx-card">
            <h3>Micronutrients today</h3>
            <div class="chx-micros">
                ${rows.map(r => {
                    const over = r.limit && r.pct > 100;
                    const cls = over ? 'over' : r.limit ? 'limit' : r.pct >= 100 ? 'met' : '';
                    return `<div class="chx-micro ${cls}">
                        <span class="chx-micro-name">${r.label}</span>
                        <span class="chx-micro-track">
                            <span class="chx-micro-fill" style="width:${Math.min(100, r.pct)}%"></span>
                        </span>
                        <span class="chx-micro-val">${this.fmt(r.total, r.total < 10 ? 1 : 0)}<em>${r.unit}</em></span>
                        <span class="chx-micro-pct">${Math.round(r.pct)}%</span>
                    </div>`;
                }).join('')}
            </div>
            <p class="chx-dim">Against adult Daily Values. Sodium and sugar are ceilings, not targets.</p>
            ${gaps.length ? `<p class="chx-dim">${gaps.length} of ${meals.length} ${
                meals.length === 1 ? 'entry' : 'entries'} ${
                gaps.length === 1 ? 'has' : 'have'} no micronutrient data — hand-typed meals record
                only calories and macros, so the totals above are a floor.</p>` : ''}
        </div>`;
    },

    crumpets() { return this.data.profile?.cozy_crumpets || 0; },

    // Crumpets are the app's reward currency: small, frequent, and never
    // spent by the app itself.
    async awardCrumpets(n, why) {
        if (!this.data.profile) return;
        const next = this.crumpets() + n;
        this.data.profile.cozy_crumpets = next;
        const { error } = await this.db('user_profiles')
            .update({ cozy_crumpets: next, updated_at: new Date().toISOString() })
            .eq('id', this.data.profile.id);
        if (error) console.warn('[CozyHealth] crumpet update failed', error);
        else this._toast(`+${n} 🥞 ${why}`);
    },

    fmt(n, digits = 0) {
        const v = Number(n) || 0;
        return v.toLocaleString(undefined, { maximumFractionDigits: digits });
    },

    esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    },

    when(iso) {
        const d = new Date(iso), now = new Date();
        const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        if (d.toDateString() === now.toDateString()) return time;
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + time;
    },

    // ---------- shell ----------

    _buildDOM() {
        this.container.innerHTML = `
        <div class="chx-root">
            <div class="chx-people"></div>
            <div class="chx-tabs">
                ${this.TABS.map(t => `<button class="chx-tab ${t.id === this.tab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
            </div>
            <div class="chx-body"><div class="chx-loading">Loading your day…</div></div>
            <div class="chx-toast hidden"></div>
        </div>`;

        this.dom = {
            people: this.container.querySelector('.chx-people'),
            body: this.container.querySelector('.chx-body'),
            toast: this.container.querySelector('.chx-toast')
        };

        this.container.querySelectorAll('[data-tab]').forEach(b =>
            b.addEventListener('click', () => {
                this.tab = b.dataset.tab;
                this.container.querySelectorAll('[data-tab]').forEach(x =>
                    x.classList.toggle('active', x.dataset.tab === this.tab));
                this.render();
            }));
    },

    _setBusy(on) {
        if (on && this.dom) this.dom.body.innerHTML = '<div class="chx-loading">Loading your day…</div>';
    },

    _toast(msg) {
        if (!this.dom) return;
        this.dom.toast.textContent = msg;
        this.dom.toast.classList.remove('hidden');
        clearTimeout(this._toastT);
        this._toastT = setTimeout(() => this.dom.toast.classList.add('hidden'), 2600);
    },

    render() {
        if (!this.mounted || !this.dom) return;
        if (this._error) {
            this.dom.body.innerHTML = `<div class="chx-empty">
                <p>Couldn't load your health data.</p>
                <p class="chx-dim">${this.esc(this._error)}</p>
                <button class="chx-btn" onclick="CozyHealth.refresh()">Try again</button>
            </div>`;
            return;
        }
        this._renderPeople();
        const fn = {
            today: () => this.renderToday(),
            food:  () => this.renderFood(),
            move:  () => this.renderMove(),
            mind:  () => this.renderMind(),
            body:  () => this.renderBody()
        }[this.tab];
        this.dom.body.innerHTML = fn ? fn() : '';
        this._bindTab();
    },

    _renderPeople() {
        const incoming = this.sharedWithMe();
        if (!incoming.length && this.isOwnLog()) { this.dom.people.innerHTML = ''; return; }
        const chip = (id, label, active) =>
            `<button class="chx-person ${active ? 'active' : ''}" data-person="${id || ''}">${this.esc(label)}</button>`;
        this.dom.people.innerHTML =
            chip('', 'You', this.isOwnLog()) +
            incoming.map(s => chip(s.owner_id,
                this.people[s.owner_id]?.username || this.people[s.owner_id]?.email || 'Someone',
                this.viewing === s.owner_id)).join('');
        this.dom.people.querySelectorAll('[data-person]').forEach(b =>
            b.addEventListener('click', () => this.viewPerson(b.dataset.person || null)));
    },

    // A banner making it obvious you are looking at someone else's log.
    _viewingBanner() {
        if (this.isOwnLog()) return '';
        return `<div class="chx-viewing">👀 Viewing <strong>${this.esc(this.subjectName())}</strong>'s log — read only</div>`;
    },

    // ---------- Today ----------

    renderToday() {
        const meals = this.todayMeals();
        const t = this.totals(meals);
        const workouts = this.todayWorkouts();
        const minutes = workouts.reduce((n, w) => n + (w.duration_minutes || 0), 0);
        const mind = this.todayMind();
        const meditated = this.data.meditations
            .filter(m => this.isToday(m.date))
            .reduce((n, m) => n + (m.duration_seconds || 0), 0);
        const name = this.data.profile?.username || 'there';

        const ring = (label, value, target, unit) => {
            const pct = Math.max(0, Math.min(100, (value / target) * 100));
            return `<div class="chx-ring">
                <div class="chx-ring-bar"><div class="chx-ring-fill" style="width:${pct}%"></div></div>
                <div class="chx-ring-label"><span>${label}</span><span>${this.fmt(value)}<small> / ${this.fmt(target)}${unit || ''}</small></span></div>
            </div>`;
        };

        return `
        ${this._viewingBanner()}
        <div class="chx-hello">
            <div>
                <h2>Hello, ${this.esc(name)}</h2>
                <p class="chx-dim">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            </div>
            <div class="chx-crumpets" title="Cozy crumpets earned">🥞 ${this.fmt(this.crumpets())}</div>
        </div>

        <div class="chx-card">
            <h3>Nutrition today</h3>
            ${ring('Calories', t.calories, this.TARGETS.calories, ' kcal')}
            ${ring('Protein', t.protein_grams, this.TARGETS.protein_grams, ' g')}
            ${ring('Vegetables', t.vegetables_servings, this.TARGETS.vegetables_servings, ' servings')}
            ${ring('Fibre', t.fiber_grams, this.TARGETS.fiber_grams, ' g')}
            <p class="chx-dim chx-note">Targets are rough defaults for drawing progress, not medical advice.</p>
        </div>

        <div class="chx-grid">
            <div class="chx-card chx-stat">
                <span class="chx-stat-ico">🍽️</span>
                <span class="chx-stat-num">${meals.length}</span>
                <span class="chx-stat-lbl">meal${meals.length === 1 ? '' : 's'} logged</span>
            </div>
            <div class="chx-card chx-stat">
                <span class="chx-stat-ico">🏃</span>
                <span class="chx-stat-num">${minutes}</span>
                <span class="chx-stat-lbl">active minutes</span>
            </div>
            <div class="chx-card chx-stat">
                <span class="chx-stat-ico">🧘</span>
                <span class="chx-stat-num">${Math.round(meditated / 60)}</span>
                <span class="chx-stat-lbl">minutes meditating</span>
            </div>
            <div class="chx-card chx-stat">
                <span class="chx-stat-ico">${mind ? ['😞','🙁','😐','🙂','😄'][Math.max(0, Math.min(4, (mind.mood || 3) - 1))] : '❔'}</span>
                <span class="chx-stat-num">${mind ? mind.mood : '—'}</span>
                <span class="chx-stat-lbl">mood ${mind ? 'today' : 'not logged'}</span>
            </div>
        </div>

        ${this.isOwnLog() ? this._shareCard() : ''}

        ${meals.length ? `<div class="chx-card">
            <h3>Today's meals</h3>
            ${meals.map(m => this._mealRow(m)).join('')}
        </div>` : `<div class="chx-card chx-empty-card">
            <p>Nothing logged yet today.</p>
            <button class="chx-btn" data-go="food">Log a meal</button>
        </div>`}`;
    },

    _shareCard() {
        const out = this.sharedByMe();
        return `<div class="chx-card">
            <h3>Share your health log</h3>
            ${out.length ? `<div class="chx-share-list">${out.map(s => `
                <div class="chx-item">
                    <div class="chx-item-main"><strong>${this.esc(this.people[s.shared_with_id]?.username || this.people[s.shared_with_id]?.email || 'Someone')}</strong>
                    <span class="chx-dim">can view your stats</span></div>
                    <button class="chx-del" data-unshare-health="${s.id}" title="Stop sharing">✕</button>
                </div>`).join('')}</div>`
              : '<p class="chx-dim">Not shared with anyone yet.</p>'}
            <div class="chx-row" style="margin-top:10px">
                <input type="email" id="chx-share-email" placeholder="their@email.com">
                <button class="chx-btn" id="chx-share-btn" style="flex:0 0 auto">Share</button>
            </div>
            <p class="chx-dim chx-note">They can see your stats but cannot change anything.</p>
            <p class="chx-share-err hidden" id="chx-share-err"></p>
        </div>`;
    },

    // ---------- what to suggest ----------
    //
    // A flat alphabetical library is useless once it passes ~200 entries. What
    // someone wants to log at 8am is what they logged at 8am on other days, so
    // suggestions come from their own history at this hour, ranked by how
    // often they eat it, and topped up with library items for this meal slot.

    SUGGEST_WINDOW_H: 2.5,     // how far either side of now still counts
    SUGGEST_DAYS: 21,

    timeSlot(d = new Date()) {
        const h = d.getHours();
        if (h < 10.5) return 'Breakfast';
        if (h < 15)   return 'Lunch';
        if (h < 21)   return 'Dinner';
        return 'Snack';
    },

    // Hours between two times of day, wrapping midnight so 23:00 and 01:00
    // are two hours apart rather than twenty-two.
    _hourGap(a, b) {
        const d = Math.abs(a - b) % 24;
        return Math.min(d, 24 - d);
    },

    suggestions() {
        const now = new Date();
        const nowH = now.getHours() + now.getMinutes() / 60;
        const cutoff = Date.now() - this.SUGGEST_DAYS * 864e5;

        // 1. the user's own entries logged around this time of day
        const seen = new Map();
        for (const m of this.data.meals) {
            const d = new Date(m.date);
            if (d.getTime() < cutoff) continue;
            if (this._hourGap(d.getHours() + d.getMinutes() / 60, nowH) > this.SUGGEST_WINDOW_H) continue;
            const key = (m.name || '').trim().toLowerCase();
            if (!key) continue;
            const prev = seen.get(key);
            if (prev) { prev.count++; if (d > prev.when) prev.when = d; }
            else seen.set(key, { entry: m, count: 1, when: d });
        }

        const mine = [...seen.values()]
            .sort((a, b) => b.count - a.count || b.when - a.when)
            .slice(0, 8)
            .map(x => ({ kind: 'again', id: x.entry.id, name: x.entry.name,
                         calories: x.entry.calories, count: x.count, src: x.entry }));

        // 2. top up from the library with things that fit this meal slot
        const slot = this.timeSlot(now);
        const taken = new Set(mine.map(m => m.name.trim().toLowerCase()));
        const filler = this.data.library
            .filter(g => g.meal_type === slot && !taken.has((g.name || '').trim().toLowerCase()))
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, Math.max(0, 8 - mine.length))
            .map(g => ({ kind: 'library', id: g.id, name: g.name, calories: g.calories, src: g }));

        return { slot, mine, filler };
    },

    searchLibrary(q) {
        const t = (q || '').trim().toLowerCase();
        if (t.length < 2) return [];
        return this.data.library
            .filter(g => (g.name || '').toLowerCase().includes(t))
            .sort((a, b) => {
                const ai = a.name.toLowerCase().indexOf(t), bi = b.name.toLowerCase().indexOf(t);
                return ai - bi || a.name.localeCompare(b.name);
            })
            .slice(0, 14);
    },

    // Re-log a past entry under today's date, at whatever the amount bar says.
    //
    // If the entry came from the library, re-log the library row instead: that
    // gives a per-serving basis with a known weight, so grams work. A meal the
    // user typed by hand has no such basis, so the entry itself is normalised
    // back to one serving and rescaled from there.
    async logAgain(mealId) {
        const src = this.data.meals.find(m => m.id === mealId);
        if (!src) return;

        const key = (src.name || '').trim().toLowerCase();
        const lib = this.data.library.find(g => (g.name || '').trim().toLowerCase() === key);
        if (lib) return this.quickAdd(lib.id);

        const p = this._portion(null);      // no known weight for a custom meal
        if (p.error) { this._toast(p.error); return; }
        // undo the amount it was originally logged at, then apply the new one
        const per = (src.quantity_unit === 'serving' && src.quantity > 0) ? src.quantity : 1;
        const ident = {};
        for (const k of Object.values(this.LIB_TO_ENTRY)) ident[k] = k;

        const row = {
            ...this._base(),
            name: src.name, meal_type: src.meal_type, date: new Date().toISOString(),
            quantity: p.quantity, quantity_unit: p.unit,
            ...this._scaled(src, ident, p.factor / per)
        };
        await this._insert('meal_entries', row, 'meals', `${src.name} — ${p.label}`, 2);
        this.resetAmount();
    },

    resetAmount() {
        this.amount = { value: this.UNIT_DEFAULTS.percent, unit: 'percent' };
    },

    _amountHint() {
        const { value, unit } = this.amount;
        const v = Number(value);
        if (!isFinite(v) || v <= 0) return 'Enter an amount, then tap a food.';
        if (unit === 'gram')    return `Tap a food to log ${this.fmt(v)} g of it.`;
        if (unit === 'serving') return `Tap a food to log ${this.fmt(v, 2)}× its serving.`;
        return v === 100 ? 'Tap a food to log one serving.'
                         : `Tap a food to log ${this.fmt(v)}% of a serving.`;
    },

    // ---------- Food ----------

    renderFood() {
        const meals = this.todayMeals();
        const t = this.totals(meals);

        if (!this.isOwnLog()) return this._readOnlyFood();
        const sug = this.suggestions();
        const hour = new Date().toLocaleTimeString(undefined, { hour: 'numeric' });
        const A = this.amount;
        const unitBtn = (u, label, title) =>
            `<button class="chx-unit ${A.unit === u ? 'active' : ''}" data-unit="${u}" title="${title}">${label}</button>`;
        return `
        <div class="chx-card">
            <div class="chx-amount">
                <input type="number" id="chx-amt" value="${A.value}" min="0" step="any" aria-label="Amount">
                <div class="chx-units">
                    ${unitBtn('percent', '%', 'Percent of one serving')}
                    ${unitBtn('gram', 'g', 'Grams')}
                    ${unitBtn('serving', '×', 'Whole servings')}
                </div>
                <span class="chx-dim chx-amt-hint">${this.esc(this._amountHint())}</span>
            </div>

            <h3>Usually around ${this.esc(hour)}</h3>
            ${sug.mine.length ? `<div class="chx-chips">
                ${sug.mine.map(m => `<button class="chx-chip chx-again" data-again="${m.id}">
                    ${this.esc(m.name)}<small>${this.fmt(m.calories)} kcal · ${m.count}\u00d7</small></button>`).join('')}
            </div>` : `<p class="chx-dim">Nothing logged around this time yet — once you do, it will show up here.</p>`}

            ${sug.filler.length ? `<div class="chx-suggest-sep">${this.esc(sug.slot)} ideas</div>
            <div class="chx-chips">
                ${sug.filler.map(g => `<button class="chx-chip" data-quick="${g.id}">
                    ${this.esc(g.name)}<small>${this.fmt(g.calories)} kcal</small></button>`).join('')}
            </div>` : ''}

            <div class="chx-search">
                <input type="text" id="chx-food-search" placeholder="Search all ${this.data.library.length} foods…" autocomplete="off">
                <div class="chx-results" id="chx-food-results"></div>
            </div>
        </div>

        <div class="chx-card">
            <h3>Log a meal</h3>
            <input type="text" id="chx-meal-name" placeholder="What did you eat?">
            <div class="chx-row">
                <select id="chx-meal-type">${this.MEAL_TYPES.map(x => `<option>${x}</option>`).join('')}</select>
                <input type="number" id="chx-meal-cal" placeholder="kcal" min="0">
            </div>
            <div class="chx-row">
                <input type="number" id="chx-meal-p" placeholder="protein g" min="0">
                <input type="number" id="chx-meal-c" placeholder="carbs g" min="0">
                <input type="number" id="chx-meal-f" placeholder="fat g" min="0">
            </div>
            <details class="chx-details">
                <summary>Servings</summary>
                <div class="chx-servings">
                    ${this.SERVINGS.map(s => `
                        <label class="chx-serving">
                            <span>${s.icon} ${s.label}</span>
                            <input type="number" step="0.5" min="0" value="0" data-serving="${s.key}">
                        </label>`).join('')}
                </div>
            </details>
            <button class="chx-btn chx-primary" id="chx-add-meal">Add meal</button>
        </div>

        <div class="chx-card">
            <h3>Today · ${this.fmt(t.calories)} kcal</h3>
            <div class="chx-macros">
                <span>P ${this.fmt(t.protein_grams)}g</span>
                <span>C ${this.fmt(t.carbs_grams)}g</span>
                <span>F ${this.fmt(t.fat_grams)}g</span>
                <span>Fibre ${this.fmt(t.fiber_grams)}g</span>
            </div>
            <div class="chx-serving-bars">
                ${this.SERVINGS.filter(s => t[s.key] > 0).map(s => `
                    <div class="chx-sbar ${s.good ? '' : 'watch'}">
                        <span>${s.icon} ${s.label}</span>
                        <strong>${this.fmt(t[s.key], 1)}</strong>
                    </div>`).join('') || '<p class="chx-dim">No servings logged today.</p>'}
            </div>
            ${meals.length ? meals.map(m => this._mealRow(m, true)).join('') : '<p class="chx-dim">No meals yet today.</p>'}
        </div>

        ${this._microPanel(meals, t)}`;
    },

    // When viewing a partner, show their intake without any logging controls.
    _readOnlyFood() {
        const meals = this.todayMeals();
        const t = this.totals(meals);
        return `${this._viewingBanner()}
        <div class="chx-card">
            <h3>${this.esc(this.subjectName())} today · ${this.fmt(t.calories)} kcal</h3>
            <div class="chx-macros">
                <span>P ${this.fmt(t.protein_grams)}g</span>
                <span>C ${this.fmt(t.carbs_grams)}g</span>
                <span>F ${this.fmt(t.fat_grams)}g</span>
                <span>Fibre ${this.fmt(t.fiber_grams)}g</span>
            </div>
            ${meals.length ? meals.map(m => this._mealRow(m)).join('') : '<p class="chx-dim">Nothing logged today.</p>'}
        </div>

        ${this._microPanel(meals, t)}`;
    },

    // How much of it was logged, shown only when it is not one plain serving.
    _amountOf(m) {
        if (m.quantity == null) return '';
        if (m.quantity_unit === 'gram') return ` · ${this.fmt(m.quantity)} g`;
        if (Math.abs(m.quantity - 1) < 0.005) return '';
        return ` · ${this.fmt(m.quantity * 100)}%`;
    },

    _mealRow(m, deletable) {
        return `<div class="chx-item">
            <div class="chx-item-main">
                <strong>${this.esc(m.name)}</strong>
                <span class="chx-dim">${this.esc(m.meal_type)} · ${this.when(m.date)}${this._amountOf(m)}</span>
            </div>
            <span class="chx-item-num">${this.fmt(m.calories)} kcal</span>
            ${deletable ? `<button class="chx-del" data-del-meal="${m.id}" title="Delete">✕</button>` : ''}
        </div>`;
    },

    // ---------- Move ----------

    renderMove() {
        const readOnly = !this.isOwnLog();
        const recent = this.data.workouts.slice(0, 12);
        const week = this.data.workouts.filter(w => new Date(w.date) > new Date(Date.now() - 7 * 864e5));
        const weekMin = week.reduce((n, w) => n + (w.duration_minutes || 0), 0);

        return `
        ${this._viewingBanner()}
        <div class="chx-card">
            <h3>This week</h3>
            <div class="chx-macros">
                <span>${week.length} workout${week.length === 1 ? '' : 's'}</span>
                <span>${weekMin} minutes</span>
            </div>
        </div>

        ${readOnly ? '' : `<div class="chx-card">
            <h3>Log a workout</h3>
            <div class="chx-row">
                <select id="chx-w-type">${this.WORKOUT_TYPES.map(x => `<option>${x}</option>`).join('')}</select>
                <input type="number" id="chx-w-min" placeholder="minutes" min="1" value="30">
            </div>
            <div class="chx-row">
                <select id="chx-w-int">${this.INTENSITIES.map(x => `<option ${x === 'Moderate' ? 'selected' : ''}>${x}</option>`).join('')}</select>
                <input type="text" id="chx-w-feel" placeholder="how did it feel?">
            </div>
            <input type="text" id="chx-w-notes" placeholder="Notes (optional)">
            <button class="chx-btn chx-primary" id="chx-add-workout">Add workout</button>
        </div>`}

        <div class="chx-card">
            <h3>Recent</h3>
            ${recent.length ? recent.map(w => `
                <div class="chx-item">
                    <div class="chx-item-main">
                        <strong>${this.esc(w.workout_type)}</strong>
                        <span class="chx-dim">${this.esc(w.intensity)} · ${this.when(w.date)}${w.notes ? ' · ' + this.esc(w.notes) : ''}</span>
                    </div>
                    <span class="chx-item-num">${w.duration_minutes} min</span>
                    ${readOnly ? '' : `<button class="chx-del" data-del-workout="${w.id}" title="Delete">✕</button>`}
                </div>`).join('') : '<p class="chx-dim">No workouts in the last 30 days.</p>'}
        </div>`;
    },

    // ---------- Mind ----------

    renderMind() {
        if (!this.isOwnLog()) return this._readOnlyMind();
        const today = this.todayMind();
        const recent = this.data.mind.slice(0, 10);
        const sessions = this.data.meditations.slice(0, 6);
        const v = (k, d) => today ? (today[k] ?? d) : d;

        return `
        <div class="chx-card">
            <h3>${today ? "Today's check-in" : 'How are you today?'}</h3>
            <label class="chx-slider">
                <span>Mood <strong id="chx-mood-v">${v('mood', 3)}</strong></span>
                <input type="range" id="chx-mood" min="1" max="5" step="1" value="${v('mood', 3)}">
            </label>
            <label class="chx-slider">
                <span>Energy <strong id="chx-energy-v">${v('energy', 3)}</strong></span>
                <input type="range" id="chx-energy" min="1" max="5" step="1" value="${v('energy', 3)}">
            </label>
            <label class="chx-slider">
                <span>Sleep <strong id="chx-sleep-v">${v('sleep_hours', 7)}</strong> h</span>
                <input type="range" id="chx-sleep" min="0" max="12" step="0.5" value="${v('sleep_hours', 7)}">
            </label>
            <input type="text" id="chx-grat" placeholder="One thing you're grateful for" value="${this.esc(v('gratitude', ''))}">
            <textarea id="chx-journal" rows="3" placeholder="Anything on your mind?">${this.esc(v('journal', ''))}</textarea>
            <button class="chx-btn chx-primary" id="chx-save-mind">${today ? 'Update check-in' : 'Save check-in'}</button>
        </div>

        <div class="chx-card">
            <h3>Meditate</h3>
            <div class="chx-timer">
                <div class="chx-timer-face" id="chx-timer-face">0:00</div>
                <div class="chx-row">
                    <select id="chx-med-preset">
                        <option value="1">1 minute</option>
                        <option value="3">3 minutes</option>
                        <option value="5" selected>5 minutes</option>
                        <option value="10">10 minutes</option>
                    </select>
                    <button class="chx-btn chx-primary" id="chx-med-toggle">Start</button>
                </div>
            </div>
            ${sessions.length ? `<div class="chx-med-list">${sessions.map(s => `
                <div class="chx-item">
                    <div class="chx-item-main"><strong>${Math.round((s.duration_seconds || 0) / 60)} min</strong>
                    <span class="chx-dim">${this.when(s.date)}</span></div>
                </div>`).join('')}</div>` : ''}
        </div>

        ${recent.length ? `<div class="chx-card">
            <h3>Recent check-ins</h3>
            ${recent.map(m => `
                <div class="chx-item">
                    <div class="chx-item-main">
                        <strong>${['😞','🙁','😐','🙂','😄'][Math.max(0, Math.min(4, (m.mood || 3) - 1))]} mood ${m.mood} · energy ${m.energy}</strong>
                        <span class="chx-dim">${this.when(m.date)} · ${m.sleep_hours}h sleep${m.gratitude ? ' · ' + this.esc(m.gratitude) : ''}</span>
                    </div>
                </div>`).join('')}
        </div>` : ''}`;
    },

    _readOnlyMind() {
        const recent = this.data.mind.slice(0, 14);
        return `${this._viewingBanner()}
        <div class="chx-card">
            <h3>${this.esc(this.subjectName())}'s check-ins</h3>
            ${recent.length ? recent.map(m => `
                <div class="chx-item">
                    <div class="chx-item-main">
                        <strong>${['😞','🙁','😐','🙂','😄'][Math.max(0, Math.min(4, (m.mood || 3) - 1))]} mood ${m.mood} · energy ${m.energy}</strong>
                        <span class="chx-dim">${this.when(m.date)} · ${m.sleep_hours}h sleep</span>
                    </div>
                </div>`).join('') : '<p class="chx-dim">No check-ins shared.</p>'}
        </div>`;
    },

    // ---------- Body ----------

    renderBody() {
        const readOnly = !this.isOwnLog();
        const ms = this.data.measurements;
        const latest = ms[0];
        const prev = ms[1];
        const delta = latest && prev && latest.weight_lbs && prev.weight_lbs
            ? latest.weight_lbs - prev.weight_lbs : null;

        return `
        ${this._viewingBanner()}
        ${latest ? `<div class="chx-card">
            <h3>Latest</h3>
            <div class="chx-grid">
                <div class="chx-stat"><span class="chx-stat-num">${this.fmt(latest.weight_lbs, 1)}</span><span class="chx-stat-lbl">lbs${delta !== null ? ` (${delta > 0 ? '+' : ''}${this.fmt(delta, 1)})` : ''}</span></div>
                <div class="chx-stat"><span class="chx-stat-num">${latest.body_fat_pct ? this.fmt(latest.body_fat_pct, 1) : '—'}</span><span class="chx-stat-lbl">% body fat</span></div>
                <div class="chx-stat"><span class="chx-stat-num">${latest.muscle_lbs ? this.fmt(latest.muscle_lbs, 1) : '—'}</span><span class="chx-stat-lbl">lbs muscle</span></div>
            </div>
        </div>` : ''}

        ${readOnly ? '' : `<div class="chx-card">
            <h3>Log a measurement</h3>
            <div class="chx-row">
                <input type="number" id="chx-m-weight" placeholder="weight lbs" step="0.1" min="0">
                <input type="number" id="chx-m-fat" placeholder="body fat %" step="0.1" min="0">
                <input type="number" id="chx-m-muscle" placeholder="muscle lbs" step="0.1" min="0">
            </div>
            <input type="text" id="chx-m-notes" placeholder="Notes (optional)">
            <button class="chx-btn chx-primary" id="chx-add-measure">Add measurement</button>
        </div>`}

        <div class="chx-card">
            <h3>History</h3>
            ${ms.length ? this._sparkline(ms) + ms.slice(0, 14).map(m => `
                <div class="chx-item">
                    <div class="chx-item-main">
                        <strong>${this.fmt(m.weight_lbs, 1)} lbs</strong>
                        <span class="chx-dim">${this.when(m.date)}${m.notes ? ' · ' + this.esc(m.notes) : ''}</span>
                    </div>
                    ${readOnly ? '' : `<button class="chx-del" data-del-measure="${m.id}" title="Delete">✕</button>`}
                </div>`).join('') : '<p class="chx-dim">No measurements yet.</p>'}
        </div>`;
    },

    // A tiny inline chart. Enough to see a trend without pulling in a library.
    _sparkline(ms) {
        const pts = ms.filter(m => m.weight_lbs).slice(0, 30).reverse();
        if (pts.length < 2) return '';
        const w = 280, h = 60, pad = 4;
        const vals = pts.map(p => p.weight_lbs);
        const min = Math.min(...vals), max = Math.max(...vals);
        const span = (max - min) || 1;
        const d = pts.map((p, i) => {
            const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
            const y = h - pad - ((p.weight_lbs - min) / span) * (h - pad * 2);
            return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        return `<svg class="chx-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Weight trend">
            <path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
        <div class="chx-spark-lbl"><span>${this.fmt(min, 1)}</span><span>${pts.length} readings</span><span>${this.fmt(max, 1)}</span></div>`;
    },

    // ---------- actions ----------

    _bindTab() {
        const $ = id => document.getElementById(id);
        const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

        this.container.querySelectorAll('[data-go]').forEach(b =>
            b.addEventListener('click', () => {
                this.tab = b.dataset.go;
                this.container.querySelectorAll('[data-tab]').forEach(x =>
                    x.classList.toggle('active', x.dataset.tab === this.tab));
                this.render();
            }));

        this.container.querySelectorAll('[data-quick]').forEach(b =>
            b.addEventListener('click', () => this.quickAdd(b.dataset.quick)));
        this.container.querySelectorAll('[data-again]').forEach(b =>
            b.addEventListener('click', () => this.logAgain(b.dataset.again)));

        // Amount bar. Typing only updates the hint; switching unit swaps in a
        // sensible default for that unit rather than reinterpreting "100" as
        // 100 servings.
        const amt = $('chx-amt'), hint = this.container.querySelector('.chx-amt-hint');
        if (amt) {
            amt.addEventListener('input', () => {
                this.amount.value = amt.value;
                if (hint) hint.textContent = this._amountHint();
            });
        }
        this.container.querySelectorAll('[data-unit]').forEach(b =>
            b.addEventListener('click', () => {
                this.amount = { unit: b.dataset.unit, value: this.UNIT_DEFAULTS[b.dataset.unit] };
                this.container.querySelectorAll('[data-unit]').forEach(x =>
                    x.classList.toggle('active', x === b));
                if (amt) amt.value = this.amount.value;
                if (hint) hint.textContent = this._amountHint();
            }));

        const search = $('chx-food-search');
        if (search) {
            const results = $('chx-food-results');
            const run = () => {
                const hits = this.searchLibrary(search.value);
                if (!search.value.trim()) { results.innerHTML = ''; return; }
                results.innerHTML = hits.length
                    ? hits.map(g => `<button class="chx-result" data-quick="${g.id}">
                        <span>${this.esc(g.name)}</span>
                        <small>${this.fmt(g.calories)} kcal · ${this.fmt(g.protein_grams)}g protein</small>
                      </button>`).join('')
                    : '<p class="chx-dim">Nothing matches. Log it manually below.</p>';
                results.querySelectorAll('[data-quick]').forEach(b =>
                    b.addEventListener('click', () => this.quickAdd(b.dataset.quick)));
            };
            search.addEventListener('input', run);
        }

        on('chx-add-meal', 'click', () => this.addMeal());
        on('chx-add-workout', 'click', () => this.addWorkout());
        on('chx-save-mind', 'click', () => this.saveMind());
        on('chx-add-measure', 'click', () => this.addMeasurement());
        on('chx-med-toggle', 'click', () => this.toggleMeditation());

        on('chx-share-btn', 'click', async () => {
            const input = document.getElementById('chx-share-email');
            const err = document.getElementById('chx-share-err');
            const email = (input.value || '').trim();
            if (!email) return;
            try { await this.shareHealth(email); }
            catch (e) { if (err) { err.textContent = e.message; err.classList.remove('hidden'); } }
        });
        this.container.querySelectorAll('[data-unshare-health]').forEach(b =>
            b.addEventListener('click', () => this.unshareHealth(b.dataset.unshareHealth)));

        ['mood', 'energy', 'sleep'].forEach(k => {
            const el = $('chx-' + k), out = $('chx-' + k + '-v');
            if (el && out) el.addEventListener('input', () => { out.textContent = el.value; });
        });

        this.container.querySelectorAll('[data-del-meal]').forEach(b =>
            b.addEventListener('click', () => this.remove('meal_entries', b.dataset.delMeal, 'meals')));
        this.container.querySelectorAll('[data-del-workout]').forEach(b =>
            b.addEventListener('click', () => this.remove('workouts', b.dataset.delWorkout, 'workouts')));
        this.container.querySelectorAll('[data-del-measure]').forEach(b =>
            b.addEventListener('click', () => this.remove('profile_measurements', b.dataset.delMeasure, 'measurements')));
    },

    _base() {
        const uid = this.uid();
        return { owner_id: uid, device_id: 'web:' + uid, user_id: uid };
    },

    // ---------- portions ----------
    //
    // Everything logged from the library or re-logged from history goes
    // through here, so grams, percentages and whole servings all end up as one
    // multiplier applied to a per-serving basis.

    // How many servings the amount bar currently means for this food.
    // `basisGrams` is what one serving of it weighs, or null if unknown.
    _portion(basisGrams) {
        const { value, unit } = this.amount;
        const v = Number(value);
        if (!isFinite(v) || v <= 0) return { error: 'Enter an amount above zero.' };
        if (unit === 'gram') {
            if (!basisGrams) return { error: 'No serving weight for this one — use % or servings.' };
            return { factor: v / basisGrams, quantity: v, unit: 'gram', label: this.fmt(v) + ' g' };
        }
        const servings = unit === 'percent' ? v / 100 : v;
        return {
            factor: servings, quantity: servings, unit: 'serving',
            label: unit === 'percent' ? this.fmt(v) + '% of a serving'
                                      : this.fmt(servings, 2) + (servings === 1 ? ' serving' : ' servings')
        };
    },

    // Multiply a nutrient row. `map` is source key -> destination key.
    _scaled(src, map, factor) {
        const out = {};
        for (const [from, to] of Object.entries(map)) {
            const n = Number(src[from]);
            out[to] = isFinite(n) ? Math.round(n * factor * 100) / 100 : 0;
        }
        return out;
    },

    async quickAdd(id) {
        const g = this.data.library.find(x => x.id === id);
        if (!g) return;
        const p = this._portion(g.serving_grams);
        if (p.error) { this._toast(p.error); return; }
        const row = {
            ...this._base(),
            name: g.name, meal_type: g.meal_type, date: new Date().toISOString(),
            quantity: p.quantity, quantity_unit: p.unit,
            ...this._scaled(g, this.LIB_TO_ENTRY, p.factor)
        };
        await this._insert('meal_entries', row, 'meals', `${g.name} — ${p.label}`, 2);
        this.resetAmount();
    },

    async addMeal() {
        const name = document.getElementById('chx-meal-name').value.trim();
        if (!name) { this._toast('Give the meal a name first.'); return; }
        const num = id => Number(document.getElementById(id).value) || 0;
        const row = {
            ...this._base(),
            name,
            meal_type: document.getElementById('chx-meal-type').value,
            date: new Date().toISOString(),
            calories: num('chx-meal-cal'),
            protein_grams: num('chx-meal-p'),
            carbs_grams: num('chx-meal-c'),
            fat_grams: num('chx-meal-f')
        };
        document.querySelectorAll('[data-serving]').forEach(el => {
            row[el.dataset.serving] = Number(el.value) || 0;
        });
        await this._insert('meal_entries', row, 'meals', 'Meal logged', 2);
    },

    async addWorkout() {
        const row = {
            ...this._base(),
            date: new Date().toISOString(),
            workout_type: document.getElementById('chx-w-type').value,
            duration_minutes: Number(document.getElementById('chx-w-min').value) || 30,
            intensity: document.getElementById('chx-w-int').value,
            starting_feeling: document.getElementById('chx-w-feel').value.trim() || null,
            notes: document.getElementById('chx-w-notes').value.trim()
        };
        await this._insert('workouts', row, 'workouts', 'Workout logged', 5);
    },

    async saveMind() {
        const num = id => Number(document.getElementById(id).value);
        const payload = {
            mood: num('chx-mood'),
            energy: num('chx-energy'),
            sleep_hours: num('chx-sleep'),
            gratitude: document.getElementById('chx-grat').value.trim(),
            journal: document.getElementById('chx-journal').value.trim()
        };
        const existing = this.todayMind();
        try {
            if (existing) {
                const { error } = await this.db('mind_entries').update(payload).eq('id', existing.id);
                if (error) throw error;
                Object.assign(existing, payload);
                this._toast('Check-in updated');
            } else {
                const { data, error } = await this.db('mind_entries')
                    .insert({ ...this._base(), date: new Date().toISOString(), ...payload })
                    .select().single();
                if (error) throw error;
                this.data.mind.unshift(data);
                await this.awardCrumpets(3, 'for checking in');
            }
            this.render();
        } catch (e) { this._toast('Could not save: ' + e.message); }
    },

    async addMeasurement() {
        const num = id => { const v = document.getElementById(id).value; return v === '' ? null : Number(v); };
        const weight = num('chx-m-weight');
        if (weight === null) { this._toast('Enter a weight first.'); return; }
        const row = {
            ...this._base(),
            date: new Date().toISOString(),
            weight_lbs: weight,
            body_fat_pct: num('chx-m-fat'),
            muscle_lbs: num('chx-m-muscle'),
            notes: document.getElementById('chx-m-notes').value.trim()
        };
        await this._insert('profile_measurements', row, 'measurements', 'Measurement saved', 2);
    },

    async _insert(table, row, key, msg, crumpets) {
        try {
            const { data, error } = await this.db(table).insert(row).select().single();
            if (error) throw error;
            this.data[key].unshift(data);
            this._toast(msg);
            if (crumpets) await this.awardCrumpets(crumpets, 'logged');
            this.render();
        } catch (e) {
            console.error('[CozyHealth] insert failed', table, e);
            this._toast('Could not save: ' + e.message);
        }
    },

    async remove(table, id, key) {
        if (!confirm('Delete this entry?')) return;
        try {
            const { error } = await this.db(table).delete().eq('id', id);
            if (error) throw error;
            this.data[key] = this.data[key].filter(r => r.id !== id);
            this.render();
        } catch (e) { this._toast('Could not delete: ' + e.message); }
    },

    // ---------- meditation timer ----------

    toggleMeditation() {
        const btn = document.getElementById('chx-med-toggle');
        const face = document.getElementById('chx-timer-face');
        if (this._timerId) {
            clearInterval(this._timerId);
            this._timerId = null;
            const secs = this._medElapsed || 0;
            btn.textContent = 'Start';
            if (secs >= 20) this._saveMeditation(secs);
            else this._toast('Session too short to save.');
            this._medElapsed = 0;
            face.textContent = '0:00';
            return;
        }
        const preset = Number(document.getElementById('chx-med-preset').value) || 5;
        this._medElapsed = 0;
        btn.textContent = 'Finish';
        this._timerId = setInterval(() => {
            this._medElapsed++;
            const m = Math.floor(this._medElapsed / 60), s = this._medElapsed % 60;
            face.textContent = `${m}:${String(s).padStart(2, '0')}`;
            if (this._medElapsed >= preset * 60) this.toggleMeditation();   // preset reached
        }, 1000);
    },

    async _saveMeditation(secs) {
        const preset = Number(document.getElementById('chx-med-preset')?.value) || 5;
        try {
            const { data, error } = await this.db('meditation_sessions').insert({
                id: crypto.randomUUID(),
                ...this._base(),
                date: new Date().toISOString(),
                duration_seconds: secs,
                preset_minutes: preset,
                color_hex: '#7fb6a8'
            }).select().single();
            if (error) throw error;
            this.data.meditations.unshift(data);
            await this.awardCrumpets(Math.max(1, Math.round(secs / 60)), 'for sitting still');
            this.render();
        } catch (e) { this._toast('Could not save session: ' + e.message); }
    }
};
