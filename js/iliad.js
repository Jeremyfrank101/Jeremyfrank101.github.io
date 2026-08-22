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
    W: 640, H: 360,          // internal resolution, integer-scaled up to fit

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
            palette: { skin:'#c78b52', tunic:'#d6c8a4', armour:'#c9992f', trim:'#f7e9a8', cape:'#a8341f', crest:'#f0dc9a', shield:'#c79a34', metal:'#b9c2cb' },
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
              prelude:{ lead:"Achilles has come back to the fighting. Patroclus is dead in Hector's armour, and the man who stayed by his ships for nineteen books is on the plain again with a shield made by a god. The Trojans break in front of him. This one does not run.", about:"Son of Otrynteus and a mountain nymph, lord of Hyde under snowy Tmolus. Homer gives him a home and a father in the same breath that kills him \u2014 the poem does that for the men who die first." },
              line:'First of the Trojans to meet him at the ford.' },
            { name:'Aeneas', epithet:'son of Aphrodite', book:'Book XX', hp:92, atk:19, def:16, spd:14, type:'spirit',
              palette:{ skin:'#c58f5c', tunic:'#b7546a', armour:'#d9c07a', trim:'#f0dda0', cape:'#8e3450', crest:'#f2d9e0', shield:'#c9a86a', metal:'#dfe5ec' },
              moves:[{name:'Boulder Cast',type:'might',power:24,acc:82},{name:'Divine Blood',type:'spirit',power:20,acc:95,effect:'heal'},{name:'Ancestral Guard',type:'spirit',power:0,acc:100,effect:'guard'}],
              prelude:{ lead:"Apollo puts it in his mind to stand. Aeneas has met Achilles before, on Ida, and ran; he knows what he is doing and does it anyway, trading genealogies across the space between them before either throws.", about:"Son of Anchises and Aphrodite, and the one man here the poem will not let die. Poseidon lifts him out of the fight himself, because it is fated that he survive and his line rule after." },
              line:'Fated to survive this war and found another city.' },
            { name:'Lycaon', epithet:'son of Priam, unransomed', book:'Book XXI', hp:64, atk:14, def:9, spd:18, type:'guile',
              palette:{ skin:'#c08a58', tunic:'#cfc3a0', armour:'#a98f5f', trim:'#c9b071', cape:'#6f5a3a', crest:'#ddd2ae', shield:'#a3854f', metal:'#c8cfd8' },
              moves:[{name:'Supplication',type:'guile',power:10,acc:100,effect:'daze'},{name:'Desperate Lunge',type:'might',power:26,acc:74},{name:'Flee Along the Bank',type:'guile',power:14,acc:96,effect:'evade'}],
              prelude:{ lead:"Achilles has driven half of Troy into the Scamander. A young man climbs out of the water unarmed and clasps his knees \u2014 the same man Achilles captured once before and sold to Lemnos, ransomed home only twelve days ago.", about:"Son of Priam by Laothoe. His plea is the most famous in the poem, and the answer is Achilles' coldest line: Patroclus died, who was far better than you." },
              line:'He clasps the knees of the man who once sold him into slavery.' },
            { name:'Asteropaeus', epithet:'grandson of the river Axius', book:'Book XXI', hp:88, atk:20, def:13, spd:19, type:'guile',
              palette:{ skin:'#b98454', tunic:'#4f8a7a', armour:'#7fb0a2', trim:'#a8d2c6', cape:'#2f5c52', crest:'#cfe8e0', shield:'#6f9c90', metal:'#cdd6dd' },
              moves:[{name:'Two Spears at Once',type:'might',power:28,acc:82},{name:'River-Blood',type:'spirit',power:18,acc:95,effect:'heal'},{name:'Ambidextrous Feint',type:'guile',power:22,acc:90,effect:'expose'}],
              prelude:{ lead:"The river is choked with bodies and something in it is angry. A Paeonian steps out of the current where the water runs deepest, and this one throws with both hands at once.", about:"Grandson of the river Axius, and the only ambidextrous spearman in the Iliad. He draws blood from Achilles \u2014 the only mortal in the poem to manage it." },
              line:'He throws with both hands at once. No other man in the poem can.' },
            { name:'Scamander', epithet:'the river, risen in anger', book:'Book XXI', hp:120, atk:22, def:20, spd:10, type:'spirit', divine:true,
              palette:{ skin:'#6fa8c0', tunic:'#3d7f9c', armour:'#5fa3bd', trim:'#9fd6e8', cape:'#255f7a', crest:'#bfe6f2', shield:'#4a8fa8', metal:'#a8d4e4' },
              moves:[{name:'Flood the Plain',type:'spirit',power:26,acc:90,effect:'daze'},{name:'Drowning Surge',type:'might',power:30,acc:82},{name:'Choked with Dead',type:'guile',power:20,acc:95,effect:'burn'}],
              prelude:{ lead:"Too many dead in the water. The river itself rises, speaks, and comes after Achilles across the plain in a wall, and for once he runs.", about:"A god, not a man: the river that waters Troy. He is beaten only when Hephaestus sets the plain on fire and boils him back into his banks." },
              line:'The river itself rears up, clogged with the bodies he has thrown in.' },
            { name:'Agenor', epithet:'wearing Apollo\'s likeness', book:'Book XXI', hp:80, atk:18, def:14, spd:24, type:'guile',
              palette:{ skin:'#d7b071', tunic:'#e8d9a8', armour:'#f0d98a', trim:'#fff2c4', cape:'#c9a24a', crest:'#fff6d8', shield:'#e0c46a', metal:'#f2f6fa' },
              moves:[{name:'Divine Misdirection',type:'guile',power:22,acc:96,effect:'evade'},{name:'Far-Shot Arrow',type:'guile',power:24,acc:90},{name:'Phantom Retreat',type:'spirit',power:0,acc:100,effect:'guard'}],
              prelude:{ lead:"Alone in front of the Scaean Gate, one Trojan decides to stand so the rest can get inside. Then Apollo takes his shape and leads Achilles a long way off across the plain, and by the time the trick is seen the gates are shut.", about:"Son of Antenor. His stand buys Troy an afternoon; the god who wears his face buys it an hour more." },
              line:'Apollo takes his shape and leads Achilles on a chase across the plain.' },
            { name:'Hector', epithet:'tamer of horses', book:'Book XXII', hp:130, atk:23, def:19, spd:17, type:'might', boss:true,
              palette:{ skin:'#c98b57', tunic:'#3f6fa8', armour:'#b9c2cc', trim:'#7f8b99', cape:'#2f4f86', crest:'#e0e6ee', shield:'#8fa3bd', metal:'#dde4ec' },
              moves:[{name:'Breaker of Ranks',type:'might',power:27,acc:95},{name:'Hurled Boulder',type:'might',power:34,acc:80,effect:'daze'},{name:'Wall of Ilium',type:'spirit',power:0,acc:100,effect:'guard'},{name:'Last Stand',type:'spirit',power:38,acc:85,effect:'rage'}],
              prelude:{ lead:"The gates are shut and Hector is on the wrong side of them. His father begs from the wall, his mother bares her breast to him, and he stays. Three times around the city they run before Athena, wearing his brother's face, stops him.", about:"Breaker of horses, and the only thing between Troy and the sea. He is the best man in the poem and he knows he is going to lose." },
              line:'Three times around the walls he ran. Now he turns and sets his feet.' }
        ],
        hector: [
            { name:'Protesilaus', epithet:'first ashore, first to fall', book:'Book II', hp:66, atk:15, def:10, spd:16, type:'might',
              palette:{ skin:'#c08a58', tunic:'#b04a3a', armour:'#c9ccd2', trim:'#9aa0a8', cape:'#7a2f24', crest:'#e2e6ea', shield:'#a8adb5', metal:'#d2d8de' },
              moves:[{name:'Leap from the Ship',type:'might',power:20,acc:90},{name:'Doomed Courage',type:'spirit',power:22,acc:85,effect:'rage'},{name:'Sword Cut',type:'might',power:16,acc:96}],
              prelude:{ lead:"The fleet is beached and nobody will jump. The prophecy says the first man ashore dies first. One man goes over the side anyway.", about:"Of Phylace, newly married with a house half built. Homer notes the wife left tearing her cheeks before he notes the killing." },
              line:'He knew the prophecy: the first man ashore dies. He jumped anyway.' },
            { name:'Ajax the Greater', epithet:'bulwark of the Achaeans', book:'Book VII', hp:118, atk:22, def:22, spd:9, type:'might',
              palette:{ skin:'#bf8a52', tunic:'#7f6a45', armour:'#8f7a4a', trim:'#c0a468', cape:'#5c4a2c', crest:'#d8c48a', shield:'#6f5c38', metal:'#c9cfd6' },
              moves:[{name:'Tower Shield',type:'spirit',power:0,acc:100,effect:'guard'},{name:'Seven-Hide Bash',type:'might',power:30,acc:85,effect:'daze'},{name:'Hurled Stone',type:'might',power:26,acc:84}],
              prelude:{ lead:"Hector calls the whole Achaean line out, one man, any man. Nine come forward and the lot falls to Ajax. They fight until dark and the heralds part them.", about:"Bulwark of the Achaeans, a shield of seven ox-hides and bronze. The duel is a draw, and they exchange gifts at the end of it \u2014 sword for belt." },
              line:'His shield is seven ox-hides and a layer of bronze. The duel ends in gifts.' },
            { name:'Teucer', epithet:'the bowman behind the shield', book:'Book VIII', hp:74, atk:21, def:8, spd:23, type:'guile',
              palette:{ skin:'#c99259', tunic:'#5c8a4a', armour:'#7fa86a', trim:'#a8cc90', cape:'#3d6634', crest:'#c8e0b0', shield:'#6f9459', metal:'#cbd3da' },
              moves:[{name:'Arrow from Cover',type:'guile',power:26,acc:92},{name:'Rapid Volley',type:'guile',power:16,acc:100,effect:'burn'},{name:'Duck Behind Ajax',type:'guile',power:0,acc:100,effect:'guard'}],
              prelude:{ lead:"From behind his brother's shield, an archer is picking the Trojan line apart one man at a time. Hector goes to find him with a stone.", about:"Half-brother to Ajax and the best bowman in the army. He shoots, then ducks back behind the shield like a child behind its mother \u2014 Homer's simile, not ours." },
              line:'He shoots, then hides behind his brother\'s shield like a child behind its mother.' },
            { name:'Patroclus', epithet:'in the armour of Achilles', book:'Book XVI', hp:112, atk:24, def:16, spd:20, type:'spirit',
              palette:{ skin:'#cf9a63', tunic:'#e8dcc0', armour:'#e6c15a', trim:'#f5e6a8', cape:'#b8452f', crest:'#f2e3b0', shield:'#d9b451', metal:'#cfd6dd' },
              moves:[{name:'Borrowed Glory',type:'spirit',power:28,acc:90,effect:'rage'},{name:'Rout the Trojans',type:'might',power:26,acc:92},{name:'Three Times He Charged',type:'might',power:34,acc:80,effect:'recoil'}],
              prelude:{ lead:"He borrowed the armour to frighten the Trojans off the ships and was told to come straight back. He did not come straight back. Apollo strikes the helmet from his head at the wall, and then it is only a matter of who reaches him first.", about:"Achilles' companion, wearing Achilles' armour, and the death that brings Achilles back to the war. Killing him is the worst thing Hector ever does for Troy." },
              line:'Apollo strikes the helmet from his head before Hector ever reaches him.' },
            { name:'Achilles', epithet:'swift-footed, and grieving', book:'Book XXII', hp:135, atk:27, def:16, spd:24, type:'might', boss:true,
              palette:{ skin:'#d9a06b', tunic:'#e8dcc0', armour:'#e6c15a', trim:'#f5e6a8', cape:'#b8452f', crest:'#f2e3b0', shield:'#d9b451', metal:'#cfd6dd' },
              moves:[{name:'Pelian Ash Spear',type:'might',power:32,acc:95},{name:'Swift-Footed Rush',type:'guile',power:22,acc:100,effect:'first'},{name:'Wrath',type:'might',power:46,acc:78,effect:'recoil'},{name:'Grief for Patroclus',type:'spirit',power:30,acc:90,effect:'rage'}],
              prelude:{ lead:"He has run three times around his own city and stopped running. Athena has just tricked him into standing. He asks for a pact over the body and is refused.", about:"Swift-footed, son of a goddess, in armour a god made. He has been waiting the whole poem for this and it takes him one throw." },
              line:'He has not eaten. He has not slept. He is not quite a man any more.' }
        ],
        diomedes: [
            { name:'Pandarus', epithet:'who broke the truce', book:'Book V', hp:72, atk:18, def:9, spd:21, type:'guile',
              palette:{ skin:'#c08a58', tunic:'#8a6a9c', armour:'#a888bd', trim:'#c8a8d8', cape:'#5c3f70', crest:'#dcc8e8', shield:'#96769f', metal:'#cbd3da' },
              moves:[{name:'Oathbreaker\'s Arrow',type:'guile',power:24,acc:92},{name:'Aimed at the Belt',type:'guile',power:28,acc:80},{name:'Boast',type:'spirit',power:12,acc:100,effect:'rage'}],
              prelude:{ lead:"The truce is holding. Athena talks a Trojan archer into breaking it with one arrow at Menelaus, and the war that could have ended in a duel starts again in earnest.", about:"The archer who broke the oath. Diomedes finds him in the press later and puts a spear through his mouth." },
              line:'His arrow broke the truce and began the killing again.' },
            { name:'Aeneas', epithet:'son of Aphrodite', book:'Book V', hp:94, atk:19, def:17, spd:14, type:'spirit',
              palette:{ skin:'#c58f5c', tunic:'#b7546a', armour:'#d9c07a', trim:'#f0dda0', cape:'#8e3450', crest:'#f2d9e0', shield:'#c9a86a', metal:'#dfe5ec' },
              moves:[{name:'Stand Over the Body',type:'spirit',power:0,acc:100,effect:'guard'},{name:'Spear of Anchises',type:'might',power:24,acc:90},{name:'Divine Blood',type:'spirit',power:20,acc:95,effect:'heal'}],
              prelude:{ lead:"Apollo puts it in his mind to stand. Aeneas has met Achilles before, on Ida, and ran; he knows what he is doing and does it anyway, trading genealogies across the space between them before either throws.", about:"Son of Anchises and Aphrodite, and the one man here the poem will not let die. Poseidon lifts him out of the fight himself, because it is fated that he survive and his line rule after." },
              line:'Diomedes crushes his hip with a stone two living men could not carry.' },
            { name:'Aphrodite', epithet:'laughter-loving, out of her element', book:'Book V', hp:78, atk:14, def:12, spd:26, type:'spirit', divine:true,
              palette:{ skin:'#f0c8a8', tunic:'#f2a8c0', armour:'#f8d0e0', trim:'#fff0f6', cape:'#e07fa8', crest:'#fff4f8', shield:'#f2bcd2', metal:'#ffe8f0' },
              moves:[{name:'Rescue Her Son',type:'guile',power:0,acc:100,effect:'evade'},{name:'Girdle of Desire',type:'spirit',power:22,acc:95,effect:'daze'},{name:'Immortal Ichor',type:'spirit',power:16,acc:100,effect:'heal'}],
              prelude:{ lead:"Athena has taken the mist from Diomedes' eyes so he can tell god from man, and told him to leave the gods alone \u2014 except one. Aeneas goes down; his mother comes to carry him off the field.", about:"The goddess of love, out of her element and bleeding ichor from the wrist. She goes home to Olympus crying and is told by her own mother to stay away from wars." },
              line:'She is the goddess of love and has no business here. He cuts her wrist.' },
            { name:'Apollo', epithet:'the Far-Shooter', book:'Book V', hp:118, atk:24, def:20, spd:22, type:'guile', divine:true,
              palette:{ skin:'#f2d9a8', tunic:'#f0e2b0', armour:'#f8e08a', trim:'#fff8d0', cape:'#d9a83a', crest:'#fff6d8', shield:'#e8c860', metal:'#fff2c8' },
              moves:[{name:'Silver Bow',type:'guile',power:28,acc:92},{name:'Beware, Son of Tydeus',type:'spirit',power:26,acc:95,effect:'daze'},{name:'Divine Rebuke',type:'spirit',power:32,acc:85}],
              prelude:{ lead:"Diomedes has the wounded Aeneas at his mercy and lunges a fourth time at the god shielding him. A voice tells him to think, mortal, and give way.", about:"The Far-Shooter, and the god most against the Achaeans. Even Diomedes, with his sight cleared, is not allowed this one." },
              line:'"Think, son of Tydeus, and give way. Never match yourself against gods."' },
            { name:'Ares', epithet:'the bane of mortals', book:'Book V', hp:140, atk:27, def:18, spd:16, type:'might', divine:true, boss:true,
              palette:{ skin:'#c07a5a', tunic:'#8a2f2f', armour:'#a83a3a', trim:'#d95c4a', cape:'#5c1f1f', crest:'#f0806a', shield:'#8f2f2f', metal:'#d8dee6' },
              moves:[{name:'Brazen Spear',type:'might',power:32,acc:90},{name:'Shout of Ten Thousand',type:'spirit',power:28,acc:95,effect:'daze'},{name:'War Incarnate',type:'might',power:40,acc:80,effect:'rage'},{name:'Immortal Recovery',type:'spirit',power:0,acc:100,effect:'heal'}],
              prelude:{ lead:"Athena climbs into the chariot beside him, takes the reins herself, and puts the cap of Hades on so the war-god cannot see who is driving. Then she guides the spear.", about:"The war-god, fighting for Troy. He takes the wound in the belly and bellows like ten thousand men, and Zeus tells him he is the most hateful of all the gods on Olympus." },
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
        // Painted art, if any has been added. Resolves before the first fight
        // because the roster and prelude screens come first; until then, and
        // for ever if there is no manifest, the procedural renderer draws.
        if (typeof Sprites !== 'undefined') Sprites.load();
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
            <div class="il-stage"><canvas class="il-canvas" width="${this.W}" height="${this.H}"></canvas></div>
            <div class="il-ui"></div>
        </div>`;
        this.dom = {
            root: this.container.querySelector('.il-root'),
            stage: this.container.querySelector('.il-stage'),
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
        // The duel is preceded by what led to it. This is the part of the
        // Iliad that makes the fight mean anything.
        this.scene = src.prelude ? 'prelude' : 'battle';
        this.turn = 'hero';
        this.heroPose = 'ready';
        this.foePose = 'ready';
        this._poses = null;
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
                this.hitAt(side === 'hero' ? 'foe' : 'hero');
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
            prelude:() => this.uiPrelude(),
            battle: () => this.uiBattle(),
            boon:   () => this.uiBoon(),
            over:   () => this.uiOver(),
            board:  () => this.uiBoard()
        }[this.scene];
        this.dom.ui.innerHTML = f ? f() : '';
        // Menus want the full width; a battle wants the split layout.
        this.dom.root.classList.toggle('il-menu', this.scene !== 'battle');
        this.dom.root.classList.toggle('il-reading', this.scene === 'prelude');
        this._fitW = null;   // force a re-measure, the box just changed
        this.bindUI();
    },

    uiSelect() {
        return `<div class="il-panel il-select">
            <h2>WRATH</h2>
            <p class="il-sub">Choose a hero. Fight the foes they faced, in the order Homer gives them.</p>
            <div class="il-heroes">
                ${this.ROSTER.map(h => `
                    <button class="il-hero" data-hero="${h.id}">
                        <canvas width="132" height="186" data-portrait="${h.id}"></canvas>
                        <span class="il-hero-name">${h.name}</span>
                        <span class="il-hero-ep">${this.esc(h.epithet)}</span>
                        <span class="il-hero-god">${this.esc(h.patron)}</span>
                        <span class="il-hero-blurb">${this.esc(h.blurb)}</span>
                    </button>`).join('')}
            </div>
            <button class="il-btn il-ghost" data-scene="board">View the Leaderboard</button>
        </div>`;
    },

    // ---------- before the duel ----------

    uiPrelude() {
        const f = this.foe, p = f.prelude || {};
        const n = this.stage + 1, of = this.GAUNTLET[this.hero.id].length;
        return `<div class="il-panel il-prelude">
            <div class="il-pre-kicker">${this.esc(f.book)} · duel ${n} of ${of}</div>
            <h2>${this.esc(f.name)}</h2>
            <p class="il-sub">${this.esc(f.epithet)}</p>
            <p class="il-pre-lead">${this.esc(p.lead || f.line)}</p>
            <div class="il-pre-about">
                <span class="il-pre-label">Who he is</span>
                <p>${this.esc(p.about || '')}</p>
            </div>
            <div class="il-pre-stats">
                <span class="il-tag il-${f.type}">${this.TYPES[f.type].name}</span>
                <span>${f.hp} HP</span><span>${f.atk} atk</span><span>${f.def} def</span><span>${f.spd} spd</span>
                ${f.divine ? '<span class="il-tag il-divine">a god</span>' : ''}
                ${f.boss ? '<span class="il-tag il-divine">the last</span>' : ''}
            </div>
            <button class="il-btn il-primary" data-fight>Take up the spear</button>
        </div>`;
    },

    // The scene behind the prelude: the two of them, in silhouette, on the
    // ground they are about to fight over. Drawn by the same renderer as the
    // battle, so it is the actual pair rather than stock art.
    _drawPrelude(ctx, t) {
        this.drawBackground(ctx, t);
        const MF = this.MARKS.foe, MH = this.MARKS.hero;
        this.drawWarrior(ctx, this.foe.palette, 'ready', -1, MF.x, MF.y, t, 'foe',
            { scale: MF.scale, id: this.foe.name });
        this.drawWarrior(ctx, this.hero.palette, 'ready', 1, MH.x, MH.y, t, 'hero',
            { scale: MH.scale, id: this.hero.name });
        // push it back so the words carry
        const g = ctx.createLinearGradient(0, 0, 0, this.H);
        g.addColorStop(0, 'rgba(18,10,24,0.55)');
        g.addColorStop(1, 'rgba(18,10,24,0.25)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
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
        q('[data-fight]').forEach(b => b.addEventListener('click', () => {
            this.scene = 'battle';
            this.renderUI();
        }));
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
            this.drawWarrior(c, h.palette, 'ready', 1, 64, 182, 0, null, { scale: 0.95, id: h.name });
        });
    },

    // ---------- rendering ----------
    //
    // Nothing here loads an image. Warriors are assembled from parts whose
    // offsets and angles come from the pose table; the backdrops are cached
    // procedural layers scrolled at different rates; and the lighting is done
    // with composite operations rather than shaders — a rim light subtracted
    // from the real silhouette, a cool bounce on the shadow side, and a bloom
    // pass that only bright pixels survive.

    HORIZON: 186,            // where the ground plane meets the sky
    SS: 3,                   // sprite supersampling: 3x the pixels, then down
    TURN: 0.76,              // horizontal squash of a body turned side-on
    SUN: [548, 58],          // key light; everything else is lit to agree with it

    POSES: {
        ready:  { lean: 0,    armF:-0.5, armB: 0.4, spear:-0.35, shield: 0,  bob: 1,   knee: 0 },
        attack: { lean: 0.24, armF:-1.5, armB: 0.9, spear:-1.45, shield: 5,  bob: 0,   knee: 5 },
        cast:   { lean:-0.14, armF:-2.4, armB:-2.1, spear:-2.5,  shield:-4,  bob: 2,   knee: 0 },
        hurt:   { lean:-0.32, armF: 0.5, armB: 0.8, spear: 0.6,  shield: 7,  bob: 0,   knee: 4 },
        win:    { lean:-0.06, armF:-2.2, armB: 0.2, spear:-2.2,  shield:-2,  bob: 1.5, knee: 0 },
        fallen: { lean: 1.35, armF: 1.2, armB: 1.0, spear: 1.4,  shield:10,  bob: 0,   knee:13 }
    },

    // ---------- colour ----------
    //
    // Flat fills read as plastic. Every material instead gets a seven-step
    // ramp whose shadows drift toward blue and whose highlights drift toward
    // warm yellow — the hue shift is what makes bronze look like bronze rather
    // than a brown rectangle. Ramps are cached; this is not per-frame work.

    _rampCache: {},

    _hexToHsl(hex) {
        const n = parseInt(hex.slice(1), 16);
        const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        let h = 0; const l = (mx + mn) / 2;
        const d = mx - mn;
        const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
        if (d !== 0) {
            if (mx === r) h = ((g - b) / d) % 6;
            else if (mx === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60; if (h < 0) h += 360;
        }
        return [h, sat, l];
    },

    _hslToHex(h, s, l) {
        h = ((h % 360) + 360) % 360;
        s = Math.max(0, Math.min(1, s));
        l = Math.max(0, Math.min(1, l));
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;
        if (h < 60)       { r = c; g = x; }
        else if (h < 120) { r = x; g = c; }
        else if (h < 180) { g = c; b = x; }
        else if (h < 240) { g = x; b = c; }
        else if (h < 300) { r = x; b = c; }
        else              { r = c; b = x; }
        const to = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
        return '#' + to(r) + to(g) + to(b);
    },

    // Rotate a hue toward an anchor, but never far. Taking the shortest path
    // to a distant anchor can swing a colour right across the wheel — gold
    // "shifted toward blue" came out red the first time. A hard cap of a few
    // degrees keeps the shift a tint rather than a change of colour.
    _toward(h, anchor, maxDeg) {
        const d = ((anchor - h + 540) % 360) - 180;
        return h + Math.max(-maxDeg, Math.min(maxDeg, d));
    },

    ramp(hex) {
        if (this._rampCache[hex]) return this._rampCache[hex];
        const [h, s, l] = this._hexToHsl(hex);
        const cool = 250, warm = 48;     // shadow anchor, highlight anchor
        const r = {
            sh3:  this._hslToHex(this._toward(h, cool, 22), Math.min(1, s * 1.30 + 0.06), Math.max(0.04, l * 0.34)),
            sh2:  this._hslToHex(this._toward(h, cool, 16), Math.min(1, s * 1.22 + 0.04), Math.max(0.05, l * 0.52)),
            sh1:  this._hslToHex(this._toward(h, cool, 8),  Math.min(1, s * 1.10 + 0.02), Math.max(0.08, l * 0.76)),
            base: hex,
            li1:  this._hslToHex(this._toward(h, warm, 7),  s * 0.94, Math.min(0.93, l * 1.13 + 0.04)),
            li2:  this._hslToHex(this._toward(h, warm, 13), s * 0.82, Math.min(0.96, l * 1.24 + 0.09)),
            li3:  this._hslToHex(this._toward(h, warm, 20), s * 0.62, Math.min(0.99, l * 1.38 + 0.18))
        };
        this._rampCache[hex] = r;
        return r;
    },

    _rgba(hex, a) {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    },

    // Blend two hex colours. Used for atmospheric haze, where distant things
    // are pulled toward the colour of the air between us and them.
    _mix(a, b, t) {
        const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
        const f = (sh) => Math.round((((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t));
        return '#' + [16, 8, 0].map(sh => f(sh).toString(16).padStart(2, '0')).join('');
    },

    // ---------- parts ----------
    //
    // The key light sits upper-right with the sun, so every rounded form is
    // lit on its right and falls to core shadow on its left.

    // A limb: a rotated capsule banded across its width, dark at the far end
    // so knees, elbows and ankles read as joints rather than as tube ends.
    _limb(ctx, x, y, w, len, angle, hex) {
        const R = this.ramp(hex), hw = w / 2;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = R.sh2;  ctx.fillRect(-hw, 0, w, len);
        ctx.fillStyle = R.sh1;  ctx.fillRect(-hw + 1, 0, w - 2, len);
        ctx.fillStyle = R.base; ctx.fillRect(-hw + 2, 0, w - 4, len);
        ctx.fillStyle = R.li1;  ctx.fillRect(hw - 4, 2, 2, len - 5);
        ctx.fillStyle = R.li2;  ctx.fillRect(hw - 4, 3, 1, Math.max(0, len - 9));
        ctx.fillStyle = R.sh3;  ctx.fillRect(-hw, len - 3, w, 3);
        ctx.restore();
    },

    // A slab shaded as a cylinder: shadow edge, body, light band, rim.
    _slab(ctx, x, y, w, h, hex, opts = {}) {
        const R = this.ramp(hex);
        ctx.fillStyle = R.sh2;  ctx.fillRect(x, y, w, h);
        ctx.fillStyle = R.sh1;  ctx.fillRect(x + 1, y, w - 2, h);
        ctx.fillStyle = R.base; ctx.fillRect(x + 2, y, w - 3, h - 1);
        if (!opts.flat) {
            ctx.fillStyle = R.li1; ctx.fillRect(x + w - 5, y + 1, 3, h - 3);
            ctx.fillStyle = R.li2; ctx.fillRect(x + w - 4, y + 2, 1, h - 5);
            ctx.fillStyle = R.sh3; ctx.fillRect(x, y + h - 3, w, 3);
        }
        if (opts.top) { ctx.fillStyle = R.li3; ctx.fillRect(x + 2, y, w - 4, 1); }
    },

    // The sculpted bronze cuirass: shoulders wide, waist drawn in, with
    // pectorals and a run of abdominal ridges cut into it. Greek muscle armour
    // was literally an idealised torso in metal, so the highlights follow
    // anatomy rather than the rectangle.
    _cuirass(b, pal, shoulderY, hipY) {
        const A = this.ramp(pal.armour), T = this.ramp(pal.trim);
        const top = shoulderY, bot = hipY + 5;
        const SW = 17, WW = 12;                       // half-widths: shoulder, waist
        const plate = (i, style) => {
            b.fillStyle = style;
            b.beginPath();
            b.moveTo(-SW + i, top + i);
            b.lineTo(SW - i,  top + i);
            b.quadraticCurveTo(SW - i, top + (bot - top) * 0.55, WW - i, bot - i);
            b.lineTo(-WW + i, bot - i);
            b.quadraticCurveTo(-SW + i, top + (bot - top) * 0.55, -SW + i, top + i);
            b.closePath(); b.fill();
        };
        plate(0, A.sh2);
        plate(1, A.sh1);
        plate(2, A.base);

        // pectorals — two domes just under the collar
        const pecY = top + 11;
        for (const sx of [-7.5, 7.5]) {
            b.fillStyle = A.sh1;
            b.beginPath(); b.ellipse(sx, pecY, 7.5, 5.5, 0, 0, Math.PI * 2); b.fill();
            b.fillStyle = A.base;
            b.beginPath(); b.ellipse(sx + 1, pecY - 1, 6.5, 4.5, 0, 0, Math.PI * 2); b.fill();
        }
        b.fillStyle = A.li1;
        b.beginPath(); b.ellipse(9, pecY - 2, 3.5, 2.4, 0, 0, Math.PI * 2); b.fill();
        b.fillStyle = A.sh2; b.fillRect(-1, top + 6, 2, 12);        // sternum
        b.fillStyle = A.sh2; b.fillRect(-15, top + 7, 4, 20);       // core shadow, off-light side

        // abdominal ridges, narrowing as they run down to the waist
        for (let i = 0; i < 4; i++) {
            const y = pecY + 8 + i * 6;
            const w = 10 - i * 1.4;
            b.fillStyle = A.sh2; b.fillRect(-w, y, w * 2, 1.4);
            b.fillStyle = A.li1; b.fillRect(-w + 1, y + 1.6, w * 2 - 2, 1);
        }

        // specular running down the lit edge, brightest where the form turns
        b.fillStyle = A.li2; b.fillRect(11, top + 5, 3, bot - top - 14);
        b.fillStyle = A.li3; b.fillRect(12, top + 8, 1, bot - top - 22);

        // collar and waist trim
        b.fillStyle = T.sh1;  b.fillRect(-SW, top, SW * 2, 4);
        b.fillStyle = T.base; b.fillRect(-SW, top, SW * 2, 3);
        b.fillStyle = T.li2;  b.fillRect(-SW + 1, top, SW * 2 - 2, 1);
        b.fillStyle = T.base; b.fillRect(-WW - 1, bot - 4, WW * 2 + 2, 4);
        b.fillStyle = T.li1;  b.fillRect(-WW - 1, bot - 4, WW * 2 + 2, 1);
    },

    // Pteruges: the skirt of stiffened leather strips that hangs from the
    // cuirass. They swing a little behind the body, which sells the weight.
    _pteruges(b, pal, hipY, t, swing) {
        const L = this.ramp(pal.tunic);
        for (let i = 0; i < 7; i++) {
            const u = (i - 3) / 3;
            const x = -13 + i * 3.8;
            const lag = swing * (1 + u * 0.4) + Math.sin(t * 2.1 + i * 0.7) * 0.8;
            const len = 17 - Math.abs(u) * 3.5;
            b.fillStyle = L.sh2;  b.fillRect(x, hipY + 1, 4, len);
            b.fillStyle = L.base; b.fillRect(x + lag * 0.25, hipY + 1, 3, len - 1);
            b.fillStyle = L.li1;  b.fillRect(x + lag * 0.25 + 2, hipY + 2, 1, len - 5);
            b.fillStyle = L.sh3;  b.fillRect(x + lag * 0.3, hipY + len, 3, 2);
        }
    },

    // A Corinthian helmet: full dome, nasal bar, cheek pieces, and the narrow
    // eye slots that are the whole reason the thing is so recognisable. It is
    // deliberately close to the skull — an oversized helmet is what makes a
    // heroic figure read as a bobblehead.
    _helmet(b, pal, headY) {
        const A = this.ramp(pal.armour), T = this.ramp(pal.trim);
        const cy = headY + 2;                          // dome centre
        b.fillStyle = A.sh2;
        b.beginPath(); b.arc(0, cy, 9.5, Math.PI, 0); b.fill();
        b.fillRect(-9.5, cy, 19, 8);
        b.fillStyle = A.sh1;
        b.beginPath(); b.arc(0.5, cy - 0.5, 8.5, Math.PI, 0); b.fill();
        b.fillRect(-8.5, cy, 17, 7);
        b.fillStyle = A.base;
        b.beginPath(); b.arc(1, cy - 1, 7.5, Math.PI, 0); b.fill();
        b.fillRect(-7, cy, 15, 6);

        // cheek pieces sweep down past the jaw, leaving the face open between
        b.fillStyle = A.sh1;  b.fillRect(-9.5, cy + 3, 4, 11);
        b.fillStyle = A.base; b.fillRect(-9, cy + 3, 3, 10);
        b.fillStyle = A.sh1;  b.fillRect(5.5, cy + 3, 4, 11);
        b.fillStyle = A.base; b.fillRect(5.5, cy + 3, 3, 10);
        b.fillStyle = A.li1;  b.fillRect(8, cy + 4, 1, 8);
        b.fillStyle = A.sh2;  b.fillRect(-9.5, cy + 12, 4, 2);
        b.fillStyle = A.sh2;  b.fillRect(5.5, cy + 12, 4, 2);

        b.fillStyle = A.sh1;  b.fillRect(-1.5, cy + 3, 3, 10);      // nasal bar
        b.fillStyle = A.base; b.fillRect(-1, cy + 3, 2, 9);
        b.fillStyle = A.li1;  b.fillRect(0.5, cy + 4, 0.6, 7);

        // brow shadow, then the eye slots with one catchlight so there is
        // somebody inside the bronze
        b.fillStyle = 'rgba(18,10,24,0.5)'; b.fillRect(-6, cy + 2, 12, 2);
        // Turned side-on, the far eye slot is all but hidden and the near one
        // does the looking. Two equal eyes is what made the figure stare out
        // of the screen instead of at the man opposite.
        b.fillStyle = '#120c18';
        b.fillRect(2.2, cy + 4, 3.6, 2.8);
        b.globalAlpha = 0.45; b.fillRect(-4.4, cy + 4, 2.4, 2.6); b.globalAlpha = 1;
        b.fillStyle = 'rgba(255,236,190,0.8)'; b.fillRect(4.4, cy + 4, 1.2, 1.2);

        // dome highlight and the trim band the crest is socketed into
        b.fillStyle = A.li2;
        b.beginPath(); b.arc(2.5, cy - 2.5, 4.5, Math.PI * 1.12, Math.PI * 1.76);
        b.lineTo(2.5, cy - 2.5); b.fill();
        b.fillStyle = A.li3; b.fillRect(3, cy - 7, 1.4, 3);
        b.fillStyle = T.base; b.fillRect(-9.5, cy + 1, 19, 1.6);
        b.fillStyle = T.li2;  b.fillRect(-9.5, cy + 1, 19, 0.8);
        return cy;
    },

    // Horsehair crest: an arcing plume rooted on the dome, drawn as a solid
    // banded shape with strands combed over it. Drawing it as strands alone
    // just filled in to a slab; the shape has to come first, texture second.
    _crest(b, pal, cy, t, lagX, len = 1) {
        // Horsehair was dyed, so the plume takes its colour from the fighter's
        // cloak rather than staying the pale bone of the helmet trim — which
        // also stops it washing out to white under the rim light.
        const C = this.ramp(this._mix(pal.crest, pal.cape, 0.42));
        const sway = lagX * 26;
        // spine of the plume: brow -> up over the dome -> down past the nape
        const pt = u => {
            const x = 7 - u * 27 + sway * u * u;
            const y = cy - 8 - Math.sin(Math.min(1, u * 0.94) * Math.PI * 0.98) * 25 * len + u * u * 16;
            return [x, y];
        };
        const thick = u => 4 + Math.sin(Math.min(1, u * 1.15) * Math.PI) * 8;

        const band = (off, style) => {
            b.fillStyle = style;
            b.beginPath();
            for (let i = 0; i <= 22; i++) {
                const u = i / 22, [x, y] = pt(u);
                if (i === 0) b.moveTo(x, y + off); else b.lineTo(x, y + off);
            }
            for (let i = 22; i >= 0; i--) {
                const u = i / 22, [x, y] = pt(u);
                b.lineTo(x, y + off + thick(u));
            }
            b.closePath(); b.fill();
        };
        band(0, C.sh1);
        band(-0.5, C.base);

        // combed strands: short ticks along the plume, lagging at the tail
        for (let i = 0; i < 30; i++) {
            const u = i / 29;
            const [x, y] = pt(u);
            const drift = Math.sin(t * 3.4 + u * 4.2) * (0.4 + u * 1.6);
            const th = thick(u);
            b.fillStyle = i % 3 === 0 ? C.li2 : i % 3 === 1 ? C.li1 : C.sh2;
            b.fillRect(x + drift, y + th * 0.15, 1.1, th * 0.8);
        }
        // lit crown along the top of the arc
        b.fillStyle = C.li3;
        for (let i = 4; i < 16; i++) {
            const u = i / 29, [x, y] = pt(u);
            b.fillRect(x, y - 0.4, 1.2, 1.4);
        }
    },

    // The hoplon, with a device on the face. Which device is decided by the
    // owner's name, so every fighter keeps the same shield every run.
    _hoplon(b, pal, cx, cy, id) {
        const S = this.ramp(pal.shield), T = this.ramp(pal.trim);
        const r = 16;
        b.fillStyle = S.sh2; b.beginPath(); b.arc(cx, cy, r, 0, Math.PI * 2); b.fill();
        b.fillStyle = S.sh1; b.beginPath(); b.arc(cx + 1, cy - 1, r - 1.5, 0, Math.PI * 2); b.fill();
        b.fillStyle = S.base; b.beginPath(); b.arc(cx + 1.5, cy - 1.5, r - 4, 0, Math.PI * 2); b.fill();

        // the device, clipped to the face so nothing spills over the rim
        b.save();
        b.beginPath(); b.arc(cx + 1.5, cy - 1.5, r - 5, 0, Math.PI * 2); b.clip();
        this._blazon(b, cx + 1, cy - 1, r - 5, pal, id);
        b.restore();

        // bronze rim, then the broad curved highlight of a domed face
        b.strokeStyle = T.base; b.lineWidth = 2.5;
        b.beginPath(); b.arc(cx, cy, r - 1, 0, Math.PI * 2); b.stroke();
        b.strokeStyle = T.li2; b.lineWidth = 1;
        b.beginPath(); b.arc(cx + 1, cy - 1, r - 1.5, Math.PI * 1.15, Math.PI * 1.8); b.stroke();
        b.fillStyle = 'rgba(255,244,214,0.16)';
        b.beginPath(); b.ellipse(cx + 5, cy - 6, 8, 5, -0.5, 0, Math.PI * 2); b.fill();
        b.fillStyle = 'rgba(30,20,40,0.22)';
        b.beginPath(); b.arc(cx - 6, cy + 6, 8, 0, Math.PI * 2); b.fill();
    },

    _blazon(b, cx, cy, r, pal, id) {
        const T = this.ramp(pal.trim), D = this.ramp(pal.armour);
        let hsh = 0;
        for (const ch of (id || 'x')) hsh = (hsh * 31 + ch.charCodeAt(0)) | 0;
        const kind = Math.abs(hsh) % 6;
        b.fillStyle = D.sh3;
        const dot = (x, y, w, h) => b.fillRect(cx + x, cy + y, w, h);

        if (kind === 0) {                     // gorgoneion — the classic
            b.beginPath(); b.arc(cx, cy, r * 0.52, 0, Math.PI * 2); b.fill();
            b.fillStyle = T.li1;
            for (let i = 0; i < 10; i++) {    // snakes
                const a = (i / 10) * Math.PI * 2;
                b.fillRect(cx + Math.cos(a) * r * 0.68 - 1, cy + Math.sin(a) * r * 0.68 - 1, 3, 3);
            }
            b.fillStyle = T.base; dot(-4, -3, 3, 3); dot(2, -3, 3, 3);
            b.fillRect(cx - 3, cy + 3, 7, 2);
        } else if (kind === 1) {              // lion rampant, blocked in
            b.fillRect(cx - 7, cy - 2, 12, 8);
            b.fillRect(cx - 9, cy - 8, 8, 8);
            b.fillRect(cx + 4, cy - 6, 4, 10);
            b.fillStyle = T.base; b.fillRect(cx - 11, cy - 10, 4, 4);
        } else if (kind === 2) {              // eagle displayed
            b.fillRect(cx - 2, cy - 8, 4, 14);
            b.beginPath();
            b.moveTo(cx - 2, cy - 5); b.lineTo(cx - r * 0.9, cy + 1);
            b.lineTo(cx - 2, cy + 3); b.closePath(); b.fill();
            b.beginPath();
            b.moveTo(cx + 2, cy - 5); b.lineTo(cx + r * 0.9, cy + 1);
            b.lineTo(cx + 2, cy + 3); b.closePath(); b.fill();
        } else if (kind === 3) {              // running waves
            for (let i = 0; i < 4; i++) {
                b.beginPath();
                b.arc(cx - 8 + i * 6, cy - 6 + i * 4, 5, Math.PI, 0);
                b.lineWidth = 2; b.strokeStyle = D.sh3; b.stroke();
            }
        } else if (kind === 4) {              // eight-rayed star
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                b.save(); b.translate(cx, cy); b.rotate(a);
                b.fillRect(-1.5, -r * 0.85, 3, r * 0.85); b.restore();
            }
            b.fillStyle = T.li1; b.beginPath(); b.arc(cx, cy, 3, 0, Math.PI * 2); b.fill();
        } else {                              // boar
            b.fillRect(cx - 8, cy - 3, 15, 8);
            b.fillRect(cx + 5, cy - 6, 6, 7);
            b.fillStyle = T.li1;
            b.fillRect(cx + 10, cy - 3, 4, 2);
            b.fillStyle = D.sh3;
            b.fillRect(cx - 9, cy + 5, 3, 4); b.fillRect(cx + 3, cy + 5, 3, 4);
        }
    },

    // ---------- pose state ----------
    //
    // Poses used to snap. Each fighter now carries an interpolated pose that
    // eases toward the target, plus springs for the cape and crest so they lag
    // the body and settle after it stops — that secondary motion is most of
    // what separates "puppet" from "alive".

    _poseState(key) {
        if (!this._poses) this._poses = {};
        if (!this._poses[key]) {
            this._poses[key] = { ...this.POSES.ready, capeV: 0, capeX: 0, crestV: 0, crestX: 0, prevLean: 0 };
        }
        return this._poses[key];
    },

    _advancePose(key, target, dt) {
        const st = this._poseState(key);
        const T = this.POSES[target] || this.POSES.ready;
        // Snappy into a strike, softer on the way back — anticipation reads
        // better when the outgoing motion is faster than the return.
        const goingOut = target === 'attack' || target === 'cast' || target === 'hurt';
        const k = Math.min(1, dt * (goingOut ? 22 : 9));
        for (const p of ['lean','armF','armB','spear','shield','bob','knee']) {
            st[p] += (T[p] - st[p]) * k;
        }
        const drive = (st.lean - st.prevLean) * 90;
        st.prevLean = st.lean;
        st.capeV  += (-st.capeX * 46 - st.capeV * 7.5 - drive * 1.6) * dt;
        st.capeX  += st.capeV * dt;
        st.crestV += (-st.crestX * 70 - st.crestV * 8.5 - drive * 1.1) * dt;
        st.crestX += st.crestV * dt;
        return st;
    },

    // A stable set of proportions per fighter. Derived from the name so it
    // never changes between runs, and nudged by hand for the ones Homer
    // actually describes: Ajax huge, Teucer slight, Tydeus's son thickset.
    BUILDS: {
        'Ajax the Greater': { h: 1.10, w: 1.18, crest: 1.15 },
        'Achilles':         { h: 1.06, w: 1.00, crest: 1.30 },
        'Hector':           { h: 1.03, w: 1.08, crest: 1.10 },
        'Diomedes':         { h: 0.98, w: 1.12, crest: 0.95 },
        'Teucer':           { h: 0.95, w: 0.88, crest: 0.70 },
        'Lycaon':           { h: 0.92, w: 0.86, crest: 0.60 },
        'Patroclus':        { h: 1.04, w: 1.00, crest: 1.25 },
        'Scamander':        { h: 1.14, w: 1.22, crest: 1.40 },
        'Ares':             { h: 1.12, w: 1.20, crest: 1.35 },
        'Apollo':           { h: 1.05, w: 0.94, crest: 1.20 },
        'Aphrodite':        { h: 0.94, w: 0.84, crest: 1.05 }
    },

    _build(id) {
        if (this.BUILDS[id]) return this.BUILDS[id];
        let h = 0;
        for (const ch of String(id || 'x')) h = (h * 31 + ch.charCodeAt(0)) | 0;
        const n = Math.abs(h);
        return { h: 0.94 + (n % 13) / 100, w: 0.92 + (n % 17) / 90, crest: 0.8 + (n % 11) / 22 };
    },

    drawWarrior(ctx, pal, poseName, facing, cx, groundY, t, key, opts = {}) {
        const P = key ? this._advancePose(key, poseName, this._dt || 0.016)
                      : { ...(this.POSES[poseName] || this.POSES.ready), capeX: 0, crestX: 0 };
        const id = opts.id || key || 'x';

        // Render to a buffer so the rim light can be derived from the real
        // silhouette rather than guessed per part.
        // Sized to the measured union of every settled pose, plus room for the
        // outline dilation. The fallen pose reaches 156 left of the feet and 49
        // below them; the raised spear of `win` reaches 185 above.
        // Drawn at triple resolution and composited down. Every coordinate
        // below is still in figure units; SS only changes how many device
        // pixels each of those units gets, which is what turns a blocky
        // silhouette into something with actual modelling in it.
        const SS = this.SS;
        const BW = 250 * SS, BH = 248 * SS, ox = 160, oy = 190;
        if (!this._buf) {
            const mk = () => {
                const c = document.createElement('canvas');
                c.width = BW; c.height = BH;
                return c;
            };
            this._buf = mk(); this._bufCtx = this._buf.getContext('2d');
            this._rim = mk(); this._rimCtx = this._rim.getContext('2d');
            this._bounce = mk();
            this._outline = mk();
        }
        // If painted art has been supplied for this character, it stands in
        // here and the whole procedural body below is skipped. Missing art is
        // the normal case: Sprites.frame returns null and nothing changes.
        const frame = (typeof Sprites !== 'undefined' && !opts.procedural)
            ? Sprites.frame(id, poseName) : null;
        if (frame) {
            return this._drawSpriteWarrior(ctx, frame, P, poseName, facing,
                                           cx, groundY, t, opts, ox, oy, BW, BH);
        }

        const b = this._bufCtx;
        b.clearRect(0, 0, BW, BH);
        b.imageSmoothingEnabled = true;
        b.save();
        b.scale(SS, SS);
        b.translate(ox, oy);

        const fallen = poseName === 'fallen';
        if (fallen) { b.rotate(-P.lean); b.translate(-10, 10); }
        else b.rotate(P.lean * 0.12);

        // Turn to a three-quarter stance facing the enemy. Squaring up to the
        // camera made two men ignore each other across a battlefield; a
        // shoulders-in figure with the far limbs set back reads as a duel.
        // Everything after this is drawn in the turned frame.
        if (!fallen) b.scale(this.TURN * this._build(id).w, 1);

        // Proportions, ground at y=0. A heroic figure is about seven and a
        // half heads tall; the first pass here was three and a half, which is
        // why it read as a toy. Every landmark below is derived from that.
        // Build varies by who this is, so the silhouettes differ before any
        // colour does: Ajax is a wall, Teucer is a bowman, Achilles is tall.
        const B = this._build(id);
        const breathe = Math.sin(t * 2.4) * P.bob * 0.8;
        const hipY = (-68 * B.h) + breathe;
        const shoulderY = (-110 * B.h) + breathe;
        const headY = (-128 * B.h) + breathe;  // top of the skull
        const swing = P.capeX * 18;

        // ---- cape, behind everything ----
        const capeR = this.ramp(pal.cape);
        const sway = Math.sin(t * 1.7) * 2.6 + P.capeX * 42;
        const capeTop = shoulderY + 4;
        const hem = -16;                        // falls to mid-calf
        b.fillStyle = capeR.sh2;
        b.beginPath();
        b.moveTo(-6, capeTop);
        b.quadraticCurveTo(-22 - sway, hipY - 10, -27 - sway * 1.3, hem);
        b.lineTo(-4 - sway * 0.5, hem + 4);
        b.quadraticCurveTo(-3, hipY - 10, 4, capeTop + 2);
        b.closePath(); b.fill();
        b.fillStyle = capeR.sh1;
        b.beginPath();
        b.moveTo(-6, capeTop + 1);
        b.quadraticCurveTo(-19 - sway * 0.85, hipY - 10, -23 - sway * 1.1, hem - 3);
        b.lineTo(-6 - sway * 0.45, hem);
        b.quadraticCurveTo(-3, hipY - 10, 3, capeTop + 3);
        b.closePath(); b.fill();
        // folds: bands that follow the sway, so the cloth has volume
        for (let i = 0; i < 4; i++) {
            const u = i / 3;
            const xt = -7 - u * (15 + sway * 0.9);
            b.fillStyle = i % 2 ? capeR.base : capeR.sh2;
            b.beginPath();
            b.moveTo(xt, capeTop + 3 + u * 3);
            b.quadraticCurveTo(xt - 5 - sway * 0.4, hipY - 6, xt - 6 - sway * 0.6, hem - 2 - u * 3);
            b.lineTo(xt - 1 - sway * 0.5, hem - 1 - u * 3);
            b.quadraticCurveTo(xt + 1, hipY - 6, xt + 3.5, capeTop + 3 + u * 3);
            b.closePath(); b.fill();
        }
        // a lit edge where the cloth turns over toward the sun
        b.fillStyle = capeR.li1;
        b.beginPath();
        b.moveTo(3, capeTop + 3);
        b.quadraticCurveTo(-1, hipY - 8, -4 - sway * 0.4, hem + 2);
        b.lineTo(-6 - sway * 0.4, hem + 2);
        b.quadraticCurveTo(-3, hipY - 8, 1, capeTop + 3);
        b.closePath(); b.fill();

        // ---- legs ----
        // Legs run from the hip to the top of the foot, so a bent knee shortens
        // the stride rather than lifting the fighter off the ground.
        const legLen = (-5) - hipY - P.knee * 0.35;
        // far leg first, set back and in shadow; near leg over it
        b.save(); b.globalAlpha = 0.82;
        this._limb(b, -11, hipY, 10, legLen - 1, 0.16 + P.knee * 0.03, this._mix(pal.skin, '#2a1c14', 0.3));
        b.restore();
        this._limb(b,  6, hipY, 11, legLen, -0.10 - P.knee * 0.02, pal.skin);
        // knee highlights
        const skinR = this.ramp(pal.skin);
        b.fillStyle = skinR.li1;
        b.fillRect(-6, hipY + legLen * 0.46, 4, 3);
        b.fillRect(10, hipY + legLen * 0.46, 4, 3);
        // Greaves. Pulled toward the armour colour rather than raw `metal`:
        // bright steel here reads as a pair of white socks against the skin.
        const greave = this._mix(pal.metal, pal.armour, 0.62);
        this._slab(b, -14, hipY + legLen - 30, 11, 25, greave, { top: true });
        this._slab(b,   4, hipY + legLen - 30, 11, 25, greave, { top: true });
        // sandals
        // The sole sits exactly on y = 0, which is the ground. It used to stop
        // five units short, and with the contact shadow drawn at +1 the whole
        // figure read as hovering an inch above the plain.
        const sole = this.ramp('#5a4028');
        const footTop = -5, footH = 5;
        b.fillStyle = sole.base; b.fillRect(-15, footTop, 14, footH);
        b.fillStyle = sole.base; b.fillRect(3, footTop, 14, footH);
        b.fillStyle = sole.sh2;  b.fillRect(-15, footTop + footH - 1.5, 14, 1.5);
        b.fillStyle = sole.sh2;  b.fillRect(3, footTop + footH - 1.5, 14, 1.5);

        // ---- skirt, back arm, body ----
        this._pteruges(b, pal, hipY, t, swing);
        b.save(); b.globalAlpha = 0.85;
        this._limb(b, -14, shoulderY + 9, 8, 34, P.armB + 0.12, this._mix(pal.skin, '#2a1c14', 0.28));
        b.restore();
        this._cuirass(b, pal, shoulderY, hipY);

        // shoulder guards, sitting on the ends of the collar
        this._slab(b, -20, shoulderY + 1, 9, 10, pal.armour, { top: true });
        this._slab(b,  11, shoulderY + 1, 9, 10, pal.armour, { top: true });

        // ---- neck and head ----
        b.fillStyle = skinR.sh2; b.fillRect(-4, shoulderY - 6, 8, 8);       // neck
        b.fillStyle = skinR.sh1; b.fillRect(-3, shoulderY - 6, 6, 8);
        // the skull sits forward of the neck on a turned figure
        b.fillStyle = skinR.sh2;  b.fillRect(-5, headY, 14, 20);
        b.fillStyle = skinR.sh1;  b.fillRect(-4, headY, 12, 19);
        b.fillStyle = skinR.base; b.fillRect(-3, headY + 1, 10, 18);
        b.fillStyle = skinR.li1;  b.fillRect(4, headY + 3, 2.5, 9);
        b.fillStyle = skinR.li2;  b.fillRect(7, headY + 5, 1.6, 6);   // brow ridge, leading edge
        b.fillStyle = skinR.sh2;  b.fillRect(-7, headY + 15, 14, 3);        // jaw shadow
        // beard
        const beard = this.ramp(this._mix(pal.crest, '#3b2a1e', 0.6));
        b.fillStyle = beard.base; b.fillRect(-6, headY + 11, 12, 8);
        b.fillStyle = beard.sh1;  b.fillRect(-6, headY + 16, 12, 3);
        b.fillStyle = beard.li1;  b.fillRect(3, headY + 12, 1.6, 5);

        const helmY = this._helmet(b, pal, headY);

        // ---- hoplon on the back arm ----
        this._hoplon(b, pal, -25 - P.shield, shoulderY + 14, id);

        // ---- front arm and spear ----
        // The spear hangs off the hand rather than off a fixed point on the
        // torso, so it stays in the grip through every pose instead of
        // drifting across the chest when the arm swings.
        const AX = 13, AY = shoulderY + 9, ALEN = 32;
        this._limb(b, AX, AY, 9, ALEN, P.armF, pal.skin);
        const handX = AX - ALEN * Math.sin(P.armF);
        const handY = AY + ALEN * Math.cos(P.armF);
        const backHandX = -12 - 34 * Math.sin(P.armB);
        const backHandY = shoulderY + 9 + 34 * Math.cos(P.armB);
        const fist = (fx, fy) => {
            b.fillStyle = skinR.sh2;  b.fillRect(fx - 4.5, fy - 3.5, 9, 8);
            b.fillStyle = skinR.base; b.fillRect(fx - 3.5, fy - 3.5, 7, 7);
            b.fillStyle = skinR.li1;  b.fillRect(fx + 1.5, fy - 2.5, 2, 4);
        };
        fist(backHandX, backHandY);

        b.save();
        b.translate(handX, handY);
        b.rotate(P.spear * 0.42);              // held close to upright at rest
        const shaft = this.ramp('#7a5a34'), tip = this.ramp(pal.metal);
        b.fillStyle = shaft.sh2;  b.fillRect(-2.5, -84, 5, 142);
        b.fillStyle = shaft.sh1;  b.fillRect(-2.5, -84, 4, 142);
        b.fillStyle = shaft.base; b.fillRect(-1.5, -84, 2, 142);
        b.fillStyle = shaft.li1;  b.fillRect(0.5, -82, 1, 138);
        b.fillStyle = shaft.sh3;  b.fillRect(-2.5, -6, 5, 12);              // bound grip
        b.fillStyle = tip.sh1; b.fillRect(-3, -88, 6, 5);                   // socket
        b.fillStyle = tip.sh1;                                              // blade
        b.beginPath(); b.moveTo(0, -105); b.lineTo(6, -84); b.lineTo(-6, -84); b.closePath(); b.fill();
        b.fillStyle = tip.base;
        b.beginPath(); b.moveTo(0, -103); b.lineTo(4.2, -85); b.lineTo(-4.2, -85); b.closePath(); b.fill();
        b.fillStyle = tip.li3;
        b.beginPath(); b.moveTo(0, -100); b.lineTo(2, -86); b.lineTo(-0.6, -86); b.closePath(); b.fill();
        b.fillStyle = tip.sh2; b.fillRect(-2, 52, 4, 7);                    // butt-spike
        b.restore();
        fist(handX, handY);

        this._crest(b, pal, helmY, t, P.crestX, this._build(id).crest);
        b.restore();

        this._compositeWarrior(ctx, { facing, cx, groundY, t, opts, ox, oy, BW, BH,
                                      lighting: 'engine' });
    },

    // Everything from a filled buffer to pixels on the stage: the derived
    // lighting passes, the contact shadow, the reflection, the downsample and
    // the haze. Shared by the procedural renderer and the sprite renderer, so
    // painted art gets the same grounding and atmosphere for free.
    //
    // `lighting: 'engine'` derives rim, bounce and outline from the silhouette.
    // Painted art usually arrives with its highlights already in it and passes
    // 'baked', which skips them — running them over lit art doubles every
    // highlight and is the usual way a sprite swap looks worse than what it
    // replaced.
    _compositeWarrior(ctx, a) {
        const { facing, cx, groundY, t, opts, ox, oy, BW, BH } = a;
        const SS = this.SS;
        const lit = a.lighting === 'engine';

        if (lit) this._derivedLighting(BW, BH, opts);
        else [this._rim, this._bounce, this._outline].forEach(c =>
            c.getContext('2d').clearRect(0, 0, BW, BH));

        // ---- composite ----
        const sc = opts.scale || 1;
        ctx.save();
        ctx.translate(cx, groundY);
        ctx.scale(facing * sc, sc);

        // contact shadow: tight and dark under the feet, soft further out.
        // `plain` omits it — the sprite template exporter wants the figure
        // alone on transparency, with nothing baked in that the engine adds.
        if (!opts.plain) {
            ctx.fillStyle = 'rgba(24,14,28,0.34)';
            ctx.beginPath(); ctx.ellipse(0, 2, 30, 7, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(24,14,28,0.30)';
            ctx.beginPath(); ctx.ellipse(0, 1, 17, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        }

        if (opts.reflect) this._reflect(ctx, ox, oy, BW, BH, t);

        const sm = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;      // downsampling 3x is the point
        const dw = BW / SS, dh = BH / SS;
        ctx.drawImage(this._outline, 0, 0, BW, BH, -ox, -oy, dw, dh);
        ctx.drawImage(this._buf,     0, 0, BW, BH, -ox, -oy, dw, dh);
        ctx.drawImage(this._bounce,  0, 0, BW, BH, -ox, -oy, dw, dh);
        ctx.drawImage(this._rim,     0, 0, BW, BH, -ox, -oy, dw, dh);
        ctx.imageSmoothingEnabled = sm;

        // atmospheric haze for anything standing far back
        if (opts.haze) {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = opts.haze;
            ctx.fillRect(-ox, -oy, BW / SS, BH / SS);
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
    },

    // Rim, bounce and outline, all three derived from the silhouette currently
    // in _buf rather than guessed per body part — which is why they keep
    // working whatever the pose does.
    _derivedLighting(BW, BH, opts) {
        const SS = this.SS;

        // ---- rim light ----
        // Subtracting a copy of the silhouette shifted away from the light
        // leaves exactly the lit edge, whatever shape the pose happens to be.
        const r = this._rimCtx;
        r.clearRect(0, 0, BW, BH);
        r.globalCompositeOperation = 'source-over';
        r.drawImage(this._buf, 0, 0);
        r.globalCompositeOperation = 'destination-out';
        r.drawImage(this._buf, -2 * SS, 2 * SS);     // key from upper right
        r.globalCompositeOperation = 'source-in';
        r.fillStyle = opts.rim || 'rgba(255,238,198,0.55)';
        r.fillRect(0, 0, BW, BH);
        r.globalCompositeOperation = 'source-over';

        // cool bounce on the shadow side, much fainter
        const bc = this._bounce.getContext('2d');
        bc.clearRect(0, 0, BW, BH);
        bc.globalCompositeOperation = 'source-over';
        bc.drawImage(this._buf, 0, 0);
        bc.globalCompositeOperation = 'destination-out';
        bc.drawImage(this._buf, 2.6 * SS, -1 * SS);
        bc.globalCompositeOperation = 'source-in';
        bc.fillStyle = opts.bounce || 'rgba(120,160,220,0.3)';
        bc.fillRect(0, 0, BW, BH);
        bc.globalCompositeOperation = 'source-over';

        // A dark outline dilated from the silhouette. Pixel art needs this to
        // sit on a busy background — and it is what lets the rim light read as
        // light rather than as a white sticker edge.
        const oc = this._outline.getContext('2d');
        oc.clearRect(0, 0, BW, BH);
        oc.globalCompositeOperation = 'source-over';
        for (const [dx, dy] of [[-2,0],[2,0],[0,-2],[0,2],[-1,-1],[1,1],[1,-1],[-1,1]]) {
            oc.drawImage(this._buf, dx * SS, dy * SS);
        }
        oc.globalCompositeOperation = 'source-in';
        oc.fillStyle = 'rgba(26,16,30,0.78)';
        oc.fillRect(0, 0, BW, BH);
        oc.globalCompositeOperation = 'source-over';
    },

    // Painted art standing in for the procedural figure. The frame goes into
    // the same buffer the procedural path fills, so the reflection, haze,
    // contact shadow and downsample all behave identically — the only thing
    // that changes is who painted the pixels.
    //
    // The pose table still drives the breathing, so a sprite-backed fighter is
    // not a dead sticker between turns.
    _drawSpriteWarrior(ctx, f, P, poseName, facing, cx, groundY, t, opts, ox, oy, BW, BH) {
        const SS = this.SS;
        const b = this._bufCtx;
        b.clearRect(0, 0, BW, BH);
        b.save();
        b.scale(SS, SS);
        b.translate(ox, oy);
        b.imageSmoothingEnabled = true;
        const breathe = poseName === 'fallen' ? 0 : Math.sin(t * 2.4) * P.bob * 0.8;
        // The anchor is the point in the art that belongs on the ground line
        // between the feet, which is exactly where the origin now is.
        b.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, -f.ax, -f.ay + breathe, f.dw, f.dh);
        b.restore();

        this._compositeWarrior(ctx, { facing, cx, groundY, t, opts, ox, oy, BW, BH,
                                      lighting: f.lighting === 'engine' ? 'engine' : 'baked' });
    },

    // Mirror the fighter into the water, sliced into bands so each band can be
    // pushed sideways by the ripple underneath it.
    _reflect(ctx, ox, oy, BW, BH, t) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.scale(1, -1);
        for (let y = 0; y < 130; y += 5) {
            const wob = Math.sin(t * 2.6 + y * 0.16) * (1 + y * 0.05);
            ctx.drawImage(this._buf,
                0, oy - y - 5, BW, 5,
                -ox + wob, y - 5, BW, 5);
        }
        ctx.restore();
    },

    // ---------- backdrops ----------
    //
    // The battlefield is four cached layers (sky, far hills, the walls of
    // Troy, the ground) plus whatever moves: clouds, banners, birds, water,
    // dust. Rebuilding the static layers costs a few milliseconds and happens
    // only when the setting changes.

    STAGES: {
        plain: { sky:['#3f6f9e','#8fb0c4','#e2c89a'], hill:'#6d7f93', wall:'#9a8768',
                 ground:'#c9a86e', grit:'#b08f58', haze:'#d9c39a', sun:'#fff2c8' },
        river: { sky:['#1d4a68','#5d99ad','#a8cdd4'], hill:'#2f5f72', wall:'#5d7f88',
                 ground:'#4f93a8', grit:'#3f7f94', haze:'#9dc4cc', sun:'#dff2f4' },
        divine:{ sky:['#3a2a5c','#8b5f97','#e0a48f'], hill:'#4a3a68', wall:'#7a5f82',
                 ground:'#a07a86', grit:'#8a6472', haze:'#c9a0b8', sun:'#ffd9c0' },
        walls: { sky:['#5a3a52','#b06a5a','#f0c288'], hill:'#6b4a58', wall:'#a88a68',
                 ground:'#bb8f62', grit:'#9c7148', haze:'#e0b78e', sun:'#fff0c0' }
    },

    _stageKey() {
        const f = this.foe;
        if (!f) return 'plain';
        if (f.name === 'Scamander') return 'river';
        if (f.divine) return 'divine';
        if (f.boss) return 'walls';
        return 'plain';
    },

    _layer(w, h, paint) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        paint(c.getContext('2d'), w, h);
        return c;
    },

    _buildStage(key) {
        const S = this.STAGES[key] || this.STAGES.plain;
        const W = this.W, H = this.H, HZ = this.HORIZON;
        const rnd = (seed => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)(9161);

        // --- sky: gradient, sun, and the glow that sells the sun ---
        const sky = this._layer(W, H, (g) => {
            const grad = g.createLinearGradient(0, 0, 0, HZ + 20);
            grad.addColorStop(0, S.sky[0]);
            grad.addColorStop(0.62, S.sky[1]);
            grad.addColorStop(1, S.sky[2]);
            g.fillStyle = grad; g.fillRect(0, 0, W, HZ + 20);

            const [sx, sy] = this.SUN;
            const halo = g.createRadialGradient(sx, sy, 4, sx, sy, 118);
            halo.addColorStop(0, 'rgba(255,246,214,0.6)');
            halo.addColorStop(0.2, 'rgba(255,238,190,0.2)');
            halo.addColorStop(1, 'rgba(255,230,170,0)');
            g.fillStyle = halo; g.fillRect(sx - 130, sy - 130, 260, 260);
            g.fillStyle = S.sun;
            g.beginPath(); g.arc(sx, sy, 17, 0, Math.PI * 2); g.fill();
        });

        // --- clouds: a wide strip so it can wrap without a seam ---
        // Cumulus, not smudges: a flat base with domes stacked on it, a cool
        // underside, and a lit cap offset toward the sun.
        const clouds = this._layer(W * 2, 150, (g, cw) => {
            for (let i = 0; i < 20; i++) {
                const x = rnd() * cw, y = 24 + rnd() * 84;
                const s = 0.45 + rnd() * 0.85;
                const puffs = 3 + Math.floor(rnd() * 3);
                const domes = [];
                for (let p = 0; p < puffs; p++) {
                    domes.push({
                        x: x + p * 19 * s,
                        y: y - Math.abs(Math.sin(p * 1.3)) * 7 * s,
                        r: (9 + rnd() * 7) * s
                    });
                }
                const flat = y + 4 * s;
                const blob = (dx, dy, grow) => {
                    g.beginPath();
                    for (const d of domes) {
                        g.moveTo(d.x + dx + d.r + grow, d.y + dy);
                        g.arc(d.x + dx, d.y + dy, d.r + grow, 0, Math.PI * 2);
                    }
                    g.rect(x + dx - 12 * s, flat + dy - 6 * s, puffs * 19 * s + 20 * s, 6 * s);
                    g.fill();
                };
                g.fillStyle = `rgba(150,168,200,${0.14 + rnd() * 0.08})`;  // cool underside
                blob(0, 2.5 * s, 0);
                g.fillStyle = `rgba(244,248,255,${0.30 + rnd() * 0.16})`;  // body
                blob(0, 0, -0.5);
                g.fillStyle = `rgba(255,251,236,${0.34 + rnd() * 0.2})`;   // sunlit cap
                blob(2.5 * s, -3 * s, -3.5 * s);
            }
        });

        // --- far hills: Ida, two ridges, hazed toward the sky colour ---
        const far = this._layer(W, H, (g) => {
            // Cusped peaks rather than rolling humps: abs(sin) puts a sharp
            // apex at every crest, which is what separates a mountain from a
            // sand dune. Two ridges at different frequencies keeps it from
            // repeating visibly across 640px.
            const profile = (x, baseY, amp, ph) =>
                baseY
                - Math.abs(Math.sin(x * 0.0041 + ph)) * amp
                - Math.abs(Math.sin(x * 0.0117 + ph * 2.3)) * amp * 0.38
                - Math.sin(x * 0.036 + ph) * amp * 0.07;
            const ridge = (baseY, amp, colour, ph) => {
                g.fillStyle = colour;
                g.beginPath();
                g.moveTo(0, HZ);
                for (let x = 0; x <= W; x += 4) g.lineTo(x, profile(x, baseY, amp, ph));
                g.lineTo(W, HZ); g.closePath(); g.fill();
            };
            // Distant land goes blue, toward the colour of the air in front of
            // it — pulling it toward the warm ground haze instead turns Ida
            // into a beige balloon sitting on the walls.
            const air = S.sky[1];
            ridge(HZ - 46, 40, this._mix(S.hill, air, 0.68), 0.6);
            ridge(HZ - 26, 26, this._mix(S.hill, air, 0.44), 2.4);
            // sunlit western faces on the near ridge
            g.fillStyle = 'rgba(255,246,220,0.22)';
            for (let x = 0; x <= W; x += 4) {
                const y = profile(x, HZ - 26, 26, 2.4);
                const slope = profile(x + 4, HZ - 26, 26, 2.4) - y;
                if (slope > 0.4) g.fillRect(x, y, 4, 2 + Math.min(6, slope));
            }
        });

        // --- Troy: curtain wall, towers, battlements, gate ---
        const mid = this._layer(W, H, (g) => {
            const wallTop = HZ - 34, base = HZ + 2;
            const wr = this.ramp(S.wall);
            g.fillStyle = wr.sh1; g.fillRect(0, wallTop, W, base - wallTop);
            g.fillStyle = wr.base; g.fillRect(0, wallTop + 2, W, base - wallTop - 2);
            // courses
            g.fillStyle = wr.sh2;
            for (let y = wallTop + 7; y < base; y += 7) g.fillRect(0, y, W, 1);
            for (let y = wallTop + 7, k = 0; y < base; y += 7, k++) {
                for (let x = (k % 2) * 13; x < W; x += 26) g.fillRect(x, y - 6, 1, 6);
            }
            g.fillStyle = wr.li1; g.fillRect(0, wallTop + 2, W, 2);
            // battlements
            g.fillStyle = wr.base;
            for (let x = 4; x < W; x += 18) {
                g.fillRect(x, wallTop - 8, 10, 9);
                g.fillStyle = wr.li1; g.fillRect(x, wallTop - 8, 10, 2);
                g.fillStyle = wr.base;
            }
            // the wall falls into shadow toward its foot, which is most of what
            // makes a flat rectangle read as a standing mass of stone
            const shade = g.createLinearGradient(0, wallTop, 0, base);
            shade.addColorStop(0, 'rgba(40,26,44,0)');
            shade.addColorStop(1, 'rgba(40,26,44,0.3)');
            g.fillStyle = shade; g.fillRect(0, wallTop, W, base - wallTop);

            // towers
            for (const tx of [46, 214, 392, 568]) {
                // each tower throws a shadow along the curtain wall, away from
                // the sun, which is what gives the run of stone any relief
                const sg = g.createLinearGradient(tx + 20, 0, tx + 62, 0);
                sg.addColorStop(0, 'rgba(38,24,42,0.34)');
                sg.addColorStop(1, 'rgba(38,24,42,0)');
                g.fillStyle = sg; g.fillRect(tx + 20, wallTop - 8, 42, base - wallTop + 8);
            }
            for (const tx of [46, 214, 392, 568]) {
                g.fillStyle = wr.sh1; g.fillRect(tx - 20, wallTop - 34, 40, base - wallTop + 34);
                g.fillStyle = wr.base; g.fillRect(tx - 18, wallTop - 32, 36, base - wallTop + 32);
                g.fillStyle = wr.li1; g.fillRect(tx + 10, wallTop - 32, 5, base - wallTop + 32);
                g.fillStyle = wr.sh2; g.fillRect(tx - 18, wallTop - 32, 5, base - wallTop + 32);
                g.fillStyle = wr.base;
                for (let x = tx - 18; x < tx + 18; x += 12) {
                    g.fillRect(x, wallTop - 40, 7, 9);
                    g.fillStyle = wr.li1; g.fillRect(x, wallTop - 40, 7, 2);
                    g.fillStyle = wr.base;
                }
                g.fillStyle = 'rgba(20,12,26,0.55)';
                g.fillRect(tx - 4, wallTop - 24, 8, 11);        // window
            }
            // the Scaean gate
            g.fillStyle = 'rgba(22,13,28,0.62)';
            g.beginPath();
            g.moveTo(320, base); g.lineTo(320, wallTop + 12);
            g.quadraticCurveTo(342, wallTop - 2, 364, wallTop + 12);
            g.lineTo(364, base); g.closePath(); g.fill();
            g.strokeStyle = wr.li1; g.lineWidth = 2;
            g.beginPath();
            g.moveTo(319, base); g.lineTo(319, wallTop + 12);
            g.quadraticCurveTo(342, wallTop - 4, 365, wallTop + 12);
            g.lineTo(365, base); g.stroke();
            // haze over the whole wall pushes it back in space. It has to fade
            // out before the wall's foot, or the gradient's hard end draws a
            // line across the picture exactly where the eye is looking.
            const h = g.createLinearGradient(0, wallTop - 46, 0, base - 4);
            h.addColorStop(0, this._rgba(S.haze, 0));
            h.addColorStop(1, this._rgba(this._mix(S.haze, '#ffffff', 0.12), 0.42));
            g.fillStyle = h;
            g.fillRect(0, wallTop - 46, W, base - wallTop + 42);
        });

        // --- ground: a plane whose texture thins toward the horizon ---
        const ground = this._layer(W, H, (g) => {
            const gr = this.ramp(S.ground);
            const grad = g.createLinearGradient(0, HZ, 0, H);
            grad.addColorStop(0, this._mix(S.ground, S.haze, 0.45));
            grad.addColorStop(0.35, S.ground);
            grad.addColorStop(1, gr.sh1);
            g.fillStyle = grad; g.fillRect(0, HZ, W, H - HZ);

            // Broad tonal patches first — dry ground is blotchy long before it
            // is grainy, and without this the plane stays a flat colour field.
            for (let i = 0; i < 90; i++) {
                const u = Math.pow(rnd(), 0.5);
                const y = HZ + u * (H - HZ);
                const rx = (24 + rnd() * 90) * (0.35 + u), ry = (4 + rnd() * 12) * (0.35 + u);
                g.globalAlpha = 0.05 + rnd() * 0.09;
                g.fillStyle = rnd() > 0.5 ? this._mix(S.grit, '#000000', 0.3)
                                          : this._mix(S.ground, '#fff0c8', 0.4);
                g.beginPath(); g.ellipse(rnd() * W, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
            }

            // then grit: each speck gets bigger and more contrasty as it comes
            // forward, which is all the perspective a flat plane needs
            for (let i = 0; i < 900; i++) {
                const u = Math.pow(rnd(), 0.62);
                const y = HZ + 1 + u * (H - HZ);
                const w = 1 + u * 9, hgt = 1 + u * 1.8;
                const x = rnd() * (W + 20) - 10;
                g.fillStyle = rnd() > 0.42 ? this._mix(S.grit, S.ground, rnd() * 0.6)
                                           : this._mix(S.grit, '#000000', 0.26);
                g.globalAlpha = (0.10 + u * 0.42) * (0.4 + rnd() * 0.6);
                g.fillRect(x, y, w, hgt);
            }
            // pebbles catching the light, foreground only
            for (let i = 0; i < 70; i++) {
                const u = 0.35 + rnd() * 0.65;
                const x = rnd() * W, y = HZ + u * (H - HZ), r = 1 + rnd() * 2.4;
                g.globalAlpha = 0.5;
                g.fillStyle = this._mix(S.grit, '#000000', 0.4);
                g.beginPath(); g.ellipse(x, y + r * 0.5, r * 1.5, r * 0.7, 0, 0, Math.PI * 2); g.fill();
                g.fillStyle = this._mix(S.ground, '#fff4d2', 0.5);
                g.beginPath(); g.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2); g.fill();
            }
            g.globalAlpha = 1;

            // cart ruts, converging slightly so they agree with the perspective
            g.strokeStyle = 'rgba(40,24,18,0.07)'; g.lineWidth = 3;
            for (let i = 0; i < 4; i++) {
                g.beginPath();
                const y0 = HZ + 16 + i * 11;
                g.moveTo(-30, y0 + i * 6);
                g.bezierCurveTo(W * 0.35, y0 + 14 + i * 9, W * 0.65, y0 + 4 + i * 13, W + 30, y0 + 30 + i * 22);
                g.stroke();
            }

            // a darker foreground band to frame the shot and hold the eye in
            const fg = g.createLinearGradient(0, H - 96, 0, H);
            fg.addColorStop(0, 'rgba(34,18,22,0)');
            fg.addColorStop(1, 'rgba(34,18,22,0.34)');
            g.fillStyle = fg; g.fillRect(0, H - 96, W, 96);

            // Dust hanging at the foot of the wall. Painted here rather than in
            // the wall layer so it straddles the join and there is no seam.
            const band = g.createLinearGradient(0, HZ - 30, 0, HZ + 54);
            band.addColorStop(0, this._rgba(S.haze, 0));
            band.addColorStop(0.38, this._rgba(S.haze, 0.5));
            band.addColorStop(1, this._rgba(S.haze, 0));
            g.fillStyle = band; g.fillRect(0, HZ - 30, W, 84);
        });

        // --- foreground dressing: the debris of a long war ---
        const props = this._layer(W, H, (g) => {
            const dark = t => `rgba(34,20,26,${t})`;
            // broken spears stuck in the ground
            for (const [x, y, a, len] of [[54, 330, -0.32, 74], [612, 316, 0.26, 62], [286, 352, -0.12, 50]]) {
                g.save(); g.translate(x, y); g.rotate(a);
                g.fillStyle = dark(0.55); g.fillRect(-2, -len, 5, len);
                g.fillStyle = '#6b4e2e'; g.fillRect(-1, -len, 3, len);
                g.fillStyle = '#8b929c';
                g.beginPath(); g.moveTo(0, -len - 11); g.lineTo(5, -len); g.lineTo(-5, -len); g.closePath(); g.fill();
                g.restore();
            }
            // a discarded shield, seen edge-on
            g.save(); g.translate(560, 348); g.rotate(0.5);
            g.fillStyle = dark(0.5); g.beginPath(); g.ellipse(0, 0, 26, 9, 0, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#8a7346'; g.beginPath(); g.ellipse(0, -2, 24, 8, 0, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#a98c56'; g.beginPath(); g.ellipse(-3, -4, 12, 4, 0, 0, Math.PI * 2); g.fill();
            g.restore();
            // grass tufts along the bottom edge
            for (let i = 0; i < 46; i++) {
                const x = rnd() * W, y = H - 34 - rnd() * 30;
                const hgt = 5 + rnd() * 9;
                g.strokeStyle = `rgba(${70 + rnd() * 40 | 0},${72 + rnd() * 34 | 0},44,0.5)`;
                g.lineWidth = 1.4;
                for (let k = -1; k <= 1; k++) {
                    g.beginPath(); g.moveTo(x, y);
                    g.quadraticCurveTo(x + k * 3, y - hgt * 0.6, x + k * 6, y - hgt);
                    g.stroke();
                }
            }
        });

        // --- the armies, drawn up in front of the wall ---
        // Two ranks of silhouettes and a thicket of spears. This is what makes
        // the plain read as a battlefield rather than an empty field with two
        // men on it, and it fills the dead space between the duellists.
        const ranks = this._layer(W, H, (g) => {
            const rank = (y, scale, tint, step) => {
                for (let x = -6; x < W + 10; x += step) {
                    const jit = (rnd() - 0.5) * step * 0.5;
                    const px = x + jit;
                    const hgt = (13 + rnd() * 3) * scale;
                    g.fillStyle = tint;
                    // spear, held upright, lengths varied so the line is ragged
                    g.fillRect(px + 3 * scale, y - hgt - (13 + rnd() * 9) * scale,
                               Math.max(1, 1.2 * scale), (16 + rnd() * 9) * scale);
                    // round shield seen edge-on, then the body
                    g.fillRect(px - 3 * scale, y - hgt, 6 * scale, hgt);
                    g.beginPath();
                    g.arc(px - 3.5 * scale, y - hgt * 0.62, 3.4 * scale, 0, Math.PI * 2);
                    g.fill();
                    // crest
                    g.fillRect(px - 1.5 * scale, y - hgt - 3 * scale, 4 * scale, 3 * scale);
                }
            };
            rank(HZ + 9,  0.62, 'rgba(58,44,58,0.34)', 7);
            rank(HZ + 17, 0.78, 'rgba(48,34,48,0.42)', 9);
            // dust kicked up in front of the ranks, hiding their feet
            const d = g.createLinearGradient(0, HZ + 4, 0, HZ + 32);
            d.addColorStop(0, this._rgba(S.haze, 0));
            d.addColorStop(1, this._rgba(S.haze, 0.55));
            g.fillStyle = d; g.fillRect(0, HZ + 4, W, 28);
        });

        return { key, S, sky, clouds, far, mid, ground, ranks, props };
    },

    _stage() {
        const key = this._stageKey();
        if (!this._bg || this._bg.key !== key) this._bg = this._buildStage(key);
        return this._bg;
    },

    drawBackground(ctx, t) {
        const B = this._stage(), S = B.S, W = this.W, H = this.H, HZ = this.HORIZON;
        const river = B.key === 'river';

        ctx.drawImage(B.sky, 0, 0);

        // clouds drift; two passes at different speeds gives cheap depth
        const cw = B.clouds.width;
        const off1 = (t * 5) % cw, off2 = (t * 11) % cw;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(B.clouds, -off1, 6);
        ctx.drawImage(B.clouds, cw - off1, 6);
        ctx.globalAlpha = 0.8;
        ctx.drawImage(B.clouds, -off2, 34);
        ctx.drawImage(B.clouds, cw - off2, 34);
        ctx.globalAlpha = 1;

        // god rays from the sun, breathing slowly
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(this.SUN[0], this.SUN[1]);
        for (let i = 0; i < 7; i++) {
            const a = -2.5 + i * 0.42 + Math.sin(t * 0.22 + i) * 0.035;
            const spread = 0.05 + Math.sin(t * 0.4 + i * 2) * 0.014;
            const g = ctx.createLinearGradient(0, 0, Math.cos(a) * 420, Math.sin(a) * 420);
            g.addColorStop(0, 'rgba(255,242,206,0.055)');
            g.addColorStop(1, 'rgba(255,238,190,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a - spread) * 460, Math.sin(a - spread) * 460);
            ctx.lineTo(Math.cos(a + spread) * 460, Math.sin(a + spread) * 460);
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();

        // birds, high and slow — the eye reads motion up there as scale
        ctx.strokeStyle = 'rgba(40,32,44,0.34)'; ctx.lineWidth = 1.4;
        for (let i = 0; i < 5; i++) {
            const bx = ((t * 13 + i * 137) % (W + 80)) - 40;
            const by = 34 + i * 13 + Math.sin(t * 0.7 + i) * 5;
            const flap = Math.sin(t * 5.5 + i * 1.7) * 2.6;
            ctx.beginPath();
            ctx.moveTo(bx - 4, by + flap); ctx.lineTo(bx, by);
            ctx.lineTo(bx + 4, by + flap); ctx.stroke();
        }

        ctx.drawImage(B.far, 0, 0);
        ctx.drawImage(B.mid, 0, 0);

        // banners on the towers, rippling
        for (const tx of [58, 236, 430, 592]) {
            const wallTop = HZ - 34;
            ctx.fillStyle = 'rgba(30,20,28,0.5)';
            ctx.fillRect(tx - 1, wallTop - 62, 2, 24);
            ctx.beginPath();
            ctx.moveTo(tx + 1, wallTop - 60);
            for (let k = 0; k <= 5; k++) {
                const u = k / 5;
                ctx.lineTo(tx + 1 + u * 20, wallTop - 60 + Math.sin(t * 3.4 + u * 3.4 + tx) * 2.4 * u + u * 2);
            }
            for (let k = 5; k >= 0; k--) {
                const u = k / 5;
                ctx.lineTo(tx + 1 + u * 20, wallTop - 48 + Math.sin(t * 3.4 + u * 3.4 + tx) * 2.4 * u + u * 2);
            }
            ctx.closePath();
            ctx.fillStyle = B.key === 'walls' ? 'rgba(196,74,58,0.85)' : 'rgba(150,120,84,0.7)';
            ctx.fill();
        }

        // smoke from behind the walls
        ctx.globalAlpha = 0.14;
        for (let i = 0; i < 4; i++) {
            const sxp = 130 + i * 150;
            const rise = (t * 9 + i * 40) % 120;
            ctx.fillStyle = '#2b2029';
            ctx.beginPath();
            ctx.ellipse(sxp + Math.sin(t * 0.5 + i) * 12, HZ - 40 - rise,
                        16 + rise * 0.32, 9 + rise * 0.2, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.drawImage(B.ground, 0, 0);
        ctx.drawImage(B.ranks, 0, 0);

        if (river) {
            // moving water: bright crests near the horizon, longer swells close up
            ctx.save();
            for (let i = 0; i < 54; i++) {
                const u = i / 54;
                const y = HZ + 6 + Math.pow(u, 1.7) * (H - HZ);
                const speed = 12 + u * 70;
                const x = ((i * 137 + t * speed) % (W + 90)) - 45;
                const w = 10 + u * 46;
                ctx.fillStyle = i % 3 === 0 ? 'rgba(226,246,252,0.34)' : 'rgba(150,206,222,0.26)';
                ctx.fillRect(x, y, w, 1 + u * 2);
            }
            // the sun's glitter path
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 34; i++) {
                const u = i / 34;
                const y = HZ + 4 + Math.pow(u, 1.8) * (H - HZ);
                const jitter = Math.sin(t * 3 + i * 2.2) * (10 + u * 60);
                ctx.fillStyle = `rgba(255,244,206,${0.30 * (1 - u * 0.6)})`;
                ctx.fillRect(470 + jitter - u * 20, y, 6 + u * 22, 1 + u * 2);
            }
            ctx.restore();
            ctx.globalCompositeOperation = 'source-over';
        }

        ctx.drawImage(B.props, 0, 0);

        // heat shimmer over the sand: shift thin slices of the ground sideways
        if (!river) {
            for (let y = HZ; y < HZ + 26; y += 2) {
                const dx = Math.sin(t * 2.3 + y * 0.5) * 1.2;
                ctx.drawImage(this.dom.canvas, 0, y, W, 2, dx, y, W, 2);
            }
        }
    },

    // ---------- particles ----------

    _spawnAmbient() {
        if (!this._parts) this._parts = [];
        const B = this._stage();
        const want = 46;
        while (this._parts.filter(p => p.kind === 'mote').length < want) {
            this._parts.push({
                kind: 'mote',
                x: Math.random() * this.W,
                y: this.HORIZON - 30 + Math.random() * (this.H - this.HORIZON + 30),
                vx: 6 + Math.random() * 20,
                vy: -3 - Math.random() * 9,
                life: 3 + Math.random() * 6, age: 0,
                r: Math.random() < 0.25 ? 2 : 1,
                warm: B.key !== 'river'
            });
        }
    },

    // A hit: dust off the ground, sparks off the bronze, and a ring.
    burst(x, y, colour) {
        if (!this._parts) this._parts = [];
        for (let i = 0; i < 26; i++) {
            const a = -Math.PI * 0.15 - Math.random() * Math.PI * 0.7;
            const sp = 60 + Math.random() * 190;
            this._parts.push({
                kind: 'spark', x, y,
                vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1),
                vy: Math.sin(a) * sp,
                life: 0.3 + Math.random() * 0.5, age: 0,
                r: Math.random() < 0.3 ? 2 : 1, colour
            });
        }
        for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2;
            this._parts.push({
                kind: 'dust', x: x + Math.cos(a) * 10, y: y + 6 + Math.random() * 8,
                vx: Math.cos(a) * (24 + Math.random() * 60),
                vy: -12 - Math.random() * 34,
                life: 0.5 + Math.random() * 0.6, age: 0,
                r: 2 + Math.random() * 3
            });
        }
        this._rings = this._rings || [];
        this._rings.push({ x, y, age: 0, life: 0.42, colour });
    },

    _stepParticles(dt) {
        this._spawnAmbient();
        const keep = [];
        for (const p of this._parts) {
            p.age += dt;
            if (p.age >= p.life) continue;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.kind === 'mote') {
                p.vy += Math.sin(this._t * 1.4 + p.x * 0.02) * 3 * dt;
                if (p.x > this.W + 6) p.x = -6;
            } else if (p.kind === 'spark') {
                p.vy += 520 * dt; p.vx *= 0.97;
            } else {
                p.vy += 90 * dt; p.vx *= 0.94; p.r += dt * 6;
            }
            keep.push(p);
        }
        this._parts = keep;
        this._rings = (this._rings || []).filter(r => (r.age += dt) < r.life);
    },

    _drawParticles(ctx) {
        for (const p of this._parts) {
            const u = p.age / p.life;
            if (p.kind === 'mote') {
                const fade = Math.sin(u * Math.PI);
                ctx.fillStyle = p.warm ? `rgba(255,238,196,${0.4 * fade})`
                                       : `rgba(214,240,250,${0.4 * fade})`;
                ctx.fillRect(p.x | 0, p.y | 0, p.r, p.r);
            } else if (p.kind === 'dust') {
                ctx.fillStyle = `rgba(198,168,120,${0.34 * (1 - u)})`;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
            }
        }
        // sparks are additive so they punch through the dust
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this._parts) {
            if (p.kind !== 'spark') continue;
            const u = p.age / p.life;
            ctx.fillStyle = p.colour || `rgba(255,226,150,${1 - u})`;
            ctx.globalAlpha = 1 - u;
            ctx.fillRect(p.x | 0, p.y | 0, p.r, p.r);
            ctx.fillStyle = 'rgba(255,250,220,0.5)';
            ctx.fillRect(p.x | 0, p.y | 0, 1, 1);
        }
        for (const r of this._rings || []) {
            const u = r.age / r.life;
            ctx.globalAlpha = (1 - u) * 0.55;
            ctx.strokeStyle = r.colour || 'rgba(255,236,180,1)';
            ctx.lineWidth = 3 * (1 - u) + 0.6;
            ctx.beginPath();
            ctx.ellipse(r.x, r.y, 12 + u * 74, (12 + u * 74) * 0.42, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
    },

    // ---------- post ----------
    //
    // A cheap bloom: shrink the frame, square it so only bright pixels
    // survive, blur it, and add it back. Then a vignette to hold the eye in
    // the middle of the frame.

    _post(ctx) {
        const W = this.W, H = this.H, bw = W >> 2, bh = H >> 2;
        if (!this._bl1) {
            this._bl1 = this._layer(bw, bh, () => {});
            this._bl2 = this._layer(bw, bh, () => {});
            this._vig = this._layer(W, H, (g) => {
                const v = g.createRadialGradient(W * 0.5, H * 0.46, H * 0.28, W * 0.5, H * 0.5, H * 0.86);
                v.addColorStop(0, 'rgba(0,0,0,0)');
                v.addColorStop(1, 'rgba(16,8,22,0.5)');
                g.fillStyle = v; g.fillRect(0, 0, W, H);
            });
        }
        const a = this._bl1.getContext('2d'), b2 = this._bl2.getContext('2d');
        a.globalCompositeOperation = 'source-over';
        a.clearRect(0, 0, bw, bh);
        a.imageSmoothingEnabled = true;
        a.drawImage(this.dom.canvas, 0, 0, bw, bh);

        b2.globalCompositeOperation = 'source-over';
        b2.clearRect(0, 0, bw, bh);
        b2.drawImage(this._bl1, 0, 0);
        b2.globalCompositeOperation = 'multiply';
        b2.drawImage(this._bl1, 0, 0);       // squared: darks fall away
        b2.drawImage(this._bl1, 0, 0);       // cubed: only real highlights left

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.3;
        ctx.imageSmoothingEnabled = true;
        if ('filter' in ctx) ctx.filter = 'blur(5px)';
        ctx.drawImage(this._bl2, 0, 0, W, H);
        if ('filter' in ctx) ctx.filter = 'none';
        ctx.restore();

        ctx.drawImage(this._vig, 0, 0);
        ctx.imageSmoothingEnabled = false;
    },

    // Where each fighter stands. The foe is set further up the plain and drawn
    // smaller, so the depth is real rather than two sprites side by side.
    MARKS: {
        hero: { x: 176, y: 348, scale: 1 },
        foe:  { x: 470, y: 250, scale: 0.78 }
    },

    // Where a fighter's chest is, in screen space — for aiming hit effects.
    _chestOf(side) {
        const m = this.MARKS[side];
        return { x: m.x, y: m.y - 100 * m.scale };
    },

    hitAt(side) {
        const p = this._chestOf(side);
        const w = side === 'hero' ? this.hero : this.foe;
        const c = w && w.palette ? w.palette.metal : '#ffe6a0';
        this.burst(p.x, p.y, c);
    },

    _draw() {
        const ctx = this.ctx, t = this._t;
        ctx.imageSmoothingEnabled = false;
        this._stepParticles(this._dt || 0.016);

        if (this.scene === 'prelude' && this.foe && this.hero) {
            this._stepParticles(this._dt || 0.016);
            this._drawPrelude(ctx, t);
            this._drawParticles(ctx);
            this._post(ctx);
            return;
        }

        if (this.scene !== 'battle' && this.scene !== 'boon') {
            // A quiet dusk plain behind the menus, using the same sky machinery
            // so the game never shows a flat rectangle.
            const B = this._stage();
            ctx.drawImage(B.sky, 0, 0);
            const cw = B.clouds.width, off = (t * 6) % cw;
            ctx.globalAlpha = 0.5;
            ctx.drawImage(B.clouds, -off, 20);
            ctx.drawImage(B.clouds, cw - off, 20);
            ctx.globalAlpha = 1;
            ctx.drawImage(B.far, 0, 0);
            ctx.drawImage(B.mid, 0, 0);
            ctx.drawImage(B.ground, 0, 0);
            ctx.drawImage(B.ranks, 0, 0);
            ctx.drawImage(B.props, 0, 0);
            ctx.fillStyle = 'rgba(24,14,34,0.55)';
            ctx.fillRect(0, 0, this.W, this.H);
            this._drawParticles(ctx);
            this._post(ctx);
            return;
        }

        ctx.save();
        if (this.shake > 0) {
            ctx.translate((Math.random() - 0.5) * 11 * this.shake, (Math.random() - 0.5) * 9 * this.shake);
            this.shake = Math.max(0, this.shake - 0.05);
        }
        this.drawBackground(ctx, t);

        const river = this._stageKey() === 'river';
        const haze = this._stage().S.haze;
        const MF = this.MARKS.foe, MH = this.MARKS.hero;
        if (this.foe) {
            this.drawWarrior(ctx, this.foe.palette, this.foePose, -1, MF.x, MF.y, t, 'foe', {
                scale: MF.scale,
                id: this.foe.name,
                haze: this._mix(haze, '#ffffff', 0.1) + '24',
                reflect: river
            });
        }
        if (this.hero) {
            this.drawWarrior(ctx, this.hero.palette, this.heroPose, 1, MH.x, MH.y, t, 'hero', {
                scale: MH.scale,
                id: this.hero.name,
                reflect: river
            });
        }
        this._drawParticles(ctx);
        ctx.restore();

        if (this.flash > 0) {
            ctx.fillStyle = `rgba(255,240,190,${this.flash * 0.7})`;
            ctx.fillRect(0, 0, this.W, this.H);
            this.flash = Math.max(0, this.flash - 0.045);
        }
        this._post(ctx);
    },

    // Scale to the box flexbox actually handed the stage, so the canvas and the
    // controls always share one screen instead of the page growing a scrollbar.
    _fit() {
        const box = this.dom.stage;
        if (!box) return;
        const cw = box.clientWidth - 8, ch = box.clientHeight - 8;
        if (cw <= 0 || ch <= 0) return;
        const raw = Math.min(cw / this.W, ch / this.H);
        // Snap to whole numbers only once there is room for a clean 2x. At 640
        // wide the integer rule alone would pin most laptops to 1:1 and waste
        // half the stage, and nearest-neighbour artefacts at this pixel density
        // are far less visible than a battlefield two thirds the size.
        const s = raw >= 2 ? Math.floor(raw) : raw;
        const w = Math.floor(this.W * s), h = Math.floor(this.H * s);
        if (this._fitW === w && this._fitH === h) return;
        this._fitW = w; this._fitH = h;
        this.dom.canvas.style.width = w + 'px';
        this.dom.canvas.style.height = h + 'px';
    },

    _loop() {
        if (!this.mounted) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        this._t += dt;
        this._dt = dt;
        this._draw();
        this._fit();
        this._raf = requestAnimationFrame(this._loop);
    }
};
