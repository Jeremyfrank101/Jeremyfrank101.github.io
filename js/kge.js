// kge.js — KGE Stories: the same story in English, Kannada and Greek.
//
// The reading view shows every sentence three times over, in that order.
// Tapping one opens the workings: how to say the Kannada, how to say the
// Greek, a word-by-word gloss so you can see which piece means what, and a
// note on what the two languages did differently from English.
//
// The stories themselves are in kge-stories.js. Progress — which sentences
// you have studied — is per account and lives in Supabase.

const KGE = {
    SCHEMA: 'cozyhealth',          // shares the app schema; its own table
    TABLE: 'kge_progress',

    mounted: false,
    container: null,
    view: { name: 'shelf' },       // shelf | story
    focus: 'both',                 // both | kn | el
    studied: new Set(),
    open: null,                    // index of the expanded sentence

    LEVELS: {
        1: 'A couple of sentences',
        2: 'A short exchange',
        3: 'A page',
        4: 'A few pages',
        5: 'A long read'
    },

    // ---------- lifecycle ----------

    mount(container) {
        if (this.mounted) {
            if (this.container === container && document.body.contains(container)) return;
            this.unmount();
        }
        this.container = container;
        this.mounted = true;
        this.view = { name: 'shelf' };
        try { this.focus = localStorage.getItem('kge_focus') || 'both'; } catch (e) { /* private mode */ }
        this._buildDOM();
        this.refresh();
    },

    unmount() {
        if (!this.mounted) return;
        this.mounted = false;
        if (this.container) this.container.innerHTML = '';
        this.container = null;
    },

    db() { return Auth.client.schema(this.SCHEMA).from(this.TABLE); },
    uid() { return Auth.getUser()?.id || null; },

    _buildDOM() {
        this.container.innerHTML = `
            <div class="kge-root"><div class="kge-body">${UI.skeleton(3)}</div>
            <div class="kge-toast hidden"></div></div>`;
        this.dom = {
            body: this.container.querySelector('.kge-body'),
            toast: this.container.querySelector('.kge-toast')
        };
    },

    _toast(msg) {
        if (!this.dom) return;
        this.dom.toast.textContent = msg;
        this.dom.toast.classList.remove('hidden');
        clearTimeout(this._t);
        this._t = setTimeout(() => this.dom.toast.classList.add('hidden'), 2200);
    },

    esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    },

    async refresh() {
        if (!Auth.client || !this.uid()) return;
        try {
            const { data, error } = await this.db().select('story_id,line_index').eq('owner_id', this.uid());
            if (error) throw error;
            this.studied = new Set((data || []).map(r => `${r.story_id}:${r.line_index}`));
        } catch (e) {
            // Progress is a nicety; never let it stop you reading.
            console.warn('[KGE] progress load failed', e);
        }
        this.render();
    },

    story(id) { return KGEStories.find(s => s.id === id); },
    isStudied(sid, i) { return this.studied.has(`${sid}:${i}`); },
    studiedIn(sid) {
        const st = this.story(sid);
        return st ? st.lines.filter((_, i) => this.isStudied(sid, i)).length : 0;
    },

    // ---------- render ----------

    render() {
        if (!this.mounted || !this.dom) return;
        this.dom.body.innerHTML = this.view.name === 'story'
            ? this.renderStory(this.view.id) : this.renderShelf();
        this._bind();
    },

    go(view) { this.view = view; this.open = null; this.render(); this.dom.body.scrollTop = 0; },

    renderShelf() {
        const total = KGEStories.reduce((n, s) => n + s.lines.length, 0);
        const done = this.studied.size;
        const byLevel = {};
        KGEStories.forEach(s => (byLevel[s.level] ||= []).push(s));

        return `
        <header class="kge-head">
            <h2>KGE Stories</h2>
            <p>Every sentence three times: English, then Kannada, then Greek.
               Tap any sentence to see how to say it and what the grammar did.</p>
            <div class="kge-progress">
                <span class="kge-bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></span>
                <span>${done} of ${total} sentences studied</span>
            </div>
            ${this._focusBar()}
        </header>

        ${Object.keys(byLevel).sort().map(lv => `
            <div class="kge-tier">
                <h3>${this.esc(this.LEVELS[lv])}</h3>
                <div class="kge-cards">
                    ${byLevel[lv].map(s => {
                        const n = this.studiedIn(s.id);
                        return `<button class="kge-card ${n === s.lines.length ? 'done' : ''}" data-story="${s.id}">
                            <span class="kge-card-top">
                                <strong>${this.esc(s.title)}</strong>
                                <em>${s.lines.length} sentence${s.lines.length === 1 ? '' : 's'}</em>
                            </span>
                            <span class="kge-card-blurb">${this.esc(s.blurb)}</span>
                            <span class="kge-card-bar"><i style="width:${(n / s.lines.length) * 100}%"></i></span>
                        </button>`;
                    }).join('')}
                </div>
            </div>`).join('')}`;
    },

    _focusBar() {
        const b = (id, label) =>
            `<button class="kge-focus ${this.focus === id ? 'active' : ''}" data-focus="${id}">${label}</button>`;
        return `<div class="kge-focusbar">
            <span class="kge-dim">Show</span>
            ${b('both', 'Both')}${b('kn', 'Kannada only')}${b('el', 'Greek only')}
        </div>`;
    },

    renderStory(id) {
        const s = this.story(id);
        if (!s) return this.renderShelf();
        const n = this.studiedIn(id);

        return `
        <div class="kge-crumb"><button class="kge-back" data-shelf>‹ All stories</button></div>
        <header class="kge-head">
            <h2>${this.esc(s.title)}</h2>
            <p>${this.esc(s.blurb)} · ${n} of ${s.lines.length} studied</p>
            ${this._focusBar()}
        </header>

        <div class="kge-lines">
            ${s.lines.map((l, i) => this._line(s, l, i)).join('')}
        </div>

        ${this._nextStory(s)}`;
    },

    _line(s, l, i) {
        const open = this.open === i;
        const done = this.isStudied(s.id, i);
        const showKn = this.focus !== 'el', showEl = this.focus !== 'kn';

        return `<div class="kge-line ${open ? 'open' : ''} ${done ? 'done' : ''}" data-key="${i}">
            <button class="kge-sentence" data-line="${i}" aria-expanded="${open}">
                <span class="kge-num">${i + 1}</span>
                <span class="kge-texts">
                    <span class="kge-en">${this.esc(l.en)}</span>
                    ${showKn ? `<span class="kge-kn" lang="kn">${this.esc(l.kn.text)}</span>` : ''}
                    ${showEl ? `<span class="kge-el" lang="el">${this.esc(l.el.text)}</span>` : ''}
                </span>
                <span class="kge-chev" aria-hidden="true">${open ? '▾' : '▸'}</span>
            </button>

            ${open ? `<div class="kge-detail">
                ${showKn ? this._langBlock('Kannada', 'kn', l.kn) : ''}
                ${showEl ? this._langBlock('Greek', 'el', l.el) : ''}

                <div class="kge-gloss">
                    <div class="kge-gloss-head">
                        <span>English</span>${showKn ? '<span>Kannada</span>' : ''}${showEl ? '<span>Greek</span>' : ''}
                    </div>
                    ${(l.gloss || []).map(g => `<div class="kge-gloss-row">
                        <span>${this.esc(g[0])}</span>
                        ${showKn ? `<span lang="kn-Latn">${this.esc(g[1])}</span>` : ''}
                        ${showEl ? `<span lang="el-Latn">${this.esc(g[2])}</span>` : ''}
                    </div>`).join('')}
                </div>

                <div class="kge-note">
                    <span class="kge-note-label">What changed</span>
                    <p>${this.esc(l.note)}</p>
                </div>

                <button class="kge-btn ${done ? 'kge-ghost' : 'kge-primary'}" data-studied="${i}">
                    ${done ? 'Studied ✓ — mark unread' : 'Mark as studied'}
                </button>
            </div>` : ''}
        </div>`;
    },

    _langBlock(label, cls, d) {
        return `<div class="kge-lang kge-lang-${cls}">
            <div class="kge-lang-head">${label}</div>
            <div class="kge-script" lang="${cls}">${this.esc(d.text)}</div>
            <div class="kge-tr">${this.esc(d.tr)}</div>
            <div class="kge-say"><span>say it</span> ${this.esc(d.say)}</div>
        </div>`;
    },

    _nextStory(s) {
        const i = KGEStories.indexOf(s);
        const next = KGEStories[i + 1];
        if (!next) return '<p class="kge-dim kge-end">That is the last story. Start another, or read this one again.</p>';
        return `<button class="kge-btn kge-next" data-story="${next.id}">
            Next: ${this.esc(next.title)} ›</button>`;
    },

    // ---------- actions ----------

    _bind() {
        const all = (sel, fn) => this.container.querySelectorAll(sel).forEach(fn);

        all('[data-shelf]', b => b.addEventListener('click', () => this.go({ name: 'shelf' })));
        all('[data-story]', b => b.addEventListener('click', () =>
            this.go({ name: 'story', id: b.dataset.story })));
        all('[data-focus]', b => b.addEventListener('click', () => {
            this.focus = b.dataset.focus;
            try { localStorage.setItem('kge_focus', this.focus); } catch (e) { /* private mode */ }
            this.render();
        }));
        all('[data-line]', b => b.addEventListener('click', () => {
            const i = +b.dataset.line;
            this.open = this.open === i ? null : i;
            this.render();
            if (this.open === i) {
                this.container.querySelector(`[data-key="${i}"]`)
                    ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }));
        all('[data-studied]', b => b.addEventListener('click', e => {
            e.stopPropagation();
            this.toggleStudied(this.view.id, +b.dataset.studied);
        }));
    },

    // Marking a sentence studied is a write like any other: applied locally
    // and queued, so it works on a train with no signal.
    toggleStudied(storyId, i) {
        const key = `${storyId}:${i}`;
        const on = !this.studied.has(key);
        if (on) this.studied.add(key); else this.studied.delete(key);

        Sync.enqueueWrite(on
            ? { schema: this.SCHEMA, table: this.TABLE, action: 'upsert',
                payload: { owner_id: this.uid(), story_id: storyId, line_index: i,
                           studied_at: new Date().toISOString() } }
            : { schema: this.SCHEMA, table: this.TABLE, action: 'delete',
                match: { owner_id: this.uid(), story_id: storyId, line_index: i } });

        this.render();
    }
};
