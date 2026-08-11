// themes.js — All 5 CozyHome themes with CSS custom properties

const THEMES = {
    'California Cabana': {
        key: 'california-cabana',
        subtitle: 'Sunset warmth & ocean breeze',
        icon: '☀️',
        pattern: 'waves',
        patternOpacity: 0.04,
        accent: [242, 115, 77],
        accentSecondary: [51, 140, 184],
        completed: [77, 179, 102],
        budget: [77, 179, 102],
        warning: [242, 153, 51],
        danger: [230, 77, 64],
        cardBg: [255, 247, 237],
        pageBg: [255, 242, 224],
        headerGrad: ['rgb(242,115,77)', 'rgb(242,179,64)'],
    },
    'Maldives': {
        key: 'maldives',
        subtitle: 'Crystal waters & white sand',
        icon: '🌊',
        pattern: 'ripples',
        patternOpacity: 0.03,
        accent: [0, 191, 209],
        accentSecondary: [77, 140, 230],
        completed: [51, 191, 140],
        budget: [51, 191, 140],
        warning: [242, 166, 64],
        danger: [217, 77, 89],
        cardBg: [237, 250, 255],
        pageBg: [230, 245, 252],
        headerGrad: ['rgb(0,191,209)', 'rgb(77,140,230)'],
    },
    'Mid-Century Modern': {
        key: 'mid-century-modern',
        subtitle: 'Retro geometry & bold color',
        icon: '💎',
        pattern: 'diamonds',
        patternOpacity: 0.06,
        accent: [204, 153, 26],
        accentSecondary: [0, 140, 140],
        completed: [115, 153, 64],
        budget: [204, 153, 26],
        warning: [217, 115, 38],
        danger: [204, 64, 51],
        cardBg: [255, 250, 235],
        pageBg: [247, 242, 224],
        headerGrad: ['rgb(204,153,26)', 'rgb(0,140,140)'],
    },
    'Bless This Mess': {
        key: 'bless-this-mess',
        subtitle: 'Farmhouse charm & soft hues',
        icon: '🌿',
        pattern: 'crosshatch',
        patternOpacity: 0.05,
        accent: [140, 179, 140],
        accentSecondary: [191, 140, 128],
        completed: [140, 179, 140],
        budget: [153, 128, 77],
        warning: [217, 153, 89],
        danger: [204, 89, 77],
        cardBg: [250, 245, 237],
        pageBg: [245, 240, 230],
        headerGrad: ['rgb(140,179,140)', 'rgb(191,140,128)'],
    },
    'Norwegian Hygge': {
        key: 'norwegian-hygge',
        subtitle: 'Nordic coziness & warm textures',
        icon: '🔥',
        pattern: 'knit',
        patternOpacity: 0.05,
        accent: [153, 51, 46],
        accentSecondary: [38, 64, 102],
        completed: [64, 128, 89],
        budget: [64, 128, 89],
        warning: [217, 140, 51],
        danger: [191, 56, 51],
        cardBg: [245, 240, 235],
        pageBg: [240, 235, 227],
        headerGrad: ['rgb(153,51,46)', 'rgb(38,64,102)'],
    }
};

const ThemeEngine = {
    current: null,

    apply(themeName) {
        const t = THEMES[themeName];
        if (!t) return;
        this.current = { name: themeName, ...t };
        Store.setTheme(themeName);

        const r = document.documentElement.style;
        r.setProperty('--accent', `rgb(${t.accent})`);
        r.setProperty('--accent-rgb', t.accent.join(','));
        r.setProperty('--accent-secondary', `rgb(${t.accentSecondary})`);
        r.setProperty('--accent-secondary-rgb', t.accentSecondary.join(','));
        r.setProperty('--completed', `rgb(${t.completed})`);
        r.setProperty('--completed-rgb', t.completed.join(','));
        r.setProperty('--budget', `rgb(${t.budget})`);
        r.setProperty('--warning', `rgb(${t.warning})`);
        r.setProperty('--danger', `rgb(${t.danger})`);
        r.setProperty('--danger-rgb', t.danger.join(','));
        r.setProperty('--card-bg', `rgb(${t.cardBg})`);
        r.setProperty('--page-bg', `rgb(${t.pageBg})`);
        r.setProperty('--header-grad-start', t.headerGrad[0]);
        r.setProperty('--header-grad-end', t.headerGrad[1]);

        document.body.setAttribute('data-theme', t.key);

        // Redraw pattern
        if (typeof PatternEngine !== 'undefined') PatternEngine.draw();
    },

    init() {
        this.apply(Store.getTheme());
    }
};

// Item type icons (emoji equivalents of SF Symbols)
const ITEM_ICONS = {
    'Tool': '🔧',
    'Furniture': '🛋️',
    'Toy': '🧸',
    'Decoration': '🎨',
    'Other': '📦'
};

const ITEM_TYPES = ['Tool', 'Furniture', 'Toy', 'Decoration', 'Other'];
