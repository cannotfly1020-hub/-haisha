const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const wwwDir = path.join(root, 'www');
const plistPath = path.join(root, 'ios/App/App/Info.plist');
const rootFiles = ['index.html', 'manifest.json', 'sw.js'];
const rootDirs = ['css', 'js', 'icons'];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

function copyEntry(name) {
  const from = path.join(root, name);
  if (!fs.existsSync(from)) {
    console.log(`  スキップ: ${name} はルートにありません`);
    return;
  }
  const to = path.join(wwwDir, name);
  fs.cpSync(from, to, { recursive: true });
  console.log(`  コピー: ${name}`);
}

console.log('1. 回帰テスト');
run(process.execPath, ['tests/carpool.test.js']);

console.log('\n2. www/ を初期化');
fs.rmSync(wwwDir, { recursive: true, force: true });
fs.mkdirSync(wwwDir, { recursive: true });
console.log('  削除: www/');

console.log('\n3. ルート正本を www/ へコピー');
rootFiles.forEach(copyEntry);
rootDirs.forEach(copyEntry);

console.log('\n4. Capacitor 同期');
run('npx', ['cap', 'sync']);

console.log('\n5. iOS 表示名');
if (!fs.existsSync(plistPath)) {
  console.error(`Info.plist がありません: ${plistPath}`);
  process.exit(1);
}
const plist = fs.readFileSync(plistPath, 'utf8');
const display = plist.match(/<key>CFBundleDisplayName<\/key>\s*<string>([^<]*)<\/string>/);
if (!display) {
  console.error('  CFBundleDisplayName がありません');
  process.exit(1);
}
if (display[1] === '配車ヘルパー') {
  const next = plist.replace(
    /(<key>CFBundleDisplayName<\/key>\s*<string>)配車ヘルパー(<\/string>)/,
    '$1くるまわり$2'
  );
  fs.writeFileSync(plistPath, next);
  console.log('  CFBundleDisplayName: 配車ヘルパー → くるまわり');
} else if (display[1] === 'くるまわり') {
  console.log('  CFBundleDisplayName: くるまわり');
} else {
  console.error(`  CFBundleDisplayName が想定外です: ${display[1]}`);
  process.exit(1);
}

console.log('\n同期完了');
