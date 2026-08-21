// ui.js — the interaction primitives every app shares.
//
// Five things live here, because all five were missing everywhere and none of
// them belongs to one app:
//
//   UI.reconcile   keyed list updates, so a row survives a re-render
//   UI.dragList    pointer-based drag to reorder and to move between lists
//   UI.undo        an undo toast in place of a confirm dialog
//   UI.skeleton    grey placeholder rows while the first fetch is in flight
//   UI.swipe       swipe a row sideways on touch to reveal its actions
//
// The first one is load-bearing. Every app used to rebuild its whole subtree
// from a template string on every change, which is why nothing could animate
// and why a drag would have been destroyed mid-gesture: the node under the
// finger stopped existing. Reconciling by id keeps the node alive.

const UI = {

    // ---------- keyed list updates ----------
    //
    // `items` is [{ id, html }]. Rows already present are left alone (their
    // DOM, their scroll position, their in-flight animation), rows that moved
    // are moved, new rows are inserted and marked so CSS can animate them in.
    // Returns true if anything actually changed.

    reconcile(container, items, opts = {}) {
        if (!container) return false;
        const seen = new Set();
        let changed = false;
        let cursor = null;   // last node we placed; the next one goes after it

        for (const it of items) {
            const id = String(it.id);
            seen.add(id);
            let node = container.querySelector(`:scope > [data-key="${CSS.escape(id)}"]`);

            if (!node) {
                node = document.createElement('div');
                node.dataset.key = id;
                node.className = opts.rowClass || '';
                node.innerHTML = it.html;
                if (opts.animate !== false) node.classList.add('ui-enter');
                changed = true;
            } else if (node.dataset.sig !== it.sig) {
                // only touch the innards when the content actually differs
                node.innerHTML = it.html;
                changed = true;
            }
            if (it.sig != null) node.dataset.sig = it.sig;

            const shouldFollow = cursor ? cursor.nextElementSibling : container.firstElementChild;
            if (shouldFollow !== node) {
                container.insertBefore(node, cursor ? cursor.nextElementSibling : container.firstElementChild);
                changed = true;
            }
            cursor = node;
        }

        // anything left over has gone; collapse it out rather than vanishing
        [...container.children].forEach(n => {
            const k = n.dataset.key;
            if (k != null && !seen.has(k)) {
                changed = true;
                if (opts.animate === false) { n.remove(); return; }
                n.classList.add('ui-exit');
                setTimeout(() => n.remove(), 180);
            }
        });
        return changed;
    },

    // ---------- fractional ordering ----------
    //
    // The position to give a row dropped between two neighbours. Midpoints
    // keep a move to one write; only when floats run out of room between two
    // values does the caller need to respace, which `needsRespace` flags.

    GAP: 1024,

    between(before, after) {
        if (before == null && after == null) return this.GAP;
        if (before == null) return after - this.GAP;
        if (after == null) return before + this.GAP;
        return (before + after) / 2;
    },

    needsRespace(before, after) {
        return before != null && after != null && Math.abs(after - before) < 1e-6;
    },

    // ---------- drag ----------
    //
    // Pointer events rather than HTML5 drag-and-drop, because HTML5 dragging
    // does not fire on touch at all and this has to work on a phone. A press
    // that moves more than a few pixels (or is held past a delay on touch,
    // so scrolling still works) lifts the row: the original stays as a gap,
    // a fixed-position clone follows the finger, and neighbours slide aside.
    //
    // opts: {
    //   handle,          selector for the drag handle, or the row itself
    //   rowSelector,     what counts as a draggable row
    //   groups,          other containers this row may be dropped into
    //   onDrop({ id, toContainer, beforeId, afterId }),
    //   onDropOn({ id, targetId, targetContainer })   // dropped onto a row
    //   acceptsDropOn    selector for rows that swallow a drop (e.g. a room)
    // }

    dragList(container, opts = {}) {
        if (!container || container._uiDrag) return;
        container._uiDrag = true;
        const TOUCH_HOLD = 220, MOVE_SLOP = 6;

        const rowOf = el => el && el.closest(opts.rowSelector || '[data-key]');

        container.addEventListener('pointerdown', e => {
            if (e.button != null && e.button > 0) return;
            const row = rowOf(e.target);
            if (!row || !container.contains(row)) return;
            if (opts.handle && !e.target.closest(opts.handle)) return;
            // never hijack a press on something interactive
            if (e.target.closest('input,textarea,select,a,button:not([data-drag-handle])')) return;

            const touch = e.pointerType === 'touch';
            const start = { x: e.clientX, y: e.clientY, t: Date.now() };
            let lifted = false, ghost = null, holdTimer = null;
            const containers = [container, ...(opts.groups || []).map(g =>
                typeof g === 'string' ? document.querySelector(g) : g).filter(Boolean)];

            const lift = () => {
                lifted = true;
                const r = row.getBoundingClientRect();
                ghost = row.cloneNode(true);
                ghost.classList.add('ui-ghost');
                Object.assign(ghost.style, {
                    position: 'fixed', left: r.left + 'px', top: r.top + 'px',
                    width: r.width + 'px', height: r.height + 'px', pointerEvents: 'none'
                });
                document.body.appendChild(ghost);
                this._scrollHost = this._scrollableOf(row);
                this._lastHost = container;
                row.classList.add('ui-dragging');
                document.body.classList.add('ui-drag-active');
                if (navigator.vibrate) { try { navigator.vibrate(8); } catch (x) {} }
            };

            const move = ev => {
                const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
                if (!lifted) {
                    if (touch) return;                                  // wait for the hold
                    if (Math.hypot(dx, dy) < MOVE_SLOP) return;
                    clearTimeout(holdTimer);
                    lift();
                }
                ev.preventDefault();
                ghost.style.transform = `translate(${dx}px, ${dy}px)`;

                this._autoScroll(ev.clientY);

                // where would it land? elementFromPoint works in viewport
                // coordinates and returns null past the edges, so hold the
                // last container we were over rather than dropping the drag.
                const over = document.elementFromPoint(ev.clientX, ev.clientY);
                const found = containers.find(c => c && (c === over || c.contains(over)));
                const host = found || this._lastHost;
                if (found) this._lastHost = found;
                document.querySelectorAll('.ui-drop-on').forEach(n => n.classList.remove('ui-drop-on'));

                if (opts.acceptsDropOn) {
                    const target = over && over.closest(opts.acceptsDropOn);
                    if (target && target !== row) { target.classList.add('ui-drop-on'); return; }
                }
                if (!host) return;

                const sibling = this._insertionPoint(host, ev.clientY, row, opts.rowSelector);
                if (sibling === undefined) return;
                host.insertBefore(row, sibling);
            };

            const finish = ev => {
                clearTimeout(holdTimer);
                this._stopScroll();
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', finish);
                window.removeEventListener('pointercancel', finish);
                if (!lifted) return;

                const dropTarget = document.querySelector('.ui-drop-on');
                document.querySelectorAll('.ui-drop-on').forEach(n => n.classList.remove('ui-drop-on'));
                if (ghost) ghost.remove();
                row.classList.remove('ui-dragging');
                document.body.classList.remove('ui-drag-active');

                if (dropTarget && opts.onDropOn) {
                    opts.onDropOn({
                        id: row.dataset.key,
                        targetId: dropTarget.dataset.key,
                        targetContainer: dropTarget.parentElement
                    });
                    return;
                }
                if (opts.onDrop) {
                    const host = row.parentElement;
                    const rows = [...host.querySelectorAll(`:scope > ${opts.rowSelector || '[data-key]'}`)];
                    const i = rows.indexOf(row);
                    opts.onDrop({
                        id: row.dataset.key,
                        toContainer: host,
                        beforeId: i > 0 ? rows[i - 1].dataset.key : null,
                        afterId: i < rows.length - 1 ? rows[i + 1].dataset.key : null
                    });
                }
            };

            if (touch) holdTimer = setTimeout(() => { lift(); }, TOUCH_HOLD);
            window.addEventListener('pointermove', move, { passive: false });
            window.addEventListener('pointerup', finish);
            window.addEventListener('pointercancel', finish);
        });
    },

    // Dragging toward the top or bottom edge scrolls the page, so a long list
    // can be reordered end to end without letting go.
    _autoScroll(y) {
        const EDGE = 80, MAX = 18;
        const h = window.innerHeight;
        let dy = 0;
        if (y < EDGE) dy = -MAX * (1 - y / EDGE);
        else if (y > h - EDGE) dy = MAX * (1 - (h - y) / EDGE);
        if (!dy) { this._stopScroll(); return; }
        this._scrollBy = dy;
        if (this._scrollTimer) return;
        this._scrollTimer = setInterval(() => {
            const target = this._scrollHost || window;
            if (target === window) window.scrollBy(0, this._scrollBy);
            else target.scrollTop += this._scrollBy;
        }, 16);
    },

    _stopScroll() {
        if (this._scrollTimer) { clearInterval(this._scrollTimer); this._scrollTimer = null; }
    },

    // The nearest actually-scrollable ancestor, since each app scrolls its own
    // pane rather than the document.
    _scrollableOf(el) {
        for (let n = el; n && n !== document.body; n = n.parentElement) {
            const st = getComputedStyle(n);
            if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
        }
        return window;
    },

    // Which sibling the dragged row should sit before, given the pointer's y.
    _insertionPoint(host, y, dragged, rowSelector) {
        const rows = [...host.querySelectorAll(`:scope > ${rowSelector || '[data-key]'}`)]
            .filter(n => n !== dragged);
        for (const n of rows) {
            const r = n.getBoundingClientRect();
            if (y < r.top + r.height / 2) return n;
        }
        return null;
    },

    // ---------- undo ----------
    //
    // Destructive actions apply immediately and offer a way back, instead of
    // stopping to ask first. The write is held until the window closes, so
    // undoing costs nothing and never has to reverse anything on the server.

    _undo: null,
    UNDO_MS: 6500,

    undo(message, { onCommit, onUndo }) {
        this.flushUndo();                       // one pending action at a time
        const bar = document.getElementById('ui-undo') || this._buildUndoBar();
        bar.querySelector('.ui-undo-msg').textContent = message;
        bar.classList.remove('hidden');

        const state = { onCommit, onUndo, timer: null };
        state.timer = setTimeout(() => this.flushUndo(), this.UNDO_MS);
        this._undo = state;

        const btn = bar.querySelector('.ui-undo-btn');
        btn.onclick = () => {
            clearTimeout(state.timer);
            this._undo = null;
            bar.classList.add('hidden');
            if (onUndo) onUndo();
        };
    },

    // Commit whatever is pending, now. Called on a timeout, before the next
    // destructive action, and on unload so a closing tab does not lose it.
    flushUndo() {
        const s = this._undo;
        if (!s) return;
        clearTimeout(s.timer);
        this._undo = null;
        const bar = document.getElementById('ui-undo');
        if (bar) bar.classList.add('hidden');
        if (s.onCommit) s.onCommit();
    },

    _buildUndoBar() {
        const bar = document.createElement('div');
        bar.id = 'ui-undo';
        bar.className = 'ui-undo hidden';
        bar.setAttribute('role', 'status');
        bar.innerHTML = `<span class="ui-undo-msg"></span>
                         <button class="ui-undo-btn" type="button">Undo</button>`;
        document.body.appendChild(bar);
        return bar;
    },

    // ---------- skeletons ----------

    skeleton(rows = 3, kind = 'row') {
        const one = kind === 'card'
            ? `<div class="ui-sk ui-sk-card"><span class="ui-sk-line w60"></span><span class="ui-sk-line w40"></span></div>`
            : `<div class="ui-sk ui-sk-row"><span class="ui-sk-dot"></span>
                 <span class="ui-sk-lines"><span class="ui-sk-line w70"></span><span class="ui-sk-line w40"></span></span></div>`;
        return `<div class="ui-sk-wrap" aria-hidden="true">${one.repeat(rows)}</div>`;
    },

    // ---------- swipe to reveal ----------
    //
    // Touch only. Dragging a row left past a threshold parks it open with its
    // actions behind; anything less springs back.

    swipe(container, opts = {}) {
        if (!container || container._uiSwipe) return;
        container._uiSwipe = true;
        const WIDTH = opts.width || 88, OPEN_AT = 40;

        container.addEventListener('pointerdown', e => {
            if (e.pointerType !== 'touch') return;
            const row = e.target.closest(opts.rowSelector || '[data-key]');
            if (!row || e.target.closest('.ui-swipe-actions')) return;
            const surface = row.querySelector(opts.surface || '.ui-swipe-surface') || row;

            let x0 = e.clientX, y0 = e.clientY, dx = 0, decided = null;
            const startOpen = surface.classList.contains('open') ? -WIDTH : 0;

            const move = ev => {
                dx = ev.clientX - x0;
                if (decided === null) {
                    if (Math.abs(ev.clientY - y0) > 10) { decided = 'scroll'; cleanup(); return; }
                    if (Math.abs(dx) > 8) decided = 'swipe';
                    else return;
                }
                ev.preventDefault();
                const at = Math.max(-WIDTH, Math.min(0, startOpen + dx));
                surface.style.transform = `translateX(${at}px)`;
            };
            const up = () => {
                if (decided === 'swipe') {
                    const at = Math.max(-WIDTH, Math.min(0, startOpen + dx));
                    const open = at < -OPEN_AT;
                    surface.style.transform = `translateX(${open ? -WIDTH : 0}px)`;
                    surface.classList.toggle('open', open);
                }
                cleanup();
            };
            const cleanup = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
            };
            window.addEventListener('pointermove', move, { passive: false });
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', up);
        });
    },

    closeSwipes(root = document) {
        root.querySelectorAll('.ui-swipe-surface.open').forEach(s => {
            s.classList.remove('open');
            s.style.transform = '';
        });
    }
};

// A pending delete must not be lost because the tab closed.
window.addEventListener('pagehide', () => UI.flushUndo());
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') UI.flushUndo();
});
