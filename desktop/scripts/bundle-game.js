// Copies the current game build into game-fallback/, so the app can play straight away (and offline)
// before it has downloaded anything from a server. Usage: node scripts/bundle-game.js [game.html] [three.min.js]
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const src = process.argv[2] || process.env.RB_GAME || path.join(root, '..', 'server', 'public', 'index.html');
const three = process.argv[3] || process.env.RB_THREE || path.join(root, '..', 'server', 'vendor', 'three.min.js');
const out = path.join(root, 'game-fallback');
if (!fs.existsSync(src)) { if (fs.existsSync(path.join(root, 'game-fallback', 'index.html'))) { console.log('No new game build found, keeping game-fallback/ as it is.'); process.exit(0); } console.error('Game build not found: ' + src); process.exit(1); }
if (!fs.existsSync(three)) { console.error('three.min.js not found: ' + three); process.exit(1); }
const page = fs.readFileSync(src, 'utf8');
const version = (page.match(/const BC_VERSION = '([^']+)'/) || [])[1] || '0';
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
  + page.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/three@[^"]+"><\/script>/, '<script src="three.min.js"></script>') + '</body></html>';
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.copyFileSync(three, path.join(out, 'three.min.js'));
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ version, bundled: true }));
console.log(`bundled RoboBlocks ${version} into game-fallback/`);
