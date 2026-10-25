function createDefaultCars() {
  return [
    { id: 1, name: '佐藤号', capacity: 3, active: true },
    { id: 2, name: '鈴木号', capacity: 3, active: true },
    { id: 3, name: '田中号(荷物車)', capacity: 2, active: true }
  ];
}

function createDefaultChildren() {
  return [
    { id: 1, name: 'ゆうと', grade: 6, pos: '投手', parentCar: '佐藤号', motionSick: false, active: true, meetOnSite: false, guardianRide: false, guardianName: '', lastCar: '', rideHistory: {} },
    { id: 2, name: 'そうた', grade: 6, pos: '捕手', parentCar: '鈴木号', motionSick: false, active: true, meetOnSite: false, guardianRide: false, guardianName: '', lastCar: '', rideHistory: {} },
    { id: 3, name: 'れん', grade: 5, pos: '内野', parentCar: '', motionSick: true, active: true, meetOnSite: false, guardianRide: false, guardianName: '', lastCar: '', rideHistory: {} },
    { id: 4, name: 'はると', grade: 5, pos: '外野', parentCar: '', motionSick: false, active: true, meetOnSite: false, guardianRide: false, guardianName: '', lastCar: '', rideHistory: {} },
    { id: 5, name: 'こうき', grade: 4, pos: '内野', parentCar: '', motionSick: false, active: true, meetOnSite: false, guardianRide: false, guardianName: '', lastCar: '', rideHistory: {} },
    { id: 6, name: '大和', grade: 3, pos: '外野', parentCar: '', motionSick: false, active: true, meetOnSite: false, guardianRide: false, guardianName: '', lastCar: '', rideHistory: {} }
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

function formatRiderLabel(child) {
  const sick = child.motionSick ? '🤢' : '';
  const guardian = child.guardianRide ? `（＋${guardianLabel(child)}）` : '';
  return `${child.name}${sick}${guardian}`;
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
  } else if (mode === 'site') {
    child.active = true;
    child.meetOnSite = true;
    child.guardianRide = false;
  } else {
    child.active = true;
    child.meetOnSite = false;
  }
}

let cars = [];
let children = [];

try {
  cars = JSON.parse(localStorage.getItem('cp_cars')) || createDefaultCars();
} catch (e) {
  cars = createDefaultCars();
}

try {
  const loaded = JSON.parse(localStorage.getItem('cp_children')) || createDefaultChildren();
  children = loaded.map(normalizeChild);
} catch (e) {
  children = createDefaultChildren();
}

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

function clearAllChecks() {
  if (confirm("子供と車の出欠チェックをすべて外しますか？\n（選手一覧や車一覧は消えません）")) {
    cars.forEach(c => c.active = false);
    children.forEach(c => {
      c.active = false;
      c.meetOnSite = false;
      c.guardianRide = false;
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
  const payload = JSON.stringify({ cars: cars, children: children }, null, 2);
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

  cars = data.cars;
  children = data.children.map(normalizeChild);
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
      }
    });
    saveData();
    renderChildren();
    updateStatusBar();
  }
}
