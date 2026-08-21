// apps.js — the app picker and the shell that switches between apps.
//
// After signing in you land on a picker rather than straight into one app.
// Each app owns a full-screen container and is told when it is shown and
// hidden, so anything holding a canvas or a socket can shut down cleanly.

const Apps = {
    LAST_KEY: 'cozyhome_last_app',
    current: null,

    LIST: [
        {
            id: 'cozyhome',
            name: 'CozyHome',
            tagline: 'Home inventory & projects',
            blurb: 'Track what you own room by room, plan projects, and share a home with the people you live with.',
            icon: '🏡',
            color: '#f2734d'
        },
        {
            id: 'health',
            name: 'CozyHealth',
            tagline: 'Food, movement & mind',
            blurb: 'Log meals with real macros, track workouts and measurements, and check in on mood, sleep and meditation.',
            icon: '🌿',
            color: '#3f9e78'
        },
        {
            id: 'mali',
            name: 'Sands of Mali',
            tagline: '3D desert trading',
            blurb: 'Timbuktu, 1325. Provision a caravan, ride the Sahara, and deliver six commissions before the thirst takes you.',
            icon: '🐪',
            color: '#c07f34'
        },
        {
            id: 'highfive',
            name: 'High Five',
            tagline: 'Multiplayer hangout',
            blurb: 'Pick a sprite and wander a room with everyone else online right now. Walk into someone to high five them.',
            icon: '🙌',
            color: '#6a7ae8'
        }
    ],

    screens: {
        picker:   'picker-screen',
        cozyhome: 'app-screen',
        health:   'health-screen',
        mali:     'mali-screen',
        highfive: 'highfive-screen'
    },

    init() {
        this.renderPicker();

        document.querySelectorAll('[data-app-back]').forEach(b =>
            b.addEventListener('click', () => this.show('picker')));

        document.getElementById('picker-profile')
            ?.addEventListener('click', () => Modal.showProfile());
    },

    renderPicker() {
        const grid = document.getElementById('app-grid');
        if (!grid) return;
        grid.innerHTML = this.LIST.map(a => `
            <button class="app-card" data-app="${a.id}">
                <span class="app-card-icon" style="background:${a.color}">${a.icon}</span>
                <span class="app-card-body">
                    <span class="app-card-name">${a.name}</span>
                    <span class="app-card-tagline">${a.tagline}</span>
                    <span class="app-card-blurb">${a.blurb}</span>
                </span>
                <span class="app-card-go">›</span>
            </button>`).join('');

        grid.querySelectorAll('[data-app]').forEach(b =>
            b.addEventListener('click', () => this.show(b.dataset.app)));
    },

    // Shows one screen and tears down whatever was running before it.
    show(id) {
        if (!this.screens[id]) id = 'picker';

        // Leaving an app: let it release its canvas, sockets and listeners.
        if (this.current && this.current !== id) this._teardown(this.current);

        Object.entries(this.screens).forEach(([key, elId]) => {
            const el = document.getElementById(elId);
            if (el) el.classList.toggle('hidden', key !== id);
        });

        this.current = id;
        try { localStorage.setItem(this.LAST_KEY, id); } catch (e) { /* private mode */ }

        this._setup(id);
    },

    _setup(id) {
        if (id === 'cozyhome') {
            App.render();
        } else if (id === 'health') {
            const host = document.getElementById('health-host');
            if (host) CozyHealth.mount(host);
        } else if (id === 'mali') {
            const host = document.getElementById('mali-host');
            if (host) Game.mount(host);
        } else if (id === 'highfive') {
            const host = document.getElementById('highfive-host');
            if (host) HighFive.mount(host);
        }
    },

    _teardown(id) {
        if (id === 'health') CozyHealth.unmount();
        else if (id === 'mali') Game.unmount();
        else if (id === 'highfive') HighFive.unmount();
    },

    // Called on sign-out: stop everything and forget where we were.
    reset() {
        if (this.current) this._teardown(this.current);
        this.current = null;
    }
};
