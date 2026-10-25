function createDefaultCars() {
  return [
    { id: 1, name: '佐藤号', capacity: 3, active: true, companions: [] },
    { id: 2, name: '鈴木号', capacity: 3, active: true, companions: [] },
    { id: 3, name: '田中号(荷物車)', capacity: 2, active: true, companions: [] }
  ];
}

function normalizeCompanion(item, fallbackId) {
  if (!item || typeof item !== 'object') return null;
  const label = typeof item.label === 'string' ? item.label.trim() : '';
  if (!label) return null;
  return {
    id: item.id != null ? item.id : fallbackId,
    label: label
  };
}

function normalizeCar(car) {
  let companions = [];
  if (Array.isArray(car.companions)) {
    companions = car.companions
      .map((item, idx) => normalizeCompanion(item, `cmp-${car.id}-${idx}`))
      .filter(Boolean);
  }

  // 旧 familySeats（人数のみ）からの移行
  const legacyFamily = Math.max(0, parseInt(car.familySeats, 10) || 0);
  if (companions.length === 0 && legacyFamily > 0) {
    for (let i = 0; i < legacyFamily; i++) {
      companions.push({ id: `legacy-family-${car.id}-${i}`, label: '身内' });
    }
  }

  return {
    id: car.id,
    name: typeof car.name === 'string' ? car.name : '',
    capacity: Math.max(0, parseInt(car.capacity, 10) || 0),
    active: !!car.active,
    companions: companions
  };
}

function companionsOf(car) {
  if (!car || !Array.isArray(car.companions)) return [];
  return car.companions;
}

function companionSeatsOf(car) {
  return companionsOf(car).length;
}

// 互換エイリアス（旧コード参照用）
function familySeatsOf(car) {
  return companionSeatsOf(car);
}

function createDefaultChildren() {
  return [
    { id: 1, name: 'ゆうと', grade: 6, pos: '投手', parentCar: '佐藤号', fixedCar: '', motionSick: false, active: true, meetOnSite: false, companions: [], lastCar: '', rideHistory: {} },
    { id: 2, name: 'そうた', grade: 6, pos: '捕手', parentCar: '鈴木号', fixedCar: '', motionSick: false, active: true, meetOnSite: false, companions: [], lastCar: '', rideHistory: {} },
    { id: 3, name: 'れん', grade: 5, pos: '内野', parentCar: '', fixedCar: '', motionSick: true, active: true, meetOnSite: false, companions: [], lastCar: '', rideHistory: {} },
    { id: 4, name: 'はると', grade: 5, pos: '外野', parentCar: '', fixedCar: '', motionSick: false, active: true, meetOnSite: false, companions: [], lastCar: '', rideHistory: {} },
    { id: 5, name: 'こうき', grade: 4, pos: '内野', parentCar: '', fixedCar: '', motionSick: false, active: true, meetOnSite: false, companions: [], lastCar: '', rideHistory: {} },
    { id: 6, name: '大和', grade: 3, pos: '外野', parentCar: '', fixedCar: '', motionSick: false, active: true, meetOnSite: false, companions: [], lastCar: '', rideHistory: {} }
  ];
}

function normalizeChildCompanions(child) {
  const meetOnSite = !!child.meetOnSite;
  if (Array.isArray(child.companions)) {
    return child.companions
      .map((item, idx) => normalizeCompanion(item, `ch-cmp-${child.id}-${idx}`))
      .filter(Boolean);
  }

  // 旧 guardianRide / guardianName（1人）からの移行
  if (!meetOnSite && child.guardianRide) {
    const label = (typeof child.guardianName === 'string' ? child.guardianName : '').trim() || '母';
    return [{ id: `legacy-guardian-${child.id}`, label: label }];
  }
  return [];
}

function normalizeChild(child) {
  const meetOnSite = !!child.meetOnSite;
  const companions = meetOnSite ? [] : normalizeChildCompanions(child);
  return {
    ...child,
    active: !!child.active,
    meetOnSite: meetOnSite,
    companions: companions,
    motionSick: !!child.motionSick,
    parentCar: typeof child.parentCar === 'string' ? child.parentCar : '',
    fixedCar: typeof child.fixedCar === 'string' ? child.fixedCar : '',
    lastCar: typeof child.lastCar === 'string' ? child.lastCar : '',
    rideHistory: child.rideHistory && typeof child.rideHistory === 'object' && !Array.isArray(child.rideHistory) ? child.rideHistory : {}
  };
}

function childCompanionsOf(child) {
  if (!child || !Array.isArray(child.companions)) return [];
  return child.companions;
}

function childCompanionSeatsOf(child) {
  return childCompanionsOf(child).length;
}

function isParticipating(child) {
  return !!child && !!child.active;
}

function isOnSite(child) {
  return isParticipating(child) && !!child.meetOnSite;
}

function isRiding(child) {
  return isParticipating(child) && !child.meetOnSite;
}

function seatCost(child) {
  if (!isRiding(child)) return 0;
  return 1 + childCompanionSeatsOf(child);
}

function formatRiderLabel(child, carName, options) {
  const showPin = !options || options.showPin !== false;
  const pinned = showPin && child.fixedCar && carName && child.fixedCar === carName ? '📌' : '';
  const sick = child.motionSick ? '🤢' : '';
  const comps = childCompanionsOf(child);
  const companion = comps.length > 0 ? `（＋${comps.map(c => c.label).join('、')}）` : '';
  return `${pinned}${child.name}${sick}${companion}`;
}

function autoFixedLabel(child) {
  if (child && child.parentCar) return `自動（親:${child.parentCar}）`;
  return '自動（指定なし）';
}

function getAttendMode(child) {
  if (!child.active) return 'off';
  return child.meetOnSite ? 'site' : 'ride';
}

function setAttendMode(child, mode) {
  if (mode === 'off') {
    child.active = false;
    child.meetOnSite = false;
    child.companions = [];
    child.fixedCar = '';
  } else if (mode === 'site') {
    child.active = true;
    child.meetOnSite = true;
    child.companions = [];
    child.fixedCar = '';
  } else {
    child.active = true;
    child.meetOnSite = false;
  }
}

function getFixedRidersForCar(carName) {
  if (!carName) return [];
  return children.filter(c => isRiding(c) && c.fixedCar === carName);
}

function fixedSeatsUsed(carName) {
  return getFixedRidersForCar(carName).reduce((sum, c) => sum + seatCost(c), 0);
}

function carSeatSummary(car) {
  const capacity = parseInt(car.capacity, 10) || 0;
  const companions = companionSeatsOf(car);
  const guests = fixedSeatsUsed(car.name);
  const used = companions + guests;
  const remaining = capacity - used;
  return {
    capacity,
    companions,
    guests,
    used,
    remaining,
    isFull: remaining <= 0,
    isOver: remaining < 0
  };
}

function canFitOnCar(car, extraSeats, excludeChildId) {
  if (!car) return false;
  const summary = carSeatSummary(car);
  let used = summary.used;
  if (excludeChildId != null) {
    const existing = children.find(c => c.id === excludeChildId);
    if (existing && existing.fixedCar === car.name && isRiding(existing)) {
      used -= seatCost(existing);
    }
  }
  return used + extraSeats <= summary.capacity;
}

function newCompanionId() {
  return `cmp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/**
 * 車両改名時の参照カスケード:
 * 全選手の parentCar / fixedCar / rideHistory / lastCar を oldName → newName に同期する。
 */
function renameCarCascade(car, oldName, newName) {
  if (!car || !oldName || !newName || oldName === newName) return;

  children.forEach((child) => {
    if (child.parentCar === oldName) child.parentCar = newName;
    if (child.fixedCar === oldName) child.fixedCar = newName;
    if (child.lastCar === oldName) child.lastCar = newName;

    if (child.rideHistory && typeof child.rideHistory === 'object' && !Array.isArray(child.rideHistory)) {
      if (Object.prototype.hasOwnProperty.call(child.rideHistory, oldName)) {
        const migrated = child.rideHistory[oldName] || 0;
        child.rideHistory[newName] = (child.rideHistory[newName] || 0) + migrated;
        delete child.rideHistory[oldName];
      }
    }
  });

  // メモリ上の直近配車結果キーも追随（永続化対象外）
  if (typeof currentAssignments !== 'undefined' && currentAssignments && currentAssignments[oldName]) {
    currentAssignments[newName] = currentAssignments[oldName];
    delete currentAssignments[oldName];
  }

  car.name = newName;
}

/**
 * 車両名を更新し、選手側の名前参照をすべて連動更新して保存する。
 * @returns {boolean} 実際に改名した場合 true
 */
function renameCar(carId, newName) {
  const car = cars.find((c) => String(c.id) === String(carId));
  if (!car) return false;

  const oldName = car.name;
  const trimmed = typeof newName === 'string' ? newName.trim() : '';
  if (!trimmed || trimmed === oldName) return false;

  if (cars.some((c) => String(c.id) !== String(carId) && c.name === trimmed)) {
    alert(`「${trimmed}」は既に別の車両で使われています。別の名前にしてください。`);
    return false;
  }

  renameCarCascade(car, oldName, trimmed);
  saveData();
  return true;
}

let cars = [];
let children = [];

try {
  const loadedCars = JSON.parse(localStorage.getItem('cp_cars')) || createDefaultCars();
  cars = loadedCars.map(normalizeCar);
} catch (e) {
  cars = createDefaultCars();
}

try {
  const loaded = JSON.parse(localStorage.getItem('cp_children')) || createDefaultChildren();
  children = loaded.map(normalizeChild);
} catch (e) {
  children = createDefaultChildren();
}

// 旧 guardianRide / guardianName を companions 配列へ正規化して永続化
(function migrateLegacyChildGuardians() {
  let changed = false;
  children.forEach(ch => {
    if (ch.guardianRide != null || ch.guardianName != null) {
      delete ch.guardianRide;
      delete ch.guardianName;
      changed = true;
    }
    if (!Array.isArray(ch.companions)) {
      ch.companions = [];
      changed = true;
    }
  });
  if (changed) {
    try {
      localStorage.setItem('cp_children', JSON.stringify(children));
    } catch (e) { /* ignore */ }
  }
})();

function saveData() {
  try {
    localStorage.setItem('cp_cars', JSON.stringify(cars));
    localStorage.setItem('cp_children', JSON.stringify(children));
  } catch (e) {
    console.error("保存エラー:", e);
  }
}

function manualSave() {
  saveData();
  alert("💾 現在の登録内容とチェック状態を保存しました！");
}

/**
 * 次回運用向けリセット:
 * 出欠・同乗・指定枠・車両同乗・配車結果のみクリア。
 * 選手/車両マスタと rideHistory・lastCar は保持。
 */
function resetTodaySession() {
  const msg = '出欠・同乗・指定枠を初期化して、次回の配車を開始しますか？\n（選手・車両リストと配車履歴は消えません）';
  if (!confirm(msg)) return;

  cars.forEach(c => {
    c.active = true;
    c.companions = [];
  });

  children.forEach(c => {
    // 既存の初期状態に合わせ、全員「乗車」に戻す（マスタ情報は触らない）
    c.active = true;
    c.meetOnSite = false;
    c.companions = [];
    c.fixedCar = '';
  });

  if (typeof openChildCompanionEditors !== 'undefined' && openChildCompanionEditors.clear) {
    openChildCompanionEditors.clear();
  }

  currentAssignments = null;
  lastGeneratedPlan = '';
  if (typeof clearLastSessionCommit === 'function') clearLastSessionCommit();
  const resultCard = document.getElementById('resultCard');
  if (resultCard) resultCard.style.display = 'none';
  const resultText = document.getElementById('resultText');
  if (resultText) resultText.textContent = '';
  if (typeof clearCarpoolDiagnosis === 'function') clearCarpoolDiagnosis();

  saveData();
  renderCars();
  renderChildren();
  updateStatusBar();
}

/** @deprecated 互換: 旧「出欠チェック全解除」→ 本日リセットへ誘導 */
function clearAllChecks() {
  resetTodaySession();
}

function resetAllData() {
  if (confirm("登録した車・子供・履歴データをすべて初期状態に消去しますか？")) {
    if (typeof clearLastSessionCommit === 'function') clearLastSessionCommit();
    try { sessionStorage.removeItem('cp_lastSessionCommit'); } catch (e) { /* ignore */ }
    localStorage.clear();
    location.reload();
  }
}

function isBackupCar(car) {
  return !!car && typeof car === 'object' && typeof car.name === 'string' && car.name.trim() !== '' && car.id != null;
}

function isBackupChild(child) {
  return !!child && typeof child === 'object' && typeof child.name === 'string' && child.name.trim() !== '' && child.id != null;
}

function buildBackupPayload() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    cars: cars,
    children: children
  };
}

/** iOS Safari でも動くクリップボード書き込み（Clipboard API → execCommand フォールバック） */
function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text).catch(() => copyTextFallback(text));
  }
  return Promise.resolve().then(() => copyTextFallback(text));
}

function copyTextFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:none;opacity:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (e) {
    ok = false;
  }
  document.body.removeChild(ta);
  if (!ok) throw new Error('clipboard copy failed');
}

function copyBackupData() {
  const payload = JSON.stringify(buildBackupPayload(), null, 2);
  copyTextToClipboard(payload).then(() => {
    alert('バックアップ用テキストをコピーしました！LINEの自分用トークやメモ帳に貼り付けて保管してください');
  }).catch(() => {
    alert('コピーに失敗しました。ブラウザの権限を確認するか、別のブラウザでお試しください。');
  });
}

function restoreBackupData(text) {
  const raw = (text || '').trim();
  if (!raw) {
    alert('退避テキストを貼り付けてください。');
    return false;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    alert('退避テキストの形式が正しくありません。コピーしたデータをそのまま貼り付けてください。');
    return false;
  }

  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray(data.cars) ||
    !Array.isArray(data.children) ||
    !data.cars.every(isBackupCar) ||
    !data.children.every(isBackupChild)
  ) {
    alert('退避テキストの形式が正しくありません。コピーしたデータをそのまま貼り付けてください。');
    return false;
  }

  if (!confirm('現在のデータを退避テキストの内容で上書きします。よろしいですか？')) {
    return false;
  }

  cars = data.cars.map(normalizeCar);
  children = data.children.map(normalizeChild);
  saveData();
  renderCars();
  renderChildren();
  updateStatusBar();

  if (typeof openChildCompanionEditors !== 'undefined' && openChildCompanionEditors.clear) {
    openChildCompanionEditors.clear();
  }

  const resultCard = document.getElementById('resultCard');
  if (resultCard) resultCard.style.display = 'none';
  const resultText = document.getElementById('resultText');
  if (resultText) resultText.textContent = '';
  currentAssignments = null;
  lastGeneratedPlan = '';

  alert('データを正常に復元しました');
  return true;
}

/* 一括進級機能 */
function promoteAllGrades() {
  if (confirm("全選手の学年を1つ繰り上げますか？\n（現在6年生の選手はチェックが外れて卒団扱いになります）")) {
    children.forEach(c => {
      if (c.grade < 6) {
        c.grade += 1;
      } else {
        c.active = false;
        c.meetOnSite = false;
        c.companions = [];
        c.fixedCar = '';
      }
    });
    saveData();
    renderCars();
    renderChildren();
    updateStatusBar();
  }
}
