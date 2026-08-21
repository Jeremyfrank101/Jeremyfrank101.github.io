// views.js — Renders the main list content for each filter mode

const Views = {

    renderAll() {
        const projects = Store.getProjects().filter(p => !p.isCompleted);
        const rooms = Store.getTopLevelRooms();
        const allProjects = Store.getProjects().filter(p => !p.isCompleted);
        let materials = [];
        allProjects.forEach(p => {
            const diyItems = Store.getDIYItems(p.id).filter(d => !d.isOwned);
            diyItems.forEach(d => materials.push({ ...d, projectName: p.name, projectId: p.id }));
            (p.tasks || []).filter(t => !t.done).forEach(t => {
                // tasks are not DIY items, skip them here
            });
        });

        let html = '';

        // Projects section
        if (projects.length) {
            html += `<div class="section">
                <div class="section-header"><span>Projects</span><span class="badge">${projects.length}</span></div>
                <div class="section-body" data-drag="project">${projects.map(p => this._projectRow(p)).join('')}</div>
            </div>`;
        }

        // Homes section
        const homes = Store.getHomes();
        if (homes.length) {
            html += `<div class="section">
                <div class="section-header"><span>Homes</span><span class="badge">${homes.length}</span></div>
                <div class="section-body" data-drag="home">${homes.map(h => {
                    const n = Store.getRoomsForHome(h.id).length;
                    return `<div class="list-row" data-key="${h.id}" data-kind="home" onclick="Modal.editHome('${h.id}')"><span class="ui-grip" data-drag-handle aria-hidden="true"></span>
                        <div class="row-thumb">${h.photo ? `<img src="${h.photo}" style="width:100%;height:100%;object-fit:cover">` : '<span>🏡</span>'}</div>
                        <div class="row-info">
                            <div class="row-title">${this._esc(h.name)} ${this._shareBadge('home', h.id, h)}</div>
                            <div class="row-subtitle"><span>${n} room${n !== 1 ? 's' : ''}</span></div>
                        </div>
                    </div>`;
                }).join('')}</div>
            </div>`;
        }

        // Rooms section
        if (rooms.length) {
            html += `<div class="section">
                <div class="section-header"><span>Rooms</span><span class="badge">${rooms.length}</span></div>
                <div class="section-body" data-drag="room">${rooms.map(r => {
                    const itemCount = Store.getItemsForRoom(r.id).length;
                    const subCount = Store.getSubRooms(r.id).length;
                    return `<div class="list-row" data-key="${r.id}" data-kind="room" onclick="Modal.editRoom('${r.id}')"><span class="ui-grip" data-drag-handle aria-hidden="true"></span>
                        <div class="row-thumb">${r.photo ? `<img src="${r.photo}" style="width:100%;height:100%;object-fit:cover">` : '<span>🏠</span>'}</div>
                        <div class="row-info">
                            <div class="row-title">${this._esc(r.name)}</div>
                            <div class="row-subtitle">
                                <span>${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
                                ${subCount ? `<span class="dot">·</span><span>${subCount} sub-room${subCount !== 1 ? 's' : ''}</span>` : ''}
                            </div>
                        </div>
                    </div>`;
                }).join('')}</div>
            </div>`;
        }

        // Material List section
        if (materials.length) {
            html += `<div class="section">
                <div class="section-header"><span>Material List</span><span class="badge">${materials.length}</span></div>
                <div class="section-body">${materials.map(d => `<div class="list-row" onclick="Modal.editDIYItem('${d.id}','${d.projectId}')">
                    <div class="row-thumb">${d.photo ? `<img src="${d.photo}" style="width:100%;height:100%;object-fit:cover">` : '<span>🔧</span>'}</div>
                    <div class="row-info">
                        <div class="row-title">${this._esc(d.name)}</div>
                        <div class="row-subtitle">
                            <span>${this._esc(d.projectName)}</span>
                            ${d.purpose ? `<span class="dot">·</span><span>${this._esc(d.purpose)}</span>` : ''}
                        </div>
                    </div>
                </div>`).join('')}</div>
            </div>`;
        }

        if (!html) return '';
        return html;
    },

    renderByRoom() {
        const homes = Store.getHomes();
        const unassigned = Store.getItems().filter(i => !i.roomId);
        let html = '';

        // Group rooms under their home. Rooms with no home come last under
        // "No Home", so nothing can go missing just because it is unassigned.
        const groups = homes.map(h => ({ home: h, rooms: Store.getRoomsForHome(h.id) }));
        const homeless = Store.getRoomsForHome(null);
        if (homeless.length) groups.push({ home: null, rooms: homeless });

        const renderRoom = room => {
            const roomItems = Store.getItemsForRoom(room.id);
            const subRooms = Store.getSubRooms(room.id);

            html += `<div class="section">
                <div class="section-header" onclick="Modal.editRoom('${room.id}')">
                    ${room.photo ? `<img src="${room.photo}" class="section-photo">` : ''}
                    <span>${this._esc(room.name)}</span>
                    ${room.isPrivate ? '<span class="share-badge incoming">🔒 private</span>' : ''}
                    <span class="section-edit">✏️</span>
                </div>
                <div class="section-body" data-drag="item" data-room="${room.id}">
                    ${roomItems.map(i => this._itemRow(i)).join('')}
                    ${subRooms.map(sub => {
                        const subItems = Store.getItemsForRoom(sub.id);
                        return `<div class="sub-room-group">
                            <div class="sub-room-header" onclick="this.parentElement.classList.toggle('expanded')">
                                ${sub.photo ? `<img src="${sub.photo}" class="sub-photo">` : '<span class="sub-icon">📂</span>'}
                                <span>${this._esc(sub.name)}</span>
                                <span class="badge">${subItems.length}</span>
                                <span class="chevron">▸</span>
                            </div>
                            <div class="sub-room-content">
                                ${subItems.length ? subItems.map(i => this._itemRow(i)).join('') : '<div class="empty-note">No items</div>'}
                            </div>
                            <div class="sub-room-actions">
                                <button class="btn-small" onclick="event.stopPropagation();Modal.editRoom('${sub.id}')">Edit</button>
                            </div>
                        </div>`;
                    }).join('')}
                    ${!roomItems.length && !subRooms.length ? '<div class="empty-note">No items</div>' : ''}
                </div>
            </div>`;
        };

        groups.forEach(({ home, rooms }) => {
            // Only label the grouping once there is a home to distinguish it
            // from, so a user who never creates one sees the original flat list.
            if (homes.length) {
                html += `<div class="home-group-header" ${home ? `onclick="Modal.editHome('${home.id}')"` : ''}>
                    ${home && home.photo ? `<img src="${home.photo}" class="home-photo">` : `<span class="home-icon">${home ? '🏡' : '📦'}</span>`}
                    <span class="home-name">${home ? this._esc(home.name) : 'No Home'}</span>
                    ${home ? this._shareBadge('home', home.id, home) : ''}
                    <span class="badge">${rooms.length}</span>
                    ${home ? '<span class="section-edit">✏️</span>' : ''}
                </div>`;
            }
            if (!rooms.length) {
                html += '<div class="section"><div class="section-body"><div class="empty-note">No rooms in this home yet.</div></div></div>';
            }
            rooms.forEach(renderRoom);
        });

        if (unassigned.length) {
            html += `<div class="section"><div class="section-header"><span>No Room</span></div><div class="section-body" data-drag="item" data-room="">${unassigned.map(i => this._itemRow(i)).join('')}</div></div>`;
        }
        return html;
    },

    renderByType() {
        let html = '';
        ITEM_TYPES.forEach(type => {
            const items = Store.getItems().filter(i => i.itemType === type);
            if (!items.length) return;
            html += `<div class="section">
                <div class="section-header"><span>${ITEM_ICONS[type]} ${type}</span></div>
                <div class="section-body" data-drag="item">${items.map(i => this._itemRow(i)).join('')}</div>
            </div>`;
        });
        return html;
    },

    renderProjects() {
        const projects = Store.getProjects();
        const open = projects.filter(p => !p.isCompleted);
        const completed = projects.filter(p => p.isCompleted);
        let html = '';

        if (!open.length && !completed.length) {
            return '<div class="section"><div class="section-body"><div class="empty-note">No projects yet. Tap + to create one.</div></div></div>';
        }

        if (open.length) {
            html += `<div class="section"><div class="section-header"><span>Open</span></div><div class="section-body" data-drag="project">${open.map(p => this._projectRow(p)).join('')}</div></div>`;
        }
        if (completed.length) {
            html += `<div class="section"><div class="section-header"><span>Completed</span></div><div class="section-body" data-drag="project">${completed.map(p => this._projectRow(p)).join('')}</div></div>`;
        }
        return html;
    },

    renderInfo() {
        return `
        <div class="info-page">
            <div class="info-hero">
                <span class="info-hero-icon">🏠</span>
                <h2>Welcome to CozyHome</h2>
                <p>Your personal home inventory and project planner. Keep track of everything in your home, organize by room, and plan your next project — all in one place.</p>
            </div>

            <div class="section info-section">
                <div class="section-header"><span>Getting Started</span></div>
                <div class="info-content">
                    <p>Tap the <strong>+</strong> button in the top-left corner to create your first room, add an item, or start a project. Here's what each one does:</p>
                </div>
            </div>

            <div class="section info-section">
                <div class="section-header"><span>🏠 Rooms & Sub-Rooms</span></div>
                <div class="info-content">
                    <p><strong>Rooms</strong> represent the spaces in your home — Living Room, Kitchen, Garage, etc. Each room can have <strong>Sub-Rooms</strong> for more specific areas like a closet, pantry, or cabinet.</p>
                    <div class="info-example">
                        <div class="info-example-label">Example</div>
                        <div class="info-example-tree">
                            <div class="info-tree-item">🏠 Kitchen</div>
                            <div class="info-tree-item indented">📂 Pantry</div>
                            <div class="info-tree-item indented">📂 Under Sink</div>
                        </div>
                    </div>
                    <p>Add a photo to each room to make it easy to recognize at a glance.</p>
                </div>
            </div>

            <div class="section info-section">
                <div class="section-header"><span>📦 Items</span></div>
                <div class="info-content">
                    <p><strong>Items</strong> are the things you own. Each item has:</p>
                    <ul class="info-list">
                        <li><strong>Name</strong> — What is it?</li>
                        <li><strong>Type</strong> — Tool, Furniture, Toy, Decoration, or Other</li>
                        <li><strong>Room</strong> — Where is it stored?</li>
                        <li><strong>Description</strong> — Any notes about it</li>
                        <li><strong>Photo</strong> — A picture for quick identification</li>
                    </ul>
                    <p>Use the <strong>Room</strong> and <strong>Type</strong> tabs to browse your items by location or category.</p>
                </div>
            </div>

            <div class="section info-section">
                <div class="section-header"><span>📁 Projects</span></div>
                <div class="info-content">
                    <p><strong>Projects</strong> help you plan home improvements, renovations, or any home-related goal. Let's walk through an example:</p>

                    <div class="info-walkthrough">
                        <div class="info-step">
                            <div class="info-step-number">1</div>
                            <div class="info-step-body">
                                <h4>Create a Project</h4>
                                <p>Say you want to build a bookshelf. Tap <strong>+</strong> then <strong>Create Project</strong> and name it <em>"Build Living Room Bookshelf"</em>.</p>
                            </div>
                        </div>

                        <div class="info-step">
                            <div class="info-step-number">2</div>
                            <div class="info-step-body">
                                <h4>Set a Budget & Goal Date</h4>
                                <p>Enter <strong>$150</strong> as your budget. Toggle on <strong>Set Goal Date</strong> and pick a target completion date. The project list will show if you're past due.</p>
                            </div>
                        </div>

                        <div class="info-step">
                            <div class="info-step-number">3</div>
                            <div class="info-step-body">
                                <h4>Link Rooms & Items</h4>
                                <p>Check <strong>Living Room</strong> under Rooms to associate the project with that space. You can also link existing items — for example, a drill you already own.</p>
                            </div>
                        </div>

                        <div class="info-step">
                            <div class="info-step-number">4</div>
                            <div class="info-step-body">
                                <h4>Add Tasks</h4>
                                <p>Break your project into steps:</p>
                                <div class="info-task-demo">
                                    <div class="info-task"><span class="info-check done">&#10003;</span> <s>Measure wall space</s></div>
                                    <div class="info-task"><span class="info-check done">&#10003;</span> <s>Buy lumber</s></div>
                                    <div class="info-task"><span class="info-check">&#9744;</span> Sand and stain wood</div>
                                    <div class="info-task"><span class="info-check">&#9744;</span> Assemble shelves</div>
                                    <div class="info-task"><span class="info-check">&#9744;</span> Mount to wall</div>
                                </div>
                                <p>Check them off as you go — your progress shows on the project card.</p>
                            </div>
                        </div>

                        <div class="info-step">
                            <div class="info-step-number">5</div>
                            <div class="info-step-body">
                                <h4>Enable DIY & Add Materials</h4>
                                <p>Toggle <strong>DIY Project</strong> on, then add the materials you need:</p>
                                <div class="info-task-demo">
                                    <div class="info-task"><span class="info-check done">&#10003;</span> <s>Wood planks (4x)</s></div>
                                    <div class="info-task"><span class="info-check done">&#10003;</span> <s>Wood screws</s></div>
                                    <div class="info-task"><span class="info-check">&#9744;</span> L-brackets (6x)</div>
                                    <div class="info-task"><span class="info-check">&#9744;</span> Wood stain</div>
                                    <div class="info-task"><span class="info-check">&#9744;</span> Wall anchors</div>
                                </div>
                                <p>Check off materials you already have. Unchecked items appear in your <strong>Material List</strong> on the All tab.</p>
                            </div>
                        </div>

                        <div class="info-step">
                            <div class="info-step-number">6</div>
                            <div class="info-step-body">
                                <h4>Material Details & Options</h4>
                                <p>Tap <strong>Edit</strong> on any material to add more detail:</p>
                                <ul class="info-list">
                                    <li><strong>Description</strong> — Specs or notes (e.g. "1x8x6 pine boards")</li>
                                    <li><strong>What it's for</strong> — Its purpose in the project</li>
                                    <li><strong>Inventory Match</strong> — Link to an item you already own in a room</li>
                                    <li><strong>Options</strong> — Add product links or descriptions for where to buy it, with comparison notes</li>
                                    <li><strong>Photo</strong> — Snap a picture for reference</li>
                                </ul>
                            </div>
                        </div>

                        <div class="info-step">
                            <div class="info-step-number">7</div>
                            <div class="info-step-body">
                                <h4>Complete the Project</h4>
                                <p>When you're done, tap <strong>Mark as Completed</strong>. The project moves to the Completed section with a checkmark.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="section info-section">
                <div class="section-header"><span>📋 Tabs Overview</span></div>
                <div class="info-content">
                    <ul class="info-list">
                        <li><strong>All</strong> — Dashboard view with active Projects, Rooms, and your Material List (unchecked materials across all projects)</li>
                        <li><strong>Room</strong> — Browse items organized by room and sub-room</li>
                        <li><strong>Type</strong> — Browse items grouped by type (Tool, Furniture, etc.)</li>
                        <li><strong>Projects</strong> — See all open and completed projects</li>
                        <li><strong>Info</strong> — You are here!</li>
                    </ul>
                </div>
            </div>

            <div class="section info-section">
                <div class="section-header"><span>🎨 Themes</span></div>
                <div class="info-content">
                    <p>Tap the <strong>profile icon</strong> in the top-right corner to change your theme. Choose from five cozy styles — each changes the colors, patterns, and overall feel of the app.</p>
                </div>
            </div>
        </div>`;
    },

    // A badge showing that something is shared, and which way.
    _shareBadge(type, id, record) {
        const incoming = Store.getIncomingShare(type, id);
        if (incoming) {
            return `<span class="share-badge incoming" title="Shared with you by ${this._esc(Store.personName(incoming.ownerId))}">👥 from ${this._esc(Store.personName(incoming.ownerId))}</span>`;
        }
        const out = Store.getSharesFor(type, id);
        if (out.length) {
            const who = out.length === 1 ? Store.personName(out[0].sharedWithId) : `${out.length} people`;
            return `<span class="share-badge" title="Shared with ${this._esc(who)}">👥 shared</span>`;
        }
        return '';
    },

    // ---- Row renderers ----

    _itemRow(item) {
        const breadcrumb = Store.getRoomBreadcrumb(item.roomId);
        return `<div class="list-row" data-key="${item.id}" data-kind="item" onclick="Modal.editItem('${item.id}')"><span class="ui-grip" data-drag-handle aria-hidden="true"></span>
            <div class="row-thumb ${item.photo ? 'has-photo' : ''}">
                ${item.photo ? `<img src="${item.photo}">` : `<span>${ITEM_ICONS[item.itemType]}</span>`}
            </div>
            <div class="row-info">
                <div class="row-title">${this._esc(item.name)}${item.isPrivate ? ' <span class="share-badge incoming">🔒</span>' : ''}</div>
                <div class="row-subtitle">
                    <span>${item.itemType}</span>
                    ${breadcrumb ? `<span class="dot">·</span><span>${this._esc(breadcrumb)}</span>` : ''}
                </div>
            </div>
        </div>`;
    },

    _projectRow(project) {
        const diyItems = Store.getDIYItems(project.id);
        const owned = diyItems.filter(d => d.isOwned).length;
        const tasks = project.tasks || [];
        const tasksDone = tasks.filter(t => t.done).length;
        const isPast = project.goalDate && new Date(project.goalDate) < new Date() && !project.isCompleted;

        return `<div class="list-row" data-key="${project.id}" data-kind="project" onclick="Modal.editProject('${project.id}')"><span class="ui-grip" data-drag-handle aria-hidden="true"></span>
            <div class="row-thumb project-thumb ${project.photo ? 'has-photo' : ''}">
                ${project.photo
                    ? `<img src="${project.photo}">`
                    : `<span class="${project.isCompleted ? 'completed-icon' : 'project-icon'}">${project.isCompleted ? '✓' : '📁'}</span>`}
            </div>
            <div class="row-info">
                <div class="row-title">
                    ${this._esc(project.name)}
                    ${project.isCompleted ? '<span class="completed-badge" role="img" aria-label="Completed">✓</span>' : ''}
                    ${this._shareBadge('project', project.id, project)}
                </div>
                <div class="row-subtitle">
                    ${project.isDIY ? '<span class="diy-badge">DIY</span>' : ''}
                    ${project.budget > 0 ? `<span class="budget-text">$${Math.round(project.budget)}</span>` : ''}
                    ${project.roomIds.length ? `<span>${project.roomIds.length} room${project.roomIds.length > 1 ? 's' : ''}</span>` : ''}
                    ${project.itemIds.length ? `<span>${project.itemIds.length} item${project.itemIds.length > 1 ? 's' : ''}</span>` : ''}
                    ${tasks.length ? `<span>${tasksDone}/${tasks.length} tasks</span>` : ''}
                    ${project.isDIY && diyItems.length ? `<span>${owned}/${diyItems.length} materials</span>` : ''}
                </div>
                ${project.goalDate ? `<div class="row-goal ${isPast ? 'past-due' : ''}">Goal: ${new Date(project.goalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>` : ''}
            </div>
        </div>`;
    },

    _esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
};
