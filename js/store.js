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
        // ThemeEngine.apply() calls this on every application, including when
        // restoring the saved theme after login, so skip no-op writes.
        if (this._data().theme === name) return;
        this._data().theme = name;
        if (Auth.getUser()) Sync.enqueue({ type: 'theme', theme: name });
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
            photo: null,
            photoPath: null,
            createdAt: new Date().toISOString()
        };
        this._data().projects.push(p);
        Sync.enqueue({ type: 'upsert', kind: 'projects', row: Sync.toProject(p) });
        this._applyPhoto('projects', p, project.photo || null);
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
