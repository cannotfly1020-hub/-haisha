(function (global) {
let lastGeneratedPlan = "";
let currentAssignments = null;

/** 同セッション内の直前 LINE 確定分 { [childId]: carName }（二重加算防止用） */
const LAST_SESSION_COMMIT_KEY = 'cp_lastSessionCommit';
let lastSessionCommit = null;

function readLastSessionCommit() {
  if (lastSessionCommit && typeof lastSessionCommit === 'object') return lastSessionCommit;
  try {
    const raw = sessionStorage.getItem(LAST_SESSION_COMMIT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    lastSessionCommit = parsed;
    return lastSessionCommit;
  } catch (e) {
    return null;
  }
}

function writeLastSessionCommit(map) {
  lastSessionCommit = map && typeof map === 'object' ? map : null;
  try {
    if (lastSessionCommit) {
      sessionStorage.setItem(LAST_SESSION_COMMIT_KEY, JSON.stringify(lastSessionCommit));
    } else {
      sessionStorage.removeItem(LAST_SESSION_COMMIT_KEY);
    }
  } catch (e) { /* ignore */ }
}

function clearLastSessionCommit() {
  writeLastSessionCommit(null);
}

/** 直前セッション確定分の rideHistory を -1（0以下のキーは削除） */
function rollbackLastSessionCommit() {
  const prev = readLastSessionCommit();
  if (!prev) return;

  Object.keys(prev).forEach((childId) => {
    const carName = prev[childId];
    if (!carName) return;
    const child = children.find((c) => String(c.id) === String(childId));
    if (!child) return;
    if (!child.rideHistory || typeof child.rideHistory !== 'object') {
      child.rideHistory = {};
      return;
    }
    const next = (parseInt(child.rideHistory[carName], 10) || 0) - 1;
    if (next <= 0) {
      delete child.rideHistory[carName];
    } else {
      child.rideHistory[carName] = next;
    }
  });
}

function applyAssignmentHistoryCommit(assignments) {
  const commitMap = {};
  if (!assignments) return commitMap;

  Object.keys(assignments).forEach((carName) => {
    (assignments[carName] || []).forEach((k) => {
      const orig = children.find((x) => x.id === k.id);
      if (!orig) return;
      if (!orig.rideHistory || typeof orig.rideHistory !== 'object') orig.rideHistory = {};
      orig.rideHistory[carName] = (parseInt(orig.rideHistory[carName], 10) || 0) + 1;
      orig.lastCar = carName;
      commitMap[String(orig.id)] = carName;
    });
  });
  return commitMap;
}

function occupiedSeats(list) {
  return (list || []).reduce((sum, k) => sum + seatCost(k), 0);
}

function carPeopleCount(car, riders) {
  return occupiedSeats(riders) + familySeatsOf(car);
}

function remainingSeats(car, assignments) {
  const cap = parseInt(car.capacity, 10) || 0;
  return cap - familySeatsOf(car) - occupiedSeats(assignments[car.name] || []);
}

function placeKid(kid, carName, assignments, currentCaps) {
  assignments[carName].push(kid);
  const cost = seatCost(kid);
  if (currentCaps[carName] > 0) {
    currentCaps[carName] = Math.max(0, currentCaps[carName] - cost);
  }
}

function clearCarpoolDiagnosis() {
  const el = document.getElementById('carpoolDiagnosis');
  if (!el) return;
  el.hidden = true;
  el.classList.remove('is-visible', 'is-warning');
  el.innerHTML = '';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 配車失敗時の診断: 過不足・固定同乗・1席余り・車酔いなどを分析し
 * 優先度付きの解決サジェストを返す。
 */
function diagnoseCarpoolFailure(options) {
  const ridingKids = children.filter(isRiding);
  const activeCars = cars.filter(c => c.active);
  const inactiveCars = cars.filter(c => !c.active);
  const leftoverKids = options && Array.isArray(options.leftoverKids) ? options.leftoverKids : [];

  const kidSeatDemand = ridingKids.reduce((sum, c) => sum + seatCost(c), 0);
  const carCompanionSeats = activeCars.reduce((sum, c) => sum + companionSeatsOf(c), 0);
  const totalCap = activeCars.reduce((sum, c) => sum + (parseInt(c.capacity, 10) || 0), 0);
  const openSeats = Math.max(0, totalCap - carCompanionSeats);
  const shortage = Math.max(0, kidSeatDemand - openSeats);
  const totalNeed = kidSeatDemand + carCompanionSeats;

  const suggestions = [];
  const notes = [];

  if (leftoverKids.length > 0) {
    notes.push(`未割り当て: ${leftoverKids.map(k => k.name).join('、')}`);
  }

  if (carCompanionSeats > 0) {
    notes.push(`車両側の事前同乗で ${carCompanionSeats}席 が確保済み`);
  }

  // A. 同乗枠の解放（車両側）
  activeCars.forEach(car => {
    companionsOf(car).forEach(cmp => {
      suggestions.push({
        priority: 10,
        tag: 'A',
        text: `「${car.name}」の同乗者『${cmp.label}』を解除すると 1席 空きます`
      });
    });
  });

  // A'. 選手側の同乗が多い場合も提案（不足時）
  if (shortage > 0) {
    ridingKids
      .filter(k => childCompanionSeatsOf(k) > 0)
      .sort((a, b) => childCompanionSeatsOf(b) - childCompanionSeatsOf(a))
      .slice(0, 4)
      .forEach(k => {
        const n = childCompanionSeatsOf(k);
        const labels = childCompanionsOf(k).map(c => c.label).join('、');
        suggestions.push({
          priority: 15,
          tag: 'A',
          text: `選手「${k.name}」の同乗者（${labels}）を減らすと最大 ${n}席 空きます`
        });
      });
  }

  // B. 休止車両の活用
  inactiveCars
    .slice()
    .sort((a, b) => (parseInt(b.capacity, 10) || 0) - (parseInt(a.capacity, 10) || 0))
    .forEach(car => {
      const seats = parseInt(car.capacity, 10) || 0;
      if (seats <= 0) return;
      suggestions.push({
        priority: 20,
        tag: 'B',
        text: `現在休止中の『${car.name}』を出勤にすると ${seats}席 確保できます`
      });
    });

  // C. 現地集合の提案
  if (shortage > 0 && ridingKids.length > 0) {
    let need = shortage;
    let count = 0;
    const sorted = [...ridingKids].sort((a, b) => seatCost(b) - seatCost(a));
    for (let i = 0; i < sorted.length && need > 0; i++) {
      need -= seatCost(sorted[i]);
      count += 1;
    }
    suggestions.push({
      priority: 30,
      tag: 'C',
      text: `あと ${count}名を『現地集合』に変更すると成立します`
    });
  }

  // D. 最低2人ルール / 1席のみ余り
  activeCars.forEach(car => {
    const cap = parseInt(car.capacity, 10) || 0;
    const rem = cap - companionSeatsOf(car);
    if (rem === 1) {
      suggestions.push({
        priority: 25,
        tag: 'D',
        text: `「${car.name}」が1席のみ余っているため、同乗者を調整して2席以上の空きを作ってください`
      });
    }
  });

  // 車酔い配慮
  const sickKids = ridingKids.filter(k => k.motionSick);
  if (sickKids.length > 0) {
    const carsWithRoom = activeCars.filter(c => {
      const rem = (parseInt(c.capacity, 10) || 0) - companionSeatsOf(c);
      return rem >= 1;
    });
    if (carsWithRoom.length === 0) {
      suggestions.push({
        priority: 22,
        tag: 'E',
        text: `🤢酔いの選手（${sickKids.map(k => k.name).join('、')}）を乗せる空き車両がありません。出勤を増やすか同乗を減らしてください`
      });
    } else if (sickKids.length > carsWithRoom.length * 2) {
      notes.push(`🤢酔い配慮: ${sickKids.map(k => k.name).join('、')}（空き車が少ない可能性）`);
    }
  }

  if (activeCars.length === 0) {
    suggestions.unshift({
      priority: 5,
      tag: 'B',
      text: '出勤中の車がありません。車両の出勤チェックを入れてください'
    });
  }

  suggestions.sort((a, b) => a.priority - b.priority || a.tag.localeCompare(b.tag));

  // 重複テキスト除去
  const seen = new Set();
  const unique = [];
  suggestions.forEach(s => {
    if (seen.has(s.text)) return;
    seen.add(s.text);
    unique.push(s);
  });

  return {
    kidSeatDemand,
    carCompanionSeats,
    totalCap,
    openSeats,
    totalNeed,
    shortage,
    notes,
    suggestions: unique.slice(0, 10),
    severity: shortage > 0 || leftoverKids.length > 0 || activeCars.length === 0 ? 'error' : 'warning'
  };
}

function showCarpoolDiagnosis(diagnosis) {
  const el = document.getElementById('carpoolDiagnosis');
  if (!el || !diagnosis) return;

  const shortageLine = diagnosis.shortage > 0
    ? `必要座席数: ${diagnosis.totalNeed}席（選手・同乗 ${diagnosis.kidSeatDemand} ＋ 車両同乗 ${diagnosis.carCompanionSeats}）に対し、空き枠が ${diagnosis.shortage}席 不足しています（定員合計 ${diagnosis.totalCap}席）`
    : diagnosis.leftoverKids && diagnosis.leftoverKids.length
      ? `全体の席数は足りていますが、固定枠や1席余りの制約で一部の選手を割り当てられませんでした`
      : `配車条件が競合しています。下記の調整をお試しください`;

  const notesHtml = (diagnosis.notes || []).length
    ? `<ul class="diagnosis-list">${diagnosis.notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
    : '';

  const actionsHtml = (diagnosis.suggestions || []).length
    ? `<ul class="diagnosis-list">${diagnosis.suggestions.map(s =>
        `<li><span class="tag">${escapeHtml(s.tag)}</span>${escapeHtml(s.text)}</li>`
      ).join('')}</ul>`
    : `<p class="diagnosis-section-label">具体的な解放候補が見つかりませんでした。定員の追加や現地集合への変更をご検討ください。</p>`;

  el.classList.toggle('is-warning', diagnosis.severity === 'warning');
  el.innerHTML = `
    <h3 class="diagnosis-title">⚠️ 配車が成立しませんでした</h3>
    <div class="diagnosis-shortage"><strong>【不足状況】</strong><br>${escapeHtml(shortageLine)}</div>
    ${notesHtml ? `<p class="diagnosis-section-label">【診断メモ】</p>${notesHtml}` : ''}
    <p class="diagnosis-section-label">【解決アクションのサジェスト】（優先度順）</p>
    ${actionsHtml}
  `;
  el.hidden = false;
  el.classList.add('is-visible');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function presentCarpoolFailure(extra) {
  currentAssignments = null;
  lastGeneratedPlan = '';
  const resultCard = document.getElementById('resultCard');
  if (resultCard) resultCard.style.display = 'none';
  const resultText = document.getElementById('resultText');
  if (resultText) resultText.textContent = '';

  const diagnosis = diagnoseCarpoolFailure(extra || {});
  if (extra && extra.leftoverKids) diagnosis.leftoverKids = extra.leftoverKids;
  showCarpoolDiagnosis(diagnosis);
}

// 親の車優先 ＆ 均等配車ロジック
function generateCarpool() {
  clearCarpoolDiagnosis();

  const activeCars = cars.filter(c => c.active);
  const ridingKids = children.filter(isRiding);
  const onSiteKids = children.filter(isOnSite);
  const mode = document.getElementById('carpoolMode').value;

  if (ridingKids.length === 0 && onSiteKids.length === 0) {
    alert("参加する子供（乗車または現地集合）を選んでください。");
    return;
  }

  let assignments = {};
  let currentCaps = {};

  if (ridingKids.length > 0) {
    if (activeCars.length === 0) {
      presentCarpoolFailure();
      return;
    }

    const totalCap = activeCars.reduce((sum, c) => sum + (parseInt(c.capacity, 10) || 0), 0);
    const familyDemand = activeCars.reduce((sum, c) => sum + familySeatsOf(c), 0);
    const seatDemand = ridingKids.reduce((sum, c) => sum + seatCost(c), 0) + familyDemand;
    if (totalCap < seatDemand) {
      presentCarpoolFailure();
      return;
    }

    // 1. 身内枠を除いた有効定員に対し、選手の目標座席数を均等計算
    const kidDemand = ridingKids.reduce((sum, c) => sum + seatCost(c), 0);
    let targetCounts = {};
    let baseCount = Math.floor(kidDemand / activeCars.length);
    let remainder = kidDemand % activeCars.length;

    let sortedCars = [...activeCars].sort((a, b) => {
      const availA = Math.max(0, (parseInt(a.capacity, 10) || 0) - familySeatsOf(a));
      const availB = Math.max(0, (parseInt(b.capacity, 10) || 0) - familySeatsOf(b));
      return availB - availA;
    });
    sortedCars.forEach((c, idx) => {
      const avail = Math.max(0, (parseInt(c.capacity, 10) || 0) - familySeatsOf(c));
      let ideal = baseCount + (idx < remainder ? 1 : 0);
      targetCounts[c.name] = Math.min(ideal, avail);
    });

    activeCars.forEach(c => {
      assignments[c.name] = [];
      currentCaps[c.name] = targetCounts[c.name];
    });

    let unassigned = [...ridingKids];
    const overflowedCars = [];

    // 2. 手動指定車両を最優先で固定（同乗保護者分の座席も消費／身内枠は既に確保済み）
    for (let i = unassigned.length - 1; i >= 0; i--) {
      let kid = unassigned[i];
      if (!kid.fixedCar) continue;
      let fixedCarObj = activeCars.find(c => c.name === kid.fixedCar);
      if (!fixedCarObj) continue;
      let cost = seatCost(kid);
      if (remainingSeats(fixedCarObj, assignments) >= cost) {
        placeKid(kid, fixedCarObj.name, assignments, currentCaps);
        unassigned.splice(i, 1);
      } else {
        if (!overflowedCars.includes(fixedCarObj.name)) {
          overflowedCars.push(fixedCarObj.name);
        }
      }
    }

    if (overflowedCars.length > 0) {
      alert(`${overflowedCars.map(n => `「${n}」`).join('、')}の定員を超えて指定されています。\nあふれた分は自動配車に回します。`);
    }

    // 3. 手動指定（本日稼働中の車）がなく、親の車が出ている子供を固定
    for (let i = unassigned.length - 1; i >= 0; i--) {
      let kid = unassigned[i];
      if (kid.fixedCar && activeCars.some(c => c.name === kid.fixedCar)) continue;
      let parentCarObj = activeCars.find(c => c.name === kid.parentCar);
      if (parentCarObj) {
        let cost = seatCost(kid);
        if (remainingSeats(parentCarObj, assignments) >= cost) {
          placeKid(kid, parentCarObj.name, assignments, currentCaps);
          unassigned.splice(i, 1);
        }
      }
    }

    // 4. 親の車がない「車酔いの子」を優先配備
    for (let i = unassigned.length - 1; i >= 0; i--) {
      let kid = unassigned[i];
      if (kid.motionSick) {
        let cost = seatCost(kid);
        let availableCars = activeCars.filter(c => currentCaps[c.name] >= cost);
        if (availableCars.length === 0) {
          availableCars = activeCars.filter(c => remainingSeats(c, assignments) >= cost);
        }
        if (availableCars.length === 0) continue;
        availableCars.sort((a, b) => {
          let diffA = (kid.lastCar === a.name) ? 99 : 0;
          let diffB = (kid.lastCar === b.name) ? 99 : 0;
          if (diffA !== diffB) return diffA - diffB;
          return currentCaps[b.name] - currentCaps[a.name];
        });
        placeKid(kid, availableCars[0].name, assignments, currentCaps);
        unassigned.splice(i, 1);
      }
    }

    // 5. モード別ソート
    if (mode === 'grade_same') {
      unassigned.sort((a, b) => (b.grade || 0) - (a.grade || 0));
    } else if (mode === 'grade_diff') {
      unassigned.sort((a, b) => (b.grade || 0) - (a.grade || 0));
      let interleaved = [];
      let left = 0, right = unassigned.length - 1;
      while (left <= right) {
        if (left === right) { interleaved.push(unassigned[left]); break; }
        interleaved.push(unassigned[left++]);
        interleaved.push(unassigned[right--]);
      }
      unassigned = interleaved;
    } else if (mode === 'position') {
      unassigned.sort((a, b) => (a.pos || '').localeCompare(b.pos || ''));
    } else {
      unassigned.sort(() => Math.random() - 0.5);
    }

    // 6. 残りの選手を割り当て（最低2人優先・過去履歴の公平化・モード別スコア）
    const stillUnassigned = [];
    unassigned.forEach(kid => {
      if (!kid.rideHistory) kid.rideHistory = {};
      const cost = seatCost(kid);

      let availableCars = activeCars.filter(c => currentCaps[c.name] >= cost);
      if (availableCars.length === 0) {
        availableCars = activeCars.filter(c => remainingSeats(c, assignments) >= cost);
      }
      if (availableCars.length === 0) {
        stillUnassigned.push(kid);
        return;
      }

      availableCars.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;

        if (carPeopleCount(a, assignments[a.name]) < 2) scoreA -= 2000;
        if (carPeopleCount(b, assignments[b.name]) < 2) scoreB -= 2000;

        if (kid.lastCar === a.name) scoreA += 500;
        if (kid.lastCar === b.name) scoreB += 500;

        scoreA += (kid.rideHistory[a.name] || 0) * 15;
        scoreB += (kid.rideHistory[b.name] || 0) * 15;

        if (mode === 'grade_same') {
          let countSameGradeA = assignments[a.name].filter(k => k.grade === kid.grade).length;
          let countSameGradeB = assignments[b.name].filter(k => k.grade === kid.grade).length;
          scoreA -= countSameGradeA * 50;
          scoreB -= countSameGradeB * 50;
        } else if (mode === 'grade_diff') {
          let countSameGradeA = assignments[a.name].filter(k => k.grade === kid.grade).length;
          let countSameGradeB = assignments[b.name].filter(k => k.grade === kid.grade).length;
          scoreA += countSameGradeA * 40;
          scoreB += countSameGradeB * 40;
        } else if (mode === 'position') {
          let countSamePosA = assignments[a.name].filter(k => k.pos === kid.pos && k.pos !== '未定').length;
          let countSamePosB = assignments[b.name].filter(k => k.pos === kid.pos && k.pos !== '未定').length;
          scoreA += countSamePosA * 40;
          scoreB += countSamePosB * 40;
        }

        if (scoreA !== scoreB) return scoreA - scoreB;
        return carPeopleCount(a, assignments[a.name]) - carPeopleCount(b, assignments[b.name]);
      });

      placeKid(kid, availableCars[0].name, assignments, currentCaps);
    });

    // 乗せるつもりだった選手が残っている場合は失敗として診断
    if (stillUnassigned.length > 0) {
      presentCarpoolFailure({ leftoverKids: stillUnassigned });
      return;
    }
  }

  clearCarpoolDiagnosis();
  currentAssignments = assignments;

  function carHasAnyone(car, riders) {
    return (riders && riders.length > 0) || companionSeatsOf(car) > 0;
  }

  function buildNameBullets(car, riders) {
    const lines = [];
    (riders || []).forEach(k => {
      lines.push(`・${k.name}`);
      childCompanionsOf(k).forEach(c => {
        lines.push(`・${c.label}`);
      });
    });
    companionsOf(car).forEach(c => {
      lines.push(`・${c.label}`);
    });
    return lines;
  }

  // 画面用テキスト（📌あり／同乗は名前列挙）
  function buildScreenPlanText() {
    let hasMotionSick = ridingKids.some(k => k.motionSick);
    let hasPinned = ridingKids.some(k => k.fixedCar && activeCars.some(c => c.name === k.fixedCar));
    let text = `【連絡】本日の配車です🚗\n---------------------\n`;

    if (ridingKids.length > 0 || activeCars.some(c => companionSeatsOf(c) > 0)) {
      activeCars.forEach(c => {
        const riders = assignments[c.name] || [];
        const riderNames = riders.map(k => formatRiderLabel(k, c.name, { showPin: true }));
        const companionNames = companionsOf(c).map(x => x.label);
        const names = [...riderNames, ...companionNames].join('、');
        const people = carPeopleCount(c, riders);
        const equipTag = c.isEquipmentCar ? ' 【道具車📦】' : '';
        text += `■ ${c.name} (${people}名)${equipTag}\n  乗車: ${names || 'なし'}\n\n`;
      });
    } else {
      text += "本日の乗車配車はありません。\n\n";
    }

    if (onSiteKids.length > 0) {
      text += `【現地集合】${onSiteKids.map(k => k.name).join('、')}\n\n`;
    }

    if (hasPinned) {
      text += "※「📌」は事前指定で固定した乗車です。\n";
    }
    if (hasMotionSick) {
      text += "※「🤢」マークの選手は助手席または前寄りの座席をお願いします。\n";
    }
    text += "---------------------\nよろしくお願いいたします！";
    return text;
  }

  // LINE用テキスト（名前のみ・箇条書き／注記なし。車両見出しのみ【道具車】可）
  function buildLinePlanText() {
    let text = `【連絡】本日の配車です🚗\n---------------------\n`;

    if (ridingKids.length > 0 || activeCars.some(c => companionSeatsOf(c) > 0)) {
      activeCars.forEach(c => {
        const riders = assignments[c.name] || [];
        const bullets = buildNameBullets(c, riders);
        const people = carPeopleCount(c, riders);
        const equipTag = c.isEquipmentCar ? ' 【道具車】' : '';
        text += `■ ${c.name} (${people}名)${equipTag}\n`;
        if (!carHasAnyone(c, riders)) {
          text += `・なし\n\n`;
        } else {
          text += `${bullets.join('\n')}\n\n`;
        }
      });
    } else {
      text += "本日の乗車配車はありません。\n\n";
    }

    if (onSiteKids.length > 0) {
      text += `【現地集合】\n${onSiteKids.map(k => `・${k.name}`).join('\n')}\n\n`;
    }

    text += "---------------------\nよろしくお願いいたします！";
    return text;
  }

  const screenText = buildScreenPlanText();
  lastGeneratedPlan = buildLinePlanText();
  document.getElementById('resultText').innerText = screenText;
  document.getElementById('resultCard').style.display = 'block';
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function copyResult() {
  if (!currentAssignments && !lastGeneratedPlan) return;

  if (currentAssignments) {
    // 同セッション内の再コピー: 直前確定分を差し戻してから今回分を加算
    rollbackLastSessionCommit();
    const commitMap = applyAssignmentHistoryCommit(currentAssignments);
    writeLastSessionCommit(commitMap);
    saveData();
    renderChildren();
    updateStatusBar();
  }

  copyTextToClipboard(lastGeneratedPlan).then(() => {
    alert("📋 LINE用テキストをコピーしました！\n今回の乗車履歴も正常に確定保存されました。");
  }).catch(() => {
    alert("コピーに失敗しました。ブラウザの権限を確認してもう一度お試しください。");
  });
}


  const HaishaCarpool = {
    generate: generateCarpool,
    diagnose: diagnoseCarpoolFailure,
    copyResult,
    clearDiagnosis: clearCarpoolDiagnosis,
    clearLastSessionCommit,
    clearCarpoolDiagnosis,
    diagnoseCarpoolFailure,
    generateCarpool,
    presentCarpoolFailure,
    showCarpoolDiagnosis,
    buildLinePlanText: function buildLinePlanText() { return lastGeneratedPlan || ''; },
    get lastGeneratedPlan() { return lastGeneratedPlan; },
    set lastGeneratedPlan(v) { lastGeneratedPlan = v; },
    get currentAssignments() { return currentAssignments; },
    set currentAssignments(v) { currentAssignments = v; },
    get lastSessionCommit() { return lastSessionCommit; }
  };
  global.HaishaCarpool = HaishaCarpool;

  Object.defineProperty(global, 'currentAssignments', {
    get() { return currentAssignments; },
    set(v) { currentAssignments = v; },
    configurable: true,
    enumerable: true
  });
  Object.defineProperty(global, 'lastGeneratedPlan', {
    get() { return lastGeneratedPlan; },
    set(v) { lastGeneratedPlan = v; },
    configurable: true,
    enumerable: true
  });
  Object.defineProperty(global, 'lastSessionCommit', {
    get() { return lastSessionCommit; },
    set(v) { lastSessionCommit = v; },
    configurable: true,
    enumerable: true
  });

  global.generateCarpool = generateCarpool;
  global.generate = generateCarpool;
  global.copyResult = copyResult;
  global.clearCarpoolDiagnosis = clearCarpoolDiagnosis;
  global.clearLastSessionCommit = clearLastSessionCommit;
  global.diagnoseCarpoolFailure = diagnoseCarpoolFailure;
  global.presentCarpoolFailure = presentCarpoolFailure;
  global.showCarpoolDiagnosis = showCarpoolDiagnosis;
  global.readLastSessionCommit = readLastSessionCommit;
  global.writeLastSessionCommit = writeLastSessionCommit;
  global.rollbackLastSessionCommit = rollbackLastSessionCommit;
  global.applyAssignmentHistoryCommit = applyAssignmentHistoryCommit;
  global.occupiedSeats = occupiedSeats;
  global.carPeopleCount = carPeopleCount;
  global.remainingSeats = remainingSeats;
  global.placeKid = placeKid;
  global.escapeHtml = escapeHtml;

})(typeof window !== 'undefined' ? window : globalThis);
