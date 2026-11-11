const T = THREE;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const approachAngle = (a, b, s) => { const d = wrapA(b - a); return Math.abs(d) <= s ? b : a + Math.sign(d) * s; };
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const ckey = (x, y, z) => ((x + 64) << 14) | ((y + 64) << 7) | (z + 64);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
};
let GRAV = 22; // set per map (the moon is lighter)

// ================= DATA =================
const COLORS = [0xe9ecee, 0xa3adb5, 0x5b6770, 0x2a3036, 0xd8382c, 0xf07a1a, 0xf2c029, 0x5fae3c, 0x1fa79a, 0x2f7fd8, 0x7a4fd0, 0xd85a9a, 0x7a4a2a, 0xb8e04a, 0x8fd8ff, 0xf3e2b8];
const PARTS = {
  cube:    { name: 'Cube',          cat: 'Structure', shape: 'box',   hpF: 1,   massF: 1,   lvl: 1, desc: 'The basic armor block.' },
  wedge:   { name: 'Wedge',         cat: 'Structure', shape: 'wedge', hpF: .85, massF: .8,  lvl: 1, desc: 'Sloped block for noses, ramps and roofs.' },
  slab:    { name: 'Slab',          cat: 'Structure', shape: 'slab',  hpF: .55, massF: .5,  lvl: 1, desc: 'Half-height block. Light, good for low decks and trim.' },
  pyr:     { name: 'Corner Slope',  cat: 'Structure', shape: 'pyr',   hpF: .7,  massF: .65, lvl: 2, desc: 'Outer corner where two wedges meet.' },
  inner:   { name: 'Inner Corner',  cat: 'Structure', shape: 'inner', hpF: .95, massF: .9,  lvl: 2, desc: 'Cube with one corner cut away. Fills the inside bend of a sloped roof.' },
  round:   { name: 'Rounded Edge',  cat: 'Structure', shape: 'round', hpF: .85, massF: .8,  lvl: 3, desc: 'Quarter-round block for smooth, curved hulls.' },
  tetra:   { name: 'Tetra',         cat: 'Structure', shape: 'tetra', hpF: .45, massF: .35, lvl: 3, desc: 'Small pointed corner piece for spikes, tips and fins.' },
  cyl:     { name: 'Cylinder',      cat: 'Structure', shape: 'cyl',   hpF: .8,  massF: .78, lvl: 2, desc: 'Round pillar for barrels, towers and smooth noses.' },
  hwedge:  { name: 'Half Wedge',    cat: 'Structure', shape: 'hwedge', hpF: .45, massF: .42, lvl: 3, desc: 'A low, shallow slope. Good for sleek fronts and fins.' },
  plate:   { name: 'Plate',         cat: 'Structure', shape: 'plate', hpF: .35, massF: .3,  lvl: 4, desc: 'Thin armor sheet. Very light skirts and shields.' },
  strut:   { name: 'Strut',         cat: 'Structure', shape: 'strut', hpF: .35, massF: .3,  lvl: 4, desc: 'Thin beam for frames, masts and bracing.' },
  seat:    { name: 'Pilot Seat',    cat: 'Core',      cpu: 5,  hp: 160, mass: 2,   lvl: 1, desc: 'Your pilot. If it is destroyed, so is the bot. Bury it in armor.' },
  wheel:   { name: 'Wheel',         cat: 'Movement',  cpu: 8,  hp: 130, mass: 2,   lvl: 1, desc: 'Fast on open ground. Must sit on the bottom layer. Carries about 32 mass.' },
  hover:   { name: 'Hover Pad',     cat: 'Movement',  cpu: 10, hp: 80,  mass: 1.5, lvl: 2, desc: 'Floats over terrain, lava and ice. Strafes with Q/E, Space/C change height. Lifts about 26 mass.' },
  tread:   { name: 'Tank Tread',    cat: 'Movement',  cpu: 10, hp: 210, mass: 3,   lvl: 3, desc: 'Slow but tough. Turns on the spot and grips hills. Bottom layer, carries about 45 mass.' },
  leg:     { name: 'Mech Leg',      cat: 'Movement',  cpu: 14, hp: 220, mass: 3,   lvl: 7, desc: 'Walks over steep slopes and small rocks. Bottom layer, carries about 50 mass.' },
  jet:     { name: 'Jump Jet',      cat: 'Movement',  cpu: 8,  hp: 70,  mass: 1,   lvl: 3, desc: 'Hold Space to thrust upward. Each jet lifts about 40 mass.' },
  rotor:   { name: 'Lift Rotor',    cat: 'Movement',  cpu: 14, hp: 70,  mass: 1.5, lvl: 5, desc: 'Turns your bot into a flyer. Space climbs, C descends, Q/E strafe. Lifts about 22 mass.' },
  wing:    { name: 'Wing',          cat: 'Movement',  cpu: 6,  hp: 70,  mass: .8,  lvl: 6, desc: 'Lift surface. Two or more wings plus thrusters make a plane: it needs speed to stay up. Lifts about 20 mass.' },
  thruster:{ name: 'Thruster',      cat: 'Movement',  cpu: 10, hp: 80,  mass: 1.5, lvl: 6, desc: 'Pushes your bot forward. Planes need them; on ground bots they add top speed.' },
  blaster: { name: 'Pulse Blaster', cat: 'Weapons',   cpu: 15, hp: 90,  mass: 2,   lvl: 1, weapon: true, desc: 'Rapid bolts that chew through cubes. Best at short range.' },
  nano:    { name: 'Nano Mender',   cat: 'Weapons',   cpu: 18, hp: 90,  mass: 2,   lvl: 3, weapon: true, desc: 'Healing beam. Point it at a damaged ally to repair their blocks. Does no damage.' },
  mortar:  { name: 'Arc Mortar',    cat: 'Weapons',   cpu: 25, hp: 110, mass: 3,   lvl: 3, weapon: true, desc: 'Lobbed shells with splash damage. Fires over hills.' },
  plasma:  { name: 'Plasma Launcher', cat: 'Weapons', cpu: 22, hp: 100, mass: 2.5, lvl: 4, weapon: true, desc: 'Fast, slightly arcing plasma balls that burst on impact and scorch a cluster of blocks.' },
  chain:   { name: 'Chain Gun',     cat: 'Weapons',   cpu: 24, hp: 120, mass: 3,   lvl: 4, weapon: true, desc: 'Spins up while you hold fire. Slow to start, then a wall of rounds.' },
  rail:    { name: 'Rail Lance',    cat: 'Weapons',   cpu: 30, hp: 80,  mass: 2.5, lvl: 5, weapon: true, desc: 'Slow piercing shot that punches deep into armor at long range.' },
  flak:    { name: 'Flak Cannon',   cat: 'Weapons',   cpu: 20, hp: 100, mass: 2.5, lvl: 5, weapon: true, desc: 'Shells burst right next to a target. Two and a half times the damage against anything airborne.' },
  seeker:  { name: 'Seeker Pod',    cat: 'Weapons',   cpu: 28, hp: 90,  mass: 2.5, lvl: 6, weapon: true, desc: 'Homing missiles. Hold your crosshair near an enemy to lock on, then fire.' },
  spike:   { name: 'Ram Spike',     cat: 'Special',   cpu: 6,  hp: 260, mass: 1.2, lvl: 3, desc: 'Ram enemies to tear into them. Damage grows with speed and with every spike.' },
  projector:{ name: 'Shield Projector', cat: 'Special', cpu: 30, hp: 140, mass: 2, lvl: 9, desc: 'Wraps your whole bot in an energy barrier that soaks 1,500 damage and recharges after 6 seconds without hits. Extra projectors add strength.' },
  shieldp: { name: 'Shield Plate',  cat: 'Special',   cpu: 8,  hp: 600, mass: 1,   lvl: 8, desc: 'Energy panel with huge health. Recharges after 5 seconds without taking hits.' },
  lamp:    { name: 'Headlamp',      cat: 'Cosmetic',  cpu: 0,  hp: 30,  mass: .1,  lvl: 1, ach: 'kills_100', desc: 'A bright lamp that lights the way. Earned by the Centurion achievement.' },
  exhaust: { name: 'Exhaust Stack', cat: 'Cosmetic',  cpu: 0,  hp: 30,  mass: .1,  lvl: 1, ach: 'movers', desc: 'Belches smoke when you floor it. Earned by the All-Terrain achievement.' },
  antenna: { name: 'Antenna',       cat: 'Cosmetic',  cpu: 0,  hp: 20,  mass: .1,  lvl: 1, ach: 'bp_p_antenna', desc: 'A whip antenna with a blinking tip. From the battle pass.' },
  spoiler: { name: 'Spoiler',       cat: 'Cosmetic',  cpu: 0,  hp: 40,  mass: .2,  lvl: 1, ach: 'bp_p_spoiler', desc: 'A rear wing that does nothing except look fast. From the battle pass.' },
  flag:    { name: 'Flag',          cat: 'Special',   cpu: 1,  hp: 20,  mass: .2,  lvl: 1, desc: 'Flies your paint color. Purely for style.' },
  ski:     { name: 'Ski',           cat: 'Movement',  cpu: 7,  hp: 120, mass: 1.5, lvl: 4, desc: 'Glides fast on ice, snow and downhill, slides in turns. Bottom layer, carries about 30 mass.' },
  insect:  { name: 'Insect Leg',    cat: 'Movement',  cpu: 12, hp: 160, mass: 2.2, lvl: 6, desc: 'Scuttles up steep slopes and over rocks that stop other legs. Bottom layer, carries about 40 mass.' },
  sprint:  { name: 'Sprinter Leg',  cat: 'Movement',  cpu: 13, hp: 140, mass: 2,   lvl: 8, desc: 'Long, quick legs: the fastest walker, but lightly armored. Bottom layer, carries about 38 mass.' },
  prop:    { name: 'Propeller',     cat: 'Movement',  cpu: 7,  hp: 60,  mass: 1,   lvl: 5, desc: 'Cheaper, gentler push than a thruster. Planes can fly on propellers alone.' },
  balloon: { name: 'Lift Balloon',  cat: 'Movement',  cpu: 6,  hp: 45,  mass: .3,  lvl: 4, desc: 'Gas bag that makes the bot lighter: each one cancels about 12 mass for wheels, legs and jets. Pops easily.' },
  arc:     { name: 'Arc Lance',     cat: 'Weapons',   cpu: 24, hp: 110, mass: 2.5, lvl: 6, weapon: true, desc: 'Hold fire for a crackling beam that melts blocks at close range.' },
  mine:    { name: 'Gravity Mine',  cat: 'Weapons',   cpu: 20, hp: 100, mass: 2.5, lvl: 5, weapon: true, desc: 'Lobs gravity mines. One that lands near an enemy drags them in and bursts at once; otherwise it waits as a trap. Up to 6 at once.' },
  lancer:  { name: 'Rail Lancer',   cat: 'Weapons',   cpu: 34, hp: 90,  mass: 3,   lvl: 9, weapon: true, desc: 'Charges while you hold fire, then fires one huge piercing shot across the map.' },
  m_shield:{ name: 'Shield Bubble', cat: 'Modules',   cpu: 15, hp: 120, mass: 2,   lvl: 4, module: 'shield', desc: 'F: a bubble that blocks all damage for 3 seconds. Costs 40 energy.' },
  m_cloak: { name: 'Cloak',         cat: 'Modules',   cpu: 16, hp: 100, mass: 1.5, lvl: 5, module: 'cloak', desc: 'G: turn invisible to enemies for 6 seconds. Firing breaks it. Costs 30 energy.' },
  m_blink: { name: 'Blink Drive',   cat: 'Modules',   cpu: 14, hp: 100, mass: 1.5, lvl: 5, module: 'blink', desc: 'R: teleport about 30 m the way you are moving. Costs 25 energy.' },
  m_emp:   { name: 'EMP Pulse',     cat: 'Modules',   cpu: 20, hp: 110, mass: 2,   lvl: 7, module: 'emp', desc: 'T: stuns every enemy within 25 m for 2.5 seconds. Costs 50 energy.' },
  m_power: { name: 'Power Cell',    cat: 'Modules',   cpu: 10, hp: 90,  mass: 1.5, lvl: 4, module: 'power', desc: 'Z: refills 60 energy (25 s cooldown). Each cell also adds 25 energy capacity.' },
  m_fly:   { name: 'Sky Booster',  cat: 'Modules',   cpu: 18, hp: 110, mass: 1.5, lvl: 3, module: 'fly', desc: 'B: rocket thrust lifts a ground bot into the air for 6 seconds. Space and C climb and dive. Costs 30 energy.' },
  m_disrupt:{ name: 'Disruptor',    cat: 'Modules',   cpu: 16, hp: 100, mass: 1.5, lvl: 8, module: 'disrupt', desc: 'H: shuts down enemy modules within 30 m for 8 seconds and drains their energy. Costs 35 energy.' },
  tesla:   { name: 'Tesla Blade',   cat: 'Weapons',   cpu: 9,  hp: 280, mass: 1.5, lvl: 2, melee: true, rot: true, desc: 'Always-on shock blade. Shreds any enemy block it touches, and its pull drags you onto enemies within 9 m ahead. R turns it.' },
};
const PART_ORDER = ['cube', 'wedge', 'slab', 'pyr', 'inner', 'round', 'cyl', 'hwedge', 'tetra', 'plate', 'strut', 'seat', 'wheel', 'tread', 'ski', 'leg', 'insect', 'sprint', 'hover', 'jet', 'rotor', 'wing', 'thruster', 'prop', 'balloon',
  'blaster', 'nano', 'mortar', 'plasma', 'chain', 'rail', 'flak', 'seeker', 'mine', 'arc', 'lancer', 'tesla', 'm_shield', 'm_cloak', 'm_blink', 'm_emp', 'm_power', 'm_disrupt', 'm_fly', 'shieldp', 'projector', 'spike', 'flag', 'lamp', 'exhaust', 'antenna', 'spoiler'];
// network/save codes: never reorder, only append (old saves and shop robots depend on these numbers)
const PART_CODES = ['cube', 'wedge', 'slab', 'pyr', 'inner', 'round', 'tetra', 'plate', 'strut', 'seat', 'wheel', 'tread', 'leg', 'hover', 'jet', 'rotor', 'wing', 'thruster', 'blaster', 'nano', 'mortar', 'plasma', 'chain', 'rail', 'flak', 'seeker', 'tesla', 'shieldp', 'flag',
  'ski', 'insect', 'sprint', 'prop', 'balloon', 'arc', 'mine', 'lancer', 'm_shield', 'm_cloak', 'm_blink', 'm_emp', 'm_power', 'm_disrupt', 'lamp', 'exhaust', 'cyl', 'hwedge', 'spike', 'projector', 'antenna', 'spoiler', 'm_fly'];
const MODULES = { shield: { key: 'KeyF', label: 'F', cost: 40, cd: 8, name: 'Shield' }, cloak: { key: 'KeyG', label: 'G', cost: 30, cd: 12, name: 'Cloak' }, blink: { key: 'KeyR', label: 'R', cost: 25, cd: 4, name: 'Blink' },
  emp: { key: 'KeyT', label: 'T', cost: 50, cd: 15, name: 'EMP' }, power: { key: 'KeyZ', label: 'Z', cost: 0, cd: 25, name: 'Power' }, disrupt: { key: 'KeyH', label: 'H', cost: 35, cd: 14, name: 'Disrupt' },
  fly: { key: 'KeyB', label: 'B', cost: 30, cd: 18, name: 'Sky Booster' } };
// weapons that heat up while firing: heat gained per second of fire; at 100% they lock for a few seconds
const HEAT = { blaster: .085, chain: .15, plasma: .07, flak: .09, arc: .1 }, HEAT_LOCK = 2.5;
const MODULE_TYPES = Object.keys(MODULES);
const FINISHES = [{ id: 'standard', name: 'Standard', lvl: 1 }, { id: 'matte', name: 'Matte', lvl: 1 }, { id: 'gloss', name: 'Gloss', lvl: 2 }, { id: 'chrome', name: 'Chrome', lvl: 5 }, { id: 'neon', name: 'Neon', lvl: 8 }, { id: 'carbon', name: 'Carbon', lvl: 1, ach: 'dmg_1m' }, { id: 'gold', name: 'Gold', lvl: 1, ach: 'quests_10' },
  { id: 'camo', name: 'Camo', lvl: 1, ach: 'bp_f_camo' }, { id: 'frost', name: 'Frost', lvl: 1, ach: 'bp_f_frost' }, { id: 'magma', name: 'Magma', lvl: 1, ach: 'bp_f_magma' }, { id: 'holo', name: 'Holo', lvl: 1, ach: 'bp_f_holo' }];
const TIERS = [null,
  { name: 'Scrap Steel',     hp: 60,  cpu: 1, mass: 1,    lvl: 1 },
  { name: 'Riveted Iron',    hp: 90,  cpu: 1, mass: 1.15, lvl: 2 },
  { name: 'Forged Alloy',    hp: 150, cpu: 2, mass: 1.1,  lvl: 3 },
  { name: 'Composite',       hp: 190, cpu: 2, mass: 1.15, lvl: 4 },
  { name: 'Hex Titanium',    hp: 260, cpu: 3, mass: 1.15, lvl: 5 },
  { name: 'Reactive Plate',  hp: 310, cpu: 3, mass: 1.2,  lvl: 6 },
  { name: 'Nanoweave',       hp: 390, cpu: 4, mass: 1.2,  lvl: 7 },
  { name: 'Ceramite',        hp: 450, cpu: 4, mass: 1.25, lvl: 8 },
  { name: 'Quantum Lattice', hp: 540, cpu: 5, mass: 1.25, lvl: 9 },
  { name: 'Neutronium',      hp: 620, cpu: 5, mass: 1.3,  lvl: 10 },
];
const isShape = t => !!(PARTS[t] && PARTS[t].shape);
// armor materials: picked in the garage next to the tier; they scale health, mass and CPU of shape blocks
const MATERIALS = {
  std:      { name: 'Standard', hp: 1, mass: 1, cpu: 1, lvl: 1, desc: 'Balanced armor.' },
  light:    { name: 'Light Alloy', hp: .55, mass: .35, cpu: 1, lvl: 2, desc: 'Weak but very light: faster bots, bigger flyers.' },
  heavy:    { name: 'Heavy Plate', hp: 2.2, mass: 2.6, cpu: 2, lvl: 3, desc: 'Twice the armor, much heavier, double CPU.' },
  reactive: { name: 'Reactive', hp: 1.1, mass: 1.3, cpu: 1.5, lvl: 5, splash: .5, desc: 'Takes half damage from explosions and splash.' },
  energy:   { name: 'Energy Armor', hp: .9, mass: .4, cpu: 2, lvl: 8, regen: .1, desc: 'Light glowing armor that regenerates 10% a second after 4 seconds without damage.' },
};
const MAT_CODES = ['std', 'light', 'heavy', 'reactive', 'energy'];
const matOf = b => MATERIALS[b.m] || MATERIALS.std;
const partCpu = b => isShape(b.t) ? Math.ceil(TIERS[b.k || 1].cpu * matOf(b).cpu) : PARTS[b.t].cpu;
// guns are armored to match the bot they sit on: twice their base health, more on bots built from higher armor tiers
const gunHpMul = topTier => 2 * Math.sqrt(TIERS[clamp(topTier | 0, 1, 10)].hp / TIERS[1].hp);
const partHp = b => isShape(b.t) ? Math.round(TIERS[b.k || 1].hp * PARTS[b.t].hpF * matOf(b).hp) : PARTS[b.t].hp;
const partMass = b => isShape(b.t) ? TIERS[b.k || 1].mass * PARTS[b.t].massF * matOf(b).mass : PARTS[b.t].mass;
const maxTier = l => { let k = 1; for (let i = 1; i < TIERS.length; i++) if (TIERS[i].lvl <= l) k = i; return k; };
const OLD_TIER = [0, 1, 3, 4, 5, 6, 7]; // v2 had six tiers
function migrateDesign(d) {
  if (!d || !Array.isArray(d.blocks)) return d;
  const v = d.v || 1;
  d.blocks = d.blocks.filter(b => b.t === 'heavy' || PARTS[b.t]).map(b => {
    b = { ...b };
    if (b.t === 'heavy') { b.t = 'cube'; b.k = 4; }
    if (v < 2 && b.t === 'wedge' && b.r >= 4) b.r = (b.r % 4) + 32;
    if (v === 2 && isShape(b.t) && b.k) b.k = OLD_TIER[b.k] || 1;
    if (isShape(b.t)) b.k = clamp(b.k || 1, 1, 10);
    return b;
  });
  d.v = 3; return d;
}
const WEAPONS = {
  blaster: { slot: 1, cd: 0.3, dmg: 19, speed: 230, spread: 0.012, life: 0.95, minInt: 0.05, range: 170 },
  plasma:  { slot: 2, cd: 1.5, dmg: 115, speed: 140, grav: 12, splash: 4, life: 3, minInt: 0.25, range: 220 },
  mortar:  { slot: 3, cd: 2.4, dmg: 190, speed: 100, grav: 36, splash: 5.5, life: 7, minInt: 0.35, range: 250 },
  rail:    { slot: 4, cd: 2.8, dmg: 300, minInt: 0.5, range: 440 },
  seeker:  { slot: 5, cd: 2.2, dmg: 160, speed: 55, maxSpeed: 115, turn: 4.2, splash: 3, life: 6, minInt: 0.3, range: 340 },
  flak:    { slot: 6, cd: 0.85, dmg: 65, speed: 190, splash: 6, fuse: 5, life: 2, minInt: 0.15, range: 320, airBonus: 2.5 },
  chain:   { slot: 7, cd: 0.15, dmg: 14, speed: 270, spread: 0.022, life: 0.85, minInt: 0.025, range: 190, spin: 1.6 },
  nano:    { slot: 8, cd: 0.12, heal: 26, minInt: 0.02, range: 70 },
  arc:     { slot: 9, cd: 0.4, dmg: 36, minInt: 0.1, range: 65 },
  mine:    { slot: 10, cd: 1.7, dmg: 340, speed: 48, grav: 26, splash: 7, life: 40, minInt: 0.5, range: 120, pull: 10 },
  lancer:  { slot: 11, cd: 4.5, dmg: 950, charge: 1.2, minInt: 1.5, range: 560 },
};
const WTYPES = ['blaster', 'plasma', 'mortar', 'rail', 'seeker', 'flak', 'chain', 'nano', 'arc', 'mine', 'lancer'];
const SPLASH = { cap: 2.6 }; // a splash weapon deals at most this many times its damage to one bot per blast
const TESLA = { tick: 0.12, dmg: 55, reach: 1.5, magnet: 9, pull: 40 }; // magnet: metres; pull: m/s² at point blank
const TESLA_DPS = Math.round(TESLA.dmg / TESLA.tick);
const tierScale = l => .75 * Math.pow(cpuMax(l) / 150, .5);
const TIER_NAMES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const hasWeapon = s => WTYPES.some(t => s.weapons[t]) || s.teslas > 0;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const xpForLevel = l => 250 * (l - 1) * l / 2;
const levelFromXp = xp => { let l = 1; while (l < 10 && xp >= xpForLevel(l + 1)) l++; return l; };
const cpuMax = l => 150 + 40 * (l - 1) + BAL.cpuBonus;
// tuning a dedicated server can change live (balance.json); the defaults are the normal game
const BAL = { weaponDamage: {}, xpRate: 1, cpuBonus: 0, reactorHealth: 1, respawnSeconds: 6 };
const BC_VERSION = '2.8.5';
// rebindable battle controls (Settings → Controls); weapons stay on the number keys
const KEY_DEFAULTS = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', strafeL: 'KeyQ', strafeR: 'KeyE', up: 'Space', down: 'KeyC', boost: 'ShiftLeft',
  board: 'Tab', chat: 'Enter', callouts: 'KeyV', destruct: 'KeyX', mod_shield: 'KeyF', mod_cloak: 'KeyG', mod_blink: 'KeyR', mod_emp: 'KeyT', mod_power: 'KeyZ', mod_disrupt: 'KeyH', mod_fly: 'KeyB' };
const KEY_NAMES = { forward: 'Drive forward', back: 'Reverse', left: 'Turn left', right: 'Turn right', strafeL: 'Strafe left', strafeR: 'Strafe right', up: 'Jets / climb', down: 'Descend', boost: 'Boost dash',
  board: 'Scoreboard', chat: 'Chat', callouts: 'Quick callouts', destruct: 'Self-destruct', mod_shield: 'Shield Bubble', mod_cloak: 'Cloak', mod_blink: 'Blink Drive', mod_emp: 'EMP Pulse', mod_power: 'Power Cell', mod_disrupt: 'Disruptor', mod_fly: 'Sky Booster' };
const KB = a => (settings.keys && settings.keys[a]) || KEY_DEFAULTS[a];
const keyLabel = c => !c ? '—' : c.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'R-Shift').replace('ControlLeft', 'Ctrl').replace('AltLeft', 'Alt').replace(/^Arrow/, 'Arrow ').replace('Backslash', '\\').replace('Semicolon', ';').replace('Comma', ',').replace('Period', '.').replace('Slash', '/');
const CHANGELOG = [
  ['2.8.5', ['Guns can be rotated in the garage (R, T and F): mount them sideways, under the hull or facing back. Every gun now tracks your crosshair, whichever weapon is selected.', 'Guns are much tougher: twice their old health, rising with the best armor tier on your bot.', 'Mortars, plasma, flak and gravity mines hit a wider area and deal more splash damage.', 'Your base pad repairs your bot and rebuilds lost blocks when you have been out of combat for 5 seconds.', 'Losing wheels, treads, legs, hover pads, rotors or thrusters slows you down.', '10 garage bays, and bots can be built twice as tall.', 'Paint and Fill only change colour now; they no longer reset armor tier or material.', 'Friends show their names, and the Friends list shows which server and room each friend is in. The Server browser lists who is playing in each room.', 'Smoother multiplayer: positions are sent twice as often on RoboBlocks servers.', 'Steadier camera: ignores the odd mouse jump, uses raw mouse input, and no longer pops up over bumps.']],
  ['2.8.4', ['On everything-unlocked servers, weapons now fire at Mk X like the armor they face, instead of at your pilot level\'s mark.']],
  ['2.8.3', ['Servers can unlock everything for their players (BC_UNLOCK_ALL): every part, armor tier, material, finish and CPU core, with no level or Tech Tree requirements.', 'Clearer messages when the updater or the desktop launcher cannot reach a server.']],
  ['2.8.2', ['Servers keep themselves up to date: they check for new releases every hour, install them, and restart when nobody is playing.', 'The desktop app updates itself from each new release automatically.']],
  ['2.8.1', ['Online play now runs only on RoboBlocks servers. The main menu\'s Server browser lists this server\'s rooms live, other servers and favourites, and takes any server address.', 'Friend codes: every pilot has a code like RB-7K3Q-X9PD. Add friends by code, or straight from the pilot list in the Server browser.', 'Sound starts as soon as the game opens (on the first key or click in browsers that hold it back).', 'Garage: middle click picks the block under the cursor (part, color, armor). Mirror is now a simple on/off switch, with its own button for the direction.', 'Bigger, easier-to-read text in the Tech Tree.', 'The connection-lost banner no longer covers other messages.']],
  ['2.8.0', ['Loadouts: your garage bays are your loadout. Pick which bot to deploy, and while wrecked press 1–5 (LB/RB on a gamepad, or tap a card) to rebuild as a different bot. Works online.', 'Map sizes: Small, Medium and Large arenas, or Auto to match the team size. Obstacles, trees and craters scale with the map.', 'Three new space maps: Crimson Nebula (glowing gas and ice shards), Dry Dock (a half-built cruiser inside a scaffold) and Ring Belt (bands of rock with clear lanes). Choose one in Battle setup.', 'Painted nebula skies, ringed planets with glowing atmospheres, and work lights in space.', 'New Ultra graphics: full-resolution rendering, light shafts from the sun, film grain, and wider, sharper shadows.', 'Every map has its own colour grade on High and Ultra.', 'RoboBlocks is now on GitHub: servers install and update from the latest release.']],
  ['2.7.0', ['Weapon balance pass, tested with thousands of AI duels: every weapon now wins its fair share in its own range.', 'Splash damage is capped per blast (1.8 times its damage to one bot), so tightly packed bots no longer take ten times the damage from mortars and plasma.', 'Flak shells now burst right next to ground bots instead of short of them.', 'Arc Lance: each extra lance now adds damage. Gravity mines snap shut when they land near an enemy. Tesla blades are cheaper, tougher, hit harder and pull you onto nearby enemies.', 'Blaster, chain gun, plasma, rail and Rail Lancer toned down slightly; seeker, flak and mines buffed.']],
  ['2.6.0', ['New desktop app: RoboBlocks runs in its own window and updates itself from your server.', 'Far more detailed robots: armored turret mounts, cooling rings, ammo boxes, coil rails, tread links, rotor blades and bevelled armor blocks.', 'Barrels kick back when they fire.', 'Speeds show in mph (switch to km/h in Settings). Settings also has a Simple robot detail option for older computers.']],
  ['2.5.0', ['Tech Tree: earn tech points by levelling up (and every 2,000 XP past level 10) and from achievements, then spend them on a hex map of parts, armor tiers, materials and CPU Cores. Open it from the main menu or the garage.', 'Pilots who played before keep everything their level already gave them, for free, plus all their points.']],
  ['2.4.0', ['BlockCraft is now RoboBlocks.', 'Sky Booster module (level 3): a few seconds of rocket flight for ground bots. Press B.', 'All-new sound: every weapon, engine, impact and module has its own sound, plus a new soundtrack that follows the fight.', 'Rapid-fire guns heat up; push them too long and they vent for a few seconds.', 'Gamepad buttons can be rebound in Settings, Controls.']],
  ['2.3.0', ['Armor materials: Light, Heavy, Reactive and Energy. New blocks: cylinder, half wedge, ram spike and the Shield Projector energy barrier.', 'New modes: Capture the Core, King of the Hill, Horde co-op and a Weekly Brawl.', 'Skill rating with balanced teams, a free cosmetic battle pass, friends and a server browser.', 'Weapon groups, bot templates, key rebinding and gamepad support.']],
  ['2.2.0', ['Bug reports: press F8 anywhere and tell us what happened.', 'F3 shows frame rate and ping.', 'Reconnects automatically if your connection drops, and puts you back in your match.', 'Change your password from the account screen.', 'Graphics switch to Fast by themselves on slow machines. Shadowing and reflections have their own switches in Settings.', 'Report a player from the pause menu, or type /report name reason in chat.']],
  ['2.1.0', ['Space Battle: zero gravity in an asteroid field, flying bots only.', 'The garage is now a hangar, with a new toolbar, layer view, balance marker, part search and bay manager.', 'Soft shadowing between blocks, and reflections on ice, lava and the garage floor.']],
  ['2.0.0', ['Rustgate Ruins and Lunar Outpost maps, weather and time of day.', 'Modules, new movement parts and weapons, and The Pit.', 'Parties, clans, quests, achievements, replays and quick play.']],
];
const PILOTS = ['Bolt', 'Cass', 'Dyna', 'Echo', 'Flint', 'Gauge', 'Hex', 'Ivo', 'Jolt', 'Kade', 'Lumen', 'Marrow', 'Nettle', 'Onyx', 'Pax', 'Quarry', 'Rasp', 'Sable', 'Tork', 'Umber', 'Volt', 'Wyck', 'Xeno', 'Yara', 'Zed', 'Clank', 'Burr', 'Moss', 'Vex', 'Rook', 'Ironjaw', 'Sprocket', 'Kestrel', 'Bramble', 'Nyx', 'Torque', 'Grit', 'Halcyon', 'Mox', 'Ferrite', 'Quill', 'Rivet', 'Ashgrove', 'Slag', 'Juno', 'Pike', 'Cinder', 'Wrench', 'Dross', 'Tamsin', 'Ozzy', 'Brakka'];
const MODES = {
  space: { name: 'Space Battle', short: 'SPACE', desc: 'Zero gravity among the asteroids. Flying bots only: thrusters, jets, rotors, propellers or hover pads. First team to the kill limit wins.' },
  pit:   { name: 'The Pit', short: 'PIT', desc: 'Every bot for itself. Most kills wins; the leader shows on everyone\'s map.' },
  tdm:   { name: 'Team Deathmatch', short: 'TDM', desc: 'Respawns on. Wreck enemy bots; the first team to the kill limit wins.' },
  arena: { name: 'Battle Arena', short: 'ARENA', desc: 'Capture and hold beacons A, B and C to build score. Kills add a little too. First to the target wins.' },
  elim:  { name: 'Elimination', short: 'ELIM', desc: 'No respawns. The last team with a bot still running wins.' },
  ctc:   { name: 'Capture the Core', short: 'CORE', desc: 'Steal the enemy data core from their base and drive it to yours while your own core is home. First to 3 captures wins.' },
  koth:  { name: 'King of the Hill', short: 'HILL', desc: 'One beacon in the middle of the map. Hold it to score a point every second.' },
  horde: { name: 'Horde', short: 'HORDE', desc: 'Co-op against ten waves of enemy bots, with a boss every fifth wave. Your squad shares a pool of rebuilds.' },
  brawl: { name: 'Weekly Brawl', short: 'BRAWL', get desc() { return brawlBlurb(); } },
};
const MAPS = {
  dust: {
    name: 'Dust Basin', blurb: 'Open desert basin ringed by mesas. Long sightlines.', size: 860, seed: 11, amp: 10,
    sky: [0xe9c29a, 0x5a86ad], fog: 0xe0bd96, fogNear: 170, fogFar: 760, sun: [-.5, .62, -.4], sunCol: 0xfff0d8, sunI: 2.2,
    hemi: [0xdfe9ff, 0x8a6a4a, .65], ground: [0x8e6c4a, 0xc29d6e, 0x6f5d4c], pad: 0x6b6f72,
    mesas: 18, rocks: 170, rockCol: [0x8f7a63, 0x77675a], decor: 'desert', clouds: .38, dust: 0xbf9b72, liquid: null,
  },
  frost: {
    name: 'Frostline', blurb: 'Snowy ridges, pine forests and frozen lakes where wheels slide.', size: 960, seed: 23, amp: 15, ridge: true,
    sky: [0xdde7ef, 0x6d92b8], fog: 0xd3e0ea, fogNear: 140, fogFar: 700, sun: [.42, .45, -.5], sunCol: 0xfff6ee, sunI: 2.0,
    hemi: [0xe8f2ff, 0x8aa0b4, .7], ground: [0xb9c6cf, 0xf1f5f8, 0x67737c], pad: 0x5d6870,
    mesas: 10, rocks: 140, rockCol: [0x7d8890, 0x5f6a72], decor: 'pines', clouds: .55, dust: 0xeef4f8,
    liquid: { type: 'ice', y: -4, color: 0xa9d7ee },
  },
  ash: {
    name: 'Ashfall Rift', blurb: 'Basalt canyons split by lava rivers. Only hovers and flyers cross the lava safely.', size: 900, seed: 37, amp: 12, canyon: true,
    sky: [0xb3603e, 0x2b1e2b], fog: 0x5e3c33, fogNear: 110, fogFar: 620, sun: [.3, .35, .6], sunCol: 0xffb27f, sunI: 1.9,
    hemi: [0xffb48a, 0x3a2420, .6], ground: [0x3a3230, 0x5f544d, 0x221c1b], pad: 0x4a4440,
    mesas: 16, rocks: 150, rockCol: [0x2e2828, 0x3f3634], decor: 'embers', clouds: .28, dust: 0x4c423e,
    liquid: { type: 'lava', y: -4.5, color: 0xff5a1a },
  },
  city: {
    name: 'Rustgate Ruins', blurb: 'A bombed-out city. Streets, tall cover, and buildings that crumble under heavy fire.', size: 820, seed: 51, amp: 1.4, city: true,
    sky: [0xc8c2b8, 0x6a7a8a], fog: 0xa8a49c, fogNear: 120, fogFar: 640, sun: [-.35, .58, .5], sunCol: 0xfff1de, sunI: 2.0,
    hemi: [0xdfe6f0, 0x6a6458, .6], ground: [0x5f5a52, 0x77716a, 0x4a4743], pad: 0x55595c,
    mesas: 0, rocks: 50, rockCol: [0x7b766e, 0x5f5b55], decor: 'rubble', clouds: .5, dust: 0x9a948a, liquid: null,
  },
  space: {
    name: 'Orbital Wreckfield', blurb: 'Open space, an asteroid field and a wrecked station. Used by Space Battle.', size: 900, seed: 83, amp: 0, space: true, grav: 0,
    sky: [0x1a1030, 0x020208], fog: 0x0a0814, fogNear: 260, fogFar: 1100, sun: [.6, .35, -.5], sunCol: 0xfff4e8, sunI: 2.8,
    hemi: [0x7a88b0, 0x2a1830, .5], ground: [0x222222, 0x333333, 0x111111], pad: 0x333333,
    mesas: 0, rocks: 0, rockCol: [0x6a625c, 0x544c48], decor: 'none', clouds: 0, dust: 0x8a8078, liquid: null, layout: 'wreck', nebula: [0x6a3cff, 0x2a8cff],
  },
  nebula: {
    name: 'Crimson Nebula', blurb: 'Glowing gas clouds that hide you from far away, ice shards and a derelict relay.', size: 900, seed: 91, amp: 0, space: true, grav: 0,
    sky: [0x3a0c22, 0x08020a], fog: 0x2a0a1c, fogNear: 140, fogFar: 620, sun: [-.5, .3, .55], sunCol: 0xffc0a8, sunI: 2.4,
    hemi: [0xff8aa8, 0x2a0a30, .62], ground: [0x222222, 0x333333, 0x111111], pad: 0x333333,
    mesas: 0, rocks: 0, rockCol: [0x8a6a78, 0x5a4458], decor: 'none', clouds: 0, dust: 0xc07a90, liquid: null, layout: 'nebula', nebula: [0xff3a6a, 0xff9a3c],
  },
  shipyard: {
    name: 'Dry Dock', blurb: 'An orbital shipyard: girder scaffolds, a half-built cruiser and cargo containers to fight around.', size: 900, seed: 103, amp: 0, space: true, grav: 0,
    sky: [0x0c1626, 0x010206], fog: 0x08101c, fogNear: 300, fogFar: 1200, sun: [.3, .55, .6], sunCol: 0xfff8ee, sunI: 3.0,
    hemi: [0x9ab4d8, 0x1a2230, .55], ground: [0x222222, 0x333333, 0x111111], pad: 0x333333,
    mesas: 0, rocks: 0, rockCol: [0x6a6e74, 0x50545a], decor: 'none', clouds: 0, dust: 0x8a9098, liquid: null, layout: 'shipyard', nebula: [0x2a6cff, 0x22d0c0],
  },
  rings: {
    name: 'Ring Belt', blurb: 'Inside a gas giant\'s rings: bands of ice and rock with clear lanes between them.', size: 900, seed: 117, amp: 0, space: true, grav: 0,
    sky: [0x1c1a10, 0x030302], fog: 0x14120a, fogNear: 240, fogFar: 1050, sun: [-.65, .25, -.4], sunCol: 0xffe6b8, sunI: 2.9,
    hemi: [0xe0c890, 0x2a2218, .55], ground: [0x222222, 0x333333, 0x111111], pad: 0x333333,
    mesas: 0, rocks: 0, rockCol: [0xb8ac98, 0x8a7e6c], decor: 'none', clouds: 0, dust: 0xc8b89a, liquid: null, layout: 'rings', nebula: [0xffb05a, 0x8a5aff],
  },
  moon: {
    name: 'Lunar Outpost', blurb: 'Low gravity, deep craters and jump pads. Everything flies farther here.', size: 900, seed: 67, amp: 4, moon: true, grav: 9,
    sky: [0x0a0c12, 0x000000], fog: 0x0c0e14, fogNear: 300, fogFar: 1300, sun: [.55, .42, -.35], sunCol: 0xffffff, sunI: 2.6,
    hemi: [0x8a94a8, 0x1a1a1e, .35], ground: [0x6d6d70, 0x9a9a9c, 0x4c4c50], pad: 0x3e4a56,
    mesas: 0, rocks: 120, rockCol: [0x77777a, 0x5c5c60], decor: 'moon', clouds: 0, dust: 0x8c8c90, liquid: null,
  },
};
const MAP_ORDER = ['dust', 'frost', 'ash', 'city', 'moon'];
// Space Battle has its own maps
const SPACE_ORDER = ['space', 'nebula', 'shipyard', 'rings'];
const pickMap = (list, r = Math.random) => list[r() * list.length | 0];
// map sizes scale the whole arena; Auto picks by team size (5v5 small, 10v10 medium, 20v20 large)
const MAP_SIZES = { small: { k: .72, name: 'Small', blurb: 'Tight and fast. Fights start in seconds.' }, medium: { k: 1, name: 'Medium', blurb: 'The standard arena.' }, large: { k: 1.4, name: 'Large', blurb: 'Room to flank, long sightlines.' } };
const autoMapSize = n => n <= 5 ? 'small' : n >= 20 ? 'large' : 'medium';
const mapSizeOf = (sz, n) => MAP_SIZES[sz] ? sz : autoMapSize(n || 10);
// each match picks a time of day and weather (from the match seed, so every player sees the same)
const MAP_TOD = { dust: ['day', 'dusk', 'dawn'], frost: ['day', 'dawn', 'dusk'], ash: ['day', 'night'], city: ['day', 'dusk', 'night'], moon: ['day'], space: ['day'], nebula: ['day'], shipyard: ['day'], rings: ['day'] };
const MAP_WX = { dust: 'sand', frost: 'snow', ash: 'ash', city: 'rain', moon: 'none', space: 'none', nebula: 'none', shipyard: 'none', rings: 'none' };

let progress = Object.assign({ xp: 0, matches: 0, wins: 0, kills: 0 }, store.get('sfa.progress', {}));
// HEADLESS: this copy runs inside the Node dedicated server (no screen, no audio); it hosts one official server.
const HEADLESS = !!(typeof window !== 'undefined' && window.__BC_HEADLESS);
// "everything unlocked" servers (BC_UNLOCK_ALL): every part, tier, material, finish and CPU core is open to everyone there
let UNLOCK_ALL = !!(typeof window !== 'undefined' && window.__BC_SERVER && window.__BC_SERVER.unlockAll);
const unlockLv = () => UNLOCK_ALL ? 10 : level();
const level = () => HEADLESS ? clamp((window.__BC_SERVER && window.__BC_SERVER.aiLevel) | 0 || 5, 1, 10) : levelFromXp(progress.xp);

// ================= STATS / MOBILITY =================
function computeStats(list) {
  const s = { cpu: 0, mass: 0, hp: 0, count: list.length, wheels: 0, treads: 0, legs: 0, skis: 0, insects: 0, sprints: 0, props: 0, balloons: 0, modules: {}, hovers: 0, jets: 0, rotors: 0, wings: 0, thrusters: 0, teslas: 0, seat: 0, weapons: {}, bottom: Infinity };
  for (const t of WTYPES) s.weapons[t] = 0;
  for (const b of list) {
    const p = PARTS[b.t]; s.cpu += partCpu(b); s.mass += partMass(b); s.hp += partHp(b);
    if (b.t === 'seat') s.seat++;
    if (p.weapon) s.weapons[b.t]++;
    if (b.t === 'hover') s.hovers++;
    if (b.t === 'jet') s.jets++;
    if (b.t === 'rotor') s.rotors++;
    if (b.t === 'tesla') s.teslas++;
    if (b.t === 'wing') s.wings++;
    if (b.t === 'thruster') s.thrusters++;
    if (b.t === 'prop') s.props++;
    if (b.t === 'balloon') s.balloons++;
    if (p.module) s.modules[p.module] = (s.modules[p.module] || 0) + 1;
    const bt = b.y - (b.t === 'wheel' ? 0.56 : 0.5); if (bt < s.bottom) s.bottom = bt;
  }
  for (const b of list) {
    if (b.t === 'wheel' && b.y - 0.56 <= s.bottom + 0.3) s.wheels++;
    if (b.t === 'tread' && b.y - 0.5 <= s.bottom + 0.3) s.treads++;
    if (b.t === 'leg' && b.y - 0.5 <= s.bottom + 0.3) s.legs++;
    if (b.t === 'ski' && b.y - 0.5 <= s.bottom + 0.3) s.skis++;
    if (b.t === 'insect' && b.y - 0.5 <= s.bottom + 0.3) s.insects++;
    if (b.t === 'sprint' && b.y - 0.5 <= s.bottom + 0.3) s.sprints++;
  }
  if (!list.length) s.bottom = -0.5;
  s.mass = Math.max(1, s.mass);
  return s;
}
// how much the bot's propulsion parts push, all kinds together (for slowing a bot that has lost some)
const propulsionOf = s => s.wheels * 32 + s.treads * 45 + (s.legs + (s.insects || 0) + (s.sprints || 0)) * 45 + (s.skis || 0) * 30 + s.hovers * 26 + s.rotors * 22 + s.wings * 20 + s.thrusters * 25 + (s.props || 0) * 16 + s.jets * 10;
function mobility(s) {
  const mass = Math.max(1, s.mass - (s.balloons || 0) * 12); // lift balloons make everything lighter
  const legsAll = s.legs + (s.insects || 0) + (s.sprints || 0);
  const ground = s.wheels * 32 + s.treads * 45 + s.legs * 50 + (s.skis || 0) * 30 + (s.insects || 0) * 40 + (s.sprints || 0) * 38;
  const groundF = ground ? Math.min(1, ground / mass) : 0;
  const lift = s.hovers ? s.hovers * 26 / mass : 0;
  const rlift = s.rotors ? s.rotors * 22 / mass : 0;
  const wlift = s.wings * 20 / mass, thrust = (s.thrusters * 25 + (s.props || 0) * 16) / mass;
  let mode = 'none';
  if (s.wings >= 2 && wlift >= .8 && thrust >= .5) mode = 'plane';
  else if (rlift >= .7) mode = 'rotor';
  else if (lift >= 0.55 && (Math.min(1, lift) >= groundF || lift >= 1)) mode = 'hover';
  else if (groundF > 0) {
    const top = Math.max(s.wheels, s.treads, legsAll, s.skis || 0);
    mode = legsAll === top ? 'leg' : (s.skis || 0) === top ? 'ski' : s.treads >= s.wheels ? 'tread' : 'wheel';
  }
  // which kind of legs: insects climb, sprinters run
  const legKind = mode !== 'leg' ? null : (s.sprints || 0) >= Math.max(s.legs, s.insects || 0) ? 'sprint' : (s.insects || 0) >= s.legs ? 'insect' : 'mech';
  const f = mode === 'plane' ? Math.min(1, thrust) : mode === 'rotor' ? Math.min(1, rlift) : mode === 'hover' ? Math.min(1, lift) : mode === 'none' ? 0 : groundF;
  const SP = { none: 0, wheel: 7 + 21 * Math.pow(f, 1.3), tread: 6 + 13 * f, leg: legKind === 'sprint' ? 8 + 16 * f : legKind === 'insect' ? 4 + 9 * f : 5 + 10 * f, ski: 9 + 22 * f, hover: 7 + 17 * f, rotor: 8 + 16 * f, plane: 22 + 26 * f };
  const TU = { none: .7, wheel: .7 + 1.5 * f, tread: 1 + 1.3 * f, leg: 1 + 1.2 * f, ski: .5 + 1 * f, hover: .8 + 1.5 * f, rotor: .8 + 1.1 * f, plane: .6 + .8 * f };
  let maxSpeed = SP[mode];
  if ((s.thrusters || s.props) && mode !== 'plane' && mode !== 'none') maxSpeed *= 1 + Math.min(.4, thrust * .4);
  return {
    mode, f, maxSpeed, turn: TU[mode], legKind, step: legKind === 'insect' ? 4.5 : legKind ? 2.6 : 0,
    accel: mode === 'tread' || mode === 'leg' ? 6 + 22 * f : mode === 'rotor' ? 4 + 16 * f : mode === 'plane' ? 8 + 14 * f : 6 + 28 * f,
    hoverH: mode === 'hover' ? 1.5 * clamp((lift - 0.55) / 0.45, 0.25, 1) : 0,
    maxAlt: mode === 'plane' ? 80 : mode === 'rotor' ? 55 * clamp((rlift - .7) / .6, .35, 1) : mode === 'hover' ? 6 : 0,
    jetAcc: s.jets ? s.jets * 40 * 1.45 * GRAV / mass : 0,
  };
}
function spaceMobility(s) {
  const mass = Math.max(1, s.mass - (s.balloons || 0) * 12);
  const thrust = s.thrusters * 25 + s.jets * 22 + s.rotors * 20 + (s.props || 0) * 16 + s.hovers * 16;
  if (!thrust) return { mode: 'none', f: 0, maxSpeed: 0, turn: .5, accel: 0, hoverH: 0, maxAlt: 170, jetAcc: 0, step: 0 };
  const f = Math.min(1, thrust / mass * 1.1);
  return { mode: 'space', f, maxSpeed: 12 + 24 * f, turn: 1 + 1.2 * f, accel: 6 + 20 * f, hoverH: 0, maxAlt: 170, jetAcc: 0, step: 0 };
}
const canFlyInSpace = s => (s.thrusters + s.jets + s.rotors + (s.props || 0) + s.hovers) > 0;
function firepower(w) { let best = 0; for (const t of WTYPES) { const n = w[t]; if (!n || t === 'nano') continue; const W = WEAPONS[t]; best = Math.max(best, W.dmg / Math.max(W.minInt, W.cd / n)); } return Math.round(best); }

// ================= DESIGN GENERATOR =================
// arch: car, hover, mortar, jumper, sniper, plasma, brawler, missile, flak, chain, medic, heli, tank
function genDesign(rnd, budget, arch, colors, tier = 1) {
  const blocks = [], occ = new Map(); let cpu = 0;
  const main = colors ? colors.main : (rnd() * COLORS.length | 0);
  const acc = colors ? colors.acc : (rnd() * COLORS.length | 0);
  const put = (x, y, z, t, c = main, r = 0) => {
    const k = ckey(x, y, z);
    if (occ.has(k)) { const o = occ.get(k); cpu -= partCpu(o); o.t = t; o.c = c; o.r = r; if (isShape(t)) o.k = tier; else delete o.k; cpu += partCpu(o); return o; }
    const b = { x, y, z, t, c, r }; if (isShape(t)) b.k = tier; occ.set(k, b); blocks.push(b); cpu += partCpu(b); return b;
  };
  const WT = { car: 'blaster', hover: rnd() < .5 && budget > 200 ? 'rail' : 'blaster', mortar: 'mortar', sniper: 'rail', jumper: 'blaster', plasma: 'plasma', brawler: 'blaster',
    missile: 'seeker', flak: 'flak', chain: 'chain', medic: 'blaster', heli: rnd() < .5 ? 'plasma' : 'blaster', tank: rnd() < .5 ? 'plasma' : 'chain', plane: rnd() < .5 ? 'blaster' : 'seeker', walker: rnd() < .5 ? 'rail' : 'plasma' };
  const wtype = WT[arch] || 'blaster';
  const move = arch === 'hover' || (arch === 'missile' && rnd() < .5) ? 'hover' : arch === 'heli' ? 'rotor' : arch === 'tank' ? 'tread' : arch === 'plane' ? 'plane' : arch === 'walker' ? 'leg' : 'wheel';
  const wcost = PARTS[wtype].cpu;
  const brawler = arch === 'brawler';
  const medic = arch === 'medic';
  let guns = clamp(Math.round(budget * (brawler ? 0.12 : medic ? 0.14 : 0.26) / wcost), 1, 6);
  const gunList = [];
  if (medic) { gunList.push('nano', 'nano'); if (budget > 260) gunList.push('nano'); }
  for (let i = 0; i < guns; i++) gunList.push(wtype);
  const gunCpu = gunList.reduce((a, t) => a + PARTS[t].cpu, 0);
  const jets = arch === 'jumper' ? (budget > 260 ? 4 : 2) : 0;
  const supportPer = { hover: 26, rotor: 22, tread: 45, wheel: 32, leg: 50, plane: 14 }[move], mobCost = move === 'plane' ? 16 : PARTS[move].cpu;
  const teslas = brawler ? clamp(Math.round(budget * 0.16 / 12), 2, budget > 220 ? 5 : 3) : 0;
  const armorBudget = budget - 5 - gunCpu - jets * 8 - teslas * 12;
  const TT = TIERS[tier];
  const cubeTarget = Math.max(12, Math.floor(armorBudget / (TT.cpu + TT.mass * mobCost / supportPer * 1.15)));
  const W = cubeTarget > 160 ? 3 : cubeTarget > 85 ? 2 : 1;
  const L = cubeTarget > 160 ? 4 : cubeTarget > 80 ? 3 : 2;
  put(0, 1, 0, 'seat', 3);
  let placed = 0, done = false;
  const layer = (y, w, l, wedgeFront) => {
    for (let z = -l; z <= l && !done; z++) for (let x = -w; x <= w; x++) {
      if (placed >= cubeTarget) { done = true; return; }
      if (occ.has(ckey(x, y, z))) continue;
      const front = wedgeFront && z === l;
      const stripe = (z === l || z === -l) && y > 0;
      const corner = front && w > 0 && Math.abs(x) === w;
      put(x, y, z, corner ? 'pyr' : front ? 'wedge' : 'cube', stripe ? acc : main, corner && x < 0 ? 3 : 0); placed++;
    }
  };
  layer(0, W, L, false);
  layer(1, W, L, true);
  layer(2, W, L - 1, true);
  if (W >= 2) { layer(3, W - 1, L - 1, true); layer(4, W - 1, L - 2, true); }
  if (W >= 3) layer(5, W - 2, L - 3, true);
  for (let z = -L; z <= L; z++) for (let x = -W; x <= W; x++) if (!occ.has(ckey(x, 0, z))) put(x, 0, z, 'cube', main);
  if (jets) for (const [x, z] of [[W, 1], [-W, 1], [W, -1], [-W, -1]]) if (!occ.has(ckey(x, 1, z))) put(x, 1, z, 'cube', main);
  // weapons on top
  const tops = new Map();
  for (const b of blocks) { const k = b.x + ',' + b.z; if (!tops.has(k) || tops.get(k).y < b.y) tops.set(k, b); }
  const sc = b => b.y - (b.t === 'wedge' || b.t === 'pyr' ? 1.5 : 0) - (move === 'rotor' && Math.abs(b.x) === W && Math.abs(b.z) === L ? 9 : 0);
  const cand = [...tops.values()].filter(b => b.x >= 0 && b.t !== 'seat').sort((a, b) => (sc(b) - sc(a)) || (b.z - a.z) || (b.x - a.x));
  const gunsAt = []; let gi = 0;
  const far = (x, z) => gunsAt.every(g => Math.abs(g.x - x) >= 2 || Math.abs(g.z - z) >= 2);
  const left = () => gunList.length - gi;
  for (const c of cand) {
    if (left() <= 0) break;
    if (c.x === 0) { if (left() % 2 === 1 && far(0, c.z)) { const ty = tops.get('0,' + c.z).y + 1; put(0, ty, c.z, gunList[gi++], acc); gunsAt.push({ x: 0, z: c.z }); } continue; }
    if (left() >= 2 && far(c.x, c.z)) {
      const mt = tops.get(-c.x + ',' + c.z); if (!mt) continue;
      const t = gunList[gi]; put(c.x, c.y + 1, c.z, t, acc); put(-c.x, mt.y + 1, c.z, gunList[gi + 1] === t ? t : t, acc); gi += 2;
      gunsAt.push({ x: c.x, z: c.z }, { x: -c.x, z: c.z });
    }
  }
  for (const c of [...tops.values()]) { if (left() <= 0) break; if (c.t === 'seat' || !far(c.x, c.z)) continue; put(c.x, c.y + 1, c.z, gunList[gi++], acc); gunsAt.push({ x: c.x, z: c.z }); }
  if (jets) { const js = [[W + 1, 1, 1], [-(W + 1), 1, 1], [W + 1, 1, -1], [-(W + 1), 1, -1]]; for (let i = 0; i < jets; i++) put(js[i][0], js[i][1], js[i][2], 'jet', acc); }
  if (teslas) { const xs = [-W, W, 0, -1, 1].filter((x, i, a) => a.indexOf(x) === i); let n = 0; for (const x of xs) { if (n >= teslas) break; if (occ.has(ckey(x, 0, L)) && !occ.has(ckey(x, 0, L + 1))) { put(x, 0, L + 1, 'tesla', acc, 0); n++; } } }
  // mobility
  const mass = blocks.reduce((m, b) => m + partMass(b), 0);
  if (move === 'hover') {
    const spots = []; const xs = W >= 2 ? [-W, 0, W] : [-W, W];
    for (let z = L; z >= -L; z -= 2) for (const x of xs) spots.push([x, z]);
    if (spots.length && spots[spots.length - 1][1] !== -L) for (const x of xs) spots.push([x, -L]);
    const need = Math.min(spots.length, Math.ceil(mass * 1.15 / 26));
    spots.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    for (let i = 0; i < need; i++) put(spots[i][0], 0, spots[i][1], 'hover', 3);
  } else if (move === 'rotor') {
    const need = Math.ceil(mass * 1.25 / 22);
    const spots = [[W, L], [-W, L], [W, -L], [-W, -L], [W, 0], [-W, 0], [0, L], [0, -L]];
    let n = 0;
    for (const [x, z] of spots) { if (n >= need) break; const t = tops.get(x + ',' + z); if (!t) continue; const top = [...occ.values()].filter(b => b.x === x && b.z === z).reduce((m, b) => Math.max(m, b.y), 0); if (occ.has(ckey(x, top + 1, z))) continue; put(x, top + 1, z, 'rotor', 2); n++; }
  } else if (move === 'plane') {
    // wings off both sides of the upper deck, thrusters on the tail
    const nW = Math.max(2, Math.ceil(mass * 1.2 / 20 / 2));
    for (let i = 0; i < nW; i++) { const z = 1 - i; for (const sx of [1, -1]) { const x = sx * (W + 1); if (!occ.has(ckey(sx * W, 1, z))) put(sx * W, 1, z, 'cube', main); put(x, 1, z, 'wing', acc); if (i < 2 && W + 2 <= 7) put(sx * (W + 2), 1, z, 'wing', acc); } }
    const m2 = blocks.reduce((m, b) => m + partMass(b), 0), nT = Math.max(1, Math.ceil(m2 * .8 / 25));
    const tx = [0, -1, 1, -2, 2]; for (let i = 0; i < Math.min(nT, 5); i++) { const x = tx[i]; if (Math.abs(x) <= W) put(x, 1, -L - 1, 'thruster', 2); }
    put(-(W + 1), 0, L, 'wheel', 3); put(W + 1, 0, L, 'wheel', 3);
  } else if (move === 'leg') {
    const need = Math.max(4, Math.ceil(mass * 1.1 / 50)), perSide = Math.min(2 * L + 1, Math.ceil(need / 2));
    const zs = [L, -L, 0, L - 1, -(L - 1)].filter((z, i, a) => a.indexOf(z) === i);
    for (let i = 0; i < perSide && i < zs.length; i++) { put(W + 1, 0, zs[i], 'leg', 3); put(-(W + 1), 0, zs[i], 'leg', 3); }
  } else {
    const t = move === 'tread' ? 'tread' : 'wheel', per = move === 'tread' ? 45 : 30;
    const need = Math.max(4, Math.ceil(mass * 1.1 / per));
    let perSide = Math.ceil(need / 2);
    if (t === 'tread') {
      perSide = Math.min(2 * L + 1, Math.max(3, perSide));
      const z0 = -Math.floor(perSide / 2);
      for (let i = 0; i < perSide; i++) { put(W + 1, 0, z0 + i, 'tread', 3); put(-(W + 1), 0, z0 + i, 'tread', 3); }
    } else {
      const zs = []; for (let z = L; z >= -L; z -= 2) zs.push(z); if (zs[zs.length - 1] !== -L) zs.push(-L);
      const order = [L, -L, ...zs.filter(z => z !== L && z !== -L)];
      perSide = Math.min(order.length, perSide);
      for (let i = 0; i < perSide; i++) { put(W + 1, 0, order[i], 'wheel', 3); put(-(W + 1), 0, order[i], 'wheel', 3); }
    }
  }
  if (tier >= 8 && rnd() < .5) { const top = blocks.filter(b => b.y >= 1 && b.t === 'cube' && Math.abs(b.z) === L).slice(0, 2); for (const b of top) { b.t = 'shieldp'; delete b.k; } }
  if (rnd() < .3) { const t = [...blocks].sort((a, b) => b.y - a.y).find(b => b.t === 'cube' && b.z < 0 && !occ.has(ckey(b.x, b.y + 1, b.z))); if (t) put(t.x, t.y + 1, t.z, 'flag', acc); }
  return { name: 'Bot', v: 3, blocks, f: ['standard', 'matte', 'gloss', 'chrome', 'neon'][tier >= 8 ? (rnd() * 5 | 0) : tier >= 5 ? (rnd() * 4 | 0) : (rnd() * 2 | 0)] };
}
// What stops a design from deploying at a given pilot level (null when it is fine). Hosts use it on other players' bots too.
function designIssue(d, lv, own) {
  if (UNLOCK_ALL) lv = 10;
  const list = d && Array.isArray(d.blocks) ? d.blocks : [];
  if (!list.length) return 'Your bot is empty. Place a Pilot Seat to start, or load the starter.';
  const s = computeStats(list);
  if (s.seat !== 1) return 'Add a Pilot Seat. Every bot needs exactly one.';
  if (!hasWeapon(s)) return 'Add at least one weapon.';
  if (!s.wheels && !s.treads && !s.legs && !s.skis && !s.insects && !s.sprints && !s.hovers && !s.jets && !s.rotors && !(s.wings && (s.thrusters || s.props))) return 'Add wheels, treads, skis, legs, hover pads, rotors or wings and thrusters so your bot can move.';
  // other players' bots may carry CPU Core upgrades from their tech tree
  const cap = own ? ownCpuMax() : cpuMax(lv) + TECH_CPU_MAX;
  if (s.cpu > cap) return own ? `This bot uses ${s.cpu} CPU. Your limit is ${cap}. CPU Core nodes in the Tech Tree raise it.` : `This bot uses ${s.cpu} CPU. The limit at pilot level ${lv} is ${cap}.`;
  for (const b of list) {
    const P = PARTS[b.t]; if (!P) return 'This bot contains an unknown part.';
    if (P.lvl > lv) return `${P.name} needs pilot level ${P.lvl}.`;
    if (P.shape && TIERS[b.k || 1] && TIERS[b.k || 1].lvl > lv) return `${TIERS[b.k].name} armor needs pilot level ${TIERS[b.k].lvl}.`;
    if (b.m && MATERIALS[b.m] && MATERIALS[b.m].lvl > lv) return `${MATERIALS[b.m].name} needs pilot level ${MATERIALS[b.m].lvl}.`;
    if (own) {
      if (!techHas(b.t)) return `${P.name} is locked. Unlock it in the Tech Tree.`;
      if (P.shape && !techHas('T' + (b.k || 1))) return `T${b.k || 1} ${TIERS[b.k || 1].name} armor is locked. Unlock it in the Tech Tree.`;
      if (P.shape && b.m && b.m !== 'std' && !techHas('mat_' + b.m)) return `${MATERIALS[b.m].name} is locked. Unlock it in the Tech Tree.`;
    }
  }
  const fin = FINISHES.find(f => f.id === (d.f || 'standard'));
  if (fin && fin.lvl > lv) return `The ${fin.name} finish needs pilot level ${fin.lvl}.`;
  return null;
}
// everything in the starter must be usable at pilot level 1: corner slopes become cubes
const presetStarter = () => ({ name: 'Starter Rig', v: 3, blocks: genDesign(mulberry32(7), 150, 'car', { main: 9, acc: 1 }).blocks.map(b => PARTS[b.t].lvl > 1 && PARTS[b.t].shape ? { ...b, t: 'cube', r: 0 } : b).filter(b => PARTS[b.t].lvl <= 1) });

// garage bays: five saved designs, like a hangar
const BAY_COUNT = 10;
let bays = store.get('sfa.bays', null);
if (!Array.isArray(bays)) {
  const old = store.get('sfa.design', null);
  bays = [old && Array.isArray(old.blocks) ? old : presetStarter(), null, null, null, null];
}
bays = bays.slice(0, BAY_COUNT); while (bays.length < BAY_COUNT) bays.push(null);
bays = bays.map((d, i) => d ? migrateDesign(d) : null);
let bayIdx = clamp(store.get('sfa.bay', 0) | 0, 0, BAY_COUNT - 1);
let design = bays[bayIdx] || { name: 'Bay ' + (bayIdx + 1), v: 3, blocks: [] };
if (!design.name || design.name === 'Bot') design.name = 'Bay ' + (bayIdx + 1);
const saveBays = () => { bays[bayIdx] = design; store.set('sfa.bays', bays); store.set('sfa.bay', bayIdx); cloudDirty(); };
let settings = Object.assign({ master: .8, music: .55, sfx: .9, quality: 'high', sens: 1, invertY: false }, store.get('sfa.settings', {}));
// graphics presets: ultra (sharper shadows, full resolution, light shafts, film grain), high, low ('Fast')
const hiQ = () => settings.quality === 'high' || settings.quality === 'ultra', ultraQ = () => settings.quality === 'ultra';
// speeds are shown in mph unless the player picks km/h (game units are metres per second)
// the desktop app (window.ROBOBLOCKS) names its server; a page served by a server uses that server
const HOST = (typeof window !== 'undefined' && window.ROBOBLOCKS) || null;
// true when this copy runs inside an embedded web preview (it then plays offline: online play is server-only)
const onClaudePage = () => typeof window !== 'undefined' && !!window.claude;
const SERVER_BASE = (() => { try { if (HOST && HOST.server) { const u = new URL(HOST.server); if (/^https?:$/.test(u.protocol)) return u.origin; } if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !onClaudePage()) return location.origin; } catch (e) { } return null; })();
const fmtSpeed = ms => settings.units === 'kmh' ? Math.round(ms * 3.6) + ' km/h' : Math.round(ms * 2.23694) + ' mph';
const saveSettings = () => { store.set('sfa.settings', settings); cloudDirty(); };
