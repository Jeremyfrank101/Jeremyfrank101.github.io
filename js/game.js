// game.js — "Game" tab shell. Lazy-loads the 3D desert game the first time the
// tab is opened, so three.js is never fetched for people who never play.

const Game = {
    SCRIPTS: ['js/vendor/three.min.js', 'js/desert.js'],

    loading: false,
    loaded: false,
    failed: false,

    // Called by App.render() for the 'game' filter.
    render() {
        return `<div id="game-host" class="game-host"></div>`;
    },

    // Called by App after the container HTML is in the DOM.
    mount() {
        const host = document.getElementById('game-host');
        if (!host) return;

        if (this.failed) { this._renderError(host); return; }

        if (this.loaded) { DesertGame.mount(host); return; }

        this._renderLoading(host);
        if (this.loading) return;
        this.loading = true;

        this._loadScripts()
            .then(() => {
                this.loaded = true;
                this.loading = false;
                // The tab may have been switched away from while loading.
                const current = document.getElementById('game-host');
                if (current) DesertGame.mount(current);
            })
            .catch(err => {
                this.loading = false;
                this.failed = true;
                console.error('[Game] failed to load the desert game', err);
                const current = document.getElementById('game-host');
                if (current) this._renderError(current);
            });
    },

    unmount() {
        if (this.loaded && typeof DesertGame !== 'undefined') DesertGame.unmount();
    },

    // True when a game is running in a container still attached to the page.
    // App.render() uses this to avoid tearing down an in-progress run.
    isLive() {
        return this.loaded
            && typeof DesertGame !== 'undefined'
            && DesertGame.mounted
            && !!DesertGame.container
            && document.body.contains(DesertGame.container);
    },

    _loadScripts() {
        return this.SCRIPTS.reduce(
            (chain, src) => chain.then(() => this._loadScript(src)),
            Promise.resolve()
        );
    },

    _loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-game-src="${src}"]`);
            if (existing) { resolve(); return; }
            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.dataset.gameSrc = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error(`Could not load ${src}`));
            document.head.appendChild(s);
        });
    },

    _renderLoading(host) {
        host.innerHTML = `
        <div class="game-msg">
            <div class="game-msg-icon">🐪</div>
            <h3>Saddling the caravan…</h3>
            <p>Loading the desert.</p>
        </div>`;
    },

    _renderError(host) {
        host.innerHTML = `
        <div class="game-msg">
            <div class="game-msg-icon">🏜️</div>
            <h3>The caravan didn't arrive</h3>
            <p>The 3D engine couldn't load. Check your connection and reopen this tab.</p>
        </div>`;
    }
};
