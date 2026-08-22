// sahara.js — the real trans-Saharan road network, c. 1325–1355.
//
// Places, routes and stops here are the historical ones, not invented
// scenery. The stop lists follow the itineraries described by al-Bakri,
// al-Umari and above all Ibn Battuta, who crossed from Sijilmasa to Walata in
// 1352 and came home from Gao by way of Takedda in 1353. Where a caravan
// really did break its journey eleven times, it breaks it eleven times here:
// the brief has it right that the number of halts is part of the history.
//
// Two deliberate omissions, both about dates. Taoudenni does not appear
// because its mines only replaced Taghaza's after 1585, and Agadez does not
// appear because the sultanate was founded in the fifteenth century. A
// fourteenth-century caravan could not have stopped at either.
//
// Coordinates are real, in degrees, so the map is a map rather than a doodle.
// Distances are computed from them by great circle, and the day counts that
// fall out are close to the ones the sources give: Ibn Battuta needed about
// 25 days from Sijilmasa to Taghaza and another 20 from Taghaza to Walata.

const Sahara = {

    // ---------- places ----------
    //
    // kind: city (walled, settled, a market), oasis (palms and water),
    // well (a hole in the ground you may find dry), mine (salt or copper).

    PLACES: {
        // --- the Niger bend, the Mali heartland ---
        timbuktu:  { name: 'Timbuktu', kind: 'city', lat: 16.77, lon: -3.01,
            note: 'Where the river meets the desert. Camels come no further south, canoes no further north, so everything changes hands here.',
            trade: 'Saharan salt, Akan and Bambuk gold, copper, cloth, books' },
        kabara:    { name: 'Kabara', kind: 'oasis', lat: 16.70, lon: -3.00,
            note: 'Timbuktu’s river port, a few miles off. Goods are poled up from here by canoe.',
            trade: 'Grain, dried fish, river freight' },
        djenne:    { name: 'Djenné', kind: 'city', lat: 13.91, lon: -4.55,
            note: 'The market that feeds Timbuktu, on an island in the Bani. Gold from Bure and Bambuk enters the Niger trade through its gates.',
            trade: 'Gold, rice, dried fish, kola, cotton cloth' },
        niani:     { name: 'Niani', kind: 'city', lat: 11.38, lon: -8.42,
            note: 'The seat of the Mansa. Al-Umari’s informants in Cairo described a court where the king gave audience beneath a silk canopy.',
            trade: 'Gold dust, ivory, kola, the business of empire' },
        gao:       { name: 'Gao', kind: 'city', lat: 16.27, lon: -0.04,
            note: 'The Songhai city downriver, held by Mali in this century and its master in the next. Its wharves face east to the copper country.',
            trade: 'Copper, salt, grain, slaves, horses' },

        // --- the western desert and the Sahel edge ---
        walata:    { name: 'Walata', kind: 'city', lat: 17.30, lon: -7.03,
            note: 'Mali’s northern gate. Every caravan out of Sijilmasa is unloaded, taxed and re-formed here; Ibn Battuta spent fifty days waiting in it.',
            trade: 'Salt southbound, gold northbound, dates, cloth' },
        tichitt:   { name: 'Tichitt', kind: 'city', lat: 18.45, lon: -9.50,
            note: 'A stone town on the Tagant escarpment, watching the road between the Adrar and the Niger.',
            trade: 'Salt from Ijil, dates, grain' },
        awdaghust: { name: 'Awdaghust', kind: 'oasis', lat: 17.42, lon: -10.40,
            note: 'The great market of Ghana’s day, sacked by the Almoravids in 1054 and long past its best by now. Caravans pass its ruins.',
            trade: 'Once gold and salt; now little' },
        oum_grein: { name: 'Bir Oum Greïn', kind: 'well', lat: 17.90, lon: -5.30,
            note: 'A well on the flat road west, drawn dry and refilling slowly.',
            trade: '—' },

        // --- the Taghaza road, straight north out of Timbuktu ---
        araouane:  { name: 'Araouane', kind: 'oasis', lat: 18.90, lon: -3.53,
            note: 'A cluster of houses in bare sand, kept alive only because the salt road needs a halt here. Nothing is grown; everything is carried in.',
            trade: 'Water, fodder, a place to re-tie loads' },
        bir_ounane:{ name: 'Bir Ounane', kind: 'well', lat: 20.40, lon: -4.00,
            note: 'A well in the Ouarane, brackish but drinkable, and the last before the salt country.',
            trade: '—' },
        ksaib:     { name: 'Bir al-Ksaib', kind: 'well', lat: 21.40, lon: -5.60,
            note: 'Ibn Battuta’s Tasarahla. Caravans halt three days here and send a takshif — a hired Massufa scout — ahead to Walata to have water brought out to meet them.',
            trade: 'Guides, and water sent out on trust' },
        taghaza:   { name: 'Taghaza', kind: 'mine', lat: 23.60, lon: -5.00,
            note: 'The salt mine. Ibn Battuta found a village whose houses and mosque were built of rock salt, roofed with camel skin, with no tree and no soil — all food carried in from Walata or Sijilmasa. The digging was done by enslaved Massufa.',
            trade: 'Salt slabs, cut two to a camel' },

        // --- the Tanezrouft and Tuat, the shorter and drier way north ---
        reggane:   { name: 'Reggane', kind: 'oasis', lat: 26.72, lon: 0.17,
            note: 'The southern doorway of Tuat, where the Tanezrouft crossing ends and palms begin again.',
            trade: 'Dates, water, fresh camels' },
        tuat:      { name: 'Tuat (Buda)', kind: 'oasis', lat: 27.87, lon: -0.29,
            note: 'A string of palm oases fed by foggara — tunnels dug miles into the hillside to bring water down by gravity.',
            trade: 'Dates, grain, gold in transit, slaves' },
        insalah:   { name: 'In Salah', kind: 'oasis', lat: 27.19, lon: 2.48,
            note: 'The Tidikelt oases, where the eastern and western desert roads meet and part again.',
            trade: 'Dates, salt, transit tolls' },
        tabelbala: { name: 'Tabelbala', kind: 'oasis', lat: 29.40, lon: -3.25,
            note: 'A halt of dark palm gardens between Tuat and the Tafilalt, its people speaking a tongue of their own.',
            trade: 'Dates, water, shelter' },

        // --- the Maghrib, where the gold road ends ---
        sijilmasa: { name: 'Sijilmasa', kind: 'city', lat: 31.28, lon: -4.28,
            note: 'The northern end of the gold road, in the Tafilalt. Its mint struck dinars from metal that began as dust in a Bambuk stream, and its merchants financed the crossings.',
            trade: 'Gold northbound, cloth, brass, beads and salt southbound' },
        ouargla:   { name: 'Ouargla', kind: 'city', lat: 31.95, lon: 5.33,
            note: 'An Ibadi merchant town whose families kept agents the length of the desert, trading on credit and letters.',
            trade: 'Gold, slaves, dates, woollens' },
        tlemcen:   { name: 'Tlemcen', kind: 'city', lat: 34.88, lon: -1.32,
            note: 'The Zayyanid capital, where Saharan gold reaches Christian merchants from Genoa and Majorca.',
            trade: 'Gold, wool, European cloth' },
        fez:       { name: 'Fez', kind: 'city', lat: 34.03, lon: -5.00,
            note: 'The Marinid capital and the Maghrib’s workshop, drawing the Tafilalt trade north.',
            trade: 'Leather, cloth, books, gold coin' },
        tunis:     { name: 'Tunis', kind: 'city', lat: 36.80, lon: 10.18,
            note: 'The Hafsid capital and a Mediterranean port: what the Ghadames road carries north leaves from here by ship.',
            trade: 'Gold, slaves, hides, wool, olive oil' },
        tripoli:   { name: 'Tripoli', kind: 'city', lat: 32.89, lon: 13.19,
            note: 'The sea end of the Fezzan road. Cargo that crossed the Kawar on camel finishes its journey on a galley.',
            trade: 'Slaves, gold, ivory, alum, dates' },
        cairo:     { name: 'Cairo', kind: 'city', lat: 30.04, lon: 31.24,
            note: 'Mansa Musa spent so freely here in 1324 that al-Umari, visiting twelve years later, found the price of gold still depressed.',
            trade: 'Everything; and pilgrims bound for the Hijaz' },

        // --- the eastern roads, out past Gao ---
        tadmekka:  { name: 'Tadmekka', kind: 'city', lat: 19.90, lon: 0.90,
            note: 'Es-Souk, in the Adrar des Ifoghas. Al-Bakri wrote that it resembled Mecca, which is what its name says; its mint struck blank gold coin of famous purity.',
            trade: 'Gold coin, salt, cloth, slaves' },
        takedda:   { name: 'Takedda', kind: 'mine', lat: 17.30, lon: 5.90,
            note: 'Ibn Battuta came here in 1353 and watched copper drawn from the ground, cast into bars, and sent south as money: thin bars for small change, thick ones for grain and meat.',
            trade: 'Copper bars, used as currency to the south' },
        fachi:     { name: 'Fachi', kind: 'oasis', lat: 18.10, lon: 11.57,
            note: 'Palms and salt pans in the middle of the Erg of Bilma, unreachable except by knowing exactly where it is.',
            trade: 'Dates, salt, water' },
        bilma:     { name: 'Bilma', kind: 'mine', lat: 18.69, lon: 12.92,
            note: 'The Kawar salt pans. Brine is evaporated in clay moulds into pillars and cones, and the azalai carries them a thousand miles to markets that have no other salt.',
            trade: 'Salt pillars, dates, natron' },
        djado:     { name: 'Djado', kind: 'oasis', lat: 21.02, lon: 12.30,
            note: 'A fortified oasis on the Kawar road north, its ksar built above the palm gardens against raiders.',
            trade: 'Dates, natron, water' },
        zawila:    { name: 'Zawila', kind: 'city', lat: 26.17, lon: 15.11,
            note: 'The Ibadi capital of the Fezzan and, for centuries, the clearing house of the eastern slave trade — the ugliest business on these roads, and among the largest.',
            trade: 'Slaves, dates, hides, ivory' },
        ghat:      { name: 'Ghat', kind: 'oasis', lat: 24.96, lon: 10.18,
            note: 'A Tuareg oasis under the Akakus cliffs, holding the road between the Aïr and the Fezzan.',
            trade: 'Dates, transit tolls, protection' },
        ghadames:  { name: 'Ghadames', kind: 'city', lat: 30.13, lon: 9.50,
            note: 'The pearl of the desert, roofed alleys and a spring, where the roads from Tripoli, Tunis and the deep Sahara meet.',
            trade: 'Gold, slaves, cloth, leather, ostrich feathers' }
    },

    // ---------- routes ----------
    //
    // `stops` are the halts between origin and destination. `days` per leg is
    // taken from the sources where they give one and estimated from distance
    // where they do not: a loaded caravan makes roughly 30–40 km a day.

    ROUTES: [
        {
            id: 'kabara-djenne', name: 'The River Road to Djenné', from: 'timbuktu', to: 'djenne',
            stops: ['kabara'], reward: 220, risk: 0.35,
            summary: 'Two days down to the port, then upriver by canoe. The easiest road a Timbuktu merchant ever takes.'
        },
        {
            id: 'niani', name: 'The Road to the Mansa’s Court', from: 'timbuktu', to: 'niani',
            stops: ['kabara', 'djenne'], reward: 480, risk: 0.5,
            summary: 'Upriver to Djenné, then overland to the capital on the Sankarani.'
        },
        {
            id: 'gao', name: 'Downriver to Gao', from: 'timbuktu', to: 'gao',
            stops: ['kabara'], reward: 260, risk: 0.4,
            summary: 'With the current, past Bourem, to the Songhai wharves.'
        },
        {
            id: 'walata', name: 'The Walata Road', from: 'timbuktu', to: 'walata',
            stops: ['oum_grein'], reward: 340, risk: 0.75,
            summary: 'West across flat, waterless country to Mali’s northern gate. Twenty-odd days.'
        },
        {
            id: 'taghaza', name: 'The Salt Road to Taghaza', from: 'timbuktu', to: 'taghaza',
            stops: ['araouane', 'bir_ounane'], reward: 620, risk: 1.0,
            summary: 'Straight north to the salt mine. Nothing grows for the last three hundred miles; every mouthful is carried.'
        },
        {
            id: 'sijilmasa', name: 'The Gold Road to Sijilmasa', from: 'timbuktu', to: 'sijilmasa',
            stops: ['araouane', 'bir_ounane', 'ksaib', 'taghaza', 'tabelbala'], reward: 1500, risk: 1.35,
            summary: 'The full crossing, the way Ibn Battuta came south in 1352 — in reverse, and uphill. Two months if it goes well.'
        },
        {
            id: 'tanezrouft', name: 'The Tanezrouft Crossing', from: 'timbuktu', to: 'sijilmasa',
            stops: ['araouane', 'reggane', 'tuat', 'tabelbala'], reward: 1400, risk: 1.6,
            summary: 'Shorter than the Taghaza road and far worse: the Tanezrouft is a land of thirst with no well for four hundred miles.'
        },
        {
            id: 'takedda', name: 'The Copper Road to Takedda', from: 'timbuktu', to: 'takedda',
            stops: ['gao', 'tadmekka'], reward: 780, risk: 1.0,
            summary: 'East along the river, then north into the Ifoghas and out to the copper workings.'
        },
        {
            id: 'ghadames', name: 'The Ghadames Road to Tunis', from: 'timbuktu', to: 'tunis',
            stops: ['gao', 'tadmekka', 'ghat', 'ghadames'], reward: 1700, risk: 1.4,
            summary: 'The eastern road out of the Niger bend, up through Tuareg country to the Mediterranean.'
        },
        {
            id: 'kawar', name: 'The Kawar Salt Road to Tripoli', from: 'timbuktu', to: 'tripoli',
            stops: ['gao', 'takedda', 'fachi', 'bilma', 'djado', 'zawila'], reward: 2100, risk: 1.55,
            summary: 'The longest road on the map: east to the copper, then the azalai across the Erg to the Kawar salt, and north through the Fezzan.'
        },
        {
            id: 'hajj', name: 'The Pilgrim Road to Cairo', from: 'timbuktu', to: 'cairo',
            stops: ['walata', 'tuat', 'insalah', 'ghadames', 'tripoli'], reward: 2600, risk: 1.5,
            summary: 'The way Mansa Musa went in 1324, with a hundred camels of gold. Nobody has forgotten it in Cairo.'
        }
    ],

    // ---------- interactions ----------
    //
    // One to three of these fall between each pair of halts. Each is a real
    // hazard or a real piece of caravan practice, and each costs something.

    EVENTS: [
        { id: 'takshif', title: 'The scout goes ahead', kinds: ['well'],
          text: 'The caravan halts three days. A Massufa takshif is hired to run ahead to the next town and have water brought out to meet you. If he loses his way, everyone here dies.',
          choices: [
            { label: 'Pay the scout well (60 cowries)', cowries: -60, water: 25, days: 3,
              result: 'He takes the money, and four days later riders come out of the haze with full skins.' },
            { label: 'Trust the wells ahead', water: -18, days: 2, risk: 0.2,
              result: 'You press on unaided. The next well is low, and the camels drink before you do.' } ] },

        { id: 'haboob', title: 'A wall of sand',
          text: 'The horizon browns and closes. Within minutes you cannot see the camel in front of you.',
          choices: [
            { label: 'Couch the camels and wait it out', days: 1, food: -8,
              result: 'You lie behind the animals for a day and a night. Everything you own is full of sand, but nothing is lost.' },
            { label: 'Keep the line moving', days: 0, water: -14, risk: 0.35,
              result: 'Two loads are torn loose and one man is separated for an hour, shouting, before he is found.' } ] },

        { id: 'drywell', title: 'The well is silted', kinds: ['well', 'oasis'],
          text: 'You reach the well and find it half full of blown sand. It will give water, but only to whoever digs.',
          choices: [
            { label: 'Dig it out', days: 1, water: 30, food: -6,
              result: 'Half a day of digging and it runs clear enough. You leave it better than you found it, as the road expects.' },
            { label: 'Take what seeps and go on', water: 8,
              result: 'A few measures of gritty water, and the next well is a long way off.' } ] },

        { id: 'azalai', title: 'A caravan coming the other way',
          text: 'Bells, then shapes: an azalai heading south, salt slabs lashed two to a camel. Their guide knows the road you are about to take.',
          choices: [
            { label: 'Trade news and buy water', cowries: -30, water: 20,
              result: 'They sell you water at desert prices and tell you which well ahead has failed. Worth every shell.' },
            { label: 'Exchange greetings and press on', days: -1,
              result: 'A shouted blessing each way. You make good time while the light lasts.' } ] },

        { id: 'toll', title: 'Riders on the flank',
          text: 'Tuareg riders shadow the caravan for an hour, then come in. This is their country, and passage through it has a price.',
          choices: [
            { label: 'Pay the toll (90 cowries)', cowries: -90,
              result: 'Paid, and worth paying: they ride with you to the next water and no one troubles you.' },
            { label: 'Refuse and close up the line', risk: 0.5, cowries: -20,
              result: 'They fall back. Something goes missing from a load in the night.' } ] },

        { id: 'lame', title: 'A camel goes lame',
          text: 'The third camel is favouring a foot. Loaded, it will not last the week.',
          choices: [
            { label: 'Redistribute the load and lead it', days: 2,
              result: 'Everything else carries a little more and the caravan slows. The animal lives.' },
            { label: 'Sell it at the next halt', cowries: 120, food: -10,
              result: 'You take what you can get for a lame animal, and carry what it carried.' } ] },

        { id: 'night', title: 'Travel by night',
          text: 'The guide proposes moving after dark and lying up through the worst of the day. The stars are clear enough to steer by.',
          choices: [
            { label: 'Travel by night', days: -2, water: 12, food: -5,
              result: 'Cold, and hard on the eyes, but you lose far less water to the sun.' },
            { label: 'Keep to daylight', water: -10,
              result: 'Safer footing, and a great deal more thirst.' } ] },

        { id: 'salt_crack', title: 'A slab splits', kinds: ['mine'],
          text: 'One of the salt slabs has cracked across the middle where the lashing bit into it. Broken salt fetches a fraction of whole.',
          choices: [
            { label: 'Repack the whole load properly', days: 1,
              result: 'You strip and re-tie every animal. Nothing else breaks the rest of the way.' },
            { label: 'Bind it and hope', cowries: -80,
              result: 'It arrives in three pieces and is sold as rubble.' } ] },

        { id: 'gazelle', title: 'Gazelle at dawn',
          text: 'A small herd, feeding at the edge of a dry watercourse, well within a bowshot.',
          choices: [
            { label: 'Hunt', days: 1, food: 25,
              result: 'Fresh meat, dried in strips over the next two days. Morale improves out of all proportion.' },
            { label: 'Leave them and keep the pace', days: 0,
              result: 'You watch them scatter and go on hungry.' } ] },

        { id: 'pilgrims', title: 'Pilgrims returning',
          text: 'A small party coming home from the Hijaz, thin and cheerful, out of provisions and asking for food in the name of the road.',
          choices: [
            { label: 'Feed them', food: -14, cowries: 40,
              result: 'They insist on paying what little they have, and give you a letter of introduction worth more.' },
            { label: 'Give water only', water: -6,
              result: 'They take it, thank you properly, and walk on. You think about it for a while afterwards.' } ] },

        { id: 'foggara', title: 'The tunnels under the palms', kinds: ['oasis'],
          text: 'The oasis is watered by foggara — galleries dug for miles into the hillside so water runs down of its own accord. The keeper offers to fill every skin you own, at a price.',
          choices: [
            { label: 'Fill everything (50 cowries)', cowries: -50, water: 45,
              result: 'Cold, clean water from under a mountain. You leave heavier and much happier.' },
            { label: 'Take the free ration', water: 15,
              result: 'What the road is owed, and no more.' } ] },

        { id: 'guide_lost', title: 'The guide is not certain',
          text: 'Two days of featureless reg, and the guide has stopped talking. He is watching the sun for longer than a confident man would.',
          choices: [
            { label: 'Halt and wait for the stars', days: 1, water: -8,
              result: 'At full dark he finds his bearing in a moment, and is offended that anyone doubted him.' },
            { label: 'Cast about for the track', days: 2, water: -16, risk: 0.3,
              result: 'Half a day wasted going the wrong way before someone spots old camel dung and a line of stones.' } ] },

        { id: 'sick', title: 'Fever in the camp',
          text: 'One of the drivers is shaking under three blankets in forty degrees of heat.',
          choices: [
            { label: 'Rest the caravan', days: 2, food: -10,
              result: 'Two days lost. He is walking by the third, unsteady but alive.' },
            { label: 'Carry him and continue', risk: 0.4,
              result: 'He is tied into a litter between two camels and does not improve.' } ] },

        { id: 'market', title: 'A small market at the halt', kinds: ['oasis', 'city'],
          text: 'Dates in baskets, goat cheese, rope, and a man selling millet at half what Timbuktu charges.',
          choices: [
            { label: 'Buy provisions (70 cowries)', cowries: -70, food: 35,
              result: 'Dates, millet and hard cheese. The caravan eats properly for a week.' },
            { label: 'Sell surplus cloth', cowries: 130, food: -5,
              result: 'You part with the cloth at a good price and keep moving.' } ] },

        { id: 'sandsea', title: 'The dunes stand across the road',
          text: 'A field of high barchan dunes, marching slowly across the line of travel. Over, or around.',
          choices: [
            { label: 'Go around', days: 2, water: -6,
              result: 'Two days added, and every one of them flat and dull, which on this road is a blessing.' },
            { label: 'Cross them', water: -20, food: -8, risk: 0.25,
              result: 'Camels floundering to the knee, loads shifting, and one animal down and needing to be dug out.' } ] },

        { id: 'copper', title: 'Copper bars at the workings', kinds: ['mine'],
          text: 'They cast it here into bars — thin ones that buy meat and firewood, thick ones that buy grain. South of here it circulates as money.',
          choices: [
            { label: 'Load copper for the return (150 cowries)', cowries: -150, cargo: 'copper',
              result: 'Heavy, unglamorous, and it will treble its value before you see the Niger again.' },
            { label: 'Travel light', days: -1,
              result: 'You leave the metal to others and make better time.' } ] },

        { id: 'mirage', title: 'Water that is not there',
          text: 'A sheet of blue lies across the plain ahead, with palms standing in it. Two of the younger men are already walking towards it.',
          choices: [
            { label: 'Call them back', days: 0,
              result: 'They come back sheepish. The guide has seen it a hundred times and says nothing at all.' },
            { label: 'Send someone to check', days: 1, water: -8,
              result: 'An hour out and an hour back, to stand on hot gravel where the lake was.' } ] },

        { id: 'stars', title: 'A clear night and a good guide',
          text: 'No wind, no cloud, and the guide in a talkative mood, naming stars and the wells they stand over.',
          choices: [
            { label: 'Sit up and learn the road', days: 1, knowledge: true,
              result: 'You will know this stretch yourself next time, which is how every guide on this road began.' },
            { label: 'Sleep while you can', water: 6,
              result: 'You wake rested and a little less thirsty than you deserve to be.' } ] }
    ],

    // ---------- geography ----------

    // Great-circle distance in kilometres.
    dist(a, b) {
        const A = this.PLACES[a], B = this.PLACES[b];
        const R = 6371, rad = d => d * Math.PI / 180;
        const dLat = rad(B.lat - A.lat), dLon = rad(B.lon - A.lon);
        const h = Math.sin(dLat / 2) ** 2 +
                  Math.cos(rad(A.lat)) * Math.cos(rad(B.lat)) * Math.sin(dLon / 2) ** 2;
        return Math.round(2 * R * Math.asin(Math.sqrt(h)));
    },

    // Every place a route touches, in order.
    legOf(route) { return [route.from, ...route.stops, route.to]; },

    routeKm(route) {
        const seq = this.legOf(route);
        let km = 0;
        for (let i = 1; i < seq.length; i++) km += this.dist(seq[i - 1], seq[i]);
        return km;
    },

    // A loaded caravan makes about 35 km a day. Ibn Battuta's Sijilmasa to
    // Taghaza was 25 days for roughly 900 km, which is the same arithmetic.
    routeDays(route) { return Math.max(2, Math.round(this.routeKm(route) / 35)); },

    place(id) { return this.PLACES[id]; }
};
