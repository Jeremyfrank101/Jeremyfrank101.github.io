// game.js — "Game" tab: a quiz generated from the user's own inventory

const Game = {
    QUESTION_COUNT: 10,
    OPTION_COUNT: 4,

    // { questions, index, score, picked } — null until a quiz is started
    state: null,

    // ---------- Lifecycle ----------

    render() {
        if (!this.state) {
            const questions = this.buildQuiz();
            if (!questions.length) return this._needsData();
            this.state = { questions, index: 0, score: 0, picked: null };
        }
        return this.state.index >= this.state.questions.length ? this._results() : this._question();
    },

    restart() {
        this.state = null;
        App.render();
    },

    pick(optionIndex) {
        const s = this.state;
        if (!s || s.picked !== null) return;
        s.picked = optionIndex;
        if (s.questions[s.index].options[optionIndex] === s.questions[s.index].answer) s.score++;
        App.render();
    },

    next() {
        const s = this.state;
        if (!s || s.picked === null) return;
        s.index++;
        s.picked = null;
        if (s.index >= s.questions.length) Store.setGameBest(s.score);
        App.render();
    },

    // ---------- Quiz construction ----------

    buildQuiz() {
        const items = Store.getItems();
        const rooms = Store.getRooms();
        const projects = Store.getProjects();
        const pool = [];

        items.forEach(i => {
            pool.push(this._qItemType(i));
            pool.push(this._qItemRoom(i, rooms));
        });
        rooms.forEach(r => pool.push(this._qRoomCount(r, items)));
        projects.forEach(p => pool.push(this._qProjectBudget(p)));

        return this._shuffle(pool.filter(Boolean)).slice(0, this.QUESTION_COUNT);
    },

    // "What type is X?" — always answerable, there are five fixed types.
    _qItemType(item) {
        const distractors = ITEM_TYPES.filter(t => t !== item.itemType);
        return {
            icon: ITEM_ICONS[item.itemType],
            prompt: `What type is <strong>${Views._esc(item.name)}</strong>?`,
            options: this._shuffle([item.itemType, ...this._shuffle(distractors).slice(0, this.OPTION_COUNT - 1)]),
            answer: item.itemType
        };
    },

    // "Which room is X in?" — needs the item placed and at least one other room.
    _qItemRoom(item, rooms) {
        if (!item.roomId) return null;
        const answer = Store.getRoomBreadcrumb(item.roomId);
        if (!answer) return null;

        const distractors = rooms
            .filter(r => r.id !== item.roomId)
            .map(r => Store.getRoomBreadcrumb(r.id))
            .filter(name => name && name !== answer);
        if (!distractors.length) return null;

        return {
            icon: ITEM_ICONS[item.itemType],
            prompt: `Which room is <strong>${Views._esc(item.name)}</strong> in?`,
            options: this._shuffle([answer, ...this._shuffle([...new Set(distractors)]).slice(0, this.OPTION_COUNT - 1)]),
            answer
        };
    },

    // "How many items are in X?" — pointless until there is a bit of inventory.
    _qRoomCount(room, items) {
        if (items.length < 3) return null;
        const count = Store.getItemsForRoom(room.id).length;
        return {
            icon: '🏠',
            prompt: `How many items are in <strong>${Views._esc(room.name)}</strong>?`,
            options: this._shuffle(this._numberOptions(count)).map(String),
            answer: String(count)
        };
    },

    // "What's the budget for X?" — only for projects that set one.
    _qProjectBudget(project) {
        const budget = Math.round(project.budget || 0);
        if (budget <= 0) return null;
        return {
            icon: '📁',
            prompt: `What's the budget for <strong>${Views._esc(project.name)}</strong>?`,
            options: this._shuffle(this._budgetOptions(budget)).map(n => `$${n}`),
            answer: `$${budget}`
        };
    },

    // ---------- Rendering ----------

    _question() {
        const s = this.state;
        const q = s.questions[s.index];
        const answered = s.picked !== null;

        const options = q.options.map((opt, idx) => {
            let cls = 'quiz-option';
            if (answered) {
                if (opt === q.answer) cls += ' correct';
                else if (idx === s.picked) cls += ' wrong';
                else cls += ' muted';
            }
            return `<button class="${cls}" ${answered ? 'disabled' : ''} onclick="Game.pick(${idx})">
                <span>${Views._esc(opt)}</span>
                ${answered && opt === q.answer ? '<span class="quiz-mark">✓</span>' : ''}
                ${answered && idx === s.picked && opt !== q.answer ? '<span class="quiz-mark">✕</span>' : ''}
            </button>`;
        }).join('');

        const isLast = s.index === s.questions.length - 1;

        return `<div class="quiz">
            <div class="quiz-status">
                <span>Question ${s.index + 1} of ${s.questions.length}</span>
                <span class="quiz-score">Score: ${s.score}</span>
            </div>
            <div class="quiz-progress"><div class="quiz-progress-fill" style="width:${(s.index / s.questions.length) * 100}%"></div></div>

            <div class="section quiz-card">
                <div class="quiz-prompt"><span class="quiz-icon">${q.icon}</span><p>${q.prompt}</p></div>
                <div class="quiz-options">${options}</div>
            </div>

            ${answered
                ? `<button class="btn-primary quiz-next" onclick="Game.next()">${isLast ? 'See Results' : 'Next Question'}</button>`
                : ''}
            <button class="btn-text quiz-restart" onclick="Game.restart()">Start over</button>
        </div>`;
    },

    _results() {
        const s = this.state;
        const total = s.questions.length;
        const pct = Math.round((s.score / total) * 100);
        const best = Store.getGameBest();

        let icon = '🏠', note = 'Room for improvement — take another look around the house.';
        if (pct === 100) { icon = '🏆'; note = 'Perfect score. You know exactly where everything is.'; }
        else if (pct >= 70) { icon = '🌟'; note = 'Nicely done. You know your home well.'; }
        else if (pct >= 40) { icon = '🙂'; note = 'Not bad — a few things have wandered off.'; }

        return `<div class="quiz">
            <div class="section quiz-card quiz-results">
                <div class="quiz-result-icon">${icon}</div>
                <div class="quiz-result-score">${s.score}<span>/${total}</span></div>
                <p class="quiz-result-note">${note}</p>
                ${best ? `<p class="quiz-result-best">Best score: ${best}/${total}</p>` : ''}
            </div>
            <button class="btn-primary quiz-next" onclick="Game.restart()">Play Again</button>
        </div>`;
    },

    _needsData() {
        return `<div class="quiz">
            <div class="section quiz-card quiz-results">
                <div class="quiz-result-icon">🎲</div>
                <h3>Nothing to quiz you on yet</h3>
                <p class="quiz-result-note">The quiz is built from your own inventory. Tap <strong>+</strong> to add a few rooms and items, then come back and test yourself.</p>
            </div>
            <button class="btn-primary quiz-next" onclick="Game.restart()">Check Again</button>
        </div>`;
    },

    // ---------- Helpers ----------

    _numberOptions(correct) {
        const opts = new Set([correct]);
        for (let spread = 1; opts.size < this.OPTION_COUNT && spread < 12; spread++) {
            if (correct - spread >= 0) opts.add(correct - spread);
            if (opts.size < this.OPTION_COUNT) opts.add(correct + spread);
        }
        return [...opts];
    },

    _budgetOptions(correct) {
        const opts = new Set([correct]);
        [0.5, 0.75, 1.5, 2, 1.25].forEach(mult => {
            if (opts.size >= this.OPTION_COUNT) return;
            const value = Math.max(1, Math.round((correct * mult) / 5) * 5);
            if (value !== correct) opts.add(value);
        });
        // Fall back to flat offsets if the multiples collided (small budgets).
        for (let step = 5; opts.size < this.OPTION_COUNT && step < 100; step += 5) {
            opts.add(correct + step);
        }
        return [...opts];
    },

    _shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
};
