// palette.js — ⌘K / Ctrl-K.
//
// One place to reach anything: switch app, jump to a room, item, project or
// recipe, or run a common action. Everything is already in memory, so this is
// a filter over the caches rather than a query.

const Palette = {
    open: false,
    items: [],
    active: 0,

    init() {
        document.addEventListener('keydown', e => {
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); this.toggle(); return; }
            if (!this.open) return;
            if (e.key === 'Escape') { e.preventDefault(); this.close(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
            else if (e.key === 'ArrowUp')   { e.preventDefault(); this.move(-1); }
            else if (e.key === 'Enter')     { e.preventDefault(); this.run(this.active); }
        });
    },

    toggle() { this.open ? this.close() : this.show(); },

    show() {
        if (!Auth.getUser()) return;          // nothing to search when signed out
        this.open = true;
        let el = document.getElementById('cmdk');
        if (!el) {
            el = document.createElement('div');
            el.id = 'cmdk';
            el.className = 'cmdk';
            el.innerHTML = `
                <div class="cmdk-backdrop" data-close></div>
                <div class="cmdk-panel" role="dialog" aria-modal="true" aria-label="Search and commands">
                    <input id="cmdk-input" type="text" placeholder="Search or jump to…" autocomplete="off">
                    <div id="cmdk-list" class="cmdk-list" role="listbox"></div>
                    <div class="cmdk-foot"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>↵</kbd> to open · <kbd>esc</kbd> to close</div>
                </div>`;
            document.body.appendChild(el);
            el.querySelector('[data-close]').addEventListener('click', () => this.close());
            el.querySelector('#cmdk-input').addEventListener('input', () => this.search());
            el.querySelector('#cmdk-list').addEventListener('click', e => {
                const row = e.target.closest('[data-i]');
                if (row) this.run(Number(row.dataset.i));
            });
        }
        el.classList.remove('hidden');
        const input = document.getElementById('cmdk-input');
        input.value = '';
        input.focus();
        this.search();
    },

    close() {
        this.open = false;
        document.getElementById('cmdk')?.classList.add('hidden');
    },

    move(d) {
        if (!this.items.length) return;
        this.active = (this.active + d + this.items.length) % this.items.length;
        this.paint();
        document.querySelector('.cmdk-row.active')?.scrollIntoView({ block: 'nearest' });
    },

    run(i) {
        const it = this.items[i];
        if (!it) return;
        this.close();
        it.go();
    },

    // Everything the palette can reach, scored against the query.
    _catalogue() {
        const out = [];
        const app = (a) => out.push({
            group: 'Apps', label: a.name, hint: a.tagline, icon: a.icon,
            go: () => Apps.show(a.id)
        });
        Apps.LIST.forEach(app);

        if (Sync.cache) {
            Store.getHomes().forEach(h => out.push({
                group: 'Homes', label: h.name, icon: '🏡',
                go: () => { Apps.show('cozyhome'); Modal.editHome(h.id); }
            }));
            Store.getRooms().forEach(r => out.push({
                group: 'Rooms', label: r.name, icon: '🏠',
                hint: `${Store.getItemsForRoom(r.id).length} items`,
                go: () => { Apps.show('cozyhome'); Modal.editRoom(r.id); }
            }));
            Store.getItems().forEach(i => {
                const room = i.roomId ? Store.getRoom(i.roomId) : null;
                out.push({
                    group: 'Items', label: i.name, icon: '📦', hint: room ? room.name : 'No room',
                    go: () => { Apps.show('cozyhome'); Modal.editItem(i.id); }
                });
            });
            Store.getProjects().forEach(p => out.push({
                group: 'Projects', label: p.name, icon: '🛠️',
                go: () => { Apps.show('cozyhome'); Modal.editProject(p.id); }
            }));
        }

        (CozyCookBook.data.recipes || []).forEach(r => out.push({
            group: 'Recipes', label: r.title, icon: '📖',
            go: () => { Apps.show('cookbook'); setTimeout(() => CozyCookBook.go({ name: 'recipe', id: r.id }), 260); }
        }));

        out.push(
            { group: 'Actions', label: 'Add a room',    icon: '＋', go: () => { Apps.show('cozyhome'); Modal.addRoom(); } },
            { group: 'Actions', label: 'Add an item',   icon: '＋', go: () => { Apps.show('cozyhome'); Modal.addItem(); } },
            { group: 'Actions', label: 'Add a project', icon: '＋', go: () => { Apps.show('cozyhome'); Modal.addProject(); } },
            { group: 'Actions', label: 'Log food',      icon: '🥗', go: () => { Apps.show('health'); CozyHealth.tab = 'food'; CozyHealth.render(); } },
            { group: 'Actions', label: 'Change theme',  icon: '🎨', go: () => Modal.showProfile() }
        );
        return out;
    },

    search() {
        const q = (document.getElementById('cmdk-input').value || '').trim().toLowerCase();
        const all = this._catalogue();
        this.items = (!q ? all.filter(x => x.group === 'Apps' || x.group === 'Actions')
                         : all.filter(x => x.label.toLowerCase().includes(q) ||
                                           (x.hint || '').toLowerCase().includes(q))
                              // A match on the name beats a match on the hint,
                              // and earlier in the name beats later. indexOf
                              // returns -1 for a hint-only match, which would
                              // otherwise sort it above everything.
                              .sort((a, b) => this._rank(a, q) - this._rank(b, q)))
                     .slice(0, 40);
        this.active = 0;
        this.paint();
    },

    _rank(x, q) {
        const i = x.label.toLowerCase().indexOf(q);
        return i === -1 ? 1000 : i;          // hint-only matches sort last
    },

    paint() {
        const list = document.getElementById('cmdk-list');
        if (!list) return;
        if (!this.items.length) { list.innerHTML = '<div class="cmdk-empty">Nothing matches that.</div>'; return; }
        let group = null, html = '';
        this.items.forEach((it, i) => {
            if (it.group !== group) { group = it.group; html += `<div class="cmdk-group">${group}</div>`; }
            html += `<div class="cmdk-row ${i === this.active ? 'active' : ''}" data-i="${i}" role="option"
                          aria-selected="${i === this.active}">
                <span class="cmdk-ico">${it.icon || ''}</span>
                <span class="cmdk-label">${this._esc(it.label)}</span>
                ${it.hint ? `<span class="cmdk-hint">${this._esc(it.hint)}</span>` : ''}
            </div>`;
        });
        list.innerHTML = html;
    },

    _esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }
};
