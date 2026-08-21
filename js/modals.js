// modals.js — Modal/sheet system for create/edit/detail views

const Modal = {
    _container: null,

    init() {
        this._container = document.getElementById('modal-container');
    },

    open(html, onClose) {
        this._container.innerHTML = `
            <div class="modal-backdrop" data-close-modal>
                <div class="modal-sheet" onclick="event.stopPropagation()">
                    ${html}
                </div>
            </div>`;
        this._container.classList.remove('hidden');
        requestAnimationFrame(() => {
            this._container.querySelector('.modal-backdrop').classList.add('visible');
            this._container.querySelector('.modal-sheet').classList.add('visible');
        });
        this._container.querySelector('[data-close-modal]').addEventListener('click', () => this.close());
        this._onClose = onClose;
    },

    close() {
        const backdrop = this._container.querySelector('.modal-backdrop');
        const sheet = this._container.querySelector('.modal-sheet');
        if (backdrop) backdrop.classList.remove('visible');
        if (sheet) sheet.classList.remove('visible');
        setTimeout(() => {
            this._container.innerHTML = '';
            this._container.classList.add('hidden');
            if (this._onClose) this._onClose();
        }, 250);
    },

    // ===================== ADD HOME =====================
    addHome() {
        this.open(`
            <div class="modal-header">
                <button class="modal-cancel" onclick="Modal.close()">Cancel</button>
                <h2>Create Home</h2>
                <button class="modal-save" id="modal-save-btn" disabled>Save</button>
            </div>
            <div class="modal-body">
                <div class="form-section">
                    <label>Home Name</label>
                    <input type="text" id="home-name" placeholder="e.g. Main House" autofocus>
                </div>
                <div class="form-section">
                    <label>Photo</label>
                    <input type="file" id="home-photo" accept="image/*" class="file-input">
                    <label for="home-photo" class="file-label">📷 Choose Photo</label>
                    <div id="home-photo-preview" class="photo-preview hidden"></div>
                </div>
                <p class="form-note">Rooms can be assigned to a home when you create or edit them.</p>
            </div>
        `, () => App.render());

        const nameInput = document.getElementById('home-name');
        const saveBtn = document.getElementById('modal-save-btn');
        nameInput.addEventListener('input', () => { saveBtn.disabled = !nameInput.value.trim(); });
        document.getElementById('home-photo')
            .addEventListener('change', (e) => this._handlePhotoPreview(e.target, 'home-photo-preview'));

        saveBtn.addEventListener('click', () => {
            Store.addHome({ name: nameInput.value.trim(), photo: this._getPhotoData('home-photo-preview') });
            this.close();
        });
    },

    // ===================== EDIT HOME =====================
    editHome(homeId) {
        const home = Store.getHome(homeId);
        if (!home) return;
        const rooms = Store.getRoomsForHome(homeId);

        this.open(`
            <div class="modal-header">
                <button class="modal-cancel" onclick="Modal.close()">Cancel</button>
                <h2>Edit Home</h2>
                <button class="modal-save" id="modal-save-btn">Done</button>
            </div>
            <div class="modal-body">
                <div class="form-section">
                    <label>Home Name</label>
                    <input type="text" id="home-name" value="${this._esc(home.name)}">
                </div>
                <div class="form-section">
                    <label>Photo</label>
                    <input type="file" id="home-photo" accept="image/*" class="file-input">
                    <label for="home-photo" class="file-label">📷 ${home.photo ? 'Change Photo' : 'Add Photo'}</label>
                    <div id="home-photo-preview" class="photo-preview ${home.photo ? '' : 'hidden'}">${home.photo ? `<img src="${home.photo}"><button class="remove-photo" onclick="document.getElementById('home-photo-preview').innerHTML='';document.getElementById('home-photo-preview').classList.add('hidden')">Remove Photo</button>` : ''}</div>
                </div>
                <div class="form-section">
                    <div class="form-info-row"><span>Rooms</span><span class="badge">${rooms.length}</span></div>
                    ${rooms.length ? `<div class="picker-list">${rooms.map(r => `<div class="picker-item"><span>🏠 ${this._esc(r.name)}</span></div>`).join('')}</div>` : '<p class="form-note">No rooms in this home yet.</p>'}
                </div>
                ${this._shareSection('home', homeId, home)}
                ${Store.isMine(home) ? `<div class="form-section">
                    <button class="btn-danger" id="delete-home-btn">Delete Home</button>
                    ${rooms.length ? `<p class="danger-note">The ${rooms.length} room${rooms.length === 1 ? '' : 's'} in this home will be kept and moved to “No Home”.</p>` : ''}
                </div>` : ''}
            </div>
        `, () => App.render());

        document.getElementById('home-photo')
            .addEventListener('change', (e) => this._handlePhotoPreview(e.target, 'home-photo-preview'));

        document.getElementById('modal-save-btn').addEventListener('click', () => {
            Store.updateHome(homeId, {
                name: document.getElementById('home-name').value.trim(),
                photo: this._getPhotoData('home-photo-preview')
            });
            this.close();
        });

        const delBtn = document.getElementById('delete-home-btn');
        if (delBtn) delBtn.addEventListener('click', () => {
            if (confirm(`Delete "${home.name}"? Its rooms will be kept and moved to “No Home”.`)) {
                Store.deleteHome(homeId);
                this.close();
            }
        });

        this._bindShareSection('home', homeId, () => { this.close(); setTimeout(() => this.editHome(homeId), 280); });
    },

    // "Convert to Sub-Room" for a top-level room. When the conversion is not
    // legal, say why rather than showing a button that does nothing.
    _convertSection(roomId) {
        const check = Store.canConvertToSubRoom(roomId);
        if (!check.ok) {
            return `<div class="form-section">
                <label>Nesting</label>
                <p class="form-note">${this._esc(check.reason)}</p>
            </div>`;
        }
        const targets = Store.getConversionTargets(roomId);
        return `<div class="form-section">
            <label>Nesting</label>
            <select id="convert-target">
                ${targets.map(t => `<option value="${t.id}">${this._esc(t.name)}</option>`).join('')}
            </select>
            <button class="btn-secondary" id="convert-room-btn">↧ Convert to Sub-Room</button>
            <p class="form-note">Nests this room, and everything in it, inside the room you pick.</p>
        </div>`;
    },

    _doConvertToSubRoom(roomId) {
        const room = Store.getRoom(roomId);
        const parentId = document.getElementById('convert-target')?.value;
        const parent = parentId ? Store.getRoom(parentId) : null;
        if (!room || !parent) return;

        const items = Store.getItemsForRoom(roomId).length;
        const detail = items ? ` Its ${items} item${items === 1 ? '' : 's'} will move with it.` : '';
        if (!confirm(`Make "${room.name}" a sub-room of "${parent.name}"?${detail}`)) return;

        if (!Store.convertToSubRoom(roomId, parentId)) {
            alert('That conversion is no longer possible — the rooms may have changed in another tab.');
            return;
        }
        this.close();
    },

    // ===================== PROJECT NOTES =====================
    //
    // A shared log of what has been done, newest first, each entry stamped
    // with its author and time. Everyone with access to the project sees the
    // whole list; you can only delete your own.

    _notesSection(projectId) {
        const notes = Store.getNotes(projectId);
        return `<div class="form-section">
            <div class="form-info-row"><span>Notes</span><span class="badge">${notes.length}</span></div>

            <div class="note-compose">
                <textarea id="note-body" rows="2" placeholder="What did you do? e.g. contacted three suppliers"></textarea>
                <button class="btn-secondary" id="add-note-btn">Add Note</button>
            </div>
            <p class="share-error hidden" id="note-error"></p>

            ${notes.length ? `<div class="note-list">${notes.map(n => `
                <div class="note">
                    <div class="note-head">
                        <span class="note-author">${this._esc(Store.isMine({ ownerId: n.userId }) ? 'You' : Store.personName(n.userId))}</span>
                        <span class="note-time">${this._noteTime(n.createdAt)}</span>
                        ${n.userId === Store.myId() ? `<button class="btn-small btn-danger-small note-del" data-note="${n.id}" title="Delete note">✕</button>` : ''}
                    </div>
                    <div class="note-body">${this._esc(n.body)}</div>
                </div>`).join('')}</div>`
              : '<p class="form-note">No notes yet. Add one as work happens and everyone on this project will see it.</p>'}
        </div>`;
    },

    // Absolute date and time — a work log needs the actual timestamp, not
    // "3 days ago", but recent entries also get a friendly prefix.
    _noteTime(iso) {
        const d = new Date(iso);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        const wasYesterday = d.toDateString() === yesterday.toDateString();
        const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        if (sameDay) return `Today, ${time}`;
        if (wasYesterday) return `Yesterday, ${time}`;
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + time;
    },

    _bindNotes(projectId) {
        const err = document.getElementById('note-error');
        const showErr = (m) => { if (err) { err.textContent = m; err.classList.remove('hidden'); } };
        const reopen = () => { this.close(); setTimeout(() => this.editProject(projectId), 280); };

        const body = document.getElementById('note-body');
        const btn = document.getElementById('add-note-btn');

        const submit = async () => {
            const text = (body.value || '').trim();
            if (!text) return;
            btn.disabled = true;
            btn.textContent = 'Adding…';
            if (err) err.classList.add('hidden');
            try {
                await Store.addNote(projectId, text);
                reopen();
            } catch (e) {
                showErr(e.message);
                btn.disabled = false;
                btn.textContent = 'Add Note';
            }
        };

        if (btn) btn.addEventListener('click', submit);
        // Enter submits, Shift+Enter makes a new line.
        if (body) body.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        });

        document.querySelectorAll('.note-del').forEach(b =>
            b.addEventListener('click', async () => {
                if (!confirm('Delete this note?')) return;
                b.disabled = true;
                try { await Store.deleteNote(b.dataset.note, projectId); reopen(); }
                catch (e) { showErr(e.message); b.disabled = false; }
            }));
    },

    // ===================== SHARING =====================
    //
    // Rendered inside the Home and Project modals. Owners can invite and
    // revoke; someone who was shared with sees who shared it and can leave.

    _shareSection(resourceType, resourceId, record) {
        const label = resourceType === 'home' ? 'home' : 'project';
        const incoming = Store.getIncomingShare(resourceType, resourceId);

        if (incoming) {
            return `<div class="form-section">
                <label>Shared With You</label>
                <div class="share-note">
                    <span class="share-avatar">👥</span>
                    <span>${this._esc(Store.personName(incoming.ownerId))} shared this ${label} with you. Anything you add is visible to both of you.</span>
                </div>
                <button class="btn-secondary" id="leave-share-btn" data-share="${incoming.id}">Leave this ${label}</button>
            </div>`;
        }

        if (!Store.isMine(record)) return '';

        const shares = Store.getSharesFor(resourceType, resourceId);
        return `<div class="form-section">
            <label>Shared With</label>
            ${shares.length ? `<div class="share-list">${shares.map(s => `
                <div class="share-row">
                    <span class="share-avatar">👤</span>
                    <span class="share-who">${this._esc(Store.personName(s.sharedWithId))}</span>
                    <button class="btn-small share-remove" data-unshare="${s.id}">Remove</button>
                </div>`).join('')}</div>`
                : '<p class="form-note">Not shared with anyone yet.</p>'}
            <div class="share-invite">
                <input type="email" id="share-email" placeholder="their@email.com" autocomplete="off">
                <button class="btn-secondary" id="share-btn">Share</button>
            </div>
            <p class="share-error hidden" id="share-error"></p>
            <p class="form-note">They need a CozyHome account. Both of you can see and add to this ${label}${resourceType === 'home' ? ', its rooms and everything in them' : ' and its materials'}.</p>
        </div>`;
    },

    _bindShareSection(resourceType, resourceId, reopen) {
        const err = document.getElementById('share-error');
        const showErr = (m) => { if (!err) return; err.textContent = m; err.classList.remove('hidden'); };

        const shareBtn = document.getElementById('share-btn');
        if (shareBtn) shareBtn.addEventListener('click', async () => {
            const input = document.getElementById('share-email');
            const email = (input.value || '').trim();
            if (!email) return;
            shareBtn.disabled = true;
            shareBtn.textContent = 'Sharing…';
            if (err) err.classList.add('hidden');
            try {
                await Store.shareResource(resourceType, resourceId, email);
                reopen();
            } catch (e) {
                showErr(e.message);
                shareBtn.disabled = false;
                shareBtn.textContent = 'Share';
            }
        });

        document.querySelectorAll('[data-unshare]').forEach(b =>
            b.addEventListener('click', async () => {
                b.disabled = true;
                try { await Store.unshare(b.dataset.unshare); reopen(); }
                catch (e) { showErr(e.message); b.disabled = false; }
            }));

        const leaveBtn = document.getElementById('leave-share-btn');
        if (leaveBtn) leaveBtn.addEventListener('click', async () => {
            if (!confirm('Leave this? You will stop seeing it, but nothing is deleted for the owner.')) return;
            leaveBtn.disabled = true;
            try {
                await Store.unshare(leaveBtn.dataset.share);
                this.close();
                await App.retryHydrate();     // it is no longer ours to show
            } catch (e) { showErr(e.message); leaveBtn.disabled = false; }
        });
    },

    // Default a new room into the home you share, so household objects are
    // visible to your partner without any extra step.
    _defaultHomeId() {
        const homes = Store.getHomes();
        if (!homes.length) return null;
        const shared = homes.find(h =>
            Store.isSharedOut('home', h.id) || Store.getIncomingShare('home', h.id));
        if (shared) return shared.id;
        return homes.length === 1 ? homes[0].id : null;
    },

    // "Keep private for me" — only offered when there is someone to hide
    // things from (or the record is already private, so it can be undone).
    _privacyToggle(checked) {
        if (!Store.sharingPartners().length && !checked) return '';
        return `<div class="form-section">
                    <label class="privacy-toggle"><input type="checkbox" id="keep-private" ${checked ? 'checked' : ''}><span>🔒 Keep private for me</span></label>
                    <p class="form-note">Hidden from the people you share a home with.</p>
                </div>`;
    },

    _privacyValue() {
        return !!document.getElementById('keep-private')?.checked;
    },

    // Reusable <select> of homes, used by both room modals.
    _homeSelect(selectedId) {
        const homes = Store.getHomes();
        if (!homes.length) {
            return `<p class="form-note">No homes yet. Create one from the + menu to group your rooms.</p>`;
        }
        return `<select id="room-home">
            <option value="">No Home</option>
            ${homes.map(h => `<option value="${h.id}" ${h.id === selectedId ? 'selected' : ''}>${this._esc(h.name)}</option>`).join('')}
        </select>`;
    },

    _selectedHomeId() {
        const el = document.getElementById('room-home');
        return el ? (el.value || null) : null;
    },

    // ===================== ADD ROOM =====================
    addRoom(parentRoom) {
        const title = parentRoom ? 'Create Sub-Room' : 'Create Room';
        const placeholder = parentRoom ? 'e.g. Closet' : 'e.g. Living Room';
        this.open(`
            <div class="modal-header">
                <button class="modal-cancel" onclick="Modal.close()">Cancel</button>
                <h2>${title}</h2>
                <button class="modal-save" id="modal-save-btn" disabled>Save</button>
            </div>
            <div class="modal-body">
                <div class="form-section">
                    <label>${parentRoom ? 'Sub-Room Name' : 'Room Name'}</label>
                    <input type="text" id="room-name" placeholder="${placeholder}" autofocus>
                </div>
                ${parentRoom
                    ? `<div class="form-section"><label>Parent Room</label><div class="form-info">🏠 ${this._esc(parentRoom.name)}</div></div>`
                    : `<div class="form-section"><label>Home</label>${this._homeSelect(this._defaultHomeId())}</div>`}
                ${this._privacyToggle(parentRoom ? !!parentRoom.isPrivate : false)}
                <div class="form-section">
                    <label>Photo</label>
                    <input type="file" id="room-photo" accept="image/*" class="file-input">
                    <label for="room-photo" class="file-label">📷 Choose Photo</label>
                    <div id="room-photo-preview" class="photo-preview hidden"></div>
                </div>
            </div>
        `, () => App.render());

        const nameInput = document.getElementById('room-name');
        const saveBtn = document.getElementById('modal-save-btn');
        const photoInput = document.getElementById('room-photo');

        nameInput.addEventListener('input', () => {
            saveBtn.disabled = !nameInput.value.trim();
        });

        photoInput.addEventListener('change', (e) => {
            this._handlePhotoPreview(e.target, 'room-photo-preview');
        });

        saveBtn.addEventListener('click', () => {
            const photo = this._getPhotoData('room-photo-preview');
            Store.addRoom({
                name: nameInput.value.trim(),
                parentRoomId: parentRoom?.id || null,
                // A sub-room inherits its parent's home rather than asking again.
                homeId: parentRoom ? (parentRoom.homeId || null) : this._selectedHomeId(),
                isPrivate: this._privacyValue(),
                photo
            });
            this.close();
        });
    },

    // ===================== EDIT ROOM =====================
    editRoom(roomId) {
        const room = Store.getRoom(roomId);
        if (!room) return;
        const isTopLevel = !room.parentRoomId;
        const subRooms = Store.getSubRooms(roomId);
        const items = Store.getItemsForRoom(roomId);
        const parentRoom = room.parentRoomId ? Store.getRoom(room.parentRoomId) : null;

        this.open(`
            <div class="modal-header">
                <button class="modal-cancel" onclick="Modal.close()">Cancel</button>
                <h2>${isTopLevel ? 'Edit Room' : 'Edit Sub-Room'}</h2>
                <button class="modal-save" id="modal-save-btn">Done</button>
            </div>
            <div class="modal-body">
                <div class="form-section">
                    <label>${isTopLevel ? 'Room Name' : 'Sub-Room Name'}</label>
                    <input type="text" id="room-name" value="${this._esc(room.name)}">
                </div>
                ${parentRoom
                    ? `<div class="form-section">
                           <label>Parent Room</label>
                           <div class="form-info">🏠 ${this._esc(parentRoom.name)}</div>
                           <button class="btn-secondary" id="promote-room-btn">↥ Make a Top-Level Room</button>
                           <p class="form-note">Moves this out of ${this._esc(parentRoom.name)} and back into the room list.</p>
                       </div>`
                    : `<div class="form-section"><label>Home</label>${this._homeSelect(room.homeId || null)}</div>
                       ${this._convertSection(roomId)}`}
                ${this._privacyToggle(!!room.isPrivate)}
                <div class="form-section">
                    <label>Photo</label>
                    <input type="file" id="room-photo" accept="image/*" class="file-input">
                    <label for="room-photo" class="file-label">📷 ${room.photo ? 'Change Photo' : 'Add Photo'}</label>
                    <div id="room-photo-preview" class="photo-preview ${room.photo ? '' : 'hidden'}">${room.photo ? `<img src="${room.photo}"><button class="remove-photo" onclick="document.getElementById('room-photo-preview').innerHTML='';document.getElementById('room-photo-preview').classList.add('hidden')">Remove Photo</button>` : ''}</div>
                </div>
                ${isTopLevel ? `<div class="form-section"><div class="form-info-row"><span>Items</span><span class="badge">${items.length}</span></div><div class="form-info-row"><span>Sub-Rooms</span><span class="badge">${subRooms.length}</span></div></div>` : `<div class="form-section"><div class="form-info-row"><span>Items</span><span class="badge">${items.length}</span></div></div>`}
                <div class="form-section">
                    <button class="btn-danger" id="delete-room-btn">Delete ${isTopLevel ? 'Room' : 'Sub-Room'}</button>
                    ${isTopLevel && (items.length || subRooms.length) ? '<p class="danger-note">Deleting this room will also delete all its items and sub-rooms.</p>' : ''}
                </div>
            </div>
        `, () => App.render());

        const photoInput = document.getElementById('room-photo');
        photoInput.addEventListener('change', (e) => this._handlePhotoPreview(e.target, 'room-photo-preview'));

        document.getElementById('modal-save-btn').addEventListener('click', () => {
            const photo = this._getPhotoData('room-photo-preview');
            const updates = { name: document.getElementById('room-name').value.trim(), photo };
            // Only top-level rooms show the home picker; sub-rooms follow their parent.
            if (document.getElementById('room-home')) updates.homeId = this._selectedHomeId();
            if (document.getElementById('keep-private')) updates.isPrivate = this._privacyValue();
            Store.updateRoom(roomId, updates);
            this.close();
        });

        const convertBtn = document.getElementById('convert-room-btn');
        if (convertBtn) convertBtn.addEventListener('click', () => this._doConvertToSubRoom(roomId));

        const promoteBtn = document.getElementById('promote-room-btn');
        if (promoteBtn) promoteBtn.addEventListener('click', () => {
            if (!confirm(`Move "${room.name}" out of "${parentRoom?.name}" and make it a top-level room?`)) return;
            Store.convertToTopLevel(roomId);
            this.close();
        });

        document.getElementById('delete-room-btn').addEventListener('click', () => {
            if (confirm(`Delete "${room.name}"? This cannot be undone.`)) {
                Store.deleteRoom(roomId);
                this.close();
            }
        });
    },

    // ===================== ADD ITEM =====================
    addItem() {
        const rooms = Store.getTopLevelRooms();
        this.open(`
            <div class="modal-header">
                <button class="modal-cancel" onclick="Modal.close()">Cancel</button>
                <h2>Add Item</h2>
                <button class="modal-save" id="modal-save-btn" disabled>Save</button>
            </div>
            <div class="modal-body">
                <div class="form-section">
                    <label>Details</label>
                    <input type="text" id="item-name" placeholder="Item Name" autofocus>
                    <textarea id="item-desc" placeholder="Description" rows="3"></textarea>
                </div>
                <div class="form-section">
                    <label>Type</label>
                    <select id="item-type">
                        ${ITEM_TYPES.map(t => `<option value="${t}">${ITEM_ICONS[t]} ${t}</option>`).join('')}
                    </select>
                </div>
                <div class="form-section">
                    <label>Room</label>
                    <select id="item-room">
                        <option value="">None</option>
                        ${rooms.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
                    </select>
                    <div id="subroom-picker" class="hidden">
                        <label>Sub-Room</label>
                        <select id="item-subroom">
                            <option value="">None (directly in room)</option>
                        </select>
                    </div>
                </div>
                ${this._privacyToggle()}
                <div class="form-section">
                    <label>Photo</label>
                    <input type="file" id="item-photo" accept="image/*" class="file-input">
                    <label for="item-photo" class="file-label">📷 Choose Photo</label>
                    <div id="item-photo-preview" class="photo-preview hidden"></div>
                </div>
            </div>
        `, () => App.render());

        const nameInput = document.getElementById('item-name');
        const saveBtn = document.getElementById('modal-save-btn');
        const roomSelect = document.getElementById('item-room');
        const subPicker = document.getElementById('subroom-picker');
        const subSelect = document.getElementById('item-subroom');

        nameInput.addEventListener('input', () => { saveBtn.disabled = !nameInput.value.trim(); });

        roomSelect.addEventListener('change', () => {
            const subs = Store.getSubRooms(roomSelect.value);
            if (subs.length) {
                subSelect.innerHTML = '<option value="">None (directly in room)</option>' + subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
                subPicker.classList.remove('hidden');
            } else {
                subPicker.classList.add('hidden');
                subSelect.value = '';
            }
        });

        document.getElementById('item-photo').addEventListener('change', (e) => this._handlePhotoPreview(e.target, 'item-photo-preview'));

        saveBtn.addEventListener('click', () => {
            const roomId = subSelect.value || roomSelect.value || null;
            const photo = this._getPhotoData('item-photo-preview');
            Store.addItem({ name: nameInput.value.trim(), desc: document.getElementById('item-desc').value.trim(), itemType: document.getElementById('item-type').value, roomId, photo, isPrivate: this._privacyValue() });
            this.close();
        });
    },

    // ===================== EDIT ITEM =====================
    editItem(itemId) {
        const item = Store.getItem(itemId);
        if (!item) return;
        const rooms = Store.getTopLevelRooms();
        const room = item.roomId ? Store.getRoom(item.roomId) : null;
        let topRoomId = '', subRoomId = '';
        if (room) {
            if (room.parentRoomId) { topRoomId = room.parentRoomId; subRoomId = room.id; }
            else { topRoomId = room.id; }
        }
        const subs = topRoomId ? Store.getSubRooms(topRoomId) : [];

        this.open(`
            <div class="modal-header">
                <button class="modal-cancel" onclick="Modal.close()">Cancel</button>
                <h2>Edit Item</h2>
                <button class="modal-save" id="modal-save-btn">Done</button>
            </div>
            <div class="modal-body">
                <div class="form-section">
                    <label>Details</label>
                    <input type="text" id="item-name" value="${this._esc(item.name)}">
                    <textarea id="item-desc" rows="3">${this._esc(item.desc)}</textarea>
                </div>
                <div class="form-section">
                    <label>Type</label>
                    <select id="item-type">
                        ${ITEM_TYPES.map(t => `<option value="${t}" ${t === item.itemType ? 'selected' : ''}>${ITEM_ICONS[t]} ${t}</option>`).join('')}
                    </select>
                </div>
                <div class="form-section">
                    <label>Room</label>
                    <select id="item-room">
                        <option value="">None</option>
                        ${rooms.map(r => `<option value="${r.id}" ${r.id === topRoomId ? 'selected' : ''}>${r.name}</option>`).join('')}
                    </select>
                    <div id="subroom-picker" class="${subs.length ? '' : 'hidden'}">
                        <label>Sub-Room</label>
                        <select id="item-subroom">
                            <option value="">None (directly in room)</option>
                            ${subs.map(s => `<option value="${s.id}" ${s.id === subRoomId ? 'selected' : ''}>${s.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                ${this._privacyToggle(!!item.isPrivate)}
                <div class="form-section">
                    <label>Photo</label>
                    <input type="file" id="item-photo" accept="image/*" class="file-input">
                    <label for="item-photo" class="file-label">📷 ${item.photo ? 'Change Photo' : 'Add Photo'}</label>
                    <div id="item-photo-preview" class="photo-preview ${item.photo ? '' : 'hidden'}">${item.photo ? `<img src="${item.photo}"><button class="remove-photo" onclick="document.getElementById('item-photo-preview').innerHTML='';document.getElementById('item-photo-preview').classList.add('hidden')">Remove Photo</button>` : ''}</div>
                </div>
                <div class="form-section">
                    <button class="btn-danger" id="delete-item-btn">Delete Item</button>
                </div>
            </div>
        `, () => App.render());

        const roomSelect = document.getElementById('item-room');
        const subPicker = document.getElementById('subroom-picker');
        const subSelect = document.getElementById('item-subroom');
        document.getElementById('item-photo').addEventListener('change', (e) => this._handlePhotoPreview(e.target, 'item-photo-preview'));

        roomSelect.addEventListener('change', () => {
            const s = Store.getSubRooms(roomSelect.value);
            if (s.length) { subSelect.innerHTML = '<option value="">None (directly in room)</option>' + s.map(x => `<option value="${x.id}">${x.name}</option>`).join(''); subPicker.classList.remove('hidden'); }
            else { subPicker.classList.add('hidden'); subSelect.value = ''; }
        });

        document.getElementById('modal-save-btn').addEventListener('click', () => {
            const roomId = subSelect.value || roomSelect.value || null;
            const photo = this._getPhotoData('item-photo-preview');
            Store.updateItem(itemId, { name: document.getElementById('item-name').value.trim(), desc: document.getElementById('item-desc').value.trim(), itemType: document.getElementById('item-type').value, roomId, photo, isPrivate: this._privacyValue() });
            this.close();
        });

        document.getElementById('delete-item-btn').addEventListener('click', () => {
            if (confirm(`Delete "${item.name}"?`)) { Store.deleteItem(itemId); this.close(); }
        });
    },

    // ===================== ADD PROJECT =====================
    addProject() {
        const rooms = Store.getRooms();
        const items = Store.getItems();
        this.open(`
            <div class="modal-header">
                <button class="modal-cancel" onclick="Modal.close()">Cancel</button>
                <h2>Create Project</h2>
                <button class="modal-save" id="modal-save-btn" disabled>Save</button>
            </div>
            <div class="modal-body">
                <div class="form-section"><label>Details</label>
                    <input type="text" id="proj-name" placeholder="Project Name" autofocus>
                    <textarea id="proj-desc" placeholder="Description" rows="3"></textarea>
                </div>
                <div class="form-section"><label>Budget</label>
                    <div class="input-prefix"><span>$</span><input type="number" id="proj-budget" placeholder="0.00" step="0.01" min="0"></div>
                </div>
                <div class="form-section"><label>Goal Date</label>
                    <label class="toggle-row"><input type="checkbox" id="proj-has-goal"><span>Set Goal Date</span></label>
                    <input type="date" id="proj-goal-date" class="hidden">
                </div>
                <div class="form-section"><label>Rooms & Sub-Rooms</label>
                    <div class="picker-list" id="proj-rooms">${rooms.map(r => `<label class="picker-item ${r.parentRoomId ? 'indented' : ''}"><input type="checkbox" value="${r.id}"><span>${r.parentRoomId ? '↳ ' : '🏠 '}${this._esc(r.name)}</span></label>`).join('') || '<p class="form-note">No rooms yet.</p>'}</div>
                </div>
                <div class="form-section"><label>Items</label>
                    <div class="picker-list" id="proj-items">${items.map(i => `<label class="picker-item"><input type="checkbox" value="${i.id}"><span>${ITEM_ICONS[i.itemType]} ${this._esc(i.name)}</span></label>`).join('') || '<p class="form-note">No items yet.</p>'}</div>
                </div>
                <div class="form-section"><label>Tasks</label>
                    <div id="proj-tasks"></div>
                    <button class="btn-secondary" onclick="Modal._addTaskRow('proj-tasks')">+ Add Task</button>
                </div>
                <div class="form-section"><label>DIY</label>
                    <label class="toggle-row"><input type="checkbox" id="proj-diy"><span>DIY Project</span></label>
                    <div id="proj-diy-section" class="hidden">
                        <label>Materials Needed</label>
                        <div id="proj-diy-items"></div>
                        <button class="btn-secondary" onclick="Modal._addDIYRow('proj-diy-items')">+ Add Material</button>
                        <p class="form-note">Add details and photos after saving.</p>
                    </div>
                </div>
                ${this._privacyToggle()}
                <div class="form-section"><label>Photo</label>
                    <input type="file" id="proj-photo" accept="image/*" class="file-input">
                    <label for="proj-photo" class="file-label">📷 Choose Photo</label>
                    <div id="proj-photo-preview" class="photo-preview hidden"></div>
                </div>
            </div>
        `, () => App.render());

        const nameInput = document.getElementById('proj-name');
        const saveBtn = document.getElementById('modal-save-btn');
        nameInput.addEventListener('input', () => { saveBtn.disabled = !nameInput.value.trim(); });

        document.getElementById('proj-has-goal').addEventListener('change', (e) => {
            document.getElementById('proj-goal-date').classList.toggle('hidden', !e.target.checked);
        });
        document.getElementById('proj-diy').addEventListener('change', (e) => {
            document.getElementById('proj-diy-section').classList.toggle('hidden', !e.target.checked);
        });
        document.getElementById('proj-photo').addEventListener('change', (e) => this._handlePhotoPreview(e.target, 'proj-photo-preview'));

        saveBtn.addEventListener('click', () => {
            const roomIds = [...document.querySelectorAll('#proj-rooms input:checked')].map(c => c.value);
            const itemIds = [...document.querySelectorAll('#proj-items input:checked')].map(c => c.value);
            const tasks = this._collectTasks('proj-tasks');
            const isDIY = document.getElementById('proj-diy').checked;
            const hasGoal = document.getElementById('proj-has-goal').checked;
            const photo = this._getPhotoData('proj-photo-preview');

            const project = Store.addProject({
                name: nameInput.value.trim(),
                desc: document.getElementById('proj-desc').value.trim(),
                budget: parseFloat(document.getElementById('proj-budget').value) || 0,
                goalDate: hasGoal ? document.getElementById('proj-goal-date').value : null,
                roomIds, itemIds, tasks, isDIY, photo,
                isPrivate: this._privacyValue()
            });

            if (isDIY) {
                document.querySelectorAll('#proj-diy-items input').forEach(input => {
                    const n = input.value.trim();
                    if (n) Store.addDIYItem({ projectId: project.id, name: n });
                });
            }
            this.close();
        });
    },

    // ===================== EDIT PROJECT =====================
    editProject(projectId) {
        const project = Store.getProject(projectId);
        if (!project) return;
        const allRooms = Store.getRooms();
        const allItems = Store.getItems();
        const diyItems = Store.getDIYItems(projectId);

        this.open(`
            <div class="modal-header">
                <button class="modal-cancel" onclick="Modal.close()">Cancel</button>
                <h2>Edit Project</h2>
                <button class="modal-save" id="modal-save-btn">Done</button>
            </div>
            <div class="modal-body">
                <div class="form-section"><label>Details</label>
                    <input type="text" id="proj-name" value="${this._esc(project.name)}">
                    <textarea id="proj-desc" rows="3">${this._esc(project.desc)}</textarea>
                </div>
                <div class="form-section"><label>Budget</label>
                    <div class="input-prefix"><span>$</span><input type="number" id="proj-budget" value="${project.budget || ''}" step="0.01" min="0"></div>
                </div>
                <div class="form-section"><label>Goal Date</label>
                    <label class="toggle-row"><input type="checkbox" id="proj-has-goal" ${project.goalDate ? 'checked' : ''}><span>Set Goal Date</span></label>
                    <input type="date" id="proj-goal-date" value="${project.goalDate || ''}" class="${project.goalDate ? '' : 'hidden'}">
                </div>
                <div class="form-section"><label>Rooms & Sub-Rooms</label>
                    <div class="picker-list" id="proj-rooms">${allRooms.map(r => `<label class="picker-item ${r.parentRoomId ? 'indented' : ''}"><input type="checkbox" value="${r.id}" ${project.roomIds.includes(r.id) ? 'checked' : ''}><span>${r.parentRoomId ? '↳ ' : '🏠 '}${this._esc(r.name)}</span></label>`).join('')}</div>
                </div>
                <div class="form-section"><label>Items</label>
                    <div class="picker-list" id="proj-items">${allItems.map(i => `<label class="picker-item"><input type="checkbox" value="${i.id}" ${project.itemIds.includes(i.id) ? 'checked' : ''}><span>${ITEM_ICONS[i.itemType]} ${this._esc(i.name)}</span></label>`).join('')}</div>
                </div>
                <div class="form-section"><label>Tasks <span class="badge">${(project.tasks||[]).filter(t=>t.done).length}/${(project.tasks||[]).length}</span></label>
                    <div id="proj-task-list">
                        ${(project.tasks||[]).map((t, idx) => `
                            <div class="task-row" data-idx="${idx}">
                                <label class="checkbox-row">
                                    <input type="checkbox" ${t.done ? 'checked' : ''} onchange="Modal._toggleTask('${projectId}',${idx},this.checked)">
                                    <span class="${t.done ? 'strikethrough' : ''}">${this._esc(t.name)}</span>
                                </label>
                                <button class="btn-small btn-danger-small" onclick="Modal._deleteTask('${projectId}',${idx})">✕</button>
                            </div>
                        `).join('')}
                    </div>
                    <div class="inline-add">
                        <input type="text" id="new-task-name" placeholder="New task">
                        <button class="btn-accent" onclick="Modal._quickAddTask('${projectId}')">+</button>
                    </div>
                </div>
                <div class="form-section"><label>DIY</label>
                    <label class="toggle-row"><input type="checkbox" id="proj-diy" ${project.isDIY ? 'checked' : ''}><span>DIY Project</span></label>
                    <div id="proj-diy-section" class="${project.isDIY ? '' : 'hidden'}">
                        <label>Materials Needed <span class="badge">${diyItems.filter(d => d.isOwned).length}/${diyItems.length}</span></label>
                        <div id="proj-diy-list">
                            ${diyItems.map(d => `
                                <div class="diy-row" data-id="${d.id}">
                                    <label class="checkbox-row">
                                        <input type="checkbox" ${d.isOwned ? 'checked' : ''} onchange="Store.updateDIYItem('${d.id}',{isOwned:this.checked});Modal.editProject('${projectId}')">
                                        <span class="${d.isOwned ? 'strikethrough' : ''}">${this._esc(d.name)}</span>
                                    </label>
                                    <div class="diy-meta">
                                        ${d.purpose ? `<small>${this._esc(d.purpose)}</small>` : ''}
                                        ${(d.options||[]).length ? `<small class="accent-text">📎 ${(d.options||[]).length} option${(d.options||[]).length > 1 ? 's' : ''}</small>` : ''}
                                        ${d.existingItemId ? `<small class="accent-text">📍 ${this._esc(Store.getRoomBreadcrumb(Store.getItem(d.existingItemId)?.roomId))}</small>` : ''}
                                    </div>
                                    <div class="diy-actions">
                                        <button class="btn-small" onclick="Modal.editDIYItem('${d.id}','${projectId}')">Edit</button>
                                        <button class="btn-small btn-danger-small" onclick="if(confirm('Delete?')){Store.deleteDIYItem('${d.id}');Modal.editProject('${projectId}')}">✕</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="inline-add">
                            <input type="text" id="new-diy-name" placeholder="New material name">
                            <button class="btn-accent" onclick="Modal._quickAddDIY('${projectId}')">+</button>
                        </div>
                    </div>
                </div>
                <div class="form-section"><label>Photo</label>
                    <input type="file" id="proj-photo" accept="image/*" class="file-input">
                    <label for="proj-photo" class="file-label">📷 ${project.photo ? 'Change Photo' : 'Add Photo'}</label>
                    <div id="proj-photo-preview" class="photo-preview ${project.photo ? '' : 'hidden'}">${project.photo ? `<img src="${project.photo}"><button class="remove-photo" onclick="document.getElementById('proj-photo-preview').innerHTML='';document.getElementById('proj-photo-preview').classList.add('hidden')">Remove Photo</button>` : ''}</div>
                </div>
                <div class="form-section">
                    ${project.isCompleted
                        ? `<button class="btn-secondary" onclick="Store.updateProject('${projectId}',{isCompleted:false,completedAt:null});Modal.editProject('${projectId}')">↩ Reopen Project</button>`
                        : `<button class="btn-completed" onclick="Store.updateProject('${projectId}',{isCompleted:true,completedAt:new Date().toISOString()});Modal.editProject('${projectId}')">✓ Mark as Completed</button>`}
                </div>
                ${this._notesSection(projectId)}
                ${this._shareSection('project', projectId, project)}
                ${Store.isMine(project) ? `<div class="form-section">
                    <button class="btn-danger" id="delete-proj-btn">Delete Project</button>
                </div>` : ''}
            </div>
        `, () => App.render());

        document.getElementById('proj-has-goal').addEventListener('change', (e) => {
            document.getElementById('proj-goal-date').classList.toggle('hidden', !e.target.checked);
        });
        document.getElementById('proj-diy').addEventListener('change', (e) => {
            document.getElementById('proj-diy-section').classList.toggle('hidden', !e.target.checked);
        });
        document.getElementById('proj-photo').addEventListener('change', (e) => this._handlePhotoPreview(e.target, 'proj-photo-preview'));

        document.getElementById('modal-save-btn').addEventListener('click', () => {
            const roomIds = [...document.querySelectorAll('#proj-rooms input:checked')].map(c => c.value);
            const itemIds = [...document.querySelectorAll('#proj-items input:checked')].map(c => c.value);
            const hasGoal = document.getElementById('proj-has-goal').checked;
            const photo = this._getPhotoData('proj-photo-preview');
            Store.updateProject(projectId, {
                name: document.getElementById('proj-name').value.trim(),
                desc: document.getElementById('proj-desc').value.trim(),
                budget: parseFloat(document.getElementById('proj-budget').value) || 0,
                goalDate: hasGoal ? document.getElementById('proj-goal-date').value : null,
                roomIds, itemIds,
                isDIY: document.getElementById('proj-diy').checked,
                photo
            });
            this.close();
        });

        document.getElementById('new-task-name')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); Modal._quickAddTask(projectId); }
        });

        const delProj = document.getElementById('delete-proj-btn');
        if (delProj) delProj.addEventListener('click', () => {
            if (confirm(`Delete "${project.name}"? This cannot be undone.`)) {
                Store.deleteProject(projectId);
                this.close();
            }
        });

        this._bindNotes(projectId);
        this._bindShareSection('project', projectId, () => { this.close(); setTimeout(() => this.editProject(projectId), 280); });
    },

    // ===================== EDIT DIY ITEM =====================
    editDIYItem(diyId, projectId) {
        const diy = Store.getDIYItem(diyId);
        if (!diy) return;
        const allItems = Store.getItems();

        this.open(`
            <div class="modal-header">
                <button class="modal-cancel" onclick="Modal.editProject('${projectId}')">Back</button>
                <h2>DIY Item</h2>
                <button class="modal-save" id="modal-save-btn">Done</button>
            </div>
            <div class="modal-body">
                <div class="form-section"><label>Details</label>
                    <input type="text" id="diy-name" value="${this._esc(diy.name)}">
                    <textarea id="diy-desc" rows="3" placeholder="Description">${this._esc(diy.desc)}</textarea>
                    <textarea id="diy-purpose" rows="2" placeholder="What it's for">${this._esc(diy.purpose)}</textarea>
                </div>
                <div class="form-section"><label>Inventory Match</label>
                    <select id="diy-match">
                        <option value="">None — Link to inventory item</option>
                        ${allItems.map(i => `<option value="${i.id}" ${diy.existingItemId === i.id ? 'selected' : ''}>${ITEM_ICONS[i.itemType]} ${this._esc(i.name)}${i.roomId ? ' — ' + this._esc(Store.getRoomBreadcrumb(i.roomId)) : ''}</option>`).join('')}
                    </select>
                    <p class="form-note">If you already own this item, link it to see which room it's in.</p>
                </div>
                <div class="form-section"><label>Options</label>
                    <div id="diy-options">${(diy.options || []).map(o => `<div class="option-row"><textarea placeholder="Description" class="opt-desc">${this._esc(o.desc)}</textarea><input type="url" placeholder="Link (URL)" class="opt-link" value="${this._esc(o.link)}"><button class="btn-remove" onclick="this.parentElement.remove()">✕</button></div>`).join('')}</div>
                    <button class="btn-secondary" onclick="Modal._addOptionRow('diy-options')">+ Add Option</button>
                </div>
                <div class="form-section"><label>Photo</label>
                    <input type="file" id="diy-photo" accept="image/*" class="file-input">
                    <label for="diy-photo" class="file-label">📷 ${diy.photo ? 'Change Photo' : 'Add Photo'}</label>
                    <div id="diy-photo-preview" class="photo-preview ${diy.photo ? '' : 'hidden'}">${diy.photo ? `<img src="${diy.photo}"><button class="remove-photo" onclick="document.getElementById('diy-photo-preview').innerHTML='';document.getElementById('diy-photo-preview').classList.add('hidden')">Remove Photo</button>` : ''}</div>
                </div>
                <div class="form-section">
                    <label class="toggle-row"><input type="checkbox" id="diy-owned" ${diy.isOwned ? 'checked' : ''}><span>I have this item</span></label>
                </div>
            </div>
        `, () => App.render());

        document.getElementById('diy-photo').addEventListener('change', (e) => this._handlePhotoPreview(e.target, 'diy-photo-preview'));

        document.getElementById('modal-save-btn').addEventListener('click', () => {
            const photo = this._getPhotoData('diy-photo-preview');
            const options = this._collectOptions('diy-options');
            Store.updateDIYItem(diyId, {
                name: document.getElementById('diy-name').value.trim(),
                desc: document.getElementById('diy-desc').value.trim(),
                purpose: document.getElementById('diy-purpose').value.trim(),
                existingItemId: document.getElementById('diy-match').value || null,
                isOwned: document.getElementById('diy-owned').checked,
                options,
                photo
            });
            Modal.editProject(projectId);
        });
    },

    // ===================== PROFILE =====================
    showProfile() {
        const user = Auth.getUser();
        const currentTheme = Store.getTheme();
        const themeList = Object.entries(THEMES).map(([name, t]) => `
            <button class="theme-option ${name === currentTheme ? 'active' : ''}" data-theme="${name}" onclick="Modal._selectTheme('${name}')">
                <div class="theme-emoji-bubble" style="background:rgb(${t.accent})">
                    <span class="theme-emoji">${t.icon}</span>
                </div>
                <span class="theme-name">${name}</span>
                <span class="check">${name === currentTheme ? '✓' : ''}</span>
            </button>
        `).join('');

        this.open(`
            <div class="modal-header">
                <div></div>
                <h2>Profile</h2>
                <button class="modal-save" onclick="Modal.close()">Done</button>
            </div>
            <div class="modal-body">
                ${user ? `
                <div class="form-section">
                    <label>Account</label>
                    <div class="profile-card">
                        <div class="profile-avatar" style="background:rgba(var(--accent-rgb),0.15);color:var(--accent)">${user.username.charAt(0).toUpperCase()}</div>
                        <div><strong>${this._esc(user.username)}</strong><br><small>${this._esc(user.email)}</small></div>
                    </div>
                </div>` : ''}
                <div class="form-section">
                    <label>Theme</label>
                    <div class="theme-grid">${themeList}</div>
                </div>
                <div class="form-section">
                    <button class="btn-secondary" onclick="Modal.signOut()">Sign Out</button>
                    <p class="form-note">Your rooms and items stay on this device.</p>
                </div>
            </div>
        `, () => App.render());
    },

    // Ends the session only. This used to call Store.wipeAll(), which deleted
    // every room, item and project the user owned.
    async signOut() {
        if (!confirm('Sign out?')) return;
        await Auth.signOut();
        this.close();
        App.checkAuth();
    },

    // ===================== HELPERS =====================

    _esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    },

    // Phone cameras produce 3–8MB files. Those get base64'd into the pending
    // write queue and uploaded as-is, so downscale before anything else sees
    // them — 1600px is more than enough for an inventory photo.
    PHOTO_MAX_EDGE: 1600,
    PHOTO_QUALITY: 0.82,

    _handlePhotoPreview(input, previewId) {
        const preview = document.getElementById(previewId);
        const file = input.files[0];
        if (!file) return;

        preview.innerHTML = '<div class="photo-loading">Processing photo…</div>';
        preview.classList.remove('hidden');

        this._downscale(file).then(dataUrl => {
            preview.innerHTML = `<img src="${dataUrl}"><button class="remove-photo" onclick="document.getElementById('${previewId}').innerHTML='';document.getElementById('${previewId}').classList.add('hidden')">Remove Photo</button>`;
        }).catch(err => {
            console.error('[Modal] photo processing failed', err);
            preview.innerHTML = '<div class="photo-loading">Could not read that image.</div>';
        });
    },

    _downscale(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                try {
                    const scale = Math.min(1, this.PHOTO_MAX_EDGE / Math.max(img.width, img.height));
                    const w = Math.max(1, Math.round(img.width * scale));
                    const h = Math.max(1, Math.round(img.height * scale));
                    const c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    const ctx = c.getContext('2d');
                    // JPEG has no alpha, so flatten onto white rather than
                    // letting transparent PNGs come out black.
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(c.toDataURL('image/jpeg', this.PHOTO_QUALITY));
                } catch (e) { reject(e); }
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
            img.src = url;
        });
    },

    _getPhotoData(previewId) {
        const img = document.querySelector(`#${previewId} img`);
        return img ? img.src : null;
    },

    _addOptionRow(containerId) {
        const div = document.getElementById(containerId);
        const row = document.createElement('div');
        row.className = 'option-row';
        row.innerHTML = '<textarea placeholder="Description" class="opt-desc"></textarea><input type="url" placeholder="Link (URL)" class="opt-link"><button class="btn-remove" onclick="this.parentElement.remove()">✕</button>';
        div.appendChild(row);
    },

    _collectOptions(containerId) {
        return [...document.querySelectorAll(`#${containerId} .option-row`)].map(row => ({
            id: crypto.randomUUID(),
            desc: row.querySelector('.opt-desc').value.trim(),
            link: row.querySelector('.opt-link').value.trim()
        })).filter(o => o.desc || o.link);
    },

    _addTaskRow(containerId) {
        const div = document.getElementById(containerId);
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Task name';
        div.appendChild(input);
        input.focus();
    },

    _collectTasks(containerId) {
        return [...document.querySelectorAll(`#${containerId} input`)].map(input => ({
            id: crypto.randomUUID(),
            name: input.value.trim(),
            done: false
        })).filter(t => t.name);
    },

    _quickAddTask(projectId) {
        const input = document.getElementById('new-task-name');
        const name = input.value.trim();
        if (!name) return;
        const project = Store.getProject(projectId);
        const tasks = [...(project.tasks || []), { id: crypto.randomUUID(), name, done: false }];
        Store.updateProject(projectId, { tasks });
        input.value = '';
        this.editProject(projectId);
    },

    _toggleTask(projectId, idx, done) {
        const project = Store.getProject(projectId);
        const tasks = [...(project.tasks || [])];
        tasks[idx] = { ...tasks[idx], done };
        Store.updateProject(projectId, { tasks });
        // Update UI in-place
        const row = document.querySelector(`.task-row[data-idx="${idx}"]`);
        if (row) {
            const span = row.querySelector('.checkbox-row span');
            span.classList.toggle('strikethrough', done);
            // Update badge
            const badge = document.querySelector('#proj-task-list')?.closest('.form-section')?.querySelector('.badge');
            if (badge) badge.textContent = `${tasks.filter(t => t.done).length}/${tasks.length}`;
        }
    },

    _deleteTask(projectId, idx) {
        const project = Store.getProject(projectId);
        const tasks = [...(project.tasks || [])];
        tasks.splice(idx, 1);
        Store.updateProject(projectId, { tasks });
        this.editProject(projectId);
    },

    _addDIYRow(containerId) {
        const div = document.getElementById(containerId);
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Material name';
        div.appendChild(input);
        input.focus();
    },

    _selectTheme(name) {
        ThemeEngine.apply(name);
        document.querySelectorAll('.theme-option').forEach(btn => {
            const isActive = btn.dataset.theme === name;
            btn.classList.toggle('active', isActive);
            btn.querySelector('.check').textContent = isActive ? '✓' : '';
        });
    },

    _quickAddDIY(projectId) {
        const input = document.getElementById('new-diy-name');
        const name = input.value.trim();
        if (!name) return;
        Store.addDIYItem({ projectId, name });
        input.value = '';
        this.editProject(projectId);
    }
};
