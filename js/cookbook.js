// cookbook.js — "CozyCookBook": recipes, grouped into cookbooks you can share.
//
// The data already existed in Supabase under the CozyCookBookSchema schema,
// written by the iOS app: folders are cookbooks, recipes carry their
// ingredients and steps as JSON arrays of {id, name|text, isChecked}, and
// cookbook_shares invites another account to a whole folder. This is a second
// client over exactly that data, so anything logged here shows up there.
//
// Note the schema name is capitalised. PostgREST matches it exactly, so
// `schema('cozycookbookschema')` fails where `schema('CozyCookBookSchema')`
// works.

const CozyCookBook = {
    SCHEMA: 'CozyCookBookSchema',
    MEALS: ['Breakfast', 'Lunch', 'Dinner'],

    mounted: false,
    container: null,
    view: { name: 'shelf' },        // shelf | folder | recipe
    data: { folders: [], recipes: [], shares: [], people: {} },
    _error: null,

    // ---------- shell ----------

    mount(container) {
        if (this.mounted) {
            if (this.container === container && document.body.contains(container)) return;
            this.unmount();
        }
        this.container = container;
        this.mounted = true;
        this.view = { name: 'shelf' };
        this._buildDOM();
        this.refresh();
    },

    unmount() {
        if (!this.mounted) return;
        this.mounted = false;
        if (this.container) this.container.innerHTML = '';
        this.container = null;
    },

    db(table) { return Auth.client.schema(this.SCHEMA).from(table); },
    uid() { return Auth.getUser()?.id || null; },

    // Every change is applied locally and queued for the server, so ticking
    // off an ingredient in a kitchen with no signal is not silently thrown
    // away. Ids are generated here rather than by Postgres: the optimistic row
    // and the stored row are then the same row, and a retry whose first
    // attempt actually landed collides on the key instead of duplicating.
    _write(table, action, payload, match) {
        Sync.enqueueWrite({ schema: this.SCHEMA, table, action, payload, match });
    },

    _buildDOM() {
        this.container.innerHTML = `
        <div class="ckb-root">
            <div class="ckb-body">${UI.skeleton(3)}</div>
            <div class="ckb-toast hidden"></div>
        </div>`;
        this.dom = {
            body: this.container.querySelector('.ckb-body'),
            toast: this.container.querySelector('.ckb-toast')
        };
    },

    _toast(msg) {
        if (!this.dom) return;
        this.dom.toast.textContent = msg;
        this.dom.toast.classList.remove('hidden');
        clearTimeout(this._toastT);
        this._toastT = setTimeout(() => this.dom.toast.classList.add('hidden'), 2600);
    },

    esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    },

    // ---------- loading ----------

    async refresh() {
        if (!Auth.client || !this.uid()) return;
        if (this.dom) this.dom.body.innerHTML = UI.skeleton(3);
        try {
            const [folders, recipes, shares] = await Promise.all([
                this.db('folders').select('*').order('name'),
                this.db('recipes').select('id,title,ingredients,steps,made_count,created_at,folder_id,user_id,meal')
                    .order('created_at', { ascending: false }),
                this.db('cookbook_shares').select('*')
            ]);
            const err = [folders, recipes, shares].find(r => r.error);
            if (err) throw err.error;

            this.data.folders = folders.data || [];
            this.data.recipes = recipes.data || [];
            this.data.shares = shares.data || [];
            await this._loadPeople();
            this._error = null;
        } catch (e) {
            console.error('[CozyCookBook] load failed', e);
            this._error = e.message || String(e);
        }
        this.render();
    },

    // Names for the people on either side of a share.
    async _loadPeople() {
        const ids = new Set();
        for (const s of this.data.shares) { ids.add(s.owner_id); ids.add(s.shared_with); }
        ids.delete(this.uid());
        const missing = [...ids].filter(id => !this.data.people[id]);
        if (!missing.length) return;
        // profiles is keyed on user_id, not id.
        const { data } = await Auth.client.from('profiles')
            .select('user_id,username,email').in('user_id', missing);
        for (const p of data || []) this.data.people[p.user_id] = p.username || p.email;
    },

    who(id) {
        if (id === this.uid()) return 'you';
        return this.data.people[id] || 'someone';
    },

    // ---------- derived ----------

    isMine(row) { return row && (row.user_id || row.owner_id) === this.uid(); },

    myFolders()     { return this._ordered(this.data.folders.filter(f => f.user_id === this.uid())); },
    sharedFolders() { return this._ordered(this.data.folders.filter(f => f.user_id !== this.uid())); },

    // Invitations sent to me that I have not answered yet.
    pendingForMe() {
        return this.data.shares.filter(s => s.shared_with === this.uid() && s.status === 'pending');
    },
    sharesOf(folderId) {
        return this.data.shares.filter(s => s.folder_id === folderId && s.owner_id === this.uid());
    },
    recipesIn(folderId) {
        return this._ordered(this.data.recipes.filter(r => r.folder_id === folderId));
    },

    // Manual order first, then whatever the list used to fall back to.
    _ordered(list) {
        return list.slice().sort((a, b) => {
            const pa = a.position, pb = b.position;
            if (pa != null && pb != null) return pa - pb;
            if (pa != null) return -1;
            if (pb != null) return 1;
            return String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''));
        });
    },

    // ---------- drag, undo, search ----------

    reorder(kind, id, beforeId, afterId) {
        const table = kind === 'folder' ? 'folders' : 'recipes';
        const list = kind === 'folder' ? this.data.folders : this.data.recipes;
        const rec = list.find(x => x.id === id);
        if (!rec) return;
        const pos = (idx) => { const r = list.find(x => x.id === idx); return r ? r.position : null; };
        rec.position = UI.between(beforeId ? pos(beforeId) : null, afterId ? pos(afterId) : null);
        this._write(table, 'update', { position: rec.position }, { id });
        this.render();
    },

    // Dropping a recipe on a cookbook moves it there, at the end.
    moveRecipe(recipeId, folderId) {
        const r = this.recipe(recipeId);
        if (!r || r.folder_id === folderId) return;
        const peers = this.recipesIn(folderId);
        r.folder_id = folderId;
        r.position = peers.length ? peers[peers.length - 1].position + UI.GAP : UI.GAP;
        this._write('recipes', 'update', { folder_id: folderId, position: r.position }, { id: recipeId });
        const f = this.folder(folderId);
        this._toast(`Moved to ${f ? f.name : 'the cookbook'}`);
        this.render();
    },

    // Reordering a checklist rewrites the whole jsonb array, which is fine:
    // it is one column and the app already read-modify-writes it to tick a box.
    reorderLine(kind, from, to) {
        const r = this.recipe(this.view.id);
        if (!r || !this.isMine(r)) return;
        const key = kind === 'ing' ? 'ingredients' : 'steps';
        const arr = (r[key] || []).slice();
        if (from === to || from < 0 || from >= arr.length) return;
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        this._saveLines(r, { [key]: arr });
        this.render();
    },

    deleteWithUndo(kind, id, label) {
        const table = kind === 'folder' ? 'folders' : 'recipes';
        const list = kind === 'folder' ? 'folders' : 'recipes';
        const snapshot = this.data[list].slice();
        const backTo = this.view;
        this.data[list] = this.data[list].filter(x => x.id !== id);
        if (kind === 'recipe') this.go({ name: 'folder', id: (snapshot.find(x=>x.id===id)||{}).folder_id });
        else this.go({ name: 'shelf' });

        UI.undo(`Deleted ${label}`, {
            onCommit: () => this._write(table, 'delete', null, { id }),
            onUndo: () => { this.data[list] = snapshot; this.go(backTo); }
        });
    },

    searchTerm: '',

    _matchesSearch(text) {
        const q = (this.searchTerm || '').trim().toLowerCase();
        return !q || String(text || '').toLowerCase().includes(q);
    },
    recipe(id) { return this.data.recipes.find(r => r.id === id); },
    folder(id) { return this.data.folders.find(f => f.id === id); },

    // ---------- render ----------

    render() {
        if (!this.mounted || !this.dom) return;
        if (this._error) {
            this.dom.body.innerHTML = `<div class="ckb-empty">
                <p>Couldn't open your cookbooks.</p>
                <p class="ckb-dim">${this.esc(this._error)}</p>
                <button class="ckb-btn" onclick="CozyCookBook.refresh()">Try again</button>
            </div>`;
            return;
        }
        const v = this.view;
        this.dom.body.innerHTML =
            v.name === 'recipe' ? this.renderRecipe(v.id) :
            v.name === 'folder' ? this.renderFolder(v.id) :
                                  this.renderShelf();
        this._bind();
    },

    go(view) { this.view = view; this.render(); this.dom.body.scrollTop = 0; },

    renderShelf() {
        const mine = this.myFolders(), shared = this.sharedFolders(), pending = this.pendingForMe();
        const card = (f, owned) => {
            const rs = this.recipesIn(f.id);
            const shares = this.sharesOf(f.id);
            return `<div class="ckb-folder" data-key="${f.id}" data-kind="folder" data-folder="${f.id}" role="button" tabindex="0">
                <span class="ui-grip" data-drag-handle aria-hidden="true"></span>
                <span class="ckb-folder-spine" aria-hidden="true"></span>
                <span class="ckb-folder-main">
                    <strong>${this.esc(f.name)}</strong>
                    <small>${rs.length} recipe${rs.length === 1 ? '' : 's'}${
                        owned && shares.length ? ` · shared with ${shares.length}` : ''}${
                        owned ? '' : ` · from ${this.esc(this.who(f.user_id))}`}</small>
                </span>
                <span class="ckb-go" aria-hidden="true">›</span>
            </div>`;
        };

        return `
        ${pending.length ? `<div class="ckb-card ckb-invites">
            <h3>Invitations</h3>
            ${pending.map(s => `<div class="ckb-invite">
                <span>${this.esc(this.who(s.owner_id))} shared a cookbook with you.</span>
                <span class="ckb-invite-btns">
                    <button class="ckb-btn ckb-primary" data-accept="${s.id}">Accept</button>
                    <button class="ckb-btn ckb-ghost" data-decline="${s.id}">Decline</button>
                </span>
            </div>`).join('')}
        </div>` : ''}

        <div class="ckb-card">
            <input type="search" id="ckb-search" class="ckb-searchbox" placeholder="Search recipes and ingredients…"
                   value="${this.esc(this.searchTerm)}" autocomplete="off" aria-label="Search recipes and ingredients">
            ${this.searchTerm ? this._searchResults() : ''}
        </div>

        <div class="ckb-card"${this.searchTerm ? ' hidden' : ''}>
            <h3>Your cookbooks</h3>
            <div class="ckb-list" data-drag="folder">${mine.length ? mine.map(f => card(f, true)).join('')
                          : '<p class="ckb-dim">No cookbooks yet. Make one below.</p>'}</div>
            <div class="ckb-row">
                <input type="text" id="ckb-new-folder" placeholder="New cookbook name" autocomplete="off">
                <button class="ckb-btn ckb-primary" id="ckb-add-folder">Add</button>
            </div>
        </div>

        ${shared.length ? `<div class="ckb-card">
            <h3>Shared with you</h3>
            ${shared.map(f => card(f, false)).join('')}
        </div>` : ''}`;
    },

    _searchResults() {
        const q = this.searchTerm.trim().toLowerCase();
        const hits = this.data.recipes.filter(r =>
            this._matchesSearch(r.title) ||
            (r.ingredients || []).some(i => String(i.name || '').toLowerCase().includes(q)));
        if (!hits.length) return '<p class="ckb-dim">Nothing matches that.</p>';
        return `<div class="ckb-recipes">${hits.map(r => {
            const f = this.folder(r.folder_id);
            const via = !this._matchesSearch(r.title)
                ? (r.ingredients || []).find(i => String(i.name || '').toLowerCase().includes(q)) : null;
            return `<div class="ckb-recipe" data-recipe="${r.id}" role="button" tabindex="0">
                <span class="ckb-recipe-main">
                    <strong>${this.esc(r.title)}</strong>
                    <small>${f ? this.esc(f.name) : 'no cookbook'}${via ? ` · ${this.esc(via.name)}` : ''}</small>
                </span>
                <span class="ckb-go" aria-hidden="true">›</span>
            </div>`;
        }).join('')}</div>`;
    },

    renderFolder(id) {
        const f = this.folder(id);
        if (!f) return this.renderShelf();
        const owned = f.user_id === this.uid();
        const rs = this.recipesIn(id);
        const shares = this.sharesOf(id);

        return `
        <div class="ckb-crumb"><button class="ckb-back" data-shelf>‹ All cookbooks</button></div>
        <div class="ckb-card">
            <h3>${this.esc(f.name)}</h3>
            <p class="ckb-dim">${rs.length} recipe${rs.length === 1 ? '' : 's'}${
                owned ? '' : ` · ${this.esc(this.who(f.user_id))}'s cookbook, read only`}</p>
            ${rs.length ? `<div class="ckb-recipes" data-drag="recipe">${rs.map(r => `
                <div class="ckb-recipe" data-key="${r.id}" data-kind="recipe" data-recipe="${r.id}" role="button" tabindex="0">
                    <span class="ui-grip" data-drag-handle aria-hidden="true"></span>
                    <span class="ckb-recipe-main">
                        <strong>${this.esc(r.title)}</strong>
                        <small>${r.meal ? this.esc(r.meal) + ' · ' : ''}${
                            (r.ingredients || []).length} ingredients · ${(r.steps || []).length} steps${
                            r.made_count ? ` · made ${r.made_count}×` : ''}</small>
                    </span>
                    <span class="ckb-go" aria-hidden="true">›</span>
                </div>`).join('')}</div>`
                : '<p class="ckb-dim">Nothing in here yet.</p>'}
        </div>

        ${owned ? `
        <div class="ckb-card">
            <h3>Add a recipe</h3>
            <input type="text" id="ckb-new-title" placeholder="Recipe name">
            <div class="ckb-row">
                <select id="ckb-new-meal">
                    <option value="">Any meal</option>
                    ${this.MEALS.map(m => `<option>${m}</option>`).join('')}
                </select>
                <button class="ckb-btn ckb-primary" id="ckb-add-recipe">Add</button>
            </div>
            <p class="ckb-dim">You can add ingredients and steps once it exists.</p>
        </div>

        <div class="ckb-card">
            <h3>Share this cookbook</h3>
            ${shares.length ? `<div class="ckb-shares">${shares.map(s => `
                <div class="ckb-share">
                    <span>${this.esc(this.who(s.shared_with))} <em>${this.esc(s.status)}</em></span>
                    <button class="ckb-del" data-unshare="${s.id}" title="Stop sharing" aria-label="Stop sharing with ${this.esc(this.who(s.shared_with))}">✕</button>
                </div>`).join('')}</div>` : '<p class="ckb-dim">Not shared with anyone yet.</p>'}
            <div class="ckb-row">
                <input type="email" id="ckb-share-email" placeholder="their email" autocomplete="off">
                <button class="ckb-btn" id="ckb-share">Invite</button>
            </div>
            <p class="ckb-err hidden" id="ckb-share-err"></p>
            <button class="ckb-btn ckb-danger" data-del-folder="${f.id}">Delete cookbook</button>
        </div>` : ''}`;
    },

    renderRecipe(id) {
        const r = this.recipe(id);
        if (!r) return this.renderShelf();
        const owned = this.isMine(r);
        const f = this.folder(r.folder_id);
        const ings = r.ingredients || [], steps = r.steps || [];

        const line = (x, i, kind) => `
            <li class="ckb-line ${x.isChecked ? 'done' : ''}" data-key="${kind}-${i}" data-i="${i}">
                ${owned ? '<span class="ui-grip" data-drag-handle aria-hidden="true"></span>' : ''}
                <label>
                    <input type="checkbox" data-check="${kind}" data-i="${i}" ${x.isChecked ? 'checked' : ''}>
                    <span>${this.esc(kind === 'ing' ? x.name : x.text)}</span>
                </label>
                ${owned ? `<button class="ckb-del" data-drop="${kind}" data-i="${i}" title="Remove" aria-label="Remove ${this.esc(kind === 'ing' ? x.name : x.text)}">✕</button>` : ''}
            </li>`;

        return `
        <div class="ckb-crumb">
            <button class="ckb-back" data-shelf>‹ All cookbooks</button>
            ${f ? `<button class="ckb-back" data-folder="${f.id}">${this.esc(f.name)}</button>` : ''}
        </div>

        <div class="ckb-card ckb-recipe-head">
            <h2>${this.esc(r.title)}</h2>
            <p class="ckb-dim">${r.meal ? this.esc(r.meal) + ' · ' : ''}made ${r.made_count || 0}×${
                owned ? '' : ` · ${this.esc(this.who(r.user_id))}'s recipe, read only`}</p>
            ${owned ? `<div class="ckb-row">
                <button class="ckb-btn ckb-primary" data-made="${r.id}">I made this</button>
                <button class="ckb-btn ckb-ghost" data-reset-checks>Clear ticks</button>
            </div>` : ''}
        </div>

        <div class="ckb-card">
            <h3>Ingredients</h3>
            ${ings.length ? `<ul class="ckb-list ckb-lines" data-drag="ing">${ings.map((x, i) => line(x, i, 'ing')).join('')}</ul>`
                          : '<p class="ckb-dim">None listed.</p>'}
            ${owned ? `<div class="ckb-row">
                <input type="text" id="ckb-new-ing" placeholder="Add an ingredient">
                <button class="ckb-btn" id="ckb-add-ing">Add</button>
            </div>` : ''}
        </div>

        <div class="ckb-card">
            <h3>Steps</h3>
            ${steps.length ? `<ol class="ckb-list ckb-steps ckb-lines" data-drag="step">${steps.map((x, i) => line(x, i, 'step')).join('')}</ol>`
                           : '<p class="ckb-dim">No steps yet.</p>'}
            ${owned ? `<div class="ckb-row">
                <input type="text" id="ckb-new-step" placeholder="Add a step">
                <button class="ckb-btn" id="ckb-add-step">Add</button>
            </div>
            <button class="ckb-btn ckb-danger" data-del-recipe="${r.id}">Delete recipe</button>` : ''}
        </div>`;
    },

    // ---------- actions ----------

    _bind() {
        const $ = id => document.getElementById(id);
        const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
        const all = (sel, fn) => this.container.querySelectorAll(sel).forEach(fn);

        // search
        const sb = $('ckb-search');
        if (sb) {
            sb.addEventListener('input', () => {
                this.searchTerm = sb.value;
                const at = sb.selectionStart;
                this.render();
                const again = document.getElementById('ckb-search');
                if (again) { again.focus(); again.setSelectionRange(at, at); }
            });
            sb.addEventListener('keydown', e => {
                if (e.key === 'Escape') { this.searchTerm = ''; this.render(); }
            });
        }

        // drag: reorder cookbooks and recipes, and drop a recipe on a cookbook
        this.container.querySelectorAll('[data-drag]').forEach(box => {
            const kind = box.dataset.drag;
            if (kind === 'ing' || kind === 'step') {
                UI.dragList(box, {
                    rowSelector: '.ckb-line', handle: '.ui-grip',
                    onDrop: ({ id }) => {
                        const rows = [...box.querySelectorAll('.ckb-line')];
                        const to = rows.findIndex(n => n.dataset.key === id);
                        const from = Number(id.split('-')[1]);
                        this.reorderLine(kind, from, to);
                    }
                });
                return;
            }
            UI.dragList(box, {
                rowSelector: kind === 'folder' ? '.ckb-folder' : '.ckb-recipe',
                handle: '.ui-grip',
                acceptsDropOn: kind === 'recipe' ? '.ckb-folder' : null,
                onDrop: ({ id, beforeId, afterId }) => this.reorder(kind, id, beforeId, afterId),
                onDropOn: ({ id, targetId }) => this.moveRecipe(id, targetId)
            });
        });

        all('[data-shelf]', b => b.addEventListener('click', () => this.go({ name: 'shelf' })));
        all('[data-folder]', b => b.addEventListener('click', () => this.go({ name: 'folder', id: b.dataset.folder })));
        all('[data-recipe]', b => b.addEventListener('click', () => this.go({ name: 'recipe', id: b.dataset.recipe })));

        on('ckb-add-folder', 'click', () => this.addFolder());
        on('ckb-new-folder', 'keydown', e => { if (e.key === 'Enter') this.addFolder(); });
        on('ckb-add-recipe', 'click', () => this.addRecipe());
        on('ckb-new-title', 'keydown', e => { if (e.key === 'Enter') this.addRecipe(); });
        on('ckb-add-ing', 'click', () => this.addLine('ing'));
        on('ckb-new-ing', 'keydown', e => { if (e.key === 'Enter') this.addLine('ing'); });
        on('ckb-add-step', 'click', () => this.addLine('step'));
        on('ckb-new-step', 'keydown', e => { if (e.key === 'Enter') this.addLine('step'); });
        on('ckb-share', 'click', () => this.share());

        all('[data-made]', b => b.addEventListener('click', () => this.madeIt(b.dataset.made)));
        all('[data-reset-checks]', b => b.addEventListener('click', () => this.clearChecks()));
        all('[data-check]', b => b.addEventListener('change', () =>
            this.toggleLine(b.dataset.check, +b.dataset.i, b.checked)));
        all('[data-drop]', b => b.addEventListener('click', () =>
            this.dropLine(b.dataset.drop, +b.dataset.i)));
        all('[data-del-recipe]', b => b.addEventListener('click', () => this.delRecipe(b.dataset.delRecipe)));
        all('[data-del-folder]', b => b.addEventListener('click', () => this.delFolder(b.dataset.delFolder)));
        all('[data-unshare]', b => b.addEventListener('click', () => this.unshare(b.dataset.unshare)));
        all('[data-accept]', b => b.addEventListener('click', () => this.answer(b.dataset.accept, 'accepted')));
        all('[data-decline]', b => b.addEventListener('click', () => this.answer(b.dataset.decline, null)));
    },

    // The iOS app writes uppercase UUIDs for line ids; match it so the two
    // clients produce indistinguishable rows.
    _lineId() {
        return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())).toUpperCase();
    },

    async addFolder() {
        const el = document.getElementById('ckb-new-folder');
        const name = (el.value || '').trim();
        if (!name) { this._toast('Give the cookbook a name.'); return; }
        const row = { id: Sync.newId(), name, user_id: this.uid(), created_at: new Date().toISOString() };
        this.data.folders.push(row);
        this.data.folders.sort((a, b) => a.name.localeCompare(b.name));
        this._write('folders', 'insert', row);
        el.value = '';
        this._toast(`${name} created`);
        this.render();
    },

    async delFolder(id) {
        const rs = this.recipesIn(id);
        if (rs.length) { this._toast(`Empty it first — ${rs.length} recipe(s) inside.`); return; }
        const f = this.folder(id);
        this.deleteWithUndo('folder', id, `"${f ? f.name : 'cookbook'}"`);
    },

    async addRecipe() {
        const t = document.getElementById('ckb-new-title');
        const meal = document.getElementById('ckb-new-meal').value || null;
        const title = (t.value || '').trim();
        if (!title) { this._toast('Give the recipe a name.'); return; }
        const row = {
            id: Sync.newId(), title, meal, folder_id: this.view.id, user_id: this.uid(),
            ingredients: [], steps: [], made_count: 0, created_at: new Date().toISOString()
        };
        this.data.recipes.unshift(row);
        this._write('recipes', 'insert', row);
        t.value = '';
        this.go({ name: 'recipe', id: row.id });
    },

    async delRecipe(id) {
        const r = this.recipe(id);
        this.deleteWithUndo('recipe', id, `"${r ? r.title : 'recipe'}"`);
    },

    // Ingredients and steps live in one jsonb column each, so every edit is a
    // read-modify-write of the whole array.
    _saveLines(r, patch) {
        Object.assign(r, patch);
        this._write('recipes', 'update', patch, { id: r.id });
        return true;
    },

    async addLine(kind) {
        const r = this.recipe(this.view.id);
        if (!r || !this.isMine(r)) return;
        const el = document.getElementById(kind === 'ing' ? 'ckb-new-ing' : 'ckb-new-step');
        const text = (el.value || '').trim();
        if (!text) return;
        const key = kind === 'ing' ? 'ingredients' : 'steps';
        const line = kind === 'ing'
            ? { id: this._lineId(), name: text, isChecked: false }
            : { id: this._lineId(), text, isChecked: false };
        if (this._saveLines(r, { [key]: [...(r[key] || []), line] })) this.render();
    },

    async dropLine(kind, i) {
        const r = this.recipe(this.view.id);
        if (!r || !this.isMine(r)) return;
        const key = kind === 'ing' ? 'ingredients' : 'steps';
        const next = (r[key] || []).filter((_, n) => n !== i);
        if (this._saveLines(r, { [key]: next })) this.render();
    },

    // Ticking off while cooking. On someone else's recipe the write would be
    // refused by RLS, so keep it local rather than showing a pointless error.
    async toggleLine(kind, i, checked) {
        const r = this.recipe(this.view.id);
        if (!r) return;
        const key = kind === 'ing' ? 'ingredients' : 'steps';
        const next = (r[key] || []).map((x, n) => n === i ? { ...x, isChecked: checked } : x);
        r[key] = next;
        if (this.isMine(r)) this._saveLines(r, { [key]: next });
        this.render();
    },

    async clearChecks() {
        const r = this.recipe(this.view.id);
        if (!r || !this.isMine(r)) return;
        const clear = a => (a || []).map(x => ({ ...x, isChecked: false }));
        if (this._saveLines(r, { ingredients: clear(r.ingredients), steps: clear(r.steps) })) this.render();
    },

    async madeIt(id) {
        const r = this.recipe(id);
        if (!r) return;
        if (!this.isMine(r)) { this._toast('You can only count makes on your own recipes.'); return; }
        const n = (r.made_count || 0) + 1;
        if (this._saveLines(r, { made_count: n })) {
            this._toast(`${r.title} — made ${n}×`);
            this.render();
        }
    },

    async share() {
        const input = document.getElementById('ckb-share-email');
        const err = document.getElementById('ckb-share-err');
        const show = m => { if (err) { err.textContent = m; err.classList.remove('hidden'); } };
        const email = (input.value || '').trim();
        if (!email) return;
        if (err) err.classList.add('hidden');

        const { data: found, error: e1 } = await Auth.client.rpc('find_user_by_email', { p_email: email });
        if (e1) { show(e1.message); return; }
        const person = Array.isArray(found) ? found[0] : found;
        if (!person) { show(`No account uses ${email}.`); return; }
        if (person.user_id === this.uid()) { show('That is you.'); return; }

        // Like CozyHealth's share, this one cannot be queued: the email has to
        // be resolved to a user id by the server before there is a row to store.
        const { error } = await this.db('cookbook_shares').insert({
            folder_id: this.view.id,
            owner_id: this.uid(),
            shared_with: person.user_id,
            status: 'pending'
        });
        if (error) { show(error.code === '23505' ? 'Already shared with them.' : error.message); return; }
        input.value = '';
        this._toast('Invitation sent');
        await this.refresh();
    },

    async unshare(shareId) {
        const s = this.data.shares.find(x => x.id === shareId);
        if (!confirm(`Stop sharing with ${s ? this.who(s.shared_with) : 'them'}?`)) return;
        this.data.shares = this.data.shares.filter(x => x.id !== shareId);
        this._write('cookbook_shares', 'delete', null, { id: shareId });
        this.render();
    },

    // Accepting sets the share to 'accepted', which is what the folder and
    // recipe read policies look for. Declining just removes the row.
    async answer(shareId, status) {
        if (status) {
            const s = this.data.shares.find(x => x.id === shareId);
            if (s) s.status = status;
            this._write('cookbook_shares', 'update', { status }, { id: shareId });
        } else {
            this.data.shares = this.data.shares.filter(x => x.id !== shareId);
            this._write('cookbook_shares', 'delete', null, { id: shareId });
        }
        this._toast(status ? 'Cookbook added to your shelf' : 'Invitation declined');
        // Accepting reveals rows the read policies were hiding, so this one
        // does need a round trip — but only to read, never to save.
        if (status) await this.refresh(); else this.render();
    }
};
