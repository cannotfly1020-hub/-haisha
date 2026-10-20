function updateStatusBar() {
  const activeKids = children.filter(c => c.active).length;
  const activeSeats = cars.filter(c => c.active).reduce((sum, c) => sum + (parseInt(c.capacity) || 0), 0);
  const diff = activeSeats - activeKids;

  const countKidsEl = document.getElementById('countKids');
  const countSeatsEl = document.getElementById('countSeats');
  const bar = document.getElementById('statusBar');
  const diffEl = document.getElementById('statusDiff');
  const labelEl = document.getElementById('statusDiffLabel');

  if (!countKidsEl || !countSeatsEl || !bar || !diffEl || !labelEl) return;

  countKidsEl.innerText = `${activeKids}人`;
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

function updateCarSelectOptions() {
  const addSelect = document.getElementById('newChildParentCar');
  const editSelect = document.getElementById('editChildParentCar');
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
    list.innerHTML += `
      <div class="item-row">
        <div class="item-left">
          <label>
            <input type="checkbox" data-action="toggle-child" data-id="${c.id}" ${c.active ? 'checked' : ''}>
            <span>${c.name}</span>
            <span class="badge-sub">${c.grade ? c.grade + '年' : ''}</span>
            <span class="badge-sub">${c.pos || ''}</span>
            ${c.motionSick ? `<span class="badge-motion">🤢酔い</span>` : ''}
            ${c.parentCar ? `<span class="badge">親:${c.parentCar}</span>` : ''}
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

function toggleCar(id) {
  const c = cars.find(x => x.id === id);
  if (c) c.active = !c.active;
  saveData();
  updateStatusBar();
}

function updateCapacity(id, val) {
  const c = cars.find(x => x.id === id);
  if (c) c.capacity = parseInt(val) || 0;
  saveData();
  updateStatusBar();
}

function toggleChild(id) {
  const ch = children.find(x => x.id === id);
  if (ch) ch.active = !ch.active;
  saveData();
  updateStatusBar();
}

function deleteCar(id) {
  const car = cars.find(x => x.id === id);
  if (car && confirm(`「${car.name}」を削除しますか？`)) {
    cars = cars.filter(x => x.id !== id);
    saveData();
    renderCars();
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
  updateCarSelectOptions();
  document.getElementById('editChildId').value = kid.id;
  document.getElementById('editChildName').value = kid.name;
  document.getElementById('editChildGrade').value = kid.grade || 6;
  document.getElementById('editChildPos').value = kid.pos || '未定';
  document.getElementById('editChildParentCar').value = kid.parentCar || '';
  document.getElementById('editChildMotionSick').checked = !!kid.motionSick;
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
    kid.motionSick = document.getElementById('editChildMotionSick').checked;
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

  const name = nameInput.value.trim();
  const grade = parseInt(gradeInput.value) || 6;
  const pos = posInput.value;
  const parent = parentSelect.value;
  const motionSick = motionInput.checked;

  if (name) {
    children.push({
      id: Date.now(),
      name: name,
      grade: grade,
      pos: pos,
      parentCar: parent,
      motionSick: motionSick,
      active: true,
      lastCar: '',
      rideHistory: {}
    });
    renderChildren();
    saveData();
    updateStatusBar();
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
