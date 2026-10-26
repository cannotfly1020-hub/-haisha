(function (global) {
/** 選手カードの同乗入力を開いている ID（再描画でも維持） */
const openChildCompanionEditors = new Set();

const CHILD_SORT_KEY = 'cp_child_sort';
const CHILD_SORT_MODES = new Set(['default', 'kana', 'grade', 'position']);
const POS_ORDER = {
  '投手': 1, 'ピッチャー': 1,
  '捕手': 2, 'キャッチャー': 2,
  '内野': 3, '内野手': 3,
  '外野': 4, '外野手': 4,
  '未定': 9, '': 9
};

/** 選手一覧の表示ソート（配列本体は破壊しない） */
let childSortMode = 'default';

function readChildSortMode() {
  try {
    const raw = sessionStorage.getItem(CHILD_SORT_KEY);
    if (CHILD_SORT_MODES.has(raw)) return raw;
  } catch (e) { /* ignore */ }
  return 'default';
}

function writeChildSortMode(mode) {
  const next = CHILD_SORT_MODES.has(mode) ? mode : 'default';
  childSortMode = next;
  try {
    sessionStorage.setItem(CHILD_SORT_KEY, next);
  } catch (e) { /* ignore */ }
  const select = document.getElementById('childSortModeSelect');
  if (select && select.value !== next) select.value = next;
}

function positionSortScore(pos) {
  const raw = typeof pos === 'string' ? pos.trim() : '';
  if (Object.prototype.hasOwnProperty.call(POS_ORDER, raw)) return POS_ORDER[raw];
  const keys = Object.keys(POS_ORDER).filter((k) => k);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (raw.includes(key) || key.includes(raw)) return POS_ORDER[key];
  }
  return 9;
}

function compareChildrenForSort(a, b, mode) {
  if (mode === 'kana') {
    return a.name.localeCompare(b.name, 'ja');
  }
  if (mode === 'grade') {
    const ga = parseInt(a.grade, 10) || 0;
    const gb = parseInt(b.grade, 10) || 0;
    if (gb !== ga) return gb - ga;
    return a.name.localeCompare(b.name, 'ja');
  }
  if (mode === 'position') {
    const pa = positionSortScore(a.pos);
    const pb = positionSortScore(b.pos);
    if (pa !== pb) return pa - pb;
    const ga = parseInt(a.grade, 10) || 0;
    const gb = parseInt(b.grade, 10) || 0;
    if (gb !== ga) return gb - ga;
    return a.name.localeCompare(b.name, 'ja');
  }
  // default: 登録順（id 昇順、同値なら配列安定のため 0）
  const ia = Number(a.id) || 0;
  const ib = Number(b.id) || 0;
  if (ia !== ib) return ia - ib;
  return 0;
}

function getSortedChildrenForRender() {
  const mode = CHILD_SORT_MODES.has(childSortMode) ? childSortMode : 'default';
  return [...children].sort((a, b) => compareChildrenForSort(a, b, mode));
}

function setChildSortMode(mode) {
  writeChildSortMode(mode);
  renderChildren();
}

function readSectionOpenState(key, fallback) {
  try {
    const raw = sessionStorage.getItem(`cp_section_${key}`);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch (e) { /* ignore */ }
  return fallback;
}

function writeSectionOpenState(key, isOpen) {
  try {
    sessionStorage.setItem(`cp_section_${key}`, isOpen ? '1' : '0');
  } catch (e) { /* ignore */ }
}

function applySectionOpenState() {
  ['cars', 'children'].forEach((key) => {
    const panel = document.getElementById(key === 'cars' ? 'carsPanel' : 'childrenPanel');
    if (!panel) return;
    const isOpen = readSectionOpenState(key, true);
    panel.classList.toggle('is-open', isOpen);
    const toggle = panel.querySelector('.panel-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
}

function toggleSection(sectionKey) {
  // ワイド画面では常時展開のためトグル無効
  if (window.matchMedia && window.matchMedia('(min-width: 768px)').matches) return;

  const panel = document.getElementById(sectionKey === 'cars' ? 'carsPanel' : 'childrenPanel');
  if (!panel) return;
  const nextOpen = !panel.classList.contains('is-open');
  panel.classList.toggle('is-open', nextOpen);
  writeSectionOpenState(sectionKey, nextOpen);
  const toggle = panel.querySelector('.panel-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
}

/** 設定・バックアップ（全画面幅で開閉可能・初期閉じ） */
function toggleSettingsPanel() {
  const panel = document.getElementById('settingsPanel');
  if (!panel) return;
  const nextOpen = !panel.classList.contains('is-open');
  panel.classList.toggle('is-open', nextOpen);
  writeSectionOpenState('settings', nextOpen);
  const toggle = panel.querySelector('.panel-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
}

function applySettingsPanelState() {
  const panel = document.getElementById('settingsPanel');
  if (!panel) return;
  const isOpen = readSectionOpenState('settings', false);
  panel.classList.toggle('is-open', isOpen);
  const toggle = panel.querySelector('.panel-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function openChildCompanionEditor(childId) {
  const id = Number(childId);
  if (!id) return;
  openChildCompanionEditors.add(id);
  renderChildren();
  const input = document.getElementById(`childCompanionInput-${id}`);
  if (input) {
    input.focus();
    if (typeof input.scrollIntoView === 'function') {
      input.scrollIntoView({ block: 'nearest' });
    }
  }
}

function updatePanelSummaries(activeCarsList, activeSeats, seatDemand, activeKids) {
  const carsSummary = document.getElementById('carsSummary');
  const childrenSummary = document.getElementById('childrenSummary');
  const remaining = activeSeats - seatDemand;
  if (carsSummary) {
    const n = activeCarsList.length;
    if (remaining < 0) {
      carsSummary.textContent = `車: ${n}台稼働（${Math.abs(remaining)}席不足）`;
    } else {
      carsSummary.textContent = `車: ${n}台稼働（残り${remaining}席）`;
    }
  }
  if (childrenSummary) {
    childrenSummary.textContent = `選手: ${activeKids}名出席`;
  }
}

function updateStatusBar() {
  const activeKids = children.filter(isParticipating).length;
  const onSiteKids = children.filter(isOnSite).length;
  const activeCarsList = cars.filter(c => c.active);
  const kidSeats = children.reduce((sum, c) => sum + seatCost(c), 0);
  const companionDemand = activeCarsList.reduce((sum, c) => sum + companionSeatsOf(c), 0);
  const seatDemand = kidSeats + companionDemand;
  const activeSeats = activeCarsList.reduce((sum, c) => sum + (parseInt(c.capacity, 10) || 0), 0);
  const diff = activeSeats - seatDemand;

  const countKidsEl = document.getElementById('countKids');
  const countOnSiteEl = document.getElementById('countOnSite');
  const countSeatsEl = document.getElementById('countSeats');
  const bar = document.getElementById('statusBar');
  const diffEl = document.getElementById('statusDiff');
  const labelEl = document.getElementById('statusDiffLabel');

  updatePanelSummaries(activeCarsList, activeSeats, seatDemand, activeKids);

  if (!countKidsEl || !countSeatsEl || !bar || !diffEl || !labelEl) return;

  countKidsEl.innerText = `${activeKids}人`;
  if (countOnSiteEl) countOnSiteEl.innerText = `${onSiteKids}人`;
  countSeatsEl.innerText = `${activeSeats}席`;

  if (diff < 0) {
    bar.classList.add('alert');
    labelEl.innerText = "不足！";
    diffEl.innerText = `${Math.abs(diff)}席 不足`;
  } else {
    bar.classList.remove('alert');
    labelEl.innerText = "状況";
    diffEl.innerText = `+${diff}席 OK`;
  }
}

function buildFixedCarOptionsHtml(selected, child) {
  let html = `<option value="">${autoFixedLabel(child || {})}</option>`;
  const activeCars = cars.filter(c => c.active);
  activeCars.forEach(c => {
    html += `<option value="${c.name}" ${selected === c.name ? 'selected' : ''}>${c.name}</option>`;
  });
  if (selected && !activeCars.some(c => c.name === selected)) {
    html += `<option value="${selected}" selected>${selected}（本日休み）</option>`;
  }
  return html;
}

function updateCarSelectOptions() {
  const addSelect = document.getElementById('newChildParentCar');
  const editSelect = document.getElementById('editChildParentCar');
  const editFixedSelect = document.getElementById('editChildFixedCar');
  if (!addSelect) return;

  let currentAddVal = addSelect.value;
  addSelect.innerHTML = '<option value="">親の車: なし</option>';
  cars.forEach(c => {
    addSelect.innerHTML += `<option value="${c.name}">${c.name}</option>`;
  });
  addSelect.value = currentAddVal;

  if (editSelect) {
    let currentEditVal = editSelect.value;
    editSelect.innerHTML = '<option value="">親の車: なし</option>';
    cars.forEach(c => {
      editSelect.innerHTML += `<option value="${c.name}">${c.name}</option>`;
    });
    editSelect.value = currentEditVal;
  }

  if (editFixedSelect) {
    const id = parseInt(document.getElementById('editChildId').value, 10);
    const kid = children.find(x => x.id === id);
    const selected = editFixedSelect.value || (kid ? kid.fixedCar : '') || '';
    editFixedSelect.innerHTML = buildFixedCarOptionsHtml(selected, kid);
  }
}

function buildCapacityBadgeHtml(summary) {
  if (summary.isOver) {
    return `<span class="seat-badge seat-badge-over">定員${summary.capacity}・超過${Math.abs(summary.remaining)}</span>`;
  }
  if (summary.isFull) {
    return `<span class="seat-badge seat-badge-full">定員${summary.capacity}・満席</span>`;
  }
  return `<span class="seat-badge seat-badge-ok">定員${summary.capacity}・残${summary.remaining}</span>`;
}

const QUICK_COMPANION_LABELS = ['母', '兄', '姉', '弟', '妹'];

function buildCompanionChipsHtml(car) {
  const list = companionsOf(car);
  if (list.length === 0) return '';
  return list.map(c => `
    <span class="companion-chip">
      ${c.label}
      <button type="button" class="companion-remove" data-action="remove-companion" data-car-id="${car.id}" data-companion-id="${c.id}" title="削除">✕</button>
    </span>
  `).join('');
}

function buildQuickCompanionButtonsHtml(car, disabled) {
  return QUICK_COMPANION_LABELS.map(label => `
    <button type="button" class="companion-quick" data-action="add-companion" data-id="${car.id}" data-label="${label}" ${disabled ? 'disabled' : ''}>${label}</button>
  `).join('');
}

function renderCars() {
  const list = document.getElementById('carList');
  if (!list) return;
  list.innerHTML = '';
  cars.forEach((car) => {
    const summary = carSeatSummary(car);
    const inactiveClass = car.active ? '' : 'is-inactive';
    const fullBlock = summary.isFull || summary.isOver;
    const addDisabled = !car.active || fullBlock ? 'disabled' : '';
    const carChips = buildCompanionChipsHtml(car);

    const safeName = String(car.name || '').replace(/"/g, '&quot;');
    const equipBadge = car.isEquipmentCar ? `<span class="equipment-badge" title="道具車">📦 道具車</span>` : '';
    list.innerHTML += `
      <div class="car-card ${inactiveClass}${car.isEquipmentCar ? ' is-equipment' : ''}">
        <div class="car-card-header">
          <label class="car-name-label">
            <input type="checkbox" data-action="toggle-car" data-id="${car.id}" ${car.active ? 'checked' : ''}>
            <input type="text" class="car-name-input" data-action="rename-car" data-id="${car.id}"
              value="${safeName}" maxlength="40" title="車両名（変更すると参照も連動更新）" aria-label="車両名">
          </label>
          ${equipBadge}
          ${buildCapacityBadgeHtml(summary)}
          <div class="car-card-tools">
            <label class="cap-edit">定員<input type="number" class="input-cap" data-action="update-capacity" data-id="${car.id}" value="${car.capacity}" min="0"></label>
            <button type="button" class="btn-delete" data-action="delete-car" data-id="${car.id}">✕</button>
          </div>
        </div>

        <div class="car-meta-row">
          <label class="car-equipment-label">
            <input type="checkbox" class="car-equipment-checkbox" data-action="toggle-equipment" data-id="${car.id}" data-car-id="${car.id}" ${car.isEquipmentCar ? 'checked' : ''}>
            道具車
          </label>
        </div>

        <div class="companion-bar">
          ${carChips ? `<div class="companion-chips">${carChips}</div>` : ''}
          <div class="companion-add-row">
            ${buildQuickCompanionButtonsHtml(car, !!addDisabled)}
            <input type="text" class="companion-input" id="companionInput-${car.id}" placeholder="名前" ${addDisabled} maxlength="20">
            <button type="button" class="companion-add-btn" data-action="add-companion-custom" data-id="${car.id}" ${addDisabled}>＋</button>
          </div>
        </div>
      </div>
    `;
  });
  updateCarSelectOptions();
}

function buildChildCompanionChipsHtml(child) {
  const list = childCompanionsOf(child);
  if (list.length === 0) return '';
  return list.map(cmp => `
    <span class="companion-chip">
      ${cmp.label}
      <button type="button" class="companion-remove" data-action="remove-child-companion" data-child-id="${child.id}" data-companion-id="${cmp.id}" title="削除">✕</button>
    </span>
  `).join('');
}

function renderChildren() {
  const list = document.getElementById('childList');
  if (!list) return;
  list.innerHTML = '';
  const select = document.getElementById('childSortModeSelect');
  if (select && select.value !== childSortMode) select.value = childSortMode;

  getSortedChildrenForRender().forEach((c) => {
    const mode = getAttendMode(c);
    const fixedDisabled = mode !== 'ride' ? 'disabled' : '';
    const companionDisabled = mode !== 'ride' ? 'disabled' : '';
    if (mode !== 'ride') openChildCompanionEditors.delete(Number(c.id));
    const editorOpen = mode === 'ride' && openChildCompanionEditors.has(Number(c.id));
    const chipsHtml = buildChildCompanionChipsHtml(c);

    list.innerHTML += `
      <div class="item-row item-row-child">
        <div class="item-main">
          <div class="child-top-row">
            <select class="attend-select" data-action="set-attend" data-id="${c.id}">
              <option value="off" ${mode === 'off' ? 'selected' : ''}>欠席</option>
              <option value="ride" ${mode === 'ride' ? 'selected' : ''}>乗車</option>
              <option value="site" ${mode === 'site' ? 'selected' : ''}>現地</option>
            </select>
            <span class="child-name">${c.name}</span>
            ${chipsHtml}
            ${mode === 'ride' && !editorOpen ? `
              <button type="button" class="btn-add-companion" data-action="open-child-companion" data-id="${c.id}">＋同乗</button>
            ` : ''}
            <span class="badge-sub">${c.grade ? c.grade + '年' : ''}</span>
            ${c.motionSick ? `<span class="badge-motion">🤢酔い</span>` : ''}
            ${c.parentCar ? `<span class="badge">親:${c.parentCar}</span>` : ''}
            ${mode === 'site' ? `<span class="badge-site">現地</span>` : ''}
            ${c.fixedCar && mode === 'ride' ? `<span class="badge-fixed">📌${c.fixedCar}</span>` : ''}
          </div>
          ${editorOpen ? `
            <div class="child-companion-editor">
              <input type="text" class="child-companion-input" id="childCompanionInput-${c.id}"
                placeholder="名前を入力..." ${companionDisabled} maxlength="20">
              <button type="button" class="companion-add-btn" data-action="add-child-companion" data-id="${c.id}" ${companionDisabled}>＋追加</button>
            </div>
          ` : ''}
          <label class="fixed-car-label ${mode !== 'ride' ? 'is-disabled' : ''}">
            <span>指定</span>
            <select class="fixed-car-select" data-action="set-fixed-car" data-id="${c.id}" ${fixedDisabled}>
              ${buildFixedCarOptionsHtml(c.fixedCar || '', c)}
            </select>
          </label>
        </div>
        <div class="item-right">
          <button type="button" class="btn-edit" data-action="edit-child" data-id="${c.id}">✏️</button>
          <button type="button" class="btn-delete" data-action="delete-child" data-id="${c.id}">✕</button>
        </div>
      </div>
    `;
  });
}

function refreshLists() {
  renderCars();
  renderChildren();
  updateStatusBar();
}

function toggleCar(id, checked) {
  const c = cars.find(x => x.id === id);
  if (!c) return;
  c.active = typeof checked === 'boolean' ? checked : !c.active;
  saveData();
  refreshLists();
}

function updateCapacity(id, val) {
  const c = cars.find(x => x.id === id);
  if (c) c.capacity = parseInt(val) || 0;
  saveData();
  renderCars();
  updateStatusBar();
}

function toggleEquipmentCar(id, checked) {
  const c = cars.find(x => String(x.id) === String(id));
  if (!c) return;
  c.isEquipmentCar = typeof checked === 'boolean' ? checked : !c.isEquipmentCar;
  saveData();
  renderCars();
  updateStatusBar();
}

/** 車両名変更（参照カスケード付き）。失敗時は表示を元に戻す。 */
function commitCarRename(id, newName) {
  const car = cars.find(x => String(x.id) === String(id));
  if (!car) return;
  const prev = car.name;
  const ok = renameCar(id, newName);
  if (!ok) {
    // 空・同一名・重複時は入力をマスタに戻して再描画
    renderCars();
    updateCarSelectOptions();
    return;
  }
  if (prev !== car.name) {
    refreshLists();
  }
}

function setChildAttend(id, mode) {
  const ch = children.find(x => x.id === id);
  if (!ch) return;
  setAttendMode(ch, mode);
  saveData();
  refreshLists();
}

function setChildFixedCar(id, carName) {
  const ch = children.find(x => x.id === id);
  if (!ch) return;

  if (!carName) {
    ch.fixedCar = '';
    saveData();
    refreshLists();
    return;
  }

  const car = cars.find(c => c.name === carName);
  if (!car) return;

  const cost = seatCost({ ...ch, fixedCar: carName, meetOnSite: false, active: true }) || 1;
  if (!canFitOnCar(car, cost, ch.id)) {
    alert(`「${car.name}」の定員を超えるため指定できません。`);
    renderChildren();
    return;
  }

  ch.fixedCar = carName;
  saveData();
  refreshLists();
}

function addChildCompanion(childId, label) {
  const ch = children.find(x => x.id === childId);
  const name = (label || '').trim();
  if (!ch || !isRiding(ch) || !name) return;

  if (ch.fixedCar) {
    const car = cars.find(c => c.name === ch.fixedCar);
    // 既存の選手＋同乗はすでに used に含まれているので、追加1席分だけ判定
    if (car && !canFitOnCar(car, 1)) {
      alert(`「${car.name}」の定員を超えるため、同乗者を追加できません。`);
      return;
    }
  }

  if (!Array.isArray(ch.companions)) ch.companions = [];
  ch.companions.push({ id: newCompanionId(), label: name });
  saveData();
  refreshLists();
}

function addChildCompanionCustom(childId) {
  const input = document.getElementById(`childCompanionInput-${childId}`);
  const name = input ? input.value.trim() : '';
  if (!name) {
    alert('同乗者の名前を入力してください。');
    return;
  }
  openChildCompanionEditors.add(Number(childId));
  addChildCompanion(childId, name);
}

function removeChildCompanion(childId, companionId) {
  const ch = children.find(x => x.id === childId);
  if (!ch || !Array.isArray(ch.companions)) return;
  ch.companions = ch.companions.filter(c => String(c.id) !== String(companionId));
  saveData();
  refreshLists();
}

function addCompanion(carId, label) {
  const car = cars.find(x => x.id === carId);
  const name = (label || '').trim();
  if (!car || !car.active || !name) return;

  if (!canFitOnCar(car, 1)) {
    alert(`「${car.name}」は満席です。`);
    renderCars();
    return;
  }

  if (!Array.isArray(car.companions)) car.companions = [];
  car.companions.push({ id: newCompanionId(), label: name });
  saveData();
  refreshLists();
}

function addCompanionCustom(carId) {
  const input = document.getElementById(`companionInput-${carId}`);
  const name = input ? input.value.trim() : '';
  if (!name) {
    alert('同乗者の名前を入力してください。');
    return;
  }
  addCompanion(carId, name);
}

function removeCompanion(carId, companionId) {
  const car = cars.find(x => x.id === carId);
  if (!car || !Array.isArray(car.companions)) return;
  car.companions = car.companions.filter(c => String(c.id) !== String(companionId));
  saveData();
  refreshLists();
}

function deleteCar(id) {
  const car = cars.find(x => x.id === id);
  if (car && confirm(`「${car.name}」を削除しますか？`)) {
    cars = cars.filter(x => x.id !== id);
    children.forEach(ch => {
      if (ch.parentCar === car.name) ch.parentCar = '';
      if (ch.fixedCar === car.name) ch.fixedCar = '';
    });
    saveData();
    renderCars();
    renderChildren();
    updateStatusBar();
  }
}

function deleteChild(id) {
  const kid = children.find(x => x.id === id);
  if (kid && confirm(`「${kid.name}」を削除しますか？`)) {
    children = children.filter(x => x.id !== id);
    saveData();
    refreshLists();
  }
}

/* 編集機能 */
function openEditModal(id) {
  const kid = children.find(x => x.id === id);
  if (!kid) return;
  document.getElementById('editChildId').value = kid.id;
  document.getElementById('editChildName').value = kid.name;
  document.getElementById('editChildGrade').value = kid.grade || 6;
  document.getElementById('editChildPos').value = kid.pos || '未定';
  document.getElementById('editChildMotionSick').checked = !!kid.motionSick;
  updateCarSelectOptions();
  document.getElementById('editChildParentCar').value = kid.parentCar || '';
  const fixedSelect = document.getElementById('editChildFixedCar');
  if (fixedSelect) {
    fixedSelect.innerHTML = buildFixedCarOptionsHtml(kid.fixedCar || '', kid);
  }
  const editModal = document.getElementById('editModal');
  editModal.classList.add('is-open');
  editModal.style.display = '';
}

function closeEditModal() {
  const editModal = document.getElementById('editModal');
  editModal.classList.remove('is-open');
  editModal.style.display = '';
}

function saveEditChild() {
  const id = parseInt(document.getElementById('editChildId').value);
  const kid = children.find(x => x.id === id);
  if (kid) {
    kid.name = document.getElementById('editChildName').value.trim() || kid.name;
    kid.grade = parseInt(document.getElementById('editChildGrade').value);
    kid.pos = document.getElementById('editChildPos').value;
    kid.parentCar = document.getElementById('editChildParentCar').value;
    kid.motionSick = document.getElementById('editChildMotionSick').checked;

    const nextFixed = document.getElementById('editChildFixedCar').value || '';
    if (nextFixed) {
      const car = cars.find(c => c.name === nextFixed);
      const cost = seatCost({ ...kid, fixedCar: nextFixed, meetOnSite: false, active: true }) || 1;
      if (car && !canFitOnCar(car, cost, kid.id)) {
        alert(`「${car.name}」の定員を超えるため指定できません。`);
        return;
      }
      kid.fixedCar = nextFixed;
    } else {
      kid.fixedCar = '';
    }

    saveData();
    refreshLists();
  }
  closeEditModal();
}

/* 並び替えソート機能 */
function sortCarsByName() {
  cars.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  saveData();
  renderCars();
}

/** @deprecated 互換: セレクトの学年順へ */
function sortChildrenByGrade() {
  setChildSortMode('grade');
}

/** @deprecated 互換: セレクトの50音順へ */
function sortChildrenByName() {
  setChildSortMode('kana');
}

function addCar() {
  const nameInput = document.getElementById('newCarName');
  const capInput = document.getElementById('newCarCapacity');
  const name = nameInput.value.trim();
  const cap = parseInt(capInput.value) || 3;
  if (name) {
    cars.push(normalizeCar({ id: Date.now(), name: name, capacity: cap, active: true, companions: [], isEquipmentCar: false }));
    renderCars();
    saveData();
    updateStatusBar();
    nameInput.value = '';
    capInput.value = '3';
  } else {
    alert("車の名前を入力してください");
  }
}

function addChild() {
  const nameInput = document.getElementById('newChildName');
  const gradeInput = document.getElementById('newChildGrade');
  const posInput = document.getElementById('newChildPos');
  const parentSelect = document.getElementById('newChildParentCar');
  const motionInput = document.getElementById('newChildMotionSick');

  const name = nameInput.value.trim();
  const grade = parseInt(gradeInput.value) || 6;
  const pos = posInput.value;
  const parent = parentSelect.value;
  const motionSick = motionInput.checked;

  if (name) {
    children.push(normalizeChild({
      id: Date.now(),
      name: name,
      grade: grade,
      pos: pos,
      parentCar: parent,
      fixedCar: '',
      motionSick: motionSick,
      companions: [],
      active: true,
      meetOnSite: false,
      lastCar: '',
      rideHistory: {}
    }));
    saveData();
    refreshLists();
    nameInput.value = '';
    parentSelect.value = '';
    motionInput.checked = false;
  } else {
    alert("選手の名前を入力してください");
  }
}

function openRestoreModal() {
  const input = document.getElementById('restoreJson');
  if (input) input.value = '';
  const restoreModal = document.getElementById('restoreModal');
  restoreModal.classList.add('is-open');
  restoreModal.style.display = '';
}

function closeRestoreModal() {
  const restoreModal = document.getElementById('restoreModal');
  restoreModal.classList.remove('is-open');
  restoreModal.style.display = '';
}

function applyRestore() {
  const text = document.getElementById('restoreJson').value;
  if (restoreBackupData(text)) {
    closeRestoreModal();
  }
}


  const HaishaUI = {
    renderCars,
    renderChildren,
    refreshLists,
    updateStatusBar,
    openCompanionEditor: openChildCompanionEditor,
    openChildCompanionEditor,
    toggleSection,
    toggleSettingsPanel,
    applySectionOpenState,
    applySettingsPanelState,
    toggleCar,
    updateCapacity,
    toggleEquipmentCar,
    commitCarRename,
    setChildAttend,
    setChildFixedCar,
    addCompanion,
    addCompanionCustom,
    removeCompanion,
    addChildCompanion,
    addChildCompanionCustom,
    removeChildCompanion,
    addCar,
    addChild,
    deleteCar,
    deleteChild,
    openEditModal,
    closeEditModal,
    saveEditChild,
    sortCarsByName,
    sortChildrenByGrade,
    sortChildrenByName,
    setChildSortMode,
    getSortedChildrenForRender,
    get childSortMode() { return childSortMode; },
    openRestoreModal,
    closeRestoreModal,
    applyRestore,
    updateCarSelectOptions,
    get openChildCompanionEditors() { return openChildCompanionEditors; }
  };
  global.HaishaUI = HaishaUI;

  const uiCompatFns = Object.keys(HaishaUI).filter((k) => typeof HaishaUI[k] === 'function');
  uiCompatFns.forEach((name) => { global[name] = HaishaUI[name]; });
  // 明示エイリアス
  global.openCompanionEditor = openChildCompanionEditor;
  global.openChildCompanionEditors = openChildCompanionEditors;

})(typeof window !== 'undefined' ? window : globalThis);
