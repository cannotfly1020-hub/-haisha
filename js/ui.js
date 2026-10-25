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
  if (list.length === 0) {
    return `<span class="companion-empty">同乗なし</span>`;
  }
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

    list.innerHTML += `
      <div class="car-card ${inactiveClass}">
        <div class="car-card-header">
          <label class="car-name-label">
            <input type="checkbox" data-action="toggle-car" data-id="${car.id}" ${car.active ? 'checked' : ''}>
            <span class="car-name">${car.name}</span>
          </label>
          ${buildCapacityBadgeHtml(summary)}
          <div class="car-card-tools">
            <label class="cap-edit">定員<input type="number" class="input-cap" data-action="update-capacity" data-id="${car.id}" value="${car.capacity}" min="0"></label>
            <button type="button" class="btn-delete" data-action="delete-car" data-id="${car.id}">✕</button>
          </div>
        </div>

        <div class="companion-bar">
          <div class="companion-chips">${buildCompanionChipsHtml(car)}</div>
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

function renderChildren() {
  const list = document.getElementById('childList');
  if (!list) return;
  list.innerHTML = '';
  children.forEach((c) => {
    const mode = getAttendMode(c);
    const fixedDisabled = mode !== 'ride' ? 'disabled' : '';
    const guardianDisabled = mode !== 'ride' ? 'disabled' : '';
    const showGuardianInput = mode === 'ride' && c.guardianRide;
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
            <label class="guardian-inline ${mode !== 'ride' ? 'is-disabled' : ''}">
              <input type="checkbox" data-action="toggle-guardian" data-id="${c.id}" ${c.guardianRide ? 'checked' : ''} ${guardianDisabled}>
              同乗
            </label>
            ${showGuardianInput ? `
              <input type="text" class="guardian-name-input" data-action="set-guardian-name" data-id="${c.id}"
                value="${(c.guardianName || '').replace(/"/g, '&quot;')}"
                placeholder="同乗者名（例: 母）" maxlength="20">
            ` : ''}
            <span class="badge-sub">${c.grade ? c.grade + '年' : ''}</span>
            ${c.motionSick ? `<span class="badge-motion">🤢酔い</span>` : ''}
            ${c.parentCar ? `<span class="badge">親:${c.parentCar}</span>` : ''}
            ${mode === 'site' ? `<span class="badge-site">現地集合</span>` : ''}
            ${c.fixedCar && mode === 'ride' ? `<span class="badge-fixed">📌${c.fixedCar}</span>` : ''}
          </div>
          <label class="fixed-car-label ${mode !== 'ride' ? 'is-disabled' : ''}">
            <span>指定車両</span>
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

function toggleGuardianRide(id) {
  const ch = children.find(x => x.id === id);
  if (!ch || !isRiding(ch)) return;

  if (ch.guardianRide) {
    ch.guardianRide = false;
    ch.guardianName = '';
    saveData();
    refreshLists();
    return;
  }

  if (ch.fixedCar) {
    const car = cars.find(c => c.name === ch.fixedCar);
    if (car && !canFitOnCar(car, 2, ch.id)) {
      alert(`「${car.name}」の定員を超えるため、同乗者を追加できません。`);
      return;
    }
  }

  ch.guardianRide = true;
  saveData();
  refreshLists();
}

function setGuardianName(id, value) {
  const ch = children.find(x => x.id === id);
  if (!ch || !ch.guardianRide) return;
  ch.guardianName = typeof value === 'string' ? value : '';
  // 入力中のフォーカスを保つため再描画しない
  saveData();
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
      const cost = 1 + (kid.guardianRide ? 1 : 0);
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

function sortChildrenByGrade() {
  // 学年順（6年→1年）、同級生内は五十音順
  children.sort((a, b) => {
    if (b.grade !== a.grade) return b.grade - a.grade;
    return a.name.localeCompare(b.name, 'ja');
  });
  saveData();
  renderChildren();
}

function sortChildrenByName() {
  // 純粋な名前順（五十音順）
  children.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  saveData();
  renderChildren();
}

function addCar() {
  const nameInput = document.getElementById('newCarName');
  const capInput = document.getElementById('newCarCapacity');
  const name = nameInput.value.trim();
  const cap = parseInt(capInput.value) || 3;
  if (name) {
    cars.push(normalizeCar({ id: Date.now(), name: name, capacity: cap, active: true, companions: [] }));
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
      guardianName: '',
      active: true,
      meetOnSite: false,
      guardianRide: false,
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
