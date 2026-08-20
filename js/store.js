// store.js — localStorage data layer for rooms, items and projects.
//
// Authentication lives in auth.js (Supabase); this file no longer knows
// anything about users or passwords.

const Store = {
    _key: 'cozyhome_data',

    _load() {
        try {
            return JSON.parse(localStorage.getItem(this._key)) || this._default();
        } catch {
            return this._default();
        }
    },

    _save(data) {
        localStorage.setItem(this._key, JSON.stringify(data));
    },

    _default() {
        return { rooms: [], items: [], projects: [], diyItems: [], theme: 'California Cabana' };
    },

    // ---------- Theme ----------

    getTheme() {
        return this._load().theme || 'California Cabana';
    },

    setTheme(name) {
        const data = this._load();
        data.theme = name;
        this._save(data);
    },

    // ---------- Rooms ----------

    getRooms() {
        return this._load().rooms;
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
        const data = this._load();
        const r = { id: crypto.randomUUID(), name: room.name, parentRoomId: room.parentRoomId || null, photo: room.photo || null, createdAt: new Date().toISOString() };
        data.rooms.push(r);
        this._save(data);
        return r;
    },

    updateRoom(id, updates) {
        const data = this._load();
        const idx = data.rooms.findIndex(r => r.id === id);
        if (idx >= 0) { Object.assign(data.rooms[idx], updates); this._save(data); }
    },

    deleteRoom(id) {
        const data = this._load();
        // cascade: delete sub-rooms and their items
        const subIds = data.rooms.filter(r => r.parentRoomId === id).map(r => r.id);
        const allIds = [id, ...subIds];
        data.items = data.items.filter(i => !allIds.includes(i.roomId));
        data.rooms = data.rooms.filter(r => !allIds.includes(r.id));
        this._save(data);
    },

    // ---------- Items ----------

    getItems() {
        return this._load().items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    getItem(id) {
        return this.getItems().find(i => i.id === id);
    },

    getItemsForRoom(roomId) {
        return this.getItems().filter(i => i.roomId === roomId);
    },

    addItem(item) {
        const data = this._load();
        const i = { id: crypto.randomUUID(), name: item.name, desc: item.desc || '', itemType: item.itemType || 'Other', roomId: item.roomId || null, photo: item.photo || null, createdAt: new Date().toISOString() };
        data.items.push(i);
        this._save(data);
        return i;
    },

    updateItem(id, updates) {
        const data = this._load();
        const idx = data.items.findIndex(i => i.id === id);
        if (idx >= 0) { Object.assign(data.items[idx], updates); this._save(data); }
    },

    deleteItem(id) {
        const data = this._load();
        data.items = data.items.filter(i => i.id !== id);
        this._save(data);
    },

    // ---------- Projects ----------

    getProjects() {
        return this._load().projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    getProject(id) {
        return this.getProjects().find(p => p.id === id);
    },

    addProject(project) {
        const data = this._load();
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
            photo: project.photo || null,
            createdAt: new Date().toISOString()
        };
        data.projects.push(p);
        this._save(data);
        return p;
    },

    updateProject(id, updates) {
        const data = this._load();
        const idx = data.projects.findIndex(p => p.id === id);
        if (idx >= 0) { Object.assign(data.projects[idx], updates); this._save(data); }
    },

    deleteProject(id) {
        const data = this._load();
        data.diyItems = data.diyItems.filter(d => d.projectId !== id);
        data.projects = data.projects.filter(p => p.id !== id);
        this._save(data);
    },

    // ---------- DIY Items ----------

    getDIYItems(projectId) {
        return this._load().diyItems.filter(d => d.projectId === projectId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    },

    getDIYItem(id) {
        return this._load().diyItems.find(d => d.id === id);
    },

    addDIYItem(diy) {
        const data = this._load();
        const d = { id: crypto.randomUUID(), projectId: diy.projectId, name: diy.name, desc: diy.desc || '', purpose: diy.purpose || '', isOwned: false, existingItemId: diy.existingItemId || null, photo: diy.photo || null, options: diy.options || [], createdAt: new Date().toISOString() };
        data.diyItems.push(d);
        this._save(data);
        return d;
    },

    updateDIYItem(id, updates) {
        const data = this._load();
        const idx = data.diyItems.findIndex(d => d.id === id);
        if (idx >= 0) { Object.assign(data.diyItems[idx], updates); this._save(data); }
    },

    deleteDIYItem(id) {
        const data = this._load();
        data.diyItems = data.diyItems.filter(d => d.id !== id);
        this._save(data);
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

    // Destroys the local inventory. Signing out must NOT call this — that was
    // the old behaviour and it silently deleted everything the user owned.
    wipeAll() {
        const data = this._load();
        data.rooms = [];
        data.items = [];
        data.projects = [];
        data.diyItems = [];
        this._save(data);
    }
};
