function createDefaultCars() {
  return [
    { id: 1, name: '佐藤号', capacity: 3, active: true, familySeats: 0 },
    { id: 2, name: '鈴木号', capacity: 3, active: true, familySeats: 0 },
    { id: 3, name: '田中号(荷物車)', capacity: 2, active: true, familySeats: 0 }
  ];
}

function normalizeCar(car) {
  return {
    ...car,
    name: typeof car.name === 'string' ? car.name : '',
    capacity: Math.max(0, parseInt(car.capacity, 10) || 0),
    active: !!car.active,
    familySeats: Math.max(0, parseInt(car.familySeats, 10) || 0)
  };
}

function familySeatsOf(car) {
  if (!car) return 0;
  return Math.max(0, parseInt(car.familySeats, 10) || 0);
}

function createDefaultChildren() {
  return [
    { id: 1, name: 'ゆうと', grade: 6, pos: '投手', parentCar: '佐藤号', fixedCar: '', motionSick: false, active: true, meetOnSite: false, guardianRide: false, guardianName: '', lastCar: '', rideHistory: {} },
    { id: 2, name: 'そうた', grade: 6, pos: '捕手', parentCar: '鈴木号', fixedCar: '', motionSick: false, active: true, meetOnSite: false, guardianRide: false, guardianName: '', lastCar: '', rideHistory: {} },
    { id: 3, name: 'れん', grade: 5, pos: '内野', parentCar: '', fixedCar: '', motionSick: true, active: true, meetOnSite: false, guardianRide: false, guardianName: '', lastCar: '', rideHistory: {} },
    { id: 4, name: 'はると', grade: 5, pos: '外野', parentCar: '', fixedCar: '', motionSick: false, active: true, meetOnSite: false, guardianRide: false, guardianName: '', lastCar: '', rideHistory: {} },
    { id: 5, name: 'こうき', grade: 4, pos: '内野', parentCar: '', fixedCar: '', motionSick: false, active: true, meetOnSite: false, guardianRide: false, guardianName: '', lastCar: '', rideHistory: {} },
    { id: 6, name: '大和', grade: 3, pos: '外野', parentCar: '', fixedCar: '', motionSick: false, active: true, meetOnSite: false, guardianRide: false, guardianName: '', lastCar: '', rideHistory: {} }
  ];
}

function normalizeChild(child) {
  const meetOnSite = !!child.meetOnSite;
  return {
    ...child,
    active: !!child.active,
    meetOnSite: meetOnSite,
    guardianRide: !!child.guardianRide && !meetOnSite,
    guardianName: typeof child.guardianName === 'string' ? child.guardianName : '',
    motionSick: !!child.motionSick,
    parentCar: typeof child.parentCar === 'string' ? child.parentCar : '',
    fixedCar: typeof child.fixedCar === 'string' ? child.fixedCar : '',
    lastCar: typeof child.lastCar === 'string' ? child.lastCar : '',
    rideHistory: child.rideHistory && typeof child.rideHistory === 'object' && !Array.isArray(child.rideHistory) ? child.rideHistory : {}
  };
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
  return 1 + (child.guardianRide ? 1 : 0);
}

function guardianLabel(child) {
  const name = (child && child.guardianName ? child.guardianName : '').trim();
  return name || '母';
}

function formatRiderLabel(child, carName, options) {
  const showPin = !options || options.showPin !== false;
  const pinned = showPin && child.fixedCar && carName && child.fixedCar === carName ? '📌' : '';
  const sick = child.motionSick ? '🤢' : '';
  const guardian = child.guardianRide ? `（＋${guardianLabel(child)}）` : '';
  return `${pinned}${child.name}${sick}${guardian}`;
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
    child.guardianRide = false;
    child.fixedCar = '';
  } else if (mode === 'site') {
    child.active = true;
    child.meetOnSite = true;
    child.guardianRide = false;
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
  const family = familySeatsOf(car);
  const guests = fixedSeatsUsed(car.name);
  const used = family + guests;
  const remaining = capacity - used;
  return {
    capacity,
    family,
    guests,
    used,
    remaining,
    isFull: remaining <= 0,
    isOver: remaining < 0
  };
}

function seatCostForChoice(withGuardian) {
  return 1 + (withGuardian ? 1 : 0);
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

let cars = [];
let children = [];
let hiddenGuestIds = [];

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

try {
  const loadedHidden = JSON.parse(localStorage.getItem('cp_hidden_guest_ids'));
  hiddenGuestIds = Array.isArray(loadedHidden)
    ? loadedHidden.map(Number).filter(n => !Number.isNaN(n))
    : [];
} catch (e) {
  hiddenGuestIds = [];
}

function saveHiddenGuestIds() {
  try {
    localStorage.setItem('cp_hidden_guest_ids', JSON.stringify(hiddenGuestIds));
  } catch (e) {
    console.error("同乗候補の保存エラー:", e);
  }
}

function isGuestOptionHidden(childId) {
  return hiddenGuestIds.includes(Number(childId));
}

function hideGuestOption(childId) {
  const id = Number(childId);
  if (Number.isNaN(id) || hiddenGuestIds.includes(id)) return;
  hiddenGuestIds.push(id);
  saveHiddenGuestIds();
}

function restoreGuestOption(childId) {
  const id = Number(childId);
  hiddenGuestIds = hiddenGuestIds.filter(x => x !== id);
  saveHiddenGuestIds();
}

function saveData() {
  try {
    localStorage.setItem('cp_cars', JSON.stringify(cars));
    localStorage.setItem('cp_children', JSON.stringify(children));
    saveHiddenGuestIds();
  } catch (e) {
    console.error("保存エラー:", e);
  }
}

function manualSave() {
  saveData();
  alert("💾 現在の登録内容とチェック状態を保存しました！");
}

function clearAllChecks() {
  if (confirm("子供と車の出欠チェックをすべて外しますか？\n（選手一覧や車一覧は消えません）")) {
    cars.forEach(c => {
      c.active = false;
      c.familySeats = 0;
    });
    children.forEach(c => {
      c.active = false;
      c.meetOnSite = false;
      c.guardianRide = false;
      c.fixedCar = '';
    });
    saveData();
    renderCars();
    renderChildren();
    updateStatusBar();
  }
}

function resetAllData() {
  if (confirm("登録した車・子供・履歴データをすべて初期状態に消去しますか？")) {
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

function copyBackupData() {
  const payload = JSON.stringify({ cars: cars, children: children, hiddenGuestIds: hiddenGuestIds }, null, 2);
  const notifyCopied = () => {
    alert("データをコピーしました！LINEのKeepメモ等に貼り付けて保存してください");
  };
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    alert("コピーに失敗しました。ブラウザの権限を確認してもう一度お試しください。");
    return;
  }
  navigator.clipboard.writeText(payload).then(notifyCopied).catch(() => {
    alert("コピーに失敗しました。ブラウザの権限を確認してもう一度お試しください。");
  });
}

function restoreBackupData(text) {
  const raw = (text || '').trim();
  if (!raw) {
    alert("バックアップデータを貼り付けてください。");
    return false;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    alert("バックアップデータの形式が正しくありません。コピーしたデータをそのまま貼り付けてください。");
    return false;
  }

  if (!data || typeof data !== 'object' || !Array.isArray(data.cars) || !Array.isArray(data.children) || !data.cars.every(isBackupCar) || !data.children.every(isBackupChild)) {
    alert("バックアップデータの形式が正しくありません。コピーしたデータをそのまま貼り付けてください。");
    return false;
  }

  cars = data.cars.map(normalizeCar);
  children = data.children.map(normalizeChild);
  hiddenGuestIds = Array.isArray(data.hiddenGuestIds)
    ? data.hiddenGuestIds.map(Number).filter(n => !Number.isNaN(n))
    : [];
  saveData();
  renderCars();
  renderChildren();
  updateStatusBar();

  const resultCard = document.getElementById('resultCard');
  if (resultCard) resultCard.style.display = 'none';
  currentAssignments = null;
  lastGeneratedPlan = "";

  alert("復元が完了しました！");
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
        c.guardianRide = false;
        c.fixedCar = '';
      }
    });
    saveData();
    renderCars();
    renderChildren();
    updateStatusBar();
  }
}
