// app.js — Main application controller

const App = {
    currentFilter: 'all',

    async init() {
        // Apply the device's remembered theme before anything renders, so the
        // login screen keeps the look the user chose rather than flashing the
        // default while the session and preferences load.
        ThemeEngine.init();
        Modal.init();
        Apps.init();
        Palette.init();
        this.bindEvents();

        if (!Auth.configured()) {
            this.showAuthNotice('This build has no Supabase key configured, so sign-in is disabled.', true);
            return;
        }

        // Restoring a session is a network round trip; hold the auth form back
        // until we know, so a returning user doesn't see a login flash.
        this.setAuthBusy(true, 'Checking your session…');
        try {
            await Auth.restore();
        } catch (err) {
            console.error('[App] session restore failed', err);
            this.showAuthNotice('Could not reach the authentication server.', true);
        }
        this.setAuthBusy(false);

        Sync.onStatus(s => this.renderSyncStatus(s));

        // React to sign-out from another tab, token expiry, etc.
        Auth.onChange(() => this.checkAuth());
        await this.checkAuth();
    },

    // Coalesced for the same reason as Sync.hydrate(): onAuthStateChange and
    // the submit handler both call this, and interleaving their DOM writes and
    // hydration produced a half-populated app.
    checkAuth() {
        if (this._checking) return this._checking;
        this._checking = this._doCheckAuth().finally(() => { this._checking = null; });
        return this._checking;
    },

    async _doCheckAuth() {
        const user = Auth.getUser();
        document.getElementById('auth-screen').classList.toggle('hidden', !!user);

        if (!user) {
            // Hide every app screen, not just CozyHome's.
            Object.values(Apps.screens).forEach(id =>
                document.getElementById(id)?.classList.add('hidden'));
            Apps.reset();
            Sync.reset();
            // Must clear, or signing back in as the same account matches the
            // stale marker, skips hydration, and shows an empty house while
            // the data sits safely on the server.
            this._hydratedFor = null;
            return;
        }

        PatternEngine.init();

        // Pull this user's data before the first render, otherwise the app
        // flashes an empty house while the request is in flight.
        if (!this._hydratedFor || this._hydratedFor !== user.id) {
            this.render();                       // shows the loading state below
            const okData = await Sync.hydrate();
            this._hydratedFor = okData ? user.id : null;
            ThemeEngine.apply(Store.getTheme());  // theme is per-account
        }
        // Land on the picker rather than dropping straight into one app.
        if (!Apps.current) Apps.show('picker');
        else if (Apps.current === 'cozyhome') this.render();
    },

    renderSyncStatus(status) {
        const el = document.getElementById('sync-status');
        if (!el) return;
        const pending = Sync.pendingCount();
        const dropped = Sync.dropped.length;
        const map = {
            idle:    { text: '', cls: '' },
            syncing: { text: 'Saving…', cls: 'syncing' },
            offline: { text: `Offline · ${pending} change${pending === 1 ? '' : 's'} pending`, cls: 'offline' },
            error:   { text: `Not saved · ${pending} pending · retry`, cls: 'error' },
            // The server refused these outright, so retrying is pointless —
            // say what happened instead of spinning forever.
            refused: { text: `${dropped} change${dropped === 1 ? '' : 's'} rejected · details`, cls: 'refused' }
        };
        const s = map[status] || map.idle;
        el.textContent = s.text;
        el.className = 'sync-status ' + s.cls;
        el.classList.toggle('hidden', !s.text);
    },

    setAuthBusy(busy, label) {
        const btn = document.getElementById('auth-submit');
        const form = document.getElementById('auth-form');
        if (!btn || !form) return;
        btn.disabled = busy;
        form.classList.toggle('busy', busy);
        if (busy && label) {
            btn.dataset.idleLabel = btn.dataset.idleLabel || btn.textContent;
            btn.textContent = label;
        } else if (!busy && btn.dataset.idleLabel) {
            btn.textContent = btn.dataset.idleLabel;
            delete btn.dataset.idleLabel;
        }
    },

    showAuthNotice(message, isError) {
        const el = document.getElementById('auth-error');
        if (!el) return;
        el.textContent = message;
        el.classList.toggle('auth-notice', !isError);
        el.classList.remove('hidden');
    },

    clearAuthNotice() {
        const el = document.getElementById('auth-error');
        if (!el) return;
        el.classList.add('hidden');
        el.classList.remove('auth-notice');
    },

    bindEvents() {
        // Auth
        const authForm = document.getElementById('auth-form');
        let isSignUp = false;

        document.getElementById('auth-toggle').addEventListener('click', () => {
            isSignUp = !isSignUp;
            document.getElementById('signup-fields').classList.toggle('hidden', !isSignUp);
            document.getElementById('confirm-field').classList.toggle('hidden', !isSignUp);
            document.getElementById('auth-submit').textContent = isSignUp ? 'Create Account' : 'Sign In';
            document.getElementById('auth-subtitle').textContent = isSignUp ? 'Create your account' : 'Welcome back';
            document.getElementById('auth-toggle').textContent = isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account';
            this.clearAuthNotice();
        });

        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!Auth.configured()) return;

            const email = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value;

            this.clearAuthNotice();
            this.setAuthBusy(true, isSignUp ? 'Creating account…' : 'Signing in…');

            try {
                if (isSignUp) {
                    const confirm = document.getElementById('auth-confirm').value;
                    if (password !== confirm) throw new Error('Passwords do not match.');
                    const username = document.getElementById('auth-username').value.trim();
                    const name = document.getElementById('auth-name').value.trim();
                    if (!username) throw new Error('Username is required.');

                    const result = await Auth.signUp(username, name, email, password);
                    if (result.needsConfirmation) {
                        // The project requires email confirmation, so there is no
                        // session yet. Say so rather than silently doing nothing.
                        authForm.reset();
                        this.showAuthNotice(
                            `Account created. Check ${result.email} for a confirmation link, then sign in.`,
                            false
                        );
                        return;
                    }
                } else {
                    await Auth.signIn(email, password);
                }
                this.checkAuth();
            } catch (err) {
                this.showAuthNotice(err.message, true);
            } finally {
                this.setAuthBusy(false);
            }
        });

        // Filter tabs
        const search = document.getElementById('home-search');
        if (search) {
            search.addEventListener('input', () => {
                this.searchTerm = search.value;
                this._runSearch();
            });
            // Escape clears rather than making you select and delete.
            search.addEventListener('keydown', e => {
                if (e.key === 'Escape') { search.value = ''; this.searchTerm = ''; this._runSearch(); }
            });
        }

        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentFilter = tab.dataset.filter;
                this.render();
            });
        });

        // Add menu
        const addBtn = document.getElementById('add-menu-btn');
        const addMenu = document.getElementById('add-menu');
        const overlay = document.getElementById('overlay');

        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Build sub-room menu
            const topRooms = Store.getTopLevelRooms();
            const subContainer = document.getElementById('subroom-menu-container');
            if (topRooms.length) {
                subContainer.innerHTML = `<div class="submenu">
                    <button class="submenu-trigger">📂 Create Sub-Room ▸</button>
                    <div class="submenu-items">${topRooms.map(r => `<button onclick="Modal.addRoom(Store.getRoom('${r.id}'));App.closeMenus()">${r.name}</button>`).join('')}</div>
                </div>`;
            } else {
                subContainer.innerHTML = '';
            }

            // Position dropdown directly under the + button
            const rect = addBtn.getBoundingClientRect();
            addMenu.style.top = rect.bottom + 6 + 'px';
            addMenu.style.left = rect.left + 'px';

            addMenu.classList.toggle('hidden');
            overlay.classList.toggle('hidden');
        });

        overlay.addEventListener('click', () => this.closeMenus());

        addMenu.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (!action) return;
            this.closeMenus();
            switch (action) {
                case 'add-home': Modal.addHome(); break;
                case 'add-room': Modal.addRoom(); break;
                case 'add-item': Modal.addItem(); break;
                case 'add-project': Modal.addProject(); break;
            }
        });

        // Profile
        document.getElementById('profile-btn').addEventListener('click', () => {
            Modal.showProfile();
        });
    },

    closeMenus() {
        document.getElementById('add-menu').classList.add('hidden');
        document.getElementById('overlay').classList.add('hidden');
    },

    async retryHydrate() {
        this._hydratedFor = null;
        await this.checkAuth();
    },

    // Called from the sync-status chip when writes are stuck. If the server
    // refused them there is nothing to retry, so show what was lost instead.
    retrySync() {
        if (Sync.dropped.length) {
            const lines = Sync.dropped.map(d =>
                `• ${d.op.table || d.op.kind || 'change'}: ${d.message}`).join('\n');
            alert(`These changes were rejected and could not be saved:\n\n${lines}`);
            Sync.dropped = [];
            this.renderSyncStatus(Sync.status === 'refused' ? 'idle' : Sync.status);
            return;
        }
        Sync.flush();
    },

    render() {
        const container = document.getElementById('list-container');
        const emptyState = document.getElementById('empty-state');
        const user = Auth.getUser();

        // While the first fetch for this account is in flight, show a loading
        // state rather than "No Items Yet" — telling someone their house is
        // empty when we simply haven't looked yet is worse than saying nothing.
        if (user && this._hydratedFor !== user.id) {
            emptyState.classList.add('hidden');
            {
                container.innerHTML = Sync.status === 'error'
                    ? `<div class="section"><div class="section-body"><div class="empty-note">
                           Couldn't load your home. <button class="btn-small" onclick="App.retryHydrate()">Try again</button>
                       </div></div></div>`
                    : `<div class="section"><div class="section-body">${UI.skeleton(4)}</div></div>`;
            }
            return;
        }

        const items = Store.getItems();
        const rooms = Store.getRooms();
        const projects = Store.getProjects();

        const isEmpty = !items.length && !rooms.length && !projects.length;
        const selfContainedTab = this.currentFilter === 'info';
        emptyState.classList.toggle('hidden', !isEmpty || selfContainedTab);

        let html = '';
        switch (this.currentFilter) {
            case 'all': html = Views.renderAll(); break;
            case 'room': html = Views.renderByRoom(); break;
            case 'type': html = Views.renderByType(); break;
            case 'projects': html = Views.renderProjects(); break;
            case 'info': html = Views.renderInfo(); break;
        }
        container.innerHTML = this._applySearch(html);
        this._wireInteractions(container);
    },

    // ---------- search ----------
    //
    // Five filter tabs and no way to find anything by name. This hides rows
    // whose text does not match, and any section left with nothing in it.

    searchTerm: '',

    _applySearch(html) { return html; },

    _runSearch() {
        const q = (this.searchTerm || '').trim().toLowerCase();
        const container = document.getElementById('list-container');
        if (!container) return;
        let shown = 0;
        container.querySelectorAll('.list-row').forEach(row => {
            const hit = !q || row.textContent.toLowerCase().includes(q);
            row.classList.toggle('hidden', !hit);
            if (hit) shown++;
        });
        container.querySelectorAll('.section').forEach(sec => {
            const any = [...sec.querySelectorAll('.list-row')].some(r => !r.classList.contains('hidden'));
            sec.classList.toggle('hidden', !!q && !any);
        });
        const none = document.getElementById('search-none');
        if (none) none.classList.toggle('hidden', !q || shown > 0);
    },

    // ---------- drag, swipe, bulk ----------

    _wireInteractions(container) {
        const bodies = [...container.querySelectorAll('[data-drag]')];

        bodies.forEach(body => {
            const kind = body.dataset.drag;
            UI.dragList(body, {
                rowSelector: '.list-row',
                handle: '.ui-grip',
                // items can be dropped between other items in any list, or
                // straight onto a room to be re-filed into it
                groups: kind === 'item' ? bodies.filter(b => b.dataset.drag === 'item') : [],
                acceptsDropOn: kind === 'item' ? '.list-row[data-kind="room"]' : null,
                onDrop: ({ id, toContainer, beforeId, afterId }) => {
                    // Dropping into a different room's list re-files it as
                    // well as reordering — that is what the gesture means,
                    // and only moving it within the list would look broken.
                    if (kind === 'item' && toContainer.dataset.room !== undefined
                        && toContainer !== body) {
                        const to = toContainer.dataset.room || null;
                        if (Store.moveItemToRoom(id, to)) {
                            const room = to ? Store.getRoom(to) : null;
                            this._toastMove(`Moved to ${room ? room.name : 'No Room'}`);
                        }
                    }
                    Store.reorder(kind, id, beforeId, afterId);
                    this.render();
                },
                onDropOn: ({ id, targetId }) => {
                    const room = Store.getRoom(targetId);
                    if (Store.moveItemToRoom(id, targetId)) {
                        const item = Store.getItems().find(i => i.id === id);
                        this._toastMove(`Moved ${item ? item.name : 'item'} to ${room ? room.name : 'the room'}`);
                    }
                    this.render();
                }
            });
            UI.swipe(body, { rowSelector: '.list-row' });
        });

        this._wireBulk(container);
        if (this.searchTerm) this._runSearch();
    },

    // ---------- bulk selection ----------
    //
    // Long-press a row (or ctrl/cmd-click) to start selecting, then move or
    // delete the lot in one go instead of opening each one in turn.

    selection: new Set(),

    _wireBulk(container) {
        let holdTimer = null;
        container.addEventListener('pointerdown', e => {
            const row = e.target.closest('.list-row[data-key]');
            if (!row) return;
            if (e.metaKey || e.ctrlKey) { this._toggleSelect(row); return; }
            if (this.selection.size) return;           // already selecting
            holdTimer = setTimeout(() => this._toggleSelect(row), 480);
        });
        ['pointerup', 'pointermove', 'pointercancel'].forEach(ev =>
            container.addEventListener(ev, () => clearTimeout(holdTimer)));

        // a tap while selecting adds or removes rather than opening
        container.addEventListener('click', e => {
            if (!this.selection.size) return;
            const row = e.target.closest('.list-row[data-key]');
            if (!row) return;
            e.preventDefault();
            e.stopPropagation();
            this._toggleSelect(row);
        }, true);
    },

    _toggleSelect(row) {
        const id = row.dataset.key;
        if (this.selection.has(id)) this.selection.delete(id); else this.selection.add(id);
        row.classList.toggle('ui-selected', this.selection.has(id));
        row.classList.add('ui-selectable');
        this._paintBulkBar();
    },

    clearSelection() {
        this.selection.clear();
        document.querySelectorAll('.ui-selected').forEach(n => n.classList.remove('ui-selected'));
        this._paintBulkBar();
    },

    _paintBulkBar() {
        let bar = document.getElementById('ui-bulk');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'ui-bulk';
            bar.className = 'ui-bulkbar hidden';
            document.body.appendChild(bar);
        }
        const n = this.selection.size;
        if (!n) { bar.classList.add('hidden'); return; }
        bar.classList.remove('hidden');
        bar.innerHTML = `<span>${n} selected</span>
            <button type="button" data-bulk="move">Move to room…</button>
            <button type="button" data-bulk="delete">Delete</button>
            <button type="button" data-bulk="cancel">Cancel</button>`;
        bar.querySelectorAll('[data-bulk]').forEach(b =>
            b.addEventListener('click', () => this._runBulk(b.dataset.bulk)));
    },

    _runBulk(action) {
        const ids = [...this.selection];
        if (action === 'cancel') return this.clearSelection();

        if (action === 'move') {
            const rooms = Store.getTopLevelRooms();
            if (!rooms.length) { this._toastMove('No rooms to move into yet.'); return; }
            const names = rooms.map((r, i) => `${i + 1}. ${r.name}`).join('\n');
            const pick = prompt(`Move ${ids.length} item(s) to which room?\n\n${names}`);
            const idx = Number(pick) - 1;
            if (!rooms[idx]) return;
            let moved = 0;
            ids.forEach(id => { if (Store.moveItemToRoom(id, rooms[idx].id)) moved++; });
            this.clearSelection();
            this.render();
            this._toastMove(`Moved ${moved} item${moved === 1 ? '' : 's'} to ${rooms[idx].name}`);
            return;
        }

        if (action === 'delete') {
            const data = Sync.cache;
            const snap = { rooms: data.rooms.slice(), items: data.items.slice(), projects: data.projects.slice() };
            const kinds = {};
            ids.forEach(id => {
                const row = document.querySelector(`.list-row[data-key="${CSS.escape(id)}"]`);
                const kind = row ? row.dataset.kind : null;
                if (!kind) return;
                (kinds[kind] ||= []).push(id);
                const bucket = Store.KIND_OF[kind];
                data[bucket] = data[bucket].filter(r => r.id !== id);
            });
            this.clearSelection();
            this.render();
            UI.undo(`Deleted ${ids.length} item${ids.length === 1 ? '' : 's'}`, {
                onCommit: () => Object.entries(kinds).forEach(([kind, list]) =>
                    list.forEach(id => Sync.enqueue({ type: 'delete', kind: Store.KIND_OF[kind], id }))),
                onUndo: () => { Object.assign(data, snap); this.render(); }
            });
        }
    },

    _toastMove(msg) {
        let t = document.getElementById('app-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'app-toast';
            t.className = 'ui-undo';
            document.body.appendChild(t);
        }
        t.innerHTML = `<span class="ui-undo-msg"></span>`;
        t.querySelector('.ui-undo-msg').textContent = msg;
        t.classList.remove('hidden');
        clearTimeout(this._toastT);
        this._toastT = setTimeout(() => t.classList.add('hidden'), 2200);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
