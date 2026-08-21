// app.js — Main application controller

const App = {
    currentFilter: 'all',

    async init() {
        // Apply the device's remembered theme before anything renders, so the
        // login screen keeps the look the user chose rather than flashing the
        // default while the session and preferences load.
        ThemeEngine.init();
        Modal.init();
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
        document.getElementById('app-screen').classList.toggle('hidden', !user);

        if (!user) {
            Game.unmount();
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
        this.render();
    },

    renderSyncStatus(status) {
        const el = document.getElementById('sync-status');
        if (!el) return;
        const pending = Sync.pendingCount();
        const map = {
            idle:    { text: '', cls: '' },
            syncing: { text: 'Saving…', cls: 'syncing' },
            offline: { text: `Offline · ${pending} change${pending === 1 ? '' : 's'} pending`, cls: 'offline' },
            error:   { text: `Not saved · ${pending} pending · retry`, cls: 'error' }
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

    // Called from the sync-status chip when writes are stuck.
    retrySync() {
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
            if (!(this.currentFilter === 'game' && Game.isLive())) {
                Game.unmount();
                container.innerHTML = Sync.status === 'error'
                    ? `<div class="section"><div class="section-body"><div class="empty-note">
                           Couldn't load your home. <button class="btn-small" onclick="App.retryHydrate()">Try again</button>
                       </div></div></div>`
                    : `<div class="section"><div class="section-body"><div class="empty-note">Loading your home…</div></div></div>`;
            }
            return;
        }

        const items = Store.getItems();
        const rooms = Store.getRooms();
        const projects = Store.getProjects();

        const isEmpty = !items.length && !rooms.length && !projects.length;
        const selfContainedTab = this.currentFilter === 'info' || this.currentFilter === 'game';
        emptyState.classList.toggle('hidden', !isEmpty || selfContainedTab);

        // A running game owns a live WebGL canvas inside #list-container. Modals
        // call render() when they close, and rebuilding the container would throw
        // away the player's run, so leave it alone while it is playing.
        if (this.currentFilter === 'game' && Game.isLive()) return;

        let html = '';
        switch (this.currentFilter) {
            case 'all': html = Views.renderAll(); break;
            case 'room': html = Views.renderByRoom(); break;
            case 'type': html = Views.renderByType(); break;
            case 'projects': html = Views.renderProjects(); break;
            case 'game': html = Game.render(); break;
            case 'info': html = Views.renderInfo(); break;
        }
        container.innerHTML = html;

        // The game owns a WebGL context and a render loop, so it has to be told
        // when its container appears and when it is torn down by the line above.
        if (this.currentFilter === 'game') Game.mount();
        else Game.unmount();
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
