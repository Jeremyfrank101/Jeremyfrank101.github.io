// sync.js — Supabase persistence behind Store's synchronous API.
//
// The rest of the app reads Store inside template literals (Views, Modal), so
// reads have to stay synchronous. This layer keeps an in-memory cache that the
// Store reads from, applies writes to it immediately for an instant UI, and
// pushes them to Postgres in the background.
//
// Failed writes are queued in localStorage and retried, so a dropped
// connection or a mid-write reload doesn't lose the change.

const Sync = {
    QUEUE_KEY: 'cozyhome_pending',
    THEME_KEY: 'cozyhome_theme',
    LEGACY_KEY: 'cozyhome_data',

    // camelCase in the app, snake_case in Postgres.
    TABLES: {
        homes:     'homes',
        rooms:     'rooms',
        items:     'items',
        projects:  'projects',
        diyItems:  'diy_items'
    },

    cache: null,
    status: 'idle',      // idle | syncing | offline | error
    _queue: [],
    _flushing: false,
    _listeners: [],

    // ---------- lifecycle ----------

    reset() {
        this.cache = { homes: [], rooms: [], items: [], projects: [], diyItems: [],
                       shares: [], people: {}, notes: {},
                       theme: this.localTheme() || 'California Cabana' };
    },

    // The theme is an account preference, but it is also mirrored to this
    // device so it survives sign-out and is applied before the first fetch
    // returns — otherwise every logged-out screen flashes the default.
    localTheme() {
        try { return localStorage.getItem(this.THEME_KEY); } catch { return null; }
    },

    rememberTheme(name) {
        try { localStorage.setItem(this.THEME_KEY, name); } catch (e) { /* private mode */ }
    },

    onStatus(fn) { this._listeners.push(fn); },

    _setStatus(s, detail) {
        this.status = s;
        this._listeners.forEach(fn => fn(s, detail));
    },

    get client() { return Auth.client; },

    // Loads everything the signed-in user owns into the cache.
    //
    // Coalesced: signing up fires onAuthStateChange while the caller is also
    // awaiting checkAuth(), so two hydrates can overlap. Each one calls
    // reset(), and the slower one would wipe whatever the faster one — or the
    // user — had already put in the cache.
    hydrate() {
        if (this._hydrating) return this._hydrating;
        this._hydrating = this._doHydrate().finally(() => { this._hydrating = null; });
        return this._hydrating;
    },

    async _doHydrate() {
        this.reset();
        this._queue = this._loadQueue();
        this._setStatus('syncing');

        try {
            const [homes, rooms, items, projects, diyItems, prefs, shares, notes] = await Promise.all([
                this.client.from('homes').select('*'),
                this.client.from('rooms').select('*'),
                this.client.from('items').select('*'),
                this.client.from('projects').select('*'),
                this.client.from('diy_items').select('*'),
                this.client.from('preferences').select('*').maybeSingle(),
                this.client.from('shares').select('*'),
                this.client.from('project_notes').select('*').order('created_at', { ascending: false })
            ]);

            const firstError = [homes, rooms, items, projects, diyItems, prefs, shares, notes].find(r => r.error);
            if (firstError) throw firstError.error;

            this.cache.homes    = (homes.data    || []).map(this.fromHome);
            this.cache.rooms    = (rooms.data    || []).map(this.fromRoom);
            this.cache.items    = (items.data    || []).map(this.fromItem);
            this.cache.projects = (projects.data || []).map(this.fromProject);
            this.cache.diyItems = (diyItems.data || []).map(this.fromDIY);
            this.cache.shares   = (shares.data   || []).map(this.fromShare);
            this.cache.notes = {};
            (notes.data || []).forEach(n => {
                (this.cache.notes[n.project_id] ||= []).push(this.fromNote(n));
            });
            // The account's saved theme wins over whatever this device had.
            this.cache.theme    = prefs.data?.theme || this.localTheme() || 'California Cabana';
            this.rememberTheme(this.cache.theme);

            // How much this account already had on the server, captured before
            // any local writes can land, so the import decision is made on the
            // server state rather than on a cache someone may have added to.
            const fetchedCount = this.cache.homes.length + this.cache.rooms.length +
                                 this.cache.items.length + this.cache.projects.length +
                                 this.cache.diyItems.length;

            await this.loadPeople();            // names for anyone we share with
            await this._resolvePhotoUrls();     // turn stored paths into <img> urls
            await this.flush();                 // drain anything queued earlier
            await this._migrateLegacyIfNeeded(fetchedCount);
            this._setStatus('idle');
            return true;
        } catch (err) {
            console.error('[Sync] hydrate failed', err);
            this._setStatus('error', err.message || String(err));
            return false;
        }
    },

    // One-time import of data created before the app had a backend.
    async _migrateLegacyIfNeeded(remoteCount) {
        const raw = localStorage.getItem(this.LEGACY_KEY);
        if (!raw) return;

        let legacy;
        try { legacy = JSON.parse(raw); } catch { return; }
        if (!legacy) return;

        const counts = ['homes', 'rooms', 'items', 'projects', 'diyItems']
            .reduce((n, k) => n + (Array.isArray(legacy[k]) ? legacy[k].length : 0), 0);
        if (!counts) { localStorage.removeItem(this.LEGACY_KEY); return; }

        // Only import into an empty account, so signing in on a second device
        // never duplicates what is already there.
        if (remoteCount > 0) return;

        console.info(`[Sync] importing ${counts} local records into Supabase`);
        this._setStatus('syncing');

        // Order matters: rooms and projects are referenced by the rest.
        const push = async (kind, rows, toRow) => {
            if (!rows.length) return;
            const { error } = await this.client.from(this.TABLES[kind]).upsert(rows.map(toRow));
            if (error) throw error;
        };

        try {
            // Legacy records carry base64 in `photo`. Upload those to Storage
            // first and hang the resulting path off the record, so the row
            // mappers below write a path rather than dropping the image.
            const kinds = ['homes', 'rooms', 'projects', 'items', 'diyItems'];
            let uploaded = 0, failed = 0;
            for (const kind of kinds) {
                for (const rec of legacy[kind] || []) {
                    if (!this.isDataUrl(rec.photo)) continue;
                    try {
                        rec.photoPath = await this._uploadPhoto(kind, rec.id, rec.photo);
                        uploaded++;
                    } catch (e) {
                        // Losing a photo must not abort the whole import.
                        console.warn('[Sync] photo upload failed during import', rec.id, e);
                        rec.photoPath = null;
                        failed++;
                    }
                }
            }
            if (uploaded || failed) {
                console.info(`[Sync] imported ${uploaded} photo(s)${failed ? `, ${failed} failed` : ''}`);
            }

            await push('homes',    legacy.homes    || [], h => this.toHome(h));
            await push('rooms',    legacy.rooms    || [], r => this.toRoom(r));
            await push('projects', legacy.projects || [], p => this.toProject(p));
            await push('items',    legacy.items    || [], i => this.toItem(i));
            await push('diyItems', legacy.diyItems || [], d => this.toDIY(d));

            if (legacy.theme) {
                await this.client.from('preferences')
                    .upsert({ user_id: Auth.getUser().id, theme: legacy.theme });
                this.cache.theme = legacy.theme;
            }

            // Merge rather than assign. The user can create records while the
            // import is in flight, and replacing the arrays would silently
            // discard them.
            const mergeIn = (key, rows) => {
                const seen = new Set(this.cache[key].map(r => r.id));
                rows.forEach(r => { if (!seen.has(r.id)) this.cache[key].push(r); });
            };
            mergeIn('homes',    legacy.homes    || []);
            mergeIn('rooms',    legacy.rooms    || []);
            mergeIn('items',    legacy.items    || []);
            mergeIn('projects', legacy.projects || []);
            mergeIn('diyItems', legacy.diyItems || []);

            // Replace the imported base64 with signed URLs so the tab stops
            // holding every image in memory.
            await this._resolvePhotoUrls();

            // Keep a copy under a different key rather than deleting outright.
            localStorage.setItem(this.LEGACY_KEY + '_imported', raw);
            localStorage.removeItem(this.LEGACY_KEY);
            console.info('[Sync] import complete');
        } catch (err) {
            console.error('[Sync] import failed, leaving local data untouched', err);
            this._setStatus('error', 'Could not import your existing data.');
        }
    },

    // ---------- write queue ----------

    _loadQueue() {
        try { return JSON.parse(localStorage.getItem(this.QUEUE_KEY)) || []; }
        catch { return []; }
    },

    _saveQueue() {
        try { localStorage.setItem(this.QUEUE_KEY, JSON.stringify(this._queue)); }
        catch (e) { console.warn('[Sync] could not persist queue', e); }
    },

    // Records an intent and kicks off a flush. Callers do not await this —
    // the cache is already updated, so the UI is correct either way.
    enqueue(op) {
        this._queue.push(op);
        this._saveQueue();
        this.flush();
    },

    // The same durability for any table in any schema, so apps other than
    // CozyHome do not have to write straight to the network and lose the
    // change when the connection is not there.
    //
    // Callers supply the row's id themselves. Every table involved has a uuid
    // primary key, so a client-generated id means the optimistic row and the
    // stored row are the same row, and a retry that turns out to have already
    // landed collides on the key instead of inserting a duplicate.
    enqueueWrite({ schema, table, action, payload, match }) {
        this.enqueue({ type: 'write', schema, table, action, payload, match });
    },

    newId() {
        return (crypto.randomUUID && crypto.randomUUID()) ||
               'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                   const r = Math.random() * 16 | 0;
                   return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
               });
    },

    // A structured error from PostgREST means the request reached the server
    // and was rejected on its merits — a constraint, a policy, a bad column.
    // Retrying it unchanged will be rejected identically, and leaving it at
    // the head of the queue blocks every write behind it forever, which is
    // how a single bad row can silently stop an account from saving anything.
    _isTerminal(err) {
        if (!err) return false;
        if (err.code === 'PGRST301' || err.code === '401') return false;   // token expired; worth a retry
        return !!err.code || (err.status >= 400 && err.status < 500);
    },

    // Ops the server refused outright. Kept so the UI can say so rather than
    // pretending everything saved.
    dropped: [],

    async flush() {
        if (this._flushing || !this._queue.length) return;
        if (!Auth.getUser()) return;
        this._flushing = true;
        this._setStatus('syncing');

        while (this._queue.length) {
            const op = this._queue[0];
            try {
                await this._apply(op);
                this._queue.shift();
                this._saveQueue();
            } catch (err) {
                if (this._isTerminal(err)) {
                    // Refused, not unreachable. Drop it so the rest of the
                    // queue can drain, and remember it so we can say so.
                    console.error('[Sync] write refused, dropping', op, err);
                    this.dropped.push({ op, message: err.message || String(err) });
                    this._queue.shift();
                    this._saveQueue();
                    continue;
                }
                console.error('[Sync] write failed, will retry', op, err);
                this._flushing = false;
                this._setStatus(navigator.onLine ? 'error' : 'offline', err.message);
                return;
            }
        }

        this._flushing = false;
        this._setStatus(this.dropped.length ? 'refused' : 'idle');
    },

    async _apply(op) {
        // A plain write to any table in any schema. Used by every app but
        // CozyHome, which has its own typed ops below.
        if (op.type === 'write') {
            const from = op.schema ? this.client.schema(op.schema).from(op.table)
                                   : this.client.from(op.table);
            let res;
            if (op.action === 'insert')      res = await from.insert(op.payload);
            else if (op.action === 'upsert') res = await from.upsert(op.payload);
            else if (op.action === 'update') res = await from.update(op.payload).match(op.match);
            else if (op.action === 'delete') res = await from.delete().match(op.match);
            else throw new Error('unknown write action ' + op.action);

            if (res.error) {
                // A retried insert whose first attempt actually landed comes
                // back as a duplicate key. That is success, not failure.
                if (op.action === 'insert' && res.error.code === '23505') return;
                throw res.error;
            }
            return;
        }

        // The theme lives in its own single-row table, so it has no `kind`.
        if (op.type === 'theme') {
            const res = await this.client.from('preferences').upsert({
                user_id: Auth.getUser().id,
                theme: op.theme,
                updated_at: new Date().toISOString()
            });
            if (res.error) throw res.error;
            return;
        }

        // Auto-shares ride the queue so they apply AFTER the row they share
        // lands in Postgres — shares_owner_create checks owns_resource(), which
        // fails if the project insert has not flushed yet.
        if (op.type === 'autoshare') {
            const { data, error } = await this.client.from('shares').insert({
                resource_type: op.resourceType,
                resource_id: op.id,
                owner_id: Auth.getUser().id,
                shared_with_id: op.userId
            }).select().single();
            if (error) {
                if (error.code === '23505') return;   // already shared
                throw error;
            }
            this.cache.shares.push(this.fromShare(data));
            return;
        }

        const table = this.TABLES[op.kind];
        if (!table) throw new Error('unknown table for kind ' + op.kind);
        const q = this.client.from(table);

        // Photo uploads: put the bytes in Storage, then point the row at them.
        if (op.type === 'upload') {
            const path = await this._uploadPhoto(op.kind, op.id, op.dataUrl);
            const res = await q.update({ photo: path }).eq('id', op.id);
            if (res.error) throw res.error;

            const cached = this._findCached(op.kind, op.id);
            if (cached) {
                cached.photoPath = path;
                // Swap the heavy data URL for a signed one so the tab stops
                // holding the full image in memory.
                const { data } = await this.client.storage
                    .from(this.BUCKET).createSignedUrl(path, this.SIGNED_TTL);
                if (data?.signedUrl) cached.photo = data.signedUrl;
            }
            return;
        }

        if (op.type === 'photoDelete') {
            await this._deletePhoto(op.path);
            return;
        }

        let res;
        if (op.type === 'upsert')      res = await q.upsert(op.row);
        else if (op.type === 'delete') res = await q.delete().eq('id', op.id);
        else throw new Error('unknown op type ' + op.type);

        if (res.error) throw res.error;
    },

    pendingCount() { return this._queue.length; },

    // ---------- photos ----------
    //
    // The `photo` column holds a Storage path. In the cache, `photoPath` is
    // that path and `photo` is something an <img src> can use — a signed URL
    // once loaded, or the raw data URL while an upload is still pending. Views
    // read `photo` and therefore needed no changes.

    // A dedicated bucket, not the shared `photos` one. That bucket belongs to
    // another app in this project and carries anon read/write policies, so
    // anything CozyHome put there would have been world-readable.
    BUCKET: 'cozyhome-photos',
    SIGNED_TTL: 60 * 60 * 8,   // re-signed on every hydrate anyway

    isDataUrl(v) { return typeof v === 'string' && v.startsWith('data:'); },

    photoPathFor(kind, id) {
        return `${Auth.getUser().id}/${kind}/${id}`;
    },

    // One batched request per table instead of one per photo.
    async _resolvePhotoUrls() {
        const jobs = [];
        for (const key of ['homes', 'rooms', 'items', 'projects', 'diyItems']) {
            for (const row of this.cache[key]) {
                if (row.photoPath) jobs.push(row);
            }
        }
        if (!jobs.length) return;

        const paths = jobs.map(r => r.photoPath);
        const { data, error } = await this.client.storage
            .from(this.BUCKET)
            .createSignedUrls(paths, this.SIGNED_TTL);

        if (error) { console.warn('[Sync] could not sign photo urls', error); return; }

        const byPath = new Map();
        (data || []).forEach((d, i) => {
            if (d && d.signedUrl) byPath.set(paths[i], d.signedUrl);
        });
        jobs.forEach(r => { r.photo = byPath.get(r.photoPath) || null; });
    },

    async _uploadPhoto(kind, id, dataUrl) {
        const blob = await (await fetch(dataUrl)).blob();
        const path = this.photoPathFor(kind, id);
        const { error } = await this.client.storage
            .from(this.BUCKET)
            .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
        if (error) throw error;
        return path;
    },

    async _deletePhoto(path) {
        if (!path) return;
        const { error } = await this.client.storage.from(this.BUCKET).remove([path]);
        // A missing object is not worth failing the queue over.
        if (error) console.warn('[Sync] could not remove photo', path, error);
    },

    // Finds the cached record so an upload can write its path back.
    _findCached(kind, id) {
        return (this.cache[kind] || []).find(r => r.id === id);
    },

    // ---------- row mapping ----------
    // Postgres is snake_case; the app has always used camelCase. Convert at
    // the boundary rather than renaming fields across every view.

    fromNote(n) {
        return { id: n.id, projectId: n.project_id, userId: n.user_id,
                 body: n.body, createdAt: n.created_at };
    },

    // Notes are written directly rather than queued: the author needs to know
    // it actually landed, and a silently queued note looks posted when it is not.
    async addNote(projectId, body) {
        const { data, error } = await this.client.from('project_notes').insert({
            project_id: projectId, user_id: Auth.getUser().id, body
        }).select().single();
        if (error) throw new Error(error.message);
        const note = this.fromNote(data);
        (this.cache.notes[projectId] ||= []).unshift(note);   // newest first
        return note;
    },

    async deleteNote(noteId, projectId) {
        // .select() so we can tell a real delete from one RLS silently dropped:
        // deleting someone else's note matches zero rows and returns no error,
        // and removing it from the cache anyway would hide a note that still
        // exists on the server until the next reload.
        const { data, error } = await this.client
            .from('project_notes').delete().eq('id', noteId).select();
        if (error) throw new Error(error.message);
        if (!data || !data.length) throw new Error('That note belongs to someone else.');
        const list = this.cache.notes[projectId] || [];
        this.cache.notes[projectId] = list.filter(n => n.id !== noteId);
    },

    fromShare(s) {
        return { id: s.id, resourceType: s.resource_type, resourceId: s.resource_id,
                 ownerId: s.owner_id, sharedWithId: s.shared_with_id, createdAt: s.created_at };
    },

    // ---------- sharing ----------
    //
    // Shares are written directly rather than through the offline queue: the
    // caller needs the result (did the email resolve? did the insert pass RLS?)
    // and a silently queued share would look like it worked when it had not.

    async lookupUser(email) {
        const { data, error } = await this.client
            .rpc('find_user_by_email', { p_email: email });
        if (error) throw new Error(error.message);
        const row = Array.isArray(data) ? data[0] : data;
        return row || null;
    },

    async shareResource(resourceType, resourceId, email) {
        const person = await this.lookupUser(email);
        if (!person) {
            throw new Error(`No CozyHome account uses ${email}. They need to sign up first.`);
        }
        const { data, error } = await this.client.from('shares').insert({
            resource_type: resourceType,
            resource_id: resourceId,
            owner_id: Auth.getUser().id,
            shared_with_id: person.user_id
        }).select().single();

        if (error) {
            if (error.code === '23505') throw new Error('Already shared with that person.');
            throw new Error(error.message);
        }
        this.cache.shares.push(this.fromShare(data));
        this.cache.people[person.user_id] = { email: person.email, username: person.username };
        return person;
    },

    // Share directly with a known account (used by auto-share, where the
    // partner's id is already in the shares table). Duplicate shares are fine.
    async shareWithUser(resourceType, resourceId, userId) {
        const { data, error } = await this.client.from('shares').insert({
            resource_type: resourceType,
            resource_id: resourceId,
            owner_id: Auth.getUser().id,
            shared_with_id: userId
        }).select().single();
        if (error) {
            if (error.code === '23505') return null;   // already shared
            throw new Error(error.message);
        }
        this.cache.shares.push(this.fromShare(data));
        return data;
    },

    async unshare(shareId) {
        const { error } = await this.client.from('shares').delete().eq('id', shareId);
        if (error) throw new Error(error.message);
        this.cache.shares = this.cache.shares.filter(s => s.id !== shareId);
    },

    // Names for everyone involved in a share, for display.
    async loadPeople() {
        const ids = new Set();
        this.cache.shares.forEach(s => { ids.add(s.ownerId); ids.add(s.sharedWithId); });
        Object.values(this.cache.notes || {}).forEach(list => list.forEach(n => ids.add(n.userId)));
        ids.delete(Auth.getUser()?.id);
        if (!ids.size) return;
        const { data, error } = await this.client
            .from('profiles').select('user_id,email,username').in('user_id', [...ids]);
        if (error) { console.warn('[Sync] could not load collaborator profiles', error); return; }
        (data || []).forEach(p => {
            this.cache.people[p.user_id] = { email: p.email, username: p.username };
        });
    },

    toHome(h) {
        return { id: h.id, name: h.name,
                 photo: h.photoPath || null, created_at: h.createdAt };
    },
    fromHome(h) {
        return { id: h.id, name: h.name, ownerId: h.user_id,
                 photoPath: h.photo, photo: null, createdAt: h.created_at };
    },

    toRoom(r) {
        return { id: r.id, name: r.name, parent_room_id: r.parentRoomId || null,
                 home_id: r.homeId || null, is_private: !!r.isPrivate,
                 photo: r.photoPath || null, created_at: r.createdAt };
    },
    fromRoom(r) {
        return { id: r.id, name: r.name, parentRoomId: r.parent_room_id,
                 homeId: r.home_id, ownerId: r.user_id, isPrivate: r.is_private,
                 photoPath: r.photo, photo: null, createdAt: r.created_at };
    },

    toItem(i) {
        return { id: i.id, name: i.name, description: i.desc || '',
                 item_type: i.itemType || 'Other', room_id: i.roomId || null,
                 is_private: !!i.isPrivate,
                 photo: i.photoPath || null, created_at: i.createdAt };
    },
    fromItem(i) {
        return { id: i.id, name: i.name, desc: i.description || '',
                 itemType: i.item_type, roomId: i.room_id, ownerId: i.user_id,
                 isPrivate: i.is_private,
                 photoPath: i.photo, photo: null, createdAt: i.created_at };
    },

    toProject(p) {
        return { id: p.id, name: p.name, description: p.desc || '',
                 budget: p.budget || 0, goal_date: p.goalDate || null,
                 is_completed: !!p.isCompleted, completed_at: p.completedAt || null,
                 room_ids: p.roomIds || [], item_ids: p.itemIds || [],
                 options: p.options || [], tasks: p.tasks || [],
                 is_diy: !!p.isDIY, photo: p.photoPath || null, created_at: p.createdAt };
    },
    fromProject(p) {
        return { id: p.id, name: p.name, desc: p.description || '',
                 budget: Number(p.budget) || 0, goalDate: p.goal_date,
                 isCompleted: p.is_completed, completedAt: p.completed_at,
                 roomIds: p.room_ids || [], itemIds: p.item_ids || [],
                 options: p.options || [], tasks: p.tasks || [],
                 isDIY: p.is_diy, ownerId: p.user_id,
                 photoPath: p.photo, photo: null, createdAt: p.created_at };
    },

    toDIY(d) {
        return { id: d.id, project_id: d.projectId, name: d.name,
                 description: d.desc || '', purpose: d.purpose || '',
                 is_owned: !!d.isOwned, existing_item_id: d.existingItemId || null,
                 photo: d.photoPath || null, options: d.options || [], created_at: d.createdAt };
    },
    fromDIY(d) {
        return { id: d.id, projectId: d.project_id, name: d.name,
                 desc: d.description || '', purpose: d.purpose || '',
                 isOwned: d.is_owned, existingItemId: d.existing_item_id,
                 photoPath: d.photo, photo: null, options: d.options || [], createdAt: d.created_at };
    }
};

// Retry as soon as the network comes back.
window.addEventListener('online', () => Sync.flush());
