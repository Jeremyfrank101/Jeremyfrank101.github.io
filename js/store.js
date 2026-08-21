// store.js — data layer for rooms, items and projects.
//
// Backed by Supabase via sync.js. Reads come straight from Sync's in-memory
// cache so they stay synchronous (Views and Modal call them inside template
// literals); writes update the cache immediately and are pushed to Postgres in
// the background. The public API is unchanged from the localStorage version.
//
// Authentication lives in auth.js.

const Store = {

    _data() {
        if (!Sync.cache) Sync.reset();
        return Sync.cache;
    },

    // Modal._getPhotoData() returns whatever is in the preview's <img src>,
    // which is a data: URL for a freshly chosen file but the existing signed
    // URL when the photo was left alone. Treating those the same would either
    // re-upload on every save or wipe the reference, so they are told apart
    // here. Returns the fields to merge onto the record.
    //
    //   incoming is a data: URL -> new image, queue an upload
    //   incoming is null        -> removed, delete the stored object
    //   anything else           -> unchanged, keep the existing path
    _applyPhoto(kind, record, incoming) {
        const hadPath = record.photoPath || null;

        if (Sync.isDataUrl(incoming)) {
            record.photo = incoming;        // render immediately from the data URL
            record.photoPath = null;        // set once the upload lands
            Sync.enqueue({ type: 'upload', kind, id: record.id, dataUrl: incoming });
            return;
        }

        if (!incoming) {
            record.photo = null;
            record.photoPath = null;
            if (hadPath) Sync.enqueue({ type: 'photoDelete', kind, path: hadPath });
            return;
        }

        // Unchanged: keep both the path and the URL already being rendered.
        record.photo = incoming;
        record.photoPath = hadPath;
    },

    // ---------- Theme ----------

    getTheme() {
        return this._data().theme || 'California Cabana';
    },

    setTheme(name) {
        // Mirror to the device every time, even on a no-op, so a fresh install
        // that happens to match the default still records the choice.
        Sync.rememberTheme(name);
        // ThemeEngine.apply() calls this on every application, including when
        // restoring the saved theme after login, so skip no-op server writes.
        if (this._data().theme === name) return;
        this._data().theme = name;
        if (Auth.getUser()) Sync.enqueue({ type: 'theme', theme: name });
    },

    // ---------- Sharing ----------

    myId() { return Auth.getUser()?.id || null; },

    isMine(record) {
        // Rows created before ownerId was tracked, and rows created locally
        // this session, are ours by construction.
        return !record || !record.ownerId || record.ownerId === this.myId();
    },

    // Shares where I am the owner — people I invited in.
    getSharesFor(resourceType, resourceId) {
        return this._data().shares.filter(s =>
            s.resourceType === resourceType &&
            s.resourceId === resourceId &&
            s.ownerId === this.myId());
    },

    // The share that grants me access to something someone else owns.
    getIncomingShare(resourceType, resourceId) {
        return this._data().shares.find(s =>
            s.resourceType === resourceType &&
            s.resourceId === resourceId &&
            s.sharedWithId === this.myId());
    },

    isSharedOut(resourceType, resourceId) {
        return this.getSharesFor(resourceType, resourceId).length > 0;
    },

    personName(userId) {
        const p = this._data().people[userId];
        if (!p) return 'someone';
        return p.username || p.email;
    },

    // Everyone on the other end of a HOME share, in either direction. These
    // are the people new objects are automatically visible to.
    sharingPartners() {
        const me = this.myId();
        const out = new Set();
        for (const sh of this._data().shares) {
            if (sh.resourceType !== 'home') continue;
            out.add(sh.ownerId === me ? sh.sharedWithId : sh.ownerId);
        }
        out.delete(me);
        return [...out];
    },

    // New projects are visible to the household by default: a share row is
    // created for each partner unless the project was created "keep private".
    _autoShareProject(projectId) {
        for (const uid of this.sharingPartners()) {
            // Through the queue, not directly: it must run after the project
            // row itself has flushed, and it survives offline the same way.
            Sync.enqueue({ type: 'autoshare', resourceType: 'project', id: projectId, userId: uid });
        }
    },

    shareResource(resourceType, resourceId, email) {
        return Sync.shareResource(resourceType, resourceId, email);
    },

    unshare(shareId) {
        return Sync.unshare(shareId);
    },

    // ---------- Homes ----------

    getHomes() {
        return this._data().homes.slice().sort((a, b) => a.name.localeCompare(b.name));
    },

    getHome(id) {
        return this._data().homes.find(h => h.id === id);
    },

    addHome(home) {
        const h = {
            id: crypto.randomUUID(),
            name: home.name,
            photo: null,
            photoPath: null,
            createdAt: new Date().toISOString()
        };
        this._data().homes.push(h);
        Sync.enqueue({ type: 'upsert', kind: 'homes', row: Sync.toHome(h) });
        this._applyPhoto('homes', h, home.photo || null);
        return h;
    },

    updateHome(id, updates) {
        const home = this.getHome(id);
        if (!home) return;
        const { photo, ...rest } = updates;
        Object.assign(home, rest);
        if ('photo' in updates) this._applyPhoto('homes', home, photo);
        Sync.enqueue({ type: 'upsert', kind: 'homes', row: Sync.toHome(home) });
    },

    deleteHome(id) {
        const data = this._data();
        // Mirrors ON DELETE SET NULL in the schema: the rooms survive and fall
        // back to "No Home". Keeping the cache in step avoids the kind of drift
        // that previously left Postgres holding rows the cache thought were gone.
        data.rooms.forEach(r => { if (r.homeId === id) r.homeId = null; });
        data.homes = data.homes.filter(h => h.id !== id);
        Sync.enqueue({ type: 'delete', kind: 'homes', id });
    },

    getRoomsForHome(homeId) {
        return this.getTopLevelRooms().filter(r => (r.homeId || null) === (homeId || null));
    },

    // ---------- Rooms ----------

    getRooms() {
        return this._data().rooms;
    },

    getRoom(id) {
        return this.getRooms().find(r => r.id === id);
    },

    getTopLevelRooms() {
        return this.getRooms().filter(r => !r.parentRoomId).sort((a, b) => a.name.localeCompare(b.name));
    },

    getSubRooms(parentId) {
        return this.getRooms().filter(r => r.parentRoomId === parentId).sort((a, b) => a.name.localeCompare(b.name));
    },

    addRoom(room) {
        const r = {
            id: crypto.randomUUID(),
            name: room.name,
            parentRoomId: room.parentRoomId || null,
            homeId: room.homeId || null,
            isPrivate: !!room.isPrivate,
            photo: null,
            photoPath: null,
            createdAt: new Date().toISOString()
        };
        this._data().rooms.push(r);
        Sync.enqueue({ type: 'upsert', kind: 'rooms', row: Sync.toRoom(r) });
        this._applyPhoto('rooms', r, room.photo || null);
        return r;
    },

    updateRoom(id, updates) {
        const room = this.getRoom(id);
        if (!room) return;
        const { photo, ...rest } = updates;
        Object.assign(room, rest);
        if ('photo' in updates) this._applyPhoto('rooms', room, photo);
        Sync.enqueue({ type: 'upsert', kind: 'rooms', row: Sync.toRoom(room) });
    },

    deleteRoom(id) {
        const data = this._data();
        // Cascade locally to match the ON DELETE CASCADE in the schema, so the
        // cache and the database agree without a refetch.
        const subIds = data.rooms.filter(r => r.parentRoomId === id).map(r => r.id);
        const allIds = [id, ...subIds];
        data.items = data.items.filter(i => !allIds.includes(i.roomId));
        data.rooms = data.rooms.filter(r => !allIds.includes(r.id));
        // Deleting the parent cascades in Postgres; one delete is enough.
        Sync.enqueue({ type: 'delete', kind: 'rooms', id });
    },

    // ---------- Room restructuring ----------
    //
    // The app renders exactly two levels: rooms and their sub-rooms. Anything
    // deeper would be invisible, so conversions are gated rather than allowed
    // to create a nesting the UI cannot show.

    // Rooms a given room could legally be nested under.
    getConversionTargets(roomId) {
        const room = this.getRoom(roomId);
        if (!room || room.parentRoomId) return [];        // already a sub-room
        if (this.getSubRooms(roomId).length) return [];   // would make 3 levels
        return this.getTopLevelRooms().filter(r => r.id !== roomId);
    },

    canConvertToSubRoom(roomId) {
        const room = this.getRoom(roomId);
        if (!room) return { ok: false, reason: 'That room no longer exists.' };
        if (room.parentRoomId) return { ok: false, reason: 'This is already a sub-room.' };
        if (this.getSubRooms(roomId).length) {
            return { ok: false, reason: 'This room has sub-rooms of its own. Move or delete them first — CozyHome only nests one level deep.' };
        }
        if (!this.getConversionTargets(roomId).length) {
            return { ok: false, reason: 'There is no other room to nest this one under yet.' };
        }
        return { ok: true };
    },

    convertToSubRoom(roomId, parentId) {
        const room = this.getRoom(roomId);
        const parent = this.getRoom(parentId);
        if (!room || !parent) return false;
        if (roomId === parentId) return false;              // no self-parenting
        if (parent.parentRoomId) return false;              // parent must be top level
        if (this.getSubRooms(roomId).length) return false;  // would nest too deep

        // A sub-room belongs to whatever home its parent is in.
        this.updateRoom(roomId, { parentRoomId: parentId, homeId: parent.homeId || null });
        return true;
    },

    // The inverse, so converting is not a one-way trip.
    convertToTopLevel(roomId) {
        const room = this.getRoom(roomId);
        if (!room || !room.parentRoomId) return false;
        this.updateRoom(roomId, { parentRoomId: null });
        return true;
    },

    // ---------- Items ----------

    getItems() {
        return this._data().items.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    getItem(id) {
        return this._data().items.find(i => i.id === id);
    },

    getItemsForRoom(roomId) {
        return this.getItems().filter(i => i.roomId === roomId);
    },

    addItem(item) {
        const i = {
            id: crypto.randomUUID(),
            name: item.name,
            desc: item.desc || '',
            itemType: item.itemType || 'Other',
            roomId: item.roomId || null,
            isPrivate: !!item.isPrivate,
            photo: null,
            photoPath: null,
            createdAt: new Date().toISOString()
        };
        this._data().items.push(i);
        Sync.enqueue({ type: 'upsert', kind: 'items', row: Sync.toItem(i) });
        this._applyPhoto('items', i, item.photo || null);
        return i;
    },

    updateItem(id, updates) {
        const item = this.getItem(id);
        if (!item) return;
        const { photo, ...rest } = updates;
        Object.assign(item, rest);
        if ('photo' in updates) this._applyPhoto('items', item, photo);
        Sync.enqueue({ type: 'upsert', kind: 'items', row: Sync.toItem(item) });
    },

    deleteItem(id) {
        const data = this._data();
        data.items = data.items.filter(i => i.id !== id);
        Sync.enqueue({ type: 'delete', kind: 'items', id });
    },

    // ---------- Projects ----------

    getProjects() {
        return this._data().projects.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    getProject(id) {
        return this._data().projects.find(p => p.id === id);
    },

    addProject(project) {
        const p = {
            id: crypto.randomUUID(),
            name: project.name,
            desc: project.desc || '',
            budget: project.budget || 0,
            goalDate: project.goalDate || null,
            isCompleted: false,
            completedAt: null,
            roomIds: project.roomIds || [],
            itemIds: project.itemIds || [],
            options: project.options || [],
            tasks: project.tasks || [],
            isDIY: project.isDIY || false,
            isPrivate: !!project.isPrivate,
            photo: null,
            photoPath: null,
            createdAt: new Date().toISOString()
        };
        this._data().projects.push(p);
        Sync.enqueue({ type: 'upsert', kind: 'projects', row: Sync.toProject(p) });
        this._applyPhoto('projects', p, project.photo || null);
        if (!p.isPrivate) this._autoShareProject(p.id);
        return p;
    },

    updateProject(id, updates) {
        const project = this.getProject(id);
        if (!project) return;
        const { photo, ...rest } = updates;
        Object.assign(project, rest);
        if ('photo' in updates) this._applyPhoto('projects', project, photo);
        Sync.enqueue({ type: 'upsert', kind: 'projects', row: Sync.toProject(project) });
    },

    deleteProject(id) {
        const data = this._data();
        data.diyItems = data.diyItems.filter(d => d.projectId !== id);
        data.projects = data.projects.filter(p => p.id !== id);
        Sync.enqueue({ type: 'delete', kind: 'projects', id });
    },

    // ---------- Project notes ----------
    //
    // A shared log of what has actually been done. Everyone with access to the
    // project sees every note; each records its author and time.

    getNotes(projectId) {
        const list = (this._data().notes || {})[projectId] || [];
        return list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    addNote(projectId, body) {
        return Sync.addNote(projectId, body);
    },

    deleteNote(noteId, projectId) {
        return Sync.deleteNote(noteId, projectId);
    },

    // ---------- DIY Items ----------

    getDIYItems(projectId) {
        return this._data().diyItems
            .filter(d => d.projectId === projectId)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    },

    getDIYItem(id) {
        return this._data().diyItems.find(d => d.id === id);
    },

    addDIYItem(diy) {
        const d = {
            id: crypto.randomUUID(),
            projectId: diy.projectId,
            name: diy.name,
            desc: diy.desc || '',
            purpose: diy.purpose || '',
            isOwned: false,
            existingItemId: diy.existingItemId || null,
            photo: null,
            photoPath: null,
            options: diy.options || [],
            createdAt: new Date().toISOString()
        };
        this._data().diyItems.push(d);
        Sync.enqueue({ type: 'upsert', kind: 'diyItems', row: Sync.toDIY(d) });
        this._applyPhoto('diyItems', d, diy.photo || null);
        return d;
    },

    updateDIYItem(id, updates) {
        const diy = this.getDIYItem(id);
        if (!diy) return;
        const { photo, ...rest } = updates;
        Object.assign(diy, rest);
        if ('photo' in updates) this._applyPhoto('diyItems', diy, photo);
        Sync.enqueue({ type: 'upsert', kind: 'diyItems', row: Sync.toDIY(diy) });
    },

    deleteDIYItem(id) {
        const data = this._data();
        data.diyItems = data.diyItems.filter(d => d.id !== id);
        Sync.enqueue({ type: 'delete', kind: 'diyItems', id });
    },

    // ---------- Helpers ----------

    getRoomBreadcrumb(roomId) {
        if (!roomId) return '';
        const room = this.getRoom(roomId);
        if (!room) return '';
        if (room.parentRoomId) {
            const parent = this.getRoom(room.parentRoomId);
            return parent ? `${parent.name} → ${room.name}` : room.name;
        }
        return room.name;
    },

    // Deletes the user's entire inventory, locally and remotely. Signing out
    // must NOT call this — that was the old behaviour and it silently deleted
    // everything the user owned.
    wipeAll() {
        const data = this._data();
        // Rooms and projects cascade to items and DIY items in Postgres.
        data.rooms.forEach(r => Sync.enqueue({ type: 'delete', kind: 'rooms', id: r.id }));
        data.projects.forEach(p => Sync.enqueue({ type: 'delete', kind: 'projects', id: p.id }));
        data.items.forEach(i => Sync.enqueue({ type: 'delete', kind: 'items', id: i.id }));
        data.rooms = [];
        data.items = [];
        data.projects = [];
        data.diyItems = [];
    }
};
