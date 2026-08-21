// iliad.js — "Wrath": turn-based duels through the Iliad, in a 32-bit idiom.
//
// Pick a hero and fight the foes they actually faced in Homer, in the order
// the poem gives them. Combat is Pokémon-shaped: four moves, a type triangle,
// status effects, and a meter that fills until your patron god intervenes.
//
// Everything is drawn: warriors are assembled from parts (greaves, cuirass,
// cape, helmet crest, hoplon, spear) so every fighter can take any pose from
// the same renderer, and the whole game ships without an image file.

const Iliad = {
    W: 384, H: 216,          // SNES-ish internal resolution, integer-scaled up

    // Might overwhelms Guile · Guile undoes Spirit · Spirit breaks Might
    TYPES: {
        might:  { name: 'Might',  colour: '#d8563a', beats: 'guile'  },
        guile:  { name: 'Guile',  colour: '#4f9dd4', beats: 'spirit' },
        spirit: { name: 'Spirit', colour: '#c9a227', beats: 'might'  }
    },

    // ---------- heroes ----------

    ROSTER: [
        {
            id: 'achilles',
            name: 'Achilles',
            epithet: 'swift-footed, son of Peleus',
            patron: 'Thetis & Hera',
            blurb: 'The greatest of the Achaeans. His mother is a sea-nymph, his armour forged by Hephaestus, and his rage is the poem\'s first word.',
            hp: 118, atk: 24, def: 15, spd: 22,
            palette: { skin:'#d9a06b', tunic:'#e8dcc0', armour:'#e6c15a', trim:'#f5e6a8', cape:'#b8452f', crest:'#f2e3b0', shield:'#d9b451', metal:'#cfd6dd' },
            moves: [
                { name: 'Pelian Ash Spear', type:'might',  power: 30, acc: 95, desc: 'The spear only he can lift.' },
                { name: 'Swift-Footed Rush',type:'guile',  power: 20, acc: 100, effect:'first', desc: 'Strikes before the foe can set.' },
                { name: 'Myrmidon Guard',   type:'spirit', power: 0,  acc: 100, effect:'guard', desc: 'Shield locked. Braces and recovers.' },
                { name: 'Wrath',            type:'might',  power: 44, acc: 78, effect:'recoil', desc: 'Ruinous. It costs him too.' }
            ],
            ultimate: { name: 'Armour of Hephaestus', type:'spirit', power: 60, desc: 'Thetis begs the smith-god; the shield of the world blazes.' }
        },
        {
            id: 'hector',
            name: 'Hector',
            epithet: 'tamer of horses, breaker of ranks',
            patron: 'Apollo & Zeus',
            blurb: 'Troy\'s only wall. He fights not for glory but because the city behind him holds his wife and son.',
            hp: 130, atk: 21, def: 19, spd: 17,
            palette: { skin:'#c98b57', tunic:'#3f6fa8', armour:'#b9c2cc', trim:'#7f8b99', cape:'#2f4f86', crest:'#e0e6ee', shield:'#8fa3bd', metal:'#dde4ec' },
            moves: [
                { name: 'Breaker of Ranks', type:'might',  power: 27, acc: 95, desc: 'Shoulders through the line.' },
                { name: 'Hurled Boulder',   type:'might',  power: 36, acc: 80, effect:'daze', desc: 'A stone two men could not lift.' },
                { name: 'Wall of Ilium',    type:'spirit', power: 0,  acc: 100, effect:'guard', desc: 'He does not yield. The city is behind him.' },
                { name: 'Firebrand',        type:'guile',  power: 24, acc: 92, effect:'burn', desc: 'Fire for the Achaean ships.' }
            ],
            ultimate: { name: 'Apollo\'s Radiance', type:'spirit', power: 52, effect:'heal', desc: 'The Far-Shooter breathes strength back into his limbs.' }
        },
        {
            id: 'diomedes',
            name: 'Diomedes',
            epithet: 'lord of the war cry',
            patron: 'Athena',
            blurb: 'In his aristeia Athena strips the mist from his eyes so he can see the gods on the field — and wound them.',
            hp: 112, atk: 22, def: 17, spd: 20,
            palette: { skin:'#cf9a63', tunic:'#c8c2a8', armour:'#c0713a', trim:'#e0a05a', cape:'#7a3f7f', crest:'#d9c27a', shield:'#b8863f', metal:'#d5dbe2' },
            moves: [
                { name: 'Spear of Tydeus',  type:'might',  power: 26, acc: 96, desc: 'His father\'s fury, better aimed.' },
                { name: 'Clear-Sighted',    type:'guile',  power: 18, acc: 100, effect:'expose', desc: 'Athena\'s gift: he sees what is truly there.' },
                { name: 'Battle Cry',       type:'spirit', power: 0,  acc: 100, effect:'rage', desc: 'The war cry that empties Trojan hearts.' },
                { name: 'Wound the Divine', type:'spirit', power: 34, acc: 85, desc: 'Mortals should not do this. He does.' }
            ],
            ultimate: { name: 'Athena\'s Chariot', type:'guile', power: 55, effect:'expose', desc: 'The goddess herself takes the reins beside him.' }
        }
    ],

    // ---------- the foes, in the order Homer gives them ----------

    GAUNTLET: {
        achilles: [
            { name:'Iphition', epithet:'son of Otrynteus', book:'Book XX', hp:70, atk:15, def:10, spd:12, type:'might',
              palette:{ skin:'#b8834f', tunic:'#8a7a5c', armour:'#9aa3ad', trim:'#6f7986', cape:'#5a4a3a', crest:'#c0c8d2', shield:'#8a939e', metal:'#c3cad3' },
              moves:[{name:'Charge',type:'might',power:18,acc:92},{name:'Spear Thrust',type:'might',power:22,acc:85},{name:'Shield Push',type:'guile',power:12,acc:95,effect:'daze'}],
              line:'First of the Trojans to meet him at the ford.' },
            { name:'Aeneas', epithet:'son of Aphrodite', book:'Book XX', hp:92, atk:19, def:16, spd:14, type:'spirit',
              palette:{ skin:'#c58f5c', tunic:'#b7546a', armour:'#d9c07a', trim:'#f0dda0', cape:'#8e3450', crest:'#f2d9e0', shield:'#c9a86a', metal:'#dfe5ec' },
              moves:[{name:'Boulder Cast',type:'might',power:24,acc:82},{name:'Divine Blood',type:'spirit',power:20,acc:95,effect:'heal'},{name:'Ancestral Guard',type:'spirit',power:0,acc:100,effect:'guard'}],
              line:'Fated to survive this war and found another city.' },
            { name:'Lycaon', epithet:'son of Priam, unransomed', book:'Book XXI', hp:64, atk:14, def:9, spd:18, type:'guile',
              palette:{ skin:'#c08a58', tunic:'#cfc3a0', armour:'#a98f5f', trim:'#c9b071', cape:'#6f5a3a', crest:'#ddd2ae', shield:'#a3854f', metal:'#c8cfd8' },
              moves:[{name:'Supplication',type:'guile',power:10,acc:100,effect:'daze'},{name:'Desperate Lunge',type:'might',power:26,acc:74},{name:'Flee Along the Bank',type:'guile',power:14,acc:96,effect:'evade'}],
              line:'He clasps the knees of the man who once sold him into slavery.' },
            { name:'Asteropaeus', epithet:'grandson of the river Axius', book:'Book XXI', hp:88, atk:20, def:13, spd:19, type:'guile',
              palette:{ skin:'#b98454', tunic:'#4f8a7a', armour:'#7fb0a2', trim:'#a8d2c6', cape:'#2f5c52', crest:'#cfe8e0', shield:'#6f9c90', metal:'#cdd6dd' },
              moves:[{name:'Two Spears at Once',type:'might',power:28,acc:82},{name:'River-Blood',type:'spirit',power:18,acc:95,effect:'heal'},{name:'Ambidextrous Feint',type:'guile',power:22,acc:90,effect:'expose'}],
              line:'He throws with both hands at once. No other man in the poem can.' },
            { name:'Scamander', epithet:'the river, risen in anger', book:'Book XXI', hp:120, atk:22, def:20, spd:10, type:'spirit', divine:true,
              palette:{ skin:'#6fa8c0', tunic:'#3d7f9c', armour:'#5fa3bd', trim:'#9fd6e8', cape:'#255f7a', crest:'#bfe6f2', shield:'#4a8fa8', metal:'#a8d4e4' },
              moves:[{name:'Flood the Plain',type:'spirit',power:26,acc:90,effect:'daze'},{name:'Drowning Surge',type:'might',power:30,acc:82},{name:'Choked with Dead',type:'guile',power:20,acc:95,effect:'burn'}],
              line:'The river itself rears up, clogged with the bodies he has thrown in.' },
            { name:'Agenor', epithet:'wearing Apollo\'s likeness', book:'Book XXI', hp:80, atk:18, def:14, spd:24, type:'guile',
              palette:{ skin:'#d7b071', tunic:'#e8d9a8', armour:'#f0d98a', trim:'#fff2c4', cape:'#c9a24a', crest:'#fff6d8', shield:'#e0c46a', metal:'#f2f6fa' },
              moves:[{name:'Divine Misdirection',type:'guile',power:22,acc:96,effect:'evade'},{name:'Far-Shot Arrow',type:'guile',power:24,acc:90},{name:'Phantom Retreat',type:'spirit',power:0,acc:100,effect:'guard'}],
              line:'Apollo takes his shape and leads Achilles on a chase across the plain.' },
            { name:'Hector', epithet:'tamer of horses', book:'Book XXII', hp:130, atk:23, def:19, spd:17, type:'might', boss:true,
              palette:{ skin:'#c98b57', tunic:'#3f6fa8', armour:'#b9c2cc', trim:'#7f8b99', cape:'#2f4f86', crest:'#e0e6ee', shield:'#8fa3bd', metal:'#dde4ec' },
              moves:[{name:'Breaker of Ranks',type:'might',power:27,acc:95},{name:'Hurled Boulder',type:'might',power:34,acc:80,effect:'daze'},{name:'Wall of Ilium',type:'spirit',power:0,acc:100,effect:'guard'},{name:'Last Stand',type:'spirit',power:38,acc:85,effect:'rage'}],
              line:'Three times around the walls he ran. Now he turns and sets his feet.' }
        ],
        hector: [
            { name:'Protesilaus', epithet:'first ashore, first to fall', book:'Book II', hp:66, atk:15, def:10, spd:16, type:'might',
              palette:{ skin:'#c08a58', tunic:'#b04a3a', armour:'#c9ccd2', trim:'#9aa0a8', cape:'#7a2f24', crest:'#e2e6ea', shield:'#a8adb5', metal:'#d2d8de' },
              moves:[{name:'Leap from the Ship',type:'might',power:20,acc:90},{name:'Doomed Courage',type:'spirit',power:22,acc:85,effect:'rage'},{name:'Sword Cut',type:'might',power:16,acc:96}],
              line:'He knew the prophecy: the first man ashore dies. He jumped anyway.' },
            { name:'Ajax the Greater', epithet:'bulwark of the Achaeans', book:'Book VII', hp:118, atk:22, def:22, spd:9, type:'might',
              palette:{ skin:'#bf8a52', tunic:'#7f6a45', armour:'#8f7a4a', trim:'#c0a468', cape:'#5c4a2c', crest:'#d8c48a', shield:'#6f5c38', metal:'#c9cfd6' },
              moves:[{name:'Tower Shield',type:'spirit',power:0,acc:100,effect:'guard'},{name:'Seven-Hide Bash',type:'might',power:30,acc:85,effect:'daze'},{name:'Hurled Stone',type:'might',power:26,acc:84}],
              line:'His shield is seven ox-hides and a layer of bronze. The duel ends in gifts.' },
            { name:'Teucer', epithet:'the bowman behind the shield', book:'Book VIII', hp:74, atk:21, def:8, spd:23, type:'guile',
              palette:{ skin:'#c99259', tunic:'#5c8a4a', armour:'#7fa86a', trim:'#a8cc90', cape:'#3d6634', crest:'#c8e0b0', shield:'#6f9459', metal:'#cbd3da' },
              moves:[{name:'Arrow from Cover',type:'guile',power:26,acc:92},{name:'Rapid Volley',type:'guile',power:16,acc:100,effect:'burn'},{name:'Duck Behind Ajax',type:'guile',power:0,acc:100,effect:'guard'}],
              line:'He shoots, then hides behind his brother\'s shield like a child behind its mother.' },
            { name:'Patroclus', epithet:'in the armour of Achilles', book:'Book XVI', hp:112, atk:24, def:16, spd:20, type:'spirit',
              palette:{ skin:'#cf9a63', tunic:'#e8dcc0', armour:'#e6c15a', trim:'#f5e6a8', cape:'#b8452f', crest:'#f2e3b0', shield:'#d9b451', metal:'#cfd6dd' },
              moves:[{name:'Borrowed Glory',type:'spirit',power:28,acc:90,effect:'rage'},{name:'Rout the Trojans',type:'might',power:26,acc:92},{name:'Three Times He Charged',type:'might',power:34,acc:80,effect:'recoil'}],
              line:'Apollo strikes the helmet from his head before Hector ever reaches him.' },
            { name:'Achilles', epithet:'swift-footed, and grieving', book:'Book XXII', hp:135, atk:27, def:16, spd:24, type:'might', boss:true,
              palette:{ skin:'#d9a06b', tunic:'#e8dcc0', armour:'#e6c15a', trim:'#f5e6a8', cape:'#b8452f', crest:'#f2e3b0', shield:'#d9b451', metal:'#cfd6dd' },
              moves:[{name:'Pelian Ash Spear',type:'might',power:32,acc:95},{name:'Swift-Footed Rush',type:'guile',power:22,acc:100,effect:'first'},{name:'Wrath',type:'might',power:46,acc:78,effect:'recoil'},{name:'Grief for Patroclus',type:'spirit',power:30,acc:90,effect:'rage'}],
              line:'He has not eaten. He has not slept. He is not quite a man any more.' }
        ],
        diomedes: [
            { name:'Pandarus', epithet:'who broke the truce', book:'Book V', hp:72, atk:18, def:9, spd:21, type:'guile',
              palette:{ skin:'#c08a58', tunic:'#8a6a9c', armour:'#a888bd', trim:'#c8a8d8', cape:'#5c3f70', crest:'#dcc8e8', shield:'#96769f', metal:'#cbd3da' },
              moves:[{name:'Oathbreaker\'s Arrow',type:'guile',power:24,acc:92},{name:'Aimed at the Belt',type:'guile',power:28,acc:80},{name:'Boast',type:'spirit',power:12,acc:100,effect:'rage'}],
              line:'His arrow broke the truce and began the killing again.' },
            { name:'Aeneas', epithet:'son of Aphrodite', book:'Book V', hp:94, atk:19, def:17, spd:14, type:'spirit',
              palette:{ skin:'#c58f5c', tunic:'#b7546a', armour:'#d9c07a', trim:'#f0dda0', cape:'#8e3450', crest:'#f2d9e0', shield:'#c9a86a', metal:'#dfe5ec' },
              moves:[{name:'Stand Over the Body',type:'spirit',power:0,acc:100,effect:'guard'},{name:'Spear of Anchises',type:'might',power:24,acc:90},{name:'Divine Blood',type:'spirit',power:20,acc:95,effect:'heal'}],
              line:'Diomedes crushes his hip with a stone two living men could not carry.' },
            { name:'Aphrodite', epithet:'laughter-loving, out of her element', book:'Book V', hp:78, atk:14, def:12, spd:26, type:'spirit', divine:true,
              palette:{ skin:'#f0c8a8', tunic:'#f2a8c0', armour:'#f8d0e0', trim:'#fff0f6', cape:'#e07fa8', crest:'#fff4f8', shield:'#f2bcd2', metal:'#ffe8f0' },
              moves:[{name:'Rescue Her Son',type:'guile',power:0,acc:100,effect:'evade'},{name:'Girdle of Desire',type:'spirit',power:22,acc:95,effect:'daze'},{name:'Immortal Ichor',type:'spirit',power:16,acc:100,effect:'heal'}],
              line:'She is the goddess of love and has no business here. He cuts her wrist.' },
            { name:'Apollo', epithet:'the Far-Shooter', book:'Book V', hp:118, atk:24, def:20, spd:22, type:'guile', divine:true,
              palette:{ skin:'#f2d9a8', tunic:'#f0e2b0', armour:'#f8e08a', trim:'#fff8d0', cape:'#d9a83a', crest:'#fff6d8', shield:'#e8c860', metal:'#fff2c8' },
              moves:[{name:'Silver Bow',type:'guile',power:28,acc:92},{name:'Beware, Son of Tydeus',type:'spirit',power:26,acc:95,effect:'daze'},{name:'Divine Rebuke',type:'spirit',power:32,acc:85}],
              line:'"Think, son of Tydeus, and give way. Never match yourself against gods."' },
            { name:'Ares', epithet:'the bane of mortals', book:'Book V', hp:140, atk:27, def:18, spd:16, type:'might', divine:true, boss:true,
              palette:{ skin:'#c07a5a', tunic:'#8a2f2f', armour:'#a83a3a', trim:'#d95c4a', cape:'#5c1f1f', crest:'#f0806a', shield:'#8f2f2f', metal:'#d8dee6' },
              moves:[{name:'Brazen Spear',type:'might',power:32,acc:90},{name:'Shout of Ten Thousand',type:'spirit',power:28,acc:95,effect:'daze'},{name:'War Incarnate',type:'might',power:40,acc:80,effect:'rage'},{name:'Immortal Recovery',type:'spirit',power:0,acc:100,effect:'heal'}],
              line:'Athena leans on the spear beside him. The war god screams like ten thousand men.' }
        ]
    },

    // Chosen between fights. Roguelike drafting keeps runs from feeling fixed.
    BOONS: [
        { id:'hera',      god:'Hera',       name:'Queen\'s Favour',   desc:'+18 max vigour, fully restored.', apply:h => { h.maxHp += 18; h.hp = h.maxHp; } },
        { id:'athena',    god:'Athena',     name:'Clear Counsel',     desc:'+4 to every blow you land.',      apply:h => { h.atk += 4; } },
        { id:'hephaestus',god:'Hephaestus', name:'Forged Anew',       desc:'+4 guard against all harm.',      apply:h => { h.def += 4; } },
        { id:'hermes',    god:'Hermes',     name:'Winged Heels',      desc:'+5 swiftness. Strike first more often.', apply:h => { h.spd += 5; } },
        { id:'apollo',    god:'Apollo',     name:'Healing Hand',      desc:'Restore half your vigour now.',   apply:h => { h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp / 2)); } },
        { id:'zeus',      god:'Zeus',       name:'Aegis-Bearer',      desc:'Begin each duel with the favour of heaven half-earned.', apply:h => { h.favourStart = 50; } },
        { id:'nike',      god:'Nike',       name:'Winged Victory',    desc:'+2 attack and +2 guard, and a little vigour.', apply:h => { h.atk += 2; h.def += 2; h.maxHp += 8; h.hp += 8; } }
    ],

    // ---------- lifecycle ----------

    mounted: false,
    scene: 'select',     // select | battle | boon | over | board

    mount(container) {
        if (this.mounted) {
            if (this.container === container && document.body.contains(container)) return;
            this.unmount();
        }
        this.container = container;
        this.mounted = true;
        this.scene = 'select';
        this._t = 0;
        this._buildDOM();
        this._last = performance.now();
        this._loop = this._loop.bind(this);
        this._raf = requestAnimationFrame(this._loop);
        this.loadBoard();
    },

    unmount() {
        if (!this.mounted) return;
        this.mounted = false;
        cancelAnimationFrame(this._raf);
        document.removeEventListener('keydown', this._onKey);
        if (this.container) this.container.innerHTML = '';
        this.container = null;
    },

    // ---------- DOM ----------

    _buildDOM() {
        this.container.innerHTML = `
        <div class="il-root">
            <canvas class="il-canvas" width="${this.W}" height="${this.H}"></canvas>
            <div class="il-ui"></div>
        </div>`;
        this.dom = {
            canvas: this.container.querySelector('.il-canvas'),
            ui: this.container.querySelector('.il-ui')
        };
        this.ctx = this.dom.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        this._onKey = (e) => {
            if (this.scene !== 'battle' || this.busy || this.turn !== 'hero') return;
            const n = parseInt(e.key, 10);
            if (n >= 1 && n <= 4) { e.preventDefault(); this.useMove(n - 1); }
            if (e.key.toLowerCase() === 'q' && this.favour >= 100) { e.preventDefault(); this.useUltimate(); }
        };
        document.addEventListener('keydown', this._onKey);

        this.renderUI();
    },

    // ---------- run state ----------

    startRun(heroId) {
        const src = this.ROSTER.find(h => h.id === heroId);
        this.hero = {
            ...src,
            maxHp: src.hp, hp: src.hp,
            atk: src.atk, def: src.def, spd: src.spd,
            favourStart: 0, status: {}
        };
        this.stage = 0;
        this.kleos = 0;
        this.boons = [];
        this.log = [];
        this.startBattle();
    },

    startBattle() {
        const list = this.GAUNTLET[this.hero.id];
        if (this.stage >= list.length) { this.finish(true); return; }
        const src = list[this.stage];
        this.foe = { ...src, maxHp: src.hp, hp: src.hp, status: {} };
        this.hero.status = {};
        this.favour = this.hero.favourStart || 0;
        this.turnCount = 0;
        this.busy = false;
        this.scene = 'battle';
        this.turn = 'hero';
        this.heroPose = 'ready';
        this.foePose = 'ready';
        this.shake = 0;
        this.flash = 0;
        this.log = [`${src.name} — ${src.epithet}.`, src.line];
        this.renderUI();
    },

    // ---------- combat ----------

    effectiveness(atkType, defType) {
        if (!atkType || !defType) return 1;
        if (this.TYPES[atkType].beats === defType) return 1.5;
        if (this.TYPES[defType].beats === atkType) return 0.66;
        return 1;
    },

    roll(move, attacker, defender, atkStat, defStat) {
        const acc = move.acc - (attacker.status.dazed ? 20 : 0);
        if (Math.random() * 100 > acc) return { miss: true, dmg: 0 };
        if (defender.status.evading && Math.random() < 0.5) return { evaded: true, dmg: 0 };

        const eff = this.effectiveness(move.type, defender.type);
        const rage = attacker.status.raging ? 1.35 : 1;
        const guard = defender.status.guarding ? 0.45 : 1;
        const exposed = defender.status.exposed ? 1.3 : 1;
        const variance = 0.85 + Math.random() * 0.3;

        let dmg = (move.power + atkStat) * eff * rage * exposed * variance;
        dmg -= defStat * 0.55;
        dmg *= guard;
        return { dmg: Math.max(1, Math.round(dmg)), eff, crit: eff > 1 };
    },

    applyEffect(move, attacker, defender) {
        switch (move.effect) {
            case 'guard':  attacker.status.guarding = 2; attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.round(attacker.maxHp * 0.10)); return 'braces, and breathes.';
            case 'rage':   attacker.status.raging = 3; return 'fury rises.';
            case 'heal':   attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.round(attacker.maxHp * 0.16)); return 'strength returns.';
            case 'daze':   defender.status.dazed = 2; return 'the blow rings their helmet.';
            case 'burn':   defender.status.burning = 3; return 'fire catches and clings.';
            case 'expose': defender.status.exposed = 3; return 'a gap opens in their guard.';
            case 'evade':  attacker.status.evading = 2; return 'they slip aside.';
            default: return null;
        }
    },

    tickStatus(who) {
        const s = who.status;
        let note = null;
        if (s.burning) { const d = Math.round(who.maxHp * 0.05); who.hp -= d; s.burning--; note = `${who.name} burns for ${d}.`; }
        ['guarding','raging','dazed','exposed','evading'].forEach(k => { if (s[k]) s[k]--; });
        Object.keys(s).forEach(k => { if (s[k] <= 0) delete s[k]; });
        return note;
    },

    async useMove(i) {
        if (this.busy || this.turn !== 'hero') return;
        const move = this.hero.moves[i];
        this.busy = true;
        await this.performTurn(this.hero, this.foe, move, 'hero');
        if (this.foe.hp <= 0) return this.winBattle();
        await this.enemyTurn();
    },

    async useUltimate() {
        if (this.busy || this.favour < 100) return;
        this.busy = true;
        this.favour = 0;
        const u = this.hero.ultimate;
        this.say(`${this.hero.patron} answers!`);
        this.heroPose = 'cast';
        this.flash = 1;
        await this.wait(900);
        await this.performTurn(this.hero, this.foe, { ...u, acc: 100 }, 'hero', true);
        if (u.effect === 'heal') this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + Math.round(this.hero.maxHp * 0.3));
        if (this.foe.hp <= 0) return this.winBattle();
        await this.enemyTurn();
    },

    async performTurn(attacker, defender, move, side, isUlt) {
        const atkStat = side === 'hero' ? this.hero.atk : this.foe.atk;
        const defStat = side === 'hero' ? this.foe.def : this.hero.def;
        this.say(`${attacker.name} uses ${move.name}!`);
        if (side === 'hero') this.heroPose = isUlt ? 'cast' : 'attack'; else this.foePose = 'attack';
        this.renderUI();
        await this.wait(520);

        if (move.power > 0) {
            const r = this.roll(move, attacker, defender, atkStat, defStat);
            if (r.miss)        this.say(`${defender.name} slips the blow.`);
            else if (r.evaded) this.say(`${defender.name} is not where the spear went.`);
            else {
                defender.hp = Math.max(0, defender.hp - r.dmg);
                if (side === 'hero') this.foePose = 'hurt'; else this.heroPose = 'hurt';
                this.shake = 1;
                this.say(r.eff > 1 ? `A telling blow — ${r.dmg}!` : r.eff < 1 ? `Turned aside — only ${r.dmg}.` : `${r.dmg} damage.`);
                if (move.effect === 'recoil') {
                    const self = Math.round(r.dmg * 0.22);
                    attacker.hp = Math.max(1, attacker.hp - self);
                    this.say(`The fury costs ${attacker.name} ${self}.`);
                }
            }
        }
        const note = this.applyEffect(move, attacker, defender);
        if (note) this.say(`${attacker.name} — ${note}`);

        // favour builds from fighting well, faster when outmatched
        if (side === 'hero') this.favour = Math.min(100, this.favour + (isUlt ? 0 : 18));
        else this.favour = Math.min(100, this.favour + 10);

        this.renderUI();
        await this.wait(620);
        if (side === 'hero') this.heroPose = 'ready'; else this.foePose = 'ready';
        this.renderUI();
    },

    async enemyTurn() {
        this.turn = 'foe';
        const n = this.tickStatus(this.hero);
        if (n) { this.say(n); this.renderUI(); await this.wait(500); }
        if (this.hero.hp <= 0) return this.finish(false);

        await this.wait(320);
        const moves = this.foe.moves;
        // Prefer healing when badly hurt, otherwise weight toward strong moves.
        let move;
        const hurt = this.foe.hp / this.foe.maxHp < 0.35;
        const heal = moves.find(m => m.effect === 'heal' || m.effect === 'guard');
        if (hurt && heal && Math.random() < 0.5) move = heal;
        else move = moves[Math.floor(Math.random() * moves.length)];

        await this.performTurn(this.foe, this.hero, move, 'foe');
        const n2 = this.tickStatus(this.foe);
        if (n2) { this.say(n2); this.renderUI(); await this.wait(450); }

        if (this.hero.hp <= 0) return this.finish(false);
        if (this.foe.hp <= 0) return this.winBattle();
        this.turnCount++;
        this.turn = 'hero';
        this.busy = false;
        this.renderUI();
    },

    async winBattle() {
        this.foePose = 'fallen';
        this.heroPose = 'win';
        this.say(`${this.foe.name} falls.`);
        this.renderUI();
        await this.wait(1100);

        // Kleos rewards winning fast and unhurt — glory, not attrition.
        const hpPct = this.hero.hp / this.hero.maxHp;
        const gain = Math.round(120 + hpPct * 90 + Math.max(0, 12 - this.turnCount) * 8 + (this.foe.boss ? 150 : 0) + (this.foe.divine ? 90 : 0));
        this.kleos += gain;
        this.stage++;
        this.lastGain = gain;

        if (this.stage >= this.GAUNTLET[this.hero.id].length) return this.finish(true);
        this.scene = 'boon';
        this.boonChoices = this.shuffle(this.BOONS.filter(b => !this.boons.includes(b.id))).slice(0, 3);
        if (!this.boonChoices.length) { this.startBattle(); return; }
        this.renderUI();
    },

    takeBoon(id) {
        const b = this.BOONS.find(x => x.id === id);
        if (b) { b.apply(this.hero); this.boons.push(id); }
        this.startBattle();
    },

    async finish(victory) {
        this.scene = 'over';
        this.victory = victory;
        this.busy = true;
        if (!victory) this.heroPose = 'fallen';
        this.renderUI();
        await this.submitRun(victory);
        this.renderUI();
    },

    // ---------- leaderboard ----------

    async submitRun(victory) {
        try {
            const user = Auth.getUser();
            if (!user) return;
            await Auth.client.from('iliad_runs').insert({
                user_id: user.id,
                username: user.username || 'a stranger',
                hero: this.hero.name,
                stage: this.stage,
                kleos: this.kleos,
                victory
            });
            await this.loadBoard();
        } catch (e) { console.warn('[Iliad] could not record the run', e); }
    },

    async loadBoard() {
        try {
            const { data, error } = await Auth.client.from('iliad_runs')
                .select('username,hero,stage,kleos,victory,created_at')
                .order('stage', { ascending: false })
                .order('kleos', { ascending: false })
                .limit(12);
            if (error) throw error;
            this.board = data || [];
        } catch (e) { this.board = []; }
        if (this.scene === 'over' || this.scene === 'select') this.renderUI();
    },

    // ---------- UI ----------

    say(line) {
        this.log.push(line);
        if (this.log.length > 3) this.log.shift();
    },

    wait(ms) { return new Promise(r => setTimeout(r, ms)); },

    shuffle(a) {
        const c = [...a];
        for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
        return c;
    },

    esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; },

    renderUI() {
        if (!this.dom) return;
        const f = {
            select: () => this.uiSelect(),
            battle: () => this.uiBattle(),
            boon:   () => this.uiBoon(),
            over:   () => this.uiOver(),
            board:  () => this.uiBoard()
        }[this.scene];
        this.dom.ui.innerHTML = f ? f() : '';
        this.bindUI();
    },

    uiSelect() {
        return `<div class="il-panel il-select">
            <h2>WRATH</h2>
            <p class="il-sub">Choose a hero. Fight the foes they faced, in the order Homer gives them.</p>
            <div class="il-heroes">
                ${this.ROSTER.map(h => `
                    <button class="il-hero" data-hero="${h.id}">
                        <canvas width="96" height="120" data-portrait="${h.id}"></canvas>
                        <span class="il-hero-name">${h.name}</span>
                        <span class="il-hero-ep">${this.esc(h.epithet)}</span>
                        <span class="il-hero-god">${this.esc(h.patron)}</span>
                        <span class="il-hero-blurb">${this.esc(h.blurb)}</span>
                    </button>`).join('')}
            </div>
            <button class="il-btn il-ghost" data-scene="board">View the Leaderboard</button>
        </div>`;
    },

    uiBattle() {
        const h = this.hero, f = this.foe;
        const canUlt = this.favour >= 100;
        const st = w => Object.keys(w.status).map(k => `<span class="il-tag il-${k}">${k}</span>`).join('');
        return `<div class="il-hud">
            <div class="il-bar il-foe-bar">
                <div class="il-bar-name">${this.esc(f.name)} <small>${this.esc(f.book)}</small></div>
                <div class="il-hp"><div class="il-hp-fill" style="width:${Math.max(0, f.hp / f.maxHp * 100)}%"></div></div>
                <div class="il-tags">${st(f)}<span class="il-tag il-type" style="background:${this.TYPES[f.type].colour}">${this.TYPES[f.type].name}</span></div>
            </div>
            <div class="il-bar il-hero-bar">
                <div class="il-bar-name">${this.esc(h.name)} <small>${h.hp}/${h.maxHp}</small></div>
                <div class="il-hp"><div class="il-hp-fill hero" style="width:${Math.max(0, h.hp / h.maxHp * 100)}%"></div></div>
                <div class="il-favour"><div class="il-favour-fill" style="width:${this.favour}%"></div><span>FAVOUR OF ${this.esc(h.patron).toUpperCase()}</span></div>
                <div class="il-tags">${st(h)}</div>
            </div>
        </div>
        <div class="il-log">${this.log.map(l => `<div>${this.esc(l)}</div>`).join('')}</div>
        <div class="il-moves ${this.busy || this.turn !== 'hero' ? 'busy' : ''}">
            ${h.moves.map((m, i) => `
                <button class="il-move" data-move="${i}" ${this.busy ? 'disabled' : ''}>
                    <span class="il-move-name">${this.esc(m.name)}</span>
                    <span class="il-move-meta"><em style="color:${this.TYPES[m.type].colour}">${this.TYPES[m.type].name}</em> ${m.power ? m.power + ' pow' : 'support'} · ${m.acc}%</span>
                </button>`).join('')}
            <button class="il-move il-ult ${canUlt ? 'ready' : ''}" data-ult ${canUlt && !this.busy ? '' : 'disabled'}>
                <span class="il-move-name">★ ${this.esc(h.ultimate.name)}</span>
                <span class="il-move-meta">${canUlt ? 'The god is listening' : 'Favour ' + this.favour + '/100'}</span>
            </button>
        </div>`;
    },

    uiBoon() {
        return `<div class="il-panel">
            <h2>${this.esc(this.hero.name)} prevails</h2>
            <p class="il-sub">+${this.lastGain} kleos · ${this.stage} of ${this.GAUNTLET[this.hero.id].length} foes fallen</p>
            <p class="il-sub">A god takes an interest. Accept one gift.</p>
            <div class="il-boons">
                ${this.boonChoices.map(b => `
                    <button class="il-boon" data-boon="${b.id}">
                        <span class="il-boon-god">${this.esc(b.god)}</span>
                        <span class="il-boon-name">${this.esc(b.name)}</span>
                        <span class="il-boon-desc">${this.esc(b.desc)}</span>
                    </button>`).join('')}
            </div>
        </div>`;
    },

    uiOver() {
        const total = this.GAUNTLET[this.hero.id].length;
        return `<div class="il-panel">
            <h2>${this.victory ? 'The song is finished' : 'Darkness covered his eyes'}</h2>
            <p class="il-sub">${this.victory
                ? `${this.esc(this.hero.name)} has faced every foe the poem gave him.`
                : `${this.esc(this.hero.name)} fell to ${this.esc(this.foe.name)} at the ${this.ordinal(this.stage + 1)} trial.`}</p>
            <div class="il-score"><span>${this.kleos}</span><small>KLEOS · ${this.stage}/${total} foes</small></div>
            ${this.boardTable()}
            <div class="il-row">
                <button class="il-btn" data-scene="select">Sing it again</button>
            </div>
        </div>`;
    },

    uiBoard() {
        return `<div class="il-panel">
            <h2>Leaderboard</h2>
            <p class="il-sub">Glory is what survives the man.</p>
            ${this.boardTable()}
            <div class="il-row"><button class="il-btn" data-scene="select">Back</button></div>
        </div>`;
    },

    boardTable() {
        const rows = this.board || [];
        if (!rows.length) return '<p class="il-sub">No runs recorded yet. Be the first.</p>';
        return `<table class="il-board">
            <tr><th></th><th>Player</th><th>Hero</th><th>Foes</th><th>Kleos</th></tr>
            ${rows.map((r, i) => `<tr class="${i === 0 ? 'top' : ''}">
                <td>${i + 1}</td>
                <td>${this.esc(r.username)}${r.victory ? ' 👑' : ''}</td>
                <td>${this.esc(r.hero)}</td>
                <td>${r.stage}</td>
                <td>${r.kleos}</td>
            </tr>`).join('')}
        </table>`;
    },

    ordinal(n) {
        return ['first','second','third','fourth','fifth','sixth','seventh','eighth'][n - 1] || (n + 'th');
    },

    bindUI() {
        const q = s => this.container.querySelectorAll(s);
        q('[data-hero]').forEach(b => b.addEventListener('click', () => this.startRun(b.dataset.hero)));
        q('[data-move]').forEach(b => b.addEventListener('click', () => this.useMove(+b.dataset.move)));
        q('[data-ult]').forEach(b => b.addEventListener('click', () => this.useUltimate()));
        q('[data-boon]').forEach(b => b.addEventListener('click', () => this.takeBoon(b.dataset.boon)));
        q('[data-scene]').forEach(b => b.addEventListener('click', () => {
            this.scene = b.dataset.scene;
            if (this.scene === 'select') { this.hero = null; this.foe = null; }
            this.renderUI();
        }));
        // Portraits in the select screen use the same renderer as the battle.
        q('[data-portrait]').forEach(cv => {
            const h = this.ROSTER.find(x => x.id === cv.dataset.portrait);
            const c = cv.getContext('2d');
            c.imageSmoothingEnabled = false;
            c.save(); c.scale(1.7, 1.7);
            this.drawWarrior(c, h.palette, 'ready', 1, 28, 68, 0);
            c.restore();
        });
    },

    // ---------- rendering ----------
    //
    // One renderer, many poses. Each warrior is drawn from parts whose offsets
    // and angles come from the pose table, so a new stance costs a few numbers
    // rather than a new sprite sheet.

    POSES: {
        ready:  { lean: 0,   armF:-0.5, armB: 0.4, spear:-0.35, shield: 0,  bob: 1,   knee: 0 },
        attack: { lean: 0.22,armF:-1.5, armB: 0.9, spear:-1.45, shield: 3,  bob: 0,   knee: 3 },
        cast:   { lean:-0.12,armF:-2.4, armB:-2.1, spear:-2.5,  shield:-2,  bob: 2,   knee: 0 },
        hurt:   { lean:-0.3, armF: 0.5, armB: 0.8, spear: 0.6,  shield: 4,  bob: 0,   knee: 2 },
        win:    { lean:-0.05,armF:-2.2, armB: 0.2, spear:-2.2,  shield:-1,  bob: 1.5, knee: 0 },
        fallen: { lean: 1.35,armF: 1.2, armB: 1.0, spear: 1.4,  shield: 6,  bob: 0,   knee: 8 }
    },

    // A limb: a rotated rect, drawn pixel-hard.
    _limb(ctx, x, y, w, len, angle, fill, shade) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = shade || fill;
        ctx.fillRect(-w / 2, 0, w, len);
        ctx.fillStyle = fill;
        ctx.fillRect(-w / 2, 0, w - 1, len - 1);
        ctx.restore();
    },

    drawWarrior(ctx, pal, poseName, facing, cx, groundY, t) {
        const P = this.POSES[poseName] || this.POSES.ready;
        const breathe = Math.sin(t * 2.4) * P.bob * 0.5;
        const fallen = poseName === 'fallen';

        ctx.save();
        ctx.translate(cx, groundY);
        ctx.scale(facing, 1);
        if (fallen) { ctx.rotate(-P.lean); ctx.translate(-6, 6); }
        else ctx.rotate(P.lean * 0.12);

        const hipY = -26 + breathe;
        const shoulderY = -44 + breathe;

        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(0, 1, 13, 3.5, 0, 0, Math.PI * 2); ctx.fill();

        // cape behind, drifting
        const sway = Math.sin(t * 1.7) * 2;
        ctx.fillStyle = pal.cape;
        ctx.beginPath();
        ctx.moveTo(-3, shoulderY + 2);
        ctx.lineTo(-13 - sway, hipY + 10);
        ctx.lineTo(-6 - sway * 0.5, hipY + 12);
        ctx.lineTo(2, shoulderY + 4);
        ctx.closePath(); ctx.fill();

        // legs (greaves)
        this._limb(ctx, -4, hipY, 6, 24 - P.knee, 0.10 + P.knee * 0.03, pal.skin, '#00000033');
        this._limb(ctx,  4, hipY, 6, 24 - P.knee, -0.14 - P.knee * 0.02, pal.skin, '#00000033');
        ctx.fillStyle = pal.metal;
        ctx.fillRect(-7, hipY + 15, 6, 5);
        ctx.fillRect(2, hipY + 15, 6, 5);

        // tunic
        ctx.fillStyle = pal.tunic;
        ctx.fillRect(-9, hipY - 2, 18, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        ctx.fillRect(-9, hipY + 6, 18, 2);

        // cuirass
        ctx.fillStyle = pal.armour;
        ctx.fillRect(-9, shoulderY, 18, 20);
        ctx.fillStyle = pal.trim;
        ctx.fillRect(-9, shoulderY, 18, 3);
        ctx.fillRect(-9, shoulderY + 17, 18, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(3, shoulderY + 3, 6, 14);        // form shading
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(-8, shoulderY + 4, 4, 12);

        // back arm + shield
        this._limb(ctx, -7, shoulderY + 4, 5, 15, P.armB, pal.skin, '#00000033');
        const shx = -13 - P.shield, shy = shoulderY + 6;
        ctx.fillStyle = pal.shield;
        ctx.beginPath(); ctx.arc(shx, shy, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = pal.trim;
        ctx.beginPath(); ctx.arc(shx, shy, 11, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = pal.trim; ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.arc(shx, shy, 4, 0, Math.PI * 2); ctx.fill();

        // front arm + spear
        this._limb(ctx, 7, shoulderY + 4, 5, 14, P.armF, pal.skin, '#00000033');
        ctx.save();
        ctx.translate(9, shoulderY + 6);
        ctx.rotate(P.spear);
        ctx.fillStyle = '#7a5a34';
        ctx.fillRect(-1.5, -30, 3, 46);
        ctx.fillStyle = pal.metal;
        ctx.beginPath();
        ctx.moveTo(0, -38); ctx.lineTo(4, -28); ctx.lineTo(-4, -28);
        ctx.closePath(); ctx.fill();
        ctx.restore();

        // head
        ctx.fillStyle = pal.skin;
        ctx.fillRect(-5, shoulderY - 11, 10, 11);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(2, shoulderY - 11, 3, 11);

        // helmet: dome, nose guard, cheek pieces, crest
        ctx.fillStyle = pal.armour;
        ctx.fillRect(-6, shoulderY - 14, 12, 7);
        ctx.fillRect(-6, shoulderY - 8, 3, 7);        // cheek
        ctx.fillRect(3, shoulderY - 8, 3, 7);
        ctx.fillRect(-1, shoulderY - 8, 2, 6);        // nose guard
        ctx.fillStyle = pal.trim;
        ctx.fillRect(-6, shoulderY - 14, 12, 2);
        // eyes in the shadow of the helm
        ctx.fillStyle = '#1a1420';
        ctx.fillRect(-4, shoulderY - 6, 2, 2);
        ctx.fillRect(1, shoulderY - 6, 2, 2);

        // horsehair crest, animated
        ctx.fillStyle = pal.crest;
        for (let i = 0; i < 9; i++) {
            const w = 3 - Math.abs(i - 4) * 0.25;
            const drift = Math.sin(t * 3 + i * 0.5) * 1.2;
            ctx.fillRect(-5 + i * 1.2, shoulderY - 20 - Math.sin(i / 8 * Math.PI) * 5 + drift, w, 7);
        }
        ctx.restore();
    },

    drawBackground(ctx, t) {
        const stage = this.foe;
        // Sky shifts with the setting: river, walls, plain.
        const river = stage && stage.name === 'Scamander';
        const divine = stage && stage.divine;
        const top = river ? '#25506b' : divine ? '#4b3a6b' : '#5d7fa8';
        const g = ctx.createLinearGradient(0, 0, 0, this.H);
        g.addColorStop(0, top);
        g.addColorStop(0.55, river ? '#6aa3b5' : divine ? '#c9a0b8' : '#e0c99a');
        g.addColorStop(1, river ? '#8fbfcc' : '#d9b47e');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.W, this.H);

        // sun
        ctx.fillStyle = 'rgba(255,240,200,0.5)';
        ctx.beginPath(); ctx.arc(300, 48, 20, 0, Math.PI * 2); ctx.fill();

        // distant Troy
        ctx.fillStyle = river ? '#2f5f72' : '#8a7a63';
        for (let i = 0; i < 8; i++) {
            const x = 20 + i * 46, h = 22 + ((i * 37) % 18);
            ctx.fillRect(x, 108 - h, 30, h);
            ctx.fillRect(x + 6, 104 - h, 18, 6);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, 104, this.W, 6);

        // ground
        ctx.fillStyle = river ? '#4f93a8' : '#c2a06a';
        ctx.fillRect(0, 110, this.W, this.H - 110);
        ctx.fillStyle = river ? '#3f7f94' : '#b08f5c';
        for (let i = 0; i < 40; i++) {
            const x = (i * 61 + Math.floor(t * (river ? 24 : 0))) % (this.W + 40) - 20;
            const y = 126 + (i * 29) % 74;
            ctx.fillRect(x, y, 14, 2);
        }
    },

    _draw() {
        const ctx = this.ctx, t = this._t;
        if (this.scene !== 'battle' && this.scene !== 'boon') {
            // a quiet plain behind the menus
            const g = ctx.createLinearGradient(0, 0, 0, this.H);
            g.addColorStop(0, '#2b2340'); g.addColorStop(1, '#6b4a52');
            ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
            ctx.fillStyle = 'rgba(255,220,160,0.10)';
            for (let i = 0; i < 60; i++) {
                const x = (i * 97) % this.W, y = (i * 53) % this.H;
                ctx.fillRect(x, y, 1, 1);
            }
            return;
        }

        ctx.save();
        if (this.shake > 0) {
            ctx.translate((Math.random() - 0.5) * 6 * this.shake, (Math.random() - 0.5) * 5 * this.shake);
            this.shake = Math.max(0, this.shake - 0.05);
        }
        this.drawBackground(ctx, t);
        if (this.foe)  this.drawWarrior(ctx, this.foe.palette,  this.foePose,  -1, 278, 108, t);
        if (this.hero) this.drawWarrior(ctx, this.hero.palette, this.heroPose,  1, 104, 190, t);
        ctx.restore();

        if (this.flash > 0) {
            ctx.fillStyle = `rgba(255,240,190,${this.flash * 0.75})`;
            ctx.fillRect(0, 0, this.W, this.H);
            this.flash = Math.max(0, this.flash - 0.045);
        }
    },

    _fit() {
        const cw = this.container.clientWidth, ch = this.container.clientHeight;
        if (!cw || !ch) return;
        // Leave room for the HUD and the move buttons; the panel scrolls if not.
        const s = Math.max(1, Math.min((cw - 24) / this.W, (ch * 0.34) / this.H));
        this.dom.canvas.style.width = Math.floor(this.W * s) + 'px';
        this.dom.canvas.style.height = Math.floor(this.H * s) + 'px';
    },

    _loop() {
        if (!this.mounted) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        this._t += dt;
        this._draw();
        this._fit();
        this._raf = requestAnimationFrame(this._loop);
    }
};
