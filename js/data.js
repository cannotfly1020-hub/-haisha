function createDefaultCars() {
  return [
    { id: 1, name: '佐藤号', capacity: 3, active: true },
    { id: 2, name: '鈴木号', capacity: 3, active: true },
    { id: 3, name: '田中号(荷物車)', capacity: 2, active: true }
  ];
}

function createDefaultChildren() {
  return [
    { id: 1, name: 'ゆうと', grade: 6, pos: '投手', parentCar: '佐藤号', motionSick: false, active: true, lastCar: '', rideHistory: {} },
    { id: 2, name: 'そうた', grade: 6, pos: '捕手', parentCar: '鈴木号', motionSick: false, active: true, lastCar: '', rideHistory: {} },
    { id: 3, name: 'れん', grade: 5, pos: '内野', parentCar: '', motionSick: true, active: true, lastCar: '', rideHistory: {} },
    { id: 4, name: 'はると', grade: 5, pos: '外野', parentCar: '', motionSick: false, active: true, lastCar: '', rideHistory: {} },
    { id: 5, name: 'こうき', grade: 4, pos: '内野', parentCar: '', motionSick: false, active: true, lastCar: '', rideHistory: {} },
    { id: 6, name: '大和', grade: 3, pos: '外野', parentCar: '', motionSick: false, active: true, lastCar: '', rideHistory: {} }
  ];
}

let cars = [];
let children = [];

try {
  cars = JSON.parse(localStorage.getItem('cp_cars')) || createDefaultCars();
} catch (e) {
  cars = createDefaultCars();
}

try {
  children = JSON.parse(localStorage.getItem('cp_children')) || createDefaultChildren();
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
    children.forEach(c => c.active = false);
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

/* 一括進級機能 */
function promoteAllGrades() {
  if (confirm("全選手の学年を1つ繰り上げますか？\n（現在6年生の選手はチェックが外れて卒団扱いになります）")) {
    children.forEach(c => {
      if (c.grade < 6) {
        c.grade += 1;
      } else {
        c.active = false;
      }
    });
    saveData();
    renderChildren();
    updateStatusBar();
  }
}
