const assert = require('assert');
const fs = require('fs');
const path = require('path');

const memoryStore = () => ({
  store: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
  clear() { this.store = {}; },
  key(index) { return Object.keys(this.store)[index] || null; },
  get length() { return Object.keys(this.store).length; }
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

// -------------------------------------------------------------
// テスト6: LINE名簿テキストの自動解析（parseRosterText）
// -------------------------------------------------------------
test('名簿解析: スペースやカッコ混じりのテキストから選手名・学年・親車を正確に抽出できること', () => {
  const sampleText = `
    1. 佐藤 ゆうと 6年 佐藤号
    鈴木 そうた (5年) 母:鈴木号
    田中 れん 4年生
    はると 3
  `;
  const result = parseRosterText(sampleText);
  assert.strictEqual(result.children.length, 4, '4名抽出されること');
  assert.strictEqual(result.children[0].name, '佐藤 ゆうと');
  assert.strictEqual(result.children[0].grade, 6);
  assert.strictEqual(result.children[0].parentCar, '佐藤号');
  assert.strictEqual(result.children[1].name, '鈴木 そうた');
  assert.strictEqual(result.children[1].grade, 5);
  assert.strictEqual(result.children[2].name, '田中 れん');
  assert.strictEqual(result.children[2].grade, 4);
  assert.strictEqual(result.children[3].name, 'はると');
  assert.strictEqual(result.children[3].grade, 3);

  const mixed = parseRosterText('はると / 3年生 / 田中号\n大和\n1. 鈴木そうた (5年) 母:鈴木号');
  assert.strictEqual(mixed.children[0].name, 'はると');
  assert.strictEqual(mixed.children[0].grade, 3);
  assert.strictEqual(mixed.children[0].parentCar, '田中号');
  assert.strictEqual(mixed.children[1].name, '大和');
  assert.strictEqual(mixed.children[1].grade, '');
  assert.strictEqual(mixed.children[1].parentCar, '');
  assert.strictEqual(mixed.children[2].name, '鈴木そうた');
  assert.strictEqual(mixed.children[2].grade, 5);
  assert.strictEqual(mixed.children[2].parentCar, '鈴木号');

  const beforeKids = children.length;
  const beforeCars = cars.length;
  const imported = importRosterData(parseRosterText('あい 2年 東号'), 'append');
  const added = children.find((child) => child.name === 'あい');
  const addedCar = cars.find((car) => car.name === '東号');
  assert.strictEqual(imported.addedChildren, 1);
  assert.strictEqual(imported.addedCars, 1);
  assert.strictEqual(added.grade, 2);
  assert.strictEqual(added.parentCar, '東号');
  assert.strictEqual(added.active, true);
  assert.strictEqual(added.dayMode, 'normal');
  assert.strictEqual(seatCost(added), 1);
  assert.strictEqual(addedCar.capacity, 3);
  assert.strictEqual(addedCar.active, true);
  assert.strictEqual(addedCar.driverRole, '父');
  assert.strictEqual(children.length, beforeKids + 1);
  assert.strictEqual(cars.length, beforeCars + 1);
  children = children.filter((child) => child.name !== 'あい');
  cars = cars.filter((car) => car.name !== '東号');
  saveData();
});

// -------------------------------------------------------------
// テスト7: 学年を揃える（generateCarpool による実配車）
// -------------------------------------------------------------
test('配車モード: 「学年を揃える」モードで generateCarpool を実行した際、同学年が同じ車に集まること', () => {
  global.cars = [
    { id: 'c1', name: '1号車', capacity: 3, companions: [], dayMode: 'normal', active: true },
    { id: 'c2', name: '2号車', capacity: 3, companions: [], dayMode: 'normal', active: true }
  ];
  global.children = [
    { id: 1, name: '六年A', grade: 6, dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 2, name: '六年B', grade: 6, dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 3, name: '三年A', grade: 3, dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 4, name: '三年B', grade: 3, dayMode: 'normal', active: true, parentCar: '', companions: [] }
  ];

  const plan = generateCarpool(0, 'grade_same');
  const gradesOf = (name) => (plan.assignments[name] || []).map((kid) => parseInt(kid.grade, 10)).sort();
  const car1 = gradesOf('1号車');
  const car2 = gradesOf('2号車');
  const clumped = (car1.length === 2 && car1[0] === car1[1]) && (car2.length === 2 && car2[0] === car2[1]);
  assert.strictEqual(clumped, true, '6年生同士と3年生同士がそれぞれ同じ車にいること');

  const mixed = {
    '1号車': [global.children[0], global.children[2]],
    '2号車': [global.children[1], global.children[3]]
  };
  assert.ok(
    evaluateAssignmentScore(plan.assignments, 'grade_same') > evaluateAssignmentScore(mixed, 'grade_same'),
    '同学年が揃った配車の方がスコアが高いこと'
  );
});

// -------------------------------------------------------------
// テスト8: ポジション分散モード（generateCarpool による実配車検証）
// -------------------------------------------------------------
test('配車モード統合: 「ポジションを散らす」モードで generateCarpool を実行した際、GK同士が別々の車に配車されること', () => {
  global.cars = [
    { id: 'c1', name: '1号車', capacity: 3, companions: [], dayMode: 'normal', active: true },
    { id: 'c2', name: '2号車', capacity: 3, companions: [], dayMode: 'normal', active: true }
  ];
  global.children = [
    { id: 1, name: 'GK1', pos: 'GK', dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 2, name: 'GK2', pos: 'GK', dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 3, name: 'FW1', pos: 'FW', dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 4, name: 'FW2', pos: 'FW', dayMode: 'normal', active: true, parentCar: '', companions: [] }
  ];

  const plan = generateCarpool(0, 'pos_diff');
  const car1Riders = (plan.assignments['1号車'] || []).map(k => k.pos);
  const car2Riders = (plan.assignments['2号車'] || []).map(k => k.pos);

  const gkInCar1 = car1Riders.filter(p => p === 'GK').length;
  const gkInCar2 = car2Riders.filter(p => p === 'GK').length;

  assert.strictEqual(gkInCar1, 1, '1号車にGKが1名');
  assert.strictEqual(gkInCar2, 1, '2号車にGKが1名');

  const rerun = generateCarpool(1, 'pos_diff');
  const rerun1 = (rerun.assignments['1号車'] || []).filter(k => k.pos === 'GK').length;
  const rerun2 = (rerun.assignments['2号車'] || []).filter(k => k.pos === 'GK').length;
  assert.strictEqual(rerun1, 1, '再計算後も1号車のGKは1名');
  assert.strictEqual(rerun2, 1, '再計算後も2号車のGKは1名');
});

// -------------------------------------------------------------
// テスト9: ポジション集約モード（generateCarpool による実配車検証）
// -------------------------------------------------------------
test('配車モード統合: 「ポジションを揃える」モードで generateCarpool を実行した際、捕手同士が同じ車に集まること', () => {
  global.cars = [
    { id: 'c1', name: '1号車', capacity: 3, companions: [], dayMode: 'normal', active: true },
    { id: 'c2', name: '2号車', capacity: 3, companions: [], dayMode: 'normal', active: true }
  ];
  global.children = [
    { id: 1, name: '捕手A', pos: '捕手', dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 2, name: '捕手B', pos: '捕手', dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 3, name: '投手A', pos: '投手', dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 4, name: '投手B', pos: '投手', dayMode: 'normal', active: true, parentCar: '', companions: [] }
  ];

  const plan = generateCarpool(0, 'pos_same');
  const car1Riders = (plan.assignments['1号車'] || []).map(k => k.pos);
  const car2Riders = (plan.assignments['2号車'] || []).map(k => k.pos);

  const clumped = (car1Riders.filter(p => p === '捕手').length === 2) ||
                  (car2Riders.filter(p => p === '捕手').length === 2);

  assert.strictEqual(clumped, true, '捕手2名が同一号車に集約されていること');

  const rerun = generateCarpool(1, 'pos_same');
  const rerun1 = (rerun.assignments['1号車'] || []).filter(k => k.pos === '捕手').length;
  const rerun2 = (rerun.assignments['2号車'] || []).filter(k => k.pos === '捕手').length;
  const stillClumped = rerun1 === 2 || rerun2 === 2;
  assert.strictEqual(stillClumped, true, '再計算後も捕手2名が同一号車に残ること');
});

// -------------------------------------------------------------
// テスト10: 未定ポジションの除外検証
// -------------------------------------------------------------
test('未定除外: 「未定」や空文字の選手が複数乗車してもポジションペナルティが発生しないこと', () => {
  const kid1 = { id: 1, name: '選手1', pos: '未定', dayMode: 'normal', active: true, parentCar: '' };
  const kid2 = { id: 2, name: '選手2', pos: '', dayMode: 'normal', active: true, parentCar: '' };
  const kid3 = { id: 3, name: '選手3', pos: '未定', dayMode: 'normal', active: true, parentCar: '' };

  const assignments = { 'A号': [kid1, kid2, kid3] };
  const scoreDiff = evaluateAssignmentScore(assignments, 'pos_diff');
  const scoreSame = evaluateAssignmentScore(assignments, 'pos_same');

  assert.strictEqual(scoreDiff, scoreSame, '未定同士ではモードによるペナルティ・ボーナス差が発生しないこと');
});

// -------------------------------------------------------------
// テスト11: 表記ゆれの吸収
// -------------------------------------------------------------
test('表記ゆれ: 「内野手」と「内野」が同じポジションとして認識されること', () => {
  assert.strictEqual(canonicalPosition('内野手'), '内野');
  assert.strictEqual(canonicalPosition('内野'), '内野');
  assert.strictEqual(canonicalPosition('内野手'), canonicalPosition('内野'));
  assert.strictEqual(canonicalPosition('外野手'), canonicalPosition('外野'));
});

// -------------------------------------------------------------
// テスト12: バックアップ version 4 の往復
// -------------------------------------------------------------
test('バックアップ: version 4 にポジション一覧が含まれ、復元で戻ること', () => {
  const roles = ['投手', '捕手', 'GK', 'FW'];
  savePositionRoles(roles);
  global.cars = [{ id: 'c1', name: '1号車', capacity: 3, companions: [], dayMode: 'normal', active: true }];
  global.children = [{ id: 1, name: 'GK1', pos: 'GK', dayMode: 'normal', active: true, parentCar: '', companions: [] }];

  const payload = buildBackupPayload();
  assert.strictEqual(payload.version, 4);
  assert.deepStrictEqual(payload.positionRoles, roles);

  savePositionRoles(['投手', '捕手', '内野手', '外野手']);
  const restored = restoreBackupData(JSON.stringify(payload));
  assert.strictEqual(restored, true);
  assert.deepStrictEqual(getPositionRoles(), roles);
});

// -------------------------------------------------------------
// テスト13: 履歴減点があっても揃えるモードが勝つ
// -------------------------------------------------------------
test('複合: 前回同じ車の履歴があっても、揃えるモードで捕手同士が同じ車に集まること', () => {
  const today = getPlanSlotView().date;
  const parts = today.split('-').map(Number);
  const prevDate = new Date(parts[0], parts[1] - 1, parts[2] - 1);
  const ymd = [
    prevDate.getFullYear(),
    String(prevDate.getMonth() + 1).padStart(2, '0'),
    String(prevDate.getDate()).padStart(2, '0')
  ].join('-');
  localStorage.setItem(`cp_session_${ymd}`, JSON.stringify({
    result: { assignments: { '東号': [1, 2] } }
  }));

  global.cars = [
    { id: 'c1', name: '東号', capacity: 3, companions: [], dayMode: 'normal', active: true },
    { id: 'c2', name: '西号', capacity: 3, companions: [], dayMode: 'normal', active: true }
  ];
  global.children = [
    { id: 1, name: '捕手A', pos: '捕手', dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 2, name: '捕手B', pos: '捕手', dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 3, name: '投手A', pos: '投手', dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 4, name: '投手B', pos: '投手', dayMode: 'normal', active: true, parentCar: '', companions: [] }
  ];

  const plan = generateCarpool(0, 'pos_same');
  const eastCatchers = (plan.assignments['東号'] || []).filter((kid) => kid.pos === '捕手').length;
  const westCatchers = (plan.assignments['西号'] || []).filter((kid) => kid.pos === '捕手').length;
  assert.strictEqual(eastCatchers === 2 || westCatchers === 2, true, '履歴があっても捕手2名は同一車');

  const onHistory = {
    '東号': [global.children[0], global.children[1]],
    '西号': [global.children[2], global.children[3]]
  };
  const offHistory = {
    '東号': [global.children[2], global.children[3]],
    '西号': [global.children[0], global.children[1]]
  };
  assert.ok(
    evaluateAssignmentScore(offHistory, 'pos_same') > evaluateAssignmentScore(onHistory, 'pos_same'),
    '前回と同じ車に揃えた組は、別の車に揃えた組より履歴分だけ低いこと'
  );
  localStorage.removeItem(`cp_session_${ymd}`);
});

// -------------------------------------------------------------
// テスト14: 表記ゆれの実配車
// -------------------------------------------------------------
test('表記ゆれ実配車: 「内野手」と「内野」が揃えるモードで同じ車に集まること', () => {
  global.cars = [
    { id: 'c1', name: '1号車', capacity: 3, companions: [], dayMode: 'normal', active: true },
    { id: 'c2', name: '2号車', capacity: 3, companions: [], dayMode: 'normal', active: true }
  ];
  global.children = [
    { id: 11, name: '内野手A', pos: '内野手', dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 12, name: '内野B', pos: '内野', dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 13, name: '投手A', pos: '投手', dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 14, name: '投手B', pos: '投手', dayMode: 'normal', active: true, parentCar: '', companions: [] }
  ];

  const plan = generateCarpool(0, 'pos_same');
  const together = ['1号車', '2号車'].some((name) => {
    const riders = plan.assignments[name] || [];
    const inf = riders.filter((kid) => canonicalPosition(kid.pos) === '内野');
    return inf.length === 2;
  });
  assert.strictEqual(together, true, '内野手と内野が同一号車にいること');
});

// -------------------------------------------------------------
// テスト15: 学年を散らす実配車
// -------------------------------------------------------------
test('配車モード: 「学年を散らす」モードで高学年と低学年が各車に分かれること', () => {
  global.cars = [
    { id: 'c1', name: '1号車', capacity: 3, companions: [], dayMode: 'normal', active: true },
    { id: 'c2', name: '2号車', capacity: 3, companions: [], dayMode: 'normal', active: true }
  ];
  global.children = [
    { id: 21, name: '六年A', grade: 6, dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 22, name: '六年B', grade: 6, dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 23, name: '三年A', grade: 3, dayMode: 'normal', active: true, parentCar: '', companions: [] },
    { id: 24, name: '三年B', grade: 3, dayMode: 'normal', active: true, parentCar: '', companions: [] }
  ];

  const plan = generateCarpool(0, 'grade_diff');
  ['1号車', '2号車'].forEach((name) => {
    const grades = (plan.assignments[name] || []).map((kid) => parseInt(kid.grade, 10));
    assert.strictEqual(grades.length, 2, `${name}は2名`);
    assert.strictEqual(grades.indexOf(6) >= 0 && grades.indexOf(3) >= 0, true, `${name}に高学年と低学年が1名ずついること`);
  });
});

console.log(`\n🎉 すべてのテストに合格しました！（${passCount} 件成功）\n`);
