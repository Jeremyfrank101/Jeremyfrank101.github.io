// app.js — Main application controller

const App = {
    currentFilter: 'all',

    async init() {
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

        // React to sign-out from another tab, token expiry, etc.
        Auth.onChange(() => this.checkAuth());
        this.checkAuth();
    },

    checkAuth() {
        const user = Auth.getUser();
        document.getElementById('auth-screen').classList.toggle('hidden', !!user);
        document.getElementById('app-screen').classList.toggle('hidden', !user);
        if (user) {
            PatternEngine.init();
            this.render();
        } else {
            Game.unmount();
        }
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

    render() {
        const container = document.getElementById('list-container');
        const emptyState = document.getElementById('empty-state');
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
