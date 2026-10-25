function updateStatusBar() {
  const activeKids = children.filter(isParticipating).length;
  const onSiteKids = children.filter(isOnSite).length;
  const seatDemand = children.reduce((sum, c) => sum + seatCost(c), 0);
  const activeSeats = cars.filter(c => c.active).reduce((sum, c) => sum + (parseInt(c.capacity) || 0), 0);
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
    const id = parseInt(document.getElementById('editChildId').value);
    const kid = children.find(x => x.id === id);
    const selected = editFixedSelect.value || (kid ? kid.fixedCar : '') || '';
    editFixedSelect.innerHTML = buildFixedCarOptionsHtml(selected, kid);
  }
}

function renderCars() {
  const list = document.getElementById('carList');
  if (!list) return;
  list.innerHTML = '';
  cars.forEach((car) => {
    list.innerHTML += `
      <div class="item-row">
        <div class="item-left">
          <label>
            <input type="checkbox" data-action="toggle-car" data-id="${car.id}" ${car.active ? 'checked' : ''}>
            <span><strong>${car.name}</strong></span>
          </label>
        </div>
        <div class="item-right">
          定員:<input type="number" class="input-cap" data-action="update-capacity" data-id="${car.id}" value="${car.capacity}">人
          <button type="button" class="btn-delete" data-action="delete-car" data-id="${car.id}">✕</button>
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
    const guardianDisabled = mode !== 'ride' ? 'disabled' : '';
    const fixedDisabled = mode !== 'ride' ? 'disabled' : '';
    list.innerHTML += `
      <div class="item-row item-row-child">
        <div class="item-main">
          <select class="attend-select" data-action="set-attend" data-id="${c.id}">
            <option value="off" ${mode === 'off' ? 'selected' : ''}>欠席</option>
            <option value="ride" ${mode === 'ride' ? 'selected' : ''}>乗車</option>
            <option value="site" ${mode === 'site' ? 'selected' : ''}>現地</option>
          </select>
          <div class="item-info">
            <span class="child-name">${c.name}</span>
            <span class="badge-sub">${c.grade ? c.grade + '年' : ''}</span>
            <span class="badge-sub">${c.pos || ''}</span>
            ${c.motionSick ? `<span class="badge-motion">🤢酔い</span>` : ''}
            ${c.parentCar ? `<span class="badge">親:${c.parentCar}</span>` : ''}
            ${mode === 'site' ? `<span class="badge-site">現地集合</span>` : ''}
            ${c.guardianRide && mode === 'ride' ? `<span class="badge-guardian">＋${guardianLabel(c)}</span>` : ''}
            ${c.fixedCar && mode === 'ride' ? `<span class="badge-fixed">📌${c.fixedCar}</span>` : ''}
            <label class="fixed-car-label ${mode !== 'ride' ? 'is-disabled' : ''}">
              <span>指定車両</span>
              <select class="fixed-car-select" data-action="set-fixed-car" data-id="${c.id}" ${fixedDisabled}>
                ${buildFixedCarOptionsHtml(c.fixedCar || '', c)}
              </select>
            </label>
          </div>
        </div>
        <div class="item-right">
          <label class="guardian-check ${mode !== 'ride' ? 'is-disabled' : ''}">
            <input type="checkbox" data-action="toggle-guardian" data-id="${c.id}" ${c.guardianRide ? 'checked' : ''} ${guardianDisabled}>
            同乗
          </label>
          <button type="button" class="btn-edit" data-action="edit-child" data-id="${c.id}">✏️</button>
          <button type="button" class="btn-delete" data-action="delete-child" data-id="${c.id}">✕</button>
        </div>
      </div>
    `;
  });
}

function toggleCar(id) {
  const c = cars.find(x => x.id === id);
  if (c) c.active = !c.active;
  saveData();
  updateCarSelectOptions();
  renderChildren();
  updateStatusBar();
}

function updateCapacity(id, val) {
  const c = cars.find(x => x.id === id);
  if (c) c.capacity = parseInt(val) || 0;
  saveData();
  updateStatusBar();
}

function setChildAttend(id, mode) {
  const ch = children.find(x => x.id === id);
  if (!ch) return;
  setAttendMode(ch, mode);
  saveData();
  renderChildren();
  updateStatusBar();
}

function toggleGuardianRide(id) {
  const ch = children.find(x => x.id === id);
  if (!ch || !isRiding(ch)) return;
  ch.guardianRide = !ch.guardianRide;
  saveData();
  renderChildren();
  updateStatusBar();
}

function setChildFixedCar(id, carName) {
  const ch = children.find(x => x.id === id);
  if (!ch) return;
  ch.fixedCar = carName || '';
  saveData();
  renderChildren();
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
    renderChildren();
    updateStatusBar();
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
  document.getElementById('editChildGuardianName').value = kid.guardianName || '';
  document.getElementById('editChildMotionSick').checked = !!kid.motionSick;
  updateCarSelectOptions();
  document.getElementById('editChildParentCar').value = kid.parentCar || '';
  const fixedSelect = document.getElementById('editChildFixedCar');
  if (fixedSelect) {
    fixedSelect.innerHTML = buildFixedCarOptionsHtml(kid.fixedCar || '', kid);
  }
  document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
}

function saveEditChild() {
  const id = parseInt(document.getElementById('editChildId').value);
  const kid = children.find(x => x.id === id);
  if (kid) {
    kid.name = document.getElementById('editChildName').value.trim() || kid.name;
    kid.grade = parseInt(document.getElementById('editChildGrade').value);
    kid.pos = document.getElementById('editChildPos').value;
    kid.parentCar = document.getElementById('editChildParentCar').value;
    kid.fixedCar = document.getElementById('editChildFixedCar').value || '';
    kid.motionSick = document.getElementById('editChildMotionSick').checked;
    kid.guardianName = document.getElementById('editChildGuardianName').value.trim();
    saveData();
    renderChildren();
    updateStatusBar();
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
    cars.push({ id: Date.now(), name: name, capacity: cap, active: true });
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
  const guardianNameInput = document.getElementById('newChildGuardianName');

  const name = nameInput.value.trim();
  const grade = parseInt(gradeInput.value) || 6;
  const pos = posInput.value;
  const parent = parentSelect.value;
  const motionSick = motionInput.checked;
  const guardianName = guardianNameInput ? guardianNameInput.value.trim() : '';

  if (name) {
    children.push(normalizeChild({
      id: Date.now(),
      name: name,
      grade: grade,
      pos: pos,
      parentCar: parent,
      fixedCar: '',
      motionSick: motionSick,
      guardianName: guardianName,
      active: true,
      meetOnSite: false,
      guardianRide: false,
      lastCar: '',
      rideHistory: {}
    }));
    renderChildren();
    saveData();
    updateStatusBar();
    nameInput.value = '';
    parentSelect.value = '';
    motionInput.checked = false;
    if (guardianNameInput) guardianNameInput.value = '';
  } else {
    alert("選手の名前を入力してください");
  }
}

function openRestoreModal() {
  const input = document.getElementById('restoreJson');
  if (input) input.value = '';
  document.getElementById('restoreModal').style.display = 'flex';
}

function closeRestoreModal() {
  document.getElementById('restoreModal').style.display = 'none';
}

function applyRestore() {
  const text = document.getElementById('restoreJson').value;
  if (restoreBackupData(text)) {
    closeRestoreModal();
  }
}
