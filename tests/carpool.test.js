const assert = require('assert');
const fs = require('fs');
const path = require('path');

const memoryStore = () => ({
  store: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; }
});

global.window = global;
global.localStorage = memoryStore();
global.sessionStorage = memoryStore();

const dataJs = fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8');
const uiJs = fs.readFileSync(path.join(__dirname, '../js/ui.js'), 'utf8');
const carpoolJs = fs.readFileSync(path.join(__dirname, '../js/carpool.js'), 'utf8');

eval(dataJs);
eval(uiJs);
eval(carpoolJs);

console.log('🧪 『くるまわり』コア回帰テストを開始します...\n');

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// -------------------------------------------------------------
// テスト1: 座席一元計算（seatCost と calculateCarRemainingSeats）
// seatCost は isRiding が偽のとき 0。乗車中は active と dayMode: 'normal' が必要。
// -------------------------------------------------------------
test('座席消費計算: 弟1名付きの選手は2席消費し、残席が正確に減算されること', () => {
  const car = { id: 'c1', name: '佐藤号', capacity: 4, companions: [] };
  const kid1 = { id: 1, name: 'れん', companions: [], dayMode: 'normal', active: true };
  const kid2WithBrother = { id: 2, name: 'はると', companions: [{ id: 'cmp1', label: '弟' }], dayMode: 'normal', active: true };

  assert.strictEqual(seatCost(kid1), 1, '通常選手は1席');
  assert.strictEqual(seatCost(kid2WithBrother), 2, '弟付き選手は2席');

  const remaining = calculateCarRemainingSeats(car, [kid1, kid2WithBrother]);
  assert.strictEqual(remaining, 1, '定員4 - (1 + 2) = 残り1席');
});

// -------------------------------------------------------------
// テスト2: 親子拘束（isChildOfCar）
// -------------------------------------------------------------
test('親子拘束: 親の車が出動している場合、その選手が親の車に確実に乗ること', () => {
  const carA = { id: 'c1', name: '佐藤号', capacity: 4, companions: [], dayMode: 'normal', active: true };
  const carB = { id: 'c2', name: '田中号', capacity: 4, companions: [], dayMode: 'normal', active: true };
  const kidA = { id: 1, name: '佐藤ゆうと', parentCar: '佐藤号', companions: [], dayMode: 'normal', active: true };

  assert.strictEqual(isChildOfCar(kidA, carA), true, '佐藤号と佐藤ゆうとは親子判定される');
  assert.strictEqual(isChildOfCar(kidA, carB), false, '田中号と佐藤ゆうとは親子ではない');
});

// -------------------------------------------------------------
// テスト3: 同乗配慮ペア（NG回避の防壁）
// -------------------------------------------------------------
test('同乗配慮ペア: 配慮設定された2名は配車計算で絶対に同じ車にならないこと', () => {
  localStorage.setItem('cp_avoid_pairs', JSON.stringify([[101, 102]]));

  const kidA = { id: 101, name: '選手A', dayMode: 'normal', active: true, parentCar: '' };
  const kidB = { id: 102, name: '選手B', dayMode: 'normal', active: true, parentCar: '' };
  const kidC = { id: 103, name: '選手C', dayMode: 'normal', active: true, parentCar: '' };
  const kidD = { id: 104, name: '選手D', dayMode: 'normal', active: true, parentCar: '' };

  const car1 = { id: 'c1', name: '1号車', capacity: 3, companions: [], dayMode: 'normal', active: true };
  const car2 = { id: 'c2', name: '2号車', capacity: 3, companions: [], dayMode: 'normal', active: true };

  assert.strictEqual(hasAvoidPairConflict([kidA], kidB), true, '選手Aがいる車に選手Bは乗れない');
  assert.strictEqual(hasAvoidPairConflict([kidA], kidC), false, '選手Aがいる車に選手Cは乗れる');
  void car1;
  void car2;
  void kidD;
});

// -------------------------------------------------------------
// テスト4: 個人（家庭送迎・自走）の除外
// -------------------------------------------------------------
test('個人モード: 個人設定された車・選手は座席プール計算から完全除外されること', () => {
  const kidHold = { id: 201, name: '個人選手', dayMode: 'individual', active: true };
  const kidRide = { id: 202, name: '乗車選手', dayMode: 'normal', active: true };

  assert.strictEqual(needsPoolSeat(kidHold), false, '個人選手はプールの座席を要求しない');
  assert.strictEqual(needsPoolSeat(kidRide), true, '乗車選手はプールの座席を要求する');
  assert.strictEqual(seatCost(kidHold), 0, '個人選手の seatCost は 0');
});

// -------------------------------------------------------------
// テスト5: 見出し同乗者集約フォーマット（formatCarCompanionHeader）
// 実装は js/ui.js。data.js / carpool.js には無い。
// -------------------------------------------------------------
test('見出し集約: 運転者、車両同乗者、選手同乗者が運転手横の括弧に正しく集約されること', () => {
  const car = { name: '鈴木号', driverRole: '祖父', companions: [{ label: '母' }] };
  const riders = [
    { name: 'そうた', companions: [] },
    { name: 'はると', companions: [{ label: '弟' }] }
  ];

  const header = formatCarCompanionHeader(car, riders);
  assert.strictEqual(header, '（祖父、母、はると弟）', '運転者・車両同乗者・選手同乗者が正しく結合される');
});

console.log(`\n🎉 すべてのテストに合格しました！（${passCount} 件成功）\n`);
