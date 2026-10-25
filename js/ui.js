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

function buildSeatBadgeHtml(summary) {
  if (summary.isOver) {
    return `<span class="seat-badge seat-badge-over">定員超過 ${summary.used}/${summary.capacity}</span>`;
  }
  if (summary.isFull) {
    return `<span class="seat-badge seat-badge-full">満席 ${summary.used}/${summary.capacity}</span>`;
  }
  return `<span class="seat-badge seat-badge-ok">残り${summary.remaining}席（${summary.used}/${summary.capacity}）</span>`;
}

function buildPreassignMemberChips(car) {
  const riders = getFixedRidersForCar(car.name);
  if (riders.length === 0) {
    return `<p class="preassign-empty">まだ確定メンバーはいません</p>`;
  }
  return riders.map(k => {
    const label = k.guardianRide
      ? `${k.name}（＋${guardianLabel(k)}・2席）`
      : `${k.name}（1席）`;
    return `
      <span class="preassign-chip">
        📌${label}
        <button type="button" class="preassign-remove" data-action="remove-preassign" data-id="${k.id}" title="解除">✕</button>
      </span>
    `;
  }).join('');
}

function buildPreassignOptionsHtml(car) {
  const summary = carSeatSummary(car);
  const riding = children.filter(isRiding);
  let html = `<option value="">＋ 同乗者を追加…</option>`;

  riding.forEach(k => {
    const alreadyHere = k.fixedCar === car.name;
    const elsewhere = k.fixedCar && k.fixedCar !== car.name;
    const elsewhereNote = elsewhere ? ` ※現在${k.fixedCar}` : '';

    // この車に既に「選手＋保護者」で入っている場合は選択肢から外す
    if (alreadyHere && k.guardianRide) return;

    const baseUsed = alreadyHere ? summary.used - seatCost(k) : summary.used;
    const soloOk = baseUsed + 1 <= summary.capacity;
    const pairOk = baseUsed + 2 <= summary.capacity;

    // 選手のみで既にいる場合は「＋保護者に変更」のみ
    if (alreadyHere && !k.guardianRide) {
      const pairDisabled = pairOk ? '' : 'disabled';
      const pairLabel = pairOk
        ? `${k.name}を選手＋${guardianLabel(k)}に変更（計2席）`
        : `${k.name}＋${guardianLabel(k)} ※定員不足`;
      html += `<option value="${k.id}:pair" ${pairDisabled}>${pairLabel}</option>`;
      return;
    }

    // 未配置・他車 → 選手のみ / 選手＋保護者
    const soloDisabled = soloOk ? '' : 'disabled';
    const soloLabel = soloOk
      ? `${k.name}（選手のみ・1席）${elsewhereNote}`
      : `${k.name}（選手のみ・1席）※定員不足`;
    html += `<option value="${k.id}:solo" ${soloDisabled}>${soloLabel}</option>`;

    const pairDisabled = pairOk ? '' : 'disabled';
    const pairLabel = pairOk
      ? `${k.name}＋${guardianLabel(k)}（2席）${elsewhereNote}`
      : `${k.name}＋${guardianLabel(k)}（2席）※定員不足`;
    html += `<option value="${k.id}:pair" ${pairDisabled}>${pairLabel}</option>`;
  });

  return html;
}

function renderCars() {
  const list = document.getElementById('carList');
  if (!list) return;
  list.innerHTML = '';
  cars.forEach((car) => {
    const summary = carSeatSummary(car);
    const inactiveClass = car.active ? '' : 'is-inactive';
    list.innerHTML += `
      <div class="car-card ${inactiveClass}">
        <div class="item-row car-card-header">
          <div class="item-left">
            <label>
              <input type="checkbox" data-action="toggle-car" data-id="${car.id}" ${car.active ? 'checked' : ''}>
              <span><strong>${car.name}</strong></span>
            </label>
          </div>
          <div class="item-right">
            ${buildSeatBadgeHtml(summary)}
            定員:<input type="number" class="input-cap" data-action="update-capacity" data-id="${car.id}" value="${car.capacity}" min="0">人
            <button type="button" class="btn-delete" data-action="delete-car" data-id="${car.id}">✕</button>
          </div>
        </div>
        <div class="preassign-panel">
          <div class="preassign-title">同乗者の事前割り当て（乗車確定）</div>
          <div class="preassign-members">${buildPreassignMemberChips(car)}</div>
          <select class="preassign-select" data-action="add-preassign" data-id="${car.id}" ${car.active ? '' : 'disabled'}>
            ${buildPreassignOptionsHtml(car)}
          </select>
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

function refreshLists() {
  renderCars();
  renderChildren();
  updateStatusBar();
}

function toggleCar(id) {
  const c = cars.find(x => x.id === id);
  if (c) c.active = !c.active;
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

function toggleGuardianRide(id) {
  const ch = children.find(x => x.id === id);
  if (!ch || !isRiding(ch)) return;

  const next = !ch.guardianRide;
  if (next && ch.fixedCar) {
    const car = cars.find(c => c.name === ch.fixedCar);
    if (car) {
      const usedWithout = fixedSeatsUsed(car.name) - seatCost(ch);
      if (usedWithout + 2 > (parseInt(car.capacity) || 0)) {
        alert(`「${car.name}」の定員を超えるため、同乗保護者を追加できません。`);
        return;
      }
    }
  }

  ch.guardianRide = next;
  saveData();
  refreshLists();
}

function setChildFixedCar(id, carName) {
  const ch = children.find(x => x.id === id);
  if (!ch) return;

  if (carName) {
    const car = cars.find(c => c.name === carName);
    if (car) {
      const cost = seatCost(ch) || 1;
      const used = getFixedRidersForCar(carName)
        .filter(k => k.id !== ch.id)
        .reduce((sum, k) => sum + seatCost(k), 0);
      if (used + cost > (parseInt(car.capacity) || 0)) {
        alert(`「${car.name}」の定員を超えるため指定できません。\n同乗保護者を外すか、別の車を選んでください。`);
        renderChildren();
        return;
      }
    }
  }

  ch.fixedCar = carName || '';
  saveData();
  refreshLists();
}

function addPreassign(carId, value) {
  if (!value) return;
  const car = cars.find(x => x.id === carId);
  if (!car || !car.active) return;

  const [idStr, mode] = value.split(':');
  const kid = children.find(x => x.id === parseInt(idStr, 10));
  if (!kid || !isRiding(kid)) return;

  const withGuardian = mode === 'pair';
  const cost = seatCostForChoice(withGuardian);
  const usedBase = getFixedRidersForCar(car.name)
    .filter(k => k.id !== kid.id)
    .reduce((sum, k) => sum + seatCost(k), 0);

  if (usedBase + cost > (parseInt(car.capacity) || 0)) {
    alert(`「${car.name}」の定員（${car.capacity}席）を超えるため追加できません。`);
    renderCars();
    return;
  }

  if (kid.fixedCar && kid.fixedCar !== car.name) {
    // 他車からの移動は確認なしで上書き（UI上に※現在XXと出している）
  }

  kid.fixedCar = car.name;
  kid.guardianRide = withGuardian;
  saveData();
  refreshLists();
}

function removePreassign(childId) {
  const kid = children.find(x => x.id === childId);
  if (!kid) return;
  kid.fixedCar = '';
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
    const nextFixed = document.getElementById('editChildFixedCar').value || '';
    if (nextFixed) {
      const car = cars.find(c => c.name === nextFixed);
      if (car) {
        const cost = 1 + (kid.guardianRide ? 1 : 0);
        const used = getFixedRidersForCar(nextFixed)
          .filter(k => k.id !== kid.id)
          .reduce((sum, k) => sum + seatCost(k), 0);
        if (used + cost > (parseInt(car.capacity) || 0)) {
          alert(`「${car.name}」の定員を超えるため指定できません。`);
          return;
        }
      }
    }
    kid.fixedCar = nextFixed;
    kid.motionSick = document.getElementById('editChildMotionSick').checked;
    kid.guardianName = document.getElementById('editChildGuardianName').value.trim();
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
    saveData();
    refreshLists();
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
