(function (global) {
let lastGeneratedPlan = "";
let currentAssignments = null;
let lastAssignmentWarnings = [];

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
  writeLastDispatchCommit(null);
}

function exportPlanSessionCommits() {
  const sessionCommit = readLastSessionCommit();
  const dispatchCommit = readLastDispatchCommit();
  return {
    sessionCommit: sessionCommit ? JSON.parse(JSON.stringify(sessionCommit)) : null,
    dispatchCommit: dispatchCommit ? JSON.parse(JSON.stringify(dispatchCommit)) : null
  };
}

function importPlanSessionCommits(pack) {
  const sessionCommit = pack && pack.sessionCommit && typeof pack.sessionCommit === 'object' && !Array.isArray(pack.sessionCommit)
    ? pack.sessionCommit
    : null;
  const dispatchCommit = pack && pack.dispatchCommit && typeof pack.dispatchCommit === 'object' && Array.isArray(pack.dispatchCommit.carIds)
    ? pack.dispatchCommit
    : null;
  writeLastSessionCommit(sessionCommit);
  writeLastDispatchCommit(dispatchCommit);
}

const LAST_DISPATCH_COMMIT_KEY = 'cp_lastDispatchCommit';
let lastDispatchCommit = null;

function readLastDispatchCommit() {
  if (lastDispatchCommit && typeof lastDispatchCommit === 'object') return lastDispatchCommit;
  try {
    const raw = sessionStorage.getItem(LAST_DISPATCH_COMMIT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.carIds)) return null;
    lastDispatchCommit = parsed;
    return lastDispatchCommit;
  } catch (e) {
    return null;
  }
}

function writeLastDispatchCommit(entry) {
  lastDispatchCommit = entry && typeof entry === 'object' ? entry : null;
  try {
    if (lastDispatchCommit) {
      sessionStorage.setItem(LAST_DISPATCH_COMMIT_KEY, JSON.stringify(lastDispatchCommit));
    } else {
      sessionStorage.removeItem(LAST_DISPATCH_COMMIT_KEY);
    }
  } catch (e) { /* ignore */ }
}

function rollbackLastDispatchCommit() {
  const prev = readLastDispatchCommit();
  if (!prev || typeof prev.date !== 'string') return;
  (prev.carIds || []).forEach((id) => {
    const car = cars.find((c) => String(c.id) === String(id));
    if (!car || !Array.isArray(car.dispatchHistory)) return;
    for (let i = car.dispatchHistory.length - 1; i >= 0; i--) {
      if (car.dispatchHistory[i] === prev.date) {
        car.dispatchHistory.splice(i, 1);
        break;
      }
    }
  });
}

function recordConfirmedDispatches(assignments) {
  const date = localDateString();
  const carIds = [];
  Object.keys(assignments || {}).forEach((carName) => {
    const car = cars.find((c) => c.name === carName);
    if (!car) return;
    if (!Array.isArray(car.dispatchHistory)) car.dispatchHistory = [];
    car.dispatchHistory.push(date);
    carIds.push(car.id);
  });
  writeLastDispatchCommit({ date, carIds });
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
  const riders = (assignments && car && assignments[car.name]) || [];
  return calculateCarRemainingSeats(car, riders);
}

function placeKid(kid, carName, assignments, currentCaps) {
  assignments[carName].push(kid);
  const cost = seatCost(kid);
  if (currentCaps[carName] > 0) {
    currentCaps[carName] = Math.max(0, currentCaps[carName] - cost);
  }
}

function pageElement(id) {
  try {
    if (typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return null;
    return document.getElementById(id);
  } catch (e) {
    return null;
  }
}

function clearCarpoolDiagnosis() {
  const el = pageElement('carpoolDiagnosis');
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
  const ridingKids = children.filter(needsPoolSeat);
  const activeCars = cars.filter(isPoolCar);
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
  parentCancelShortageWarnings(ridingKids, shortage).forEach((text) => notes.unshift(text));

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

function renderAssignmentWarnings(warnings) {
  lastAssignmentWarnings = Array.isArray(warnings) ? warnings.slice() : [];
  const el = pageElement('resultWarnings');
  if (!el) return;
  if (!lastAssignmentWarnings.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = lastAssignmentWarnings.map((text) =>
    `<p class="result-warning-badge">${escapeHtml(text)}</p>`
  ).join('');
}

function cancelledParentCarNames(ridingKids) {
  const names = [];
  (ridingKids || []).forEach((kid) => {
    const parent = kid && typeof kid.parentCar === 'string' ? kid.parentCar.trim() : '';
    if (!parent || names.indexOf(parent) !== -1) return;
    const car = cars.find((item) => item.name === parent);
    if (car && !car.active) names.push(parent);
  });
  return names;
}

function heldParentCarNames(ridingKids) {
  const names = [];
  (ridingKids || []).forEach((kid) => {
    const parent = kid && typeof kid.parentCar === 'string' ? kid.parentCar.trim() : '';
    if (!parent || names.indexOf(parent) !== -1) return;
    const car = cars.find((item) => item.name === parent);
    if (car && isHoldCar(car)) names.push(parent);
  });
  return names;
}

function parentCancelShortageWarnings(ridingKids, shortage) {
  if (!(shortage > 0)) return [];
  const lines = [];
  const cancelled = cancelledParentCarNames(ridingKids);
  if (cancelled.length) {
    lines.push(`※${cancelled.join('、')}がキャンセルされたため、${shortage}席不足しています。追加の出動車が必要です`);
  }
  const held = heldParentCarNames(ridingKids);
  if (held.length) {
    lines.push(`※${held.join('、')}が個人（様子見）のため、${shortage}席不足しています。追加の出動車が必要です`);
  }
  return lines;
}

function revealResultWarnings(warnings) {
  const lines = Array.isArray(warnings) ? warnings.filter(Boolean) : [];
  if (!lines.length) return;
  renderAssignmentWarnings(lines);
  syncResultHeading();
  const resultCard = pageElement('resultCard');
  if (resultCard) resultCard.style.display = 'block';
  const resultText = pageElement('resultText');
  if (resultText) resultText.textContent = lines.join('\n');
}

function presentCarpoolFailure(extra) {
  currentAssignments = null;
  lastGeneratedPlan = '';
  if (typeof markPlanResultCleared === 'function') markPlanResultCleared();
  renderAssignmentWarnings([]);
  const resultCard = pageElement('resultCard');
  if (resultCard) resultCard.style.display = 'none';
  const resultText = pageElement('resultText');
  if (resultText) resultText.textContent = '';

  const diagnosis = diagnoseCarpoolFailure(extra || {});
  if (extra && extra.leftoverKids) diagnosis.leftoverKids = extra.leftoverKids;
  showCarpoolDiagnosis(diagnosis);
  if (typeof renderCars === 'function') renderCars();
}

const MAX_SWAP_TRIALS = 280;

function positionCounts(riders) {
  const counts = {};
  (riders || []).forEach((kid) => {
    const pos = typeof canonicalPosition === 'function'
      ? canonicalPosition(kid && kid.pos)
      : String(kid && kid.pos || '').trim();
    if (!pos) return;
    counts[pos] = (counts[pos] || 0) + 1;
  });
  return counts;
}

function positionModeDelta(riders, mode) {
  const counts = positionCounts(riders);
  let delta = 0;
  Object.keys(counts).forEach((pos) => {
    const count = counts[pos];
    if (count < 2) return;
    const weight = count - 1;
    if (mode === 'pos_same') delta += weight * 500;
    else if (mode === 'pos_diff') delta -= weight * 400;
    else delta -= weight * 560;
  });
  return delta;
}

function assignmentCars(assignments) {
  return Object.keys(assignments || {})
    .map((name) => cars.find((car) => car.name === name))
    .filter(Boolean);
}

function isSwappable(kid, activeCars) {
  if (!kid) return false;
  if (kid.fixedCar && activeCars.some((car) => car.name === kid.fixedCar)) return false;
  if (kid.parentCar && activeCars.some((car) => car.name === kid.parentCar)) return false;
  return true;
}

function medianCapacity(activeCars) {
  const caps = activeCars.map((car) => parseInt(car.capacity, 10) || 0).sort((a, b) => a - b);
  if (!caps.length) return 0;
  const mid = Math.floor(caps.length / 2);
  if (caps.length % 2) return caps[mid];
  return (caps[mid - 1] + caps[mid]) / 2;
}

let rideHistoryStats = { lastCar: {}, carRideCount: {} };

function loadRideHistoryStats() {
  rideHistoryStats = { lastCar: {}, carRideCount: {} };
  try {
    const view = typeof getPlanSlotView === 'function' ? getPlanSlotView() : null;
    const date = view && view.date ? view.date : '';
    if (typeof getRideHistoryStats !== 'function') return;
    const stats = getRideHistoryStats(date, 3);
    if (!stats || typeof stats !== 'object') return;
    rideHistoryStats = {
      lastCar: stats.lastCar && typeof stats.lastCar === 'object' ? stats.lastCar : {},
      carRideCount: stats.carRideCount && typeof stats.carRideCount === 'object' ? stats.carRideCount : {}
    };
  } catch (e) {
    rideHistoryStats = { lastCar: {}, carRideCount: {} };
  }
}

function planDateSeed() {
  try {
    const view = typeof getPlanSlotView === 'function' ? getPlanSlotView() : null;
    if (view && view.date) return String(view.date);
  } catch (e) { /* ignore */ }
  return '';
}

function normalizeRerunSalt(value) {
  const salt = parseInt(value, 10);
  return Number.isFinite(salt) && salt > 0 ? salt : 0;
}

function hashSeedKey(text) {
  let hash = 2166136261;
  const source = String(text || '');
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed, id) {
  return hashSeedKey(`${seed}\0${id}`);
}

function freeKidRank(kid, rerunSalt) {
  const dateStr = planDateSeed();
  const salt = normalizeRerunSalt(rerunSalt);
  const seedKey = salt ? `${dateStr}_salt${salt}_${kid && kid.id}` : `${dateStr}\0${kid && kid.id}`;
  return hashSeedKey(seedKey);
}

function sameGroupEstablished(kid, riders, mode) {
  const list = Array.isArray(riders) ? riders : [];
  if (mode === 'pos_same') {
    const pos = typeof canonicalPosition === 'function' ? canonicalPosition(kid && kid.pos) : '';
    if (!pos) return false;
    return list.filter((rider) => canonicalPosition(rider && rider.pos) === pos).length >= 2;
  }
  if (mode === 'grade_same') {
    const grade = parseInt(kid && kid.grade, 10);
    if (isNaN(grade) || grade <= 0) return false;
    return list.filter((rider) => parseInt(rider && rider.grade, 10) === grade).length >= 2;
  }
  return false;
}

function rideRepeatPenalty(kid, car, mode, riders) {
  if (!kid || !car || kid.id == null) return 0;
  const carName = String(car.name || '');
  if (typeof isChildOfCar === 'function' && isChildOfCar(kid, car)) return 0;
  if (kid.fixedCar && String(kid.fixedCar).trim() === carName) return 0;
  const pid = String(kid.id);
  const stats = rideHistoryStats || {};
  let penalty = 0;
  if (stats.lastCar && stats.lastCar[pid] === carName) penalty -= 300;
  const counts = stats.carRideCount && stats.carRideCount[pid];
  const times = counts && counts[carName] ? counts[carName] : 0;
  if (times) penalty -= 80 * times;
  if (penalty < 0 && sameGroupEstablished(kid, riders, mode)) penalty *= 0.5;
  return penalty;
}

function resolveCarpoolMode(mode) {
  if (mode === 'balance' || mode === 'grade_same' || mode === 'grade_diff' || mode === 'pos_diff' || mode === 'pos_same') return mode;
  return typeof getCarpoolMode === 'function' ? getCarpoolMode() : 'balance';
}

function positiveGrades(riders) {
  return (riders || [])
    .map((kid) => parseInt(kid && kid.grade, 10))
    .filter((grade) => !isNaN(grade) && grade > 0);
}

function calculateGradeClumpScore(assignments) {
  let delta = 0;
  Object.keys(assignments || {}).forEach((name) => {
    const grades = positiveGrades(assignments[name]);
    if (grades.length < 2) return;
    delta -= (Math.max.apply(null, grades) - Math.min.apply(null, grades)) * 150;
    const counts = {};
    grades.forEach((grade) => { counts[grade] = (counts[grade] || 0) + 1; });
    Object.keys(counts).forEach((key) => {
      const count = counts[key];
      if (count >= 2) delta += (count - 1) * 500;
    });
  });
  return delta;
}

/** 学年の配点だけを切り替える。ポジションモードでは学年分散を足さない。 */
function applyGradeModeScore(score, assignments, mode) {
  if (mode === 'pos_same' || mode === 'pos_diff') return score;
  const names = Object.keys(assignments || {}).filter((name) => Array.isArray(assignments[name]) && assignments[name].length > 0);
  if (names.length < 2) return score;

  if (mode === 'grade_same') return score + calculateGradeClumpScore(assignments);

  if (mode === 'grade_diff') {
    const averages = [];
    names.forEach((name) => {
      const grades = positiveGrades(assignments[name]);
      if (!grades.length) return;
      averages.push(grades.reduce((total, grade) => total + grade, 0) / grades.length);
      if (grades.length >= 2 && Math.max.apply(null, grades) === Math.min.apply(null, grades)) score -= 150;
    });
    const usable = averages.filter((avg) => avg > 0);
    if (usable.length >= 2) {
      const mean = usable.reduce((total, value) => total + value, 0) / usable.length;
      const variance = usable.reduce((total, value) => total + (value - mean) * (value - mean), 0) / usable.length;
      score -= variance * 60;
    }
    return score;
  }

  const averages = [];
  names.forEach((name) => {
    const riders = assignments[name] || [];
    if (!riders.length) return;
    const sum = riders.reduce((total, kid) => total + (Number(kid && kid.grade) || 0), 0);
    averages.push(sum / riders.length);
  });
  if (averages.length >= 2) {
    const mean = averages.reduce((total, value) => total + value, 0) / averages.length;
    const variance = averages.reduce((total, value) => total + (value - mean) * (value - mean), 0) / averages.length;
    score -= variance * 30;
  }
  return score;
}

/** 減点方式。高いほど良い。座席不足のハード失敗はここでは扱わない。 */
function evaluateAssignmentScore(assignments, mode) {
  const selected = resolveCarpoolMode(mode);
  const activeCars = assignmentCars(assignments);
  let score = 0;
  let totalRiders = 0;
  activeCars.forEach((car) => {
    totalRiders += (assignments[car.name] || []).length;
  });
  const penalizeSolo = activeCars.length > 0 && totalRiders >= activeCars.length * 2;
  const median = medianCapacity(activeCars);

  activeCars.forEach((car) => {
    const riders = assignments[car.name] || [];
    if (penalizeSolo && riders.length === 1) score -= 1000;

    const cap = parseInt(car.capacity, 10) || 0;
    if (cap < median) {
      riders.forEach((kid) => {
        if (kid.motionSick) score -= 1200;
      });
    }

    riders.forEach((kid) => {
      score += rideRepeatPenalty(kid, car, selected, riders);
    });
    for (let i = 0; i < riders.length; i++) {
      for (let j = i + 1; j < riders.length; j++) {
        if (typeof isAvoidPair === 'function' && isAvoidPair(riders[i], riders[j])) score -= 50000;
      }
    }
  });

  Object.keys(assignments || {}).forEach((name) => {
    const riders = assignments[name];
    if (Array.isArray(riders)) score += positionModeDelta(riders, selected);
  });

  return applyGradeModeScore(score, assignments, selected);
}

function hasAvoidPairConflict(carRiders, kidToPut) {
  if (!kidToPut || !carRiders || !carRiders.length) return false;
  if (typeof isAvoidPair !== 'function') return false;
  return carRiders.some((existingKid) => isAvoidPair(existingKid, kidToPut));
}

function canSwapSeats(carA, kidA, carB, kidB, assignments) {
  const listA = ((assignments && assignments[carA.name]) || []).slice();
  const listB = ((assignments && assignments[carB.name]) || []).slice();
  const indexA = listA.indexOf(kidA);
  const indexB = listB.indexOf(kidB);
  if (indexA < 0 || indexB < 0) return false;
  listA[indexA] = kidB;
  listB[indexB] = kidA;
  const othersA = listA.filter((_, idx) => idx !== indexA);
  const othersB = listB.filter((_, idx) => idx !== indexB);
  if (hasAvoidPairConflict(othersA, kidB) || hasAvoidPairConflict(othersB, kidA)) return false;
  return calculateCarRemainingSeats(carA, listA) >= 0 && calculateCarRemainingSeats(carB, listB) >= 0;
}

function tryRelocateOne(assignments, activeCars, salt, selected, state) {
  const order = activeCars.map((_, index) => index);
  if (salt && order.length) order.push(...order.splice(0, salt % order.length));
  for (let fromPos = 0; fromPos < order.length && !state.found && state.trials < MAX_SWAP_TRIALS; fromPos++) {
    const carFrom = activeCars[order[fromPos]];
    const listFrom = assignments[carFrom.name] || [];
    if (listFrom.length <= 1) continue;
    const startI = salt && listFrom.length ? salt % listFrom.length : 0;
    for (let ii = 0; ii < listFrom.length && !state.found && state.trials < MAX_SWAP_TRIALS; ii++) {
      const i = (startI + ii) % listFrom.length;
      const kid = listFrom[i];
      if (!isSwappable(kid, activeCars)) continue;
      for (let toPos = 0; toPos < order.length && !state.found && state.trials < MAX_SWAP_TRIALS; toPos++) {
        if (order[toPos] === order[fromPos]) continue;
        const carTo = activeCars[order[toPos]];
        const listTo = assignments[carTo.name] || [];
        const cost = seatCost(kid);
        if (calculateCarRemainingSeats(carTo, listTo) < cost) continue;
        if (hasAvoidPairConflict(listTo, kid)) continue;
        state.trials += 1;
        const beforeScore = evaluateAssignmentScore(assignments, selected);
        listFrom.splice(i, 1);
        if (!assignments[carTo.name]) assignments[carTo.name] = [];
        assignments[carTo.name].push(kid);
        const afterScore = evaluateAssignmentScore(assignments, selected);
        const isBetter = afterScore > beforeScore + 1e-6;
        const isEqualInRerun = salt > 0 && Math.abs(afterScore - beforeScore) <= 1e-6;
        if (isBetter || isEqualInRerun) {
          state.improved = true;
          state.found = true;
        } else {
          assignments[carTo.name].pop();
          listFrom.splice(i, 0, kid);
        }
      }
    }
  }
}

function optimizeBySwaps(assignments, activeCars, rerunSalt, mode) {
  const salt = normalizeRerunSalt(rerunSalt);
  const selected = resolveCarpoolMode(mode);
  let trials = 0;
  let improved = true;
  while (improved && trials < MAX_SWAP_TRIALS) {
    improved = false;
    const state = { trials, improved: false, found: false };
    tryRelocateOne(assignments, activeCars, salt, selected, state);
    trials = state.trials;
    improved = state.improved;
    let found = state.found;
    if (found) continue;
    const pairOrder = [];
    for (let a = 0; a < activeCars.length; a++) {
      for (let b = a + 1; b < activeCars.length; b++) pairOrder.push([a, b]);
    }
    if (salt && pairOrder.length) {
      pairOrder.push(...pairOrder.splice(0, salt % pairOrder.length));
    }
    for (let p = 0; p < pairOrder.length && !found && trials < MAX_SWAP_TRIALS; p++) {
      const carA = activeCars[pairOrder[p][0]];
      const carB = activeCars[pairOrder[p][1]];
      const listA = assignments[carA.name];
      const listB = assignments[carB.name];
      if (!listA || !listB) continue;
      const startI = salt && listA.length ? salt % listA.length : 0;
      const startJ = salt && listB.length ? salt % listB.length : 0;
      for (let ii = 0; ii < listA.length && !found && trials < MAX_SWAP_TRIALS; ii++) {
        const i = (startI + ii) % listA.length;
        const kidA = listA[i];
        if (!isSwappable(kidA, activeCars)) continue;
        for (let jj = 0; jj < listB.length && !found && trials < MAX_SWAP_TRIALS; jj++) {
          const j = (startJ + jj) % listB.length;
          const kidB = listB[j];
          if (!isSwappable(kidB, activeCars)) continue;
          if (!canSwapSeats(carA, kidA, carB, kidB, assignments)) continue;
          trials += 1;
          const before = evaluateAssignmentScore(assignments, selected);
          listA[i] = kidB;
          listB[j] = kidA;
          const after = evaluateAssignmentScore(assignments, selected);
          const isScoreBetter = after > before + 1e-6;
          const isScoreEqualInRerun = salt > 0 && Math.abs(after - before) <= 1e-6;
          if (isScoreBetter || isScoreEqualInRerun) {
            improved = true;
            found = true;
          } else {
            listA[i] = kidA;
            listB[j] = kidB;
          }
        }
      }
    }
  }
}

function preferCar(list, kid, assignments) {
  let best = list[0];
  for (let i = 1; i < list.length; i++) {
    const car = list[i];
    const bestCount = assignments[best.name].length;
    const carCount = assignments[car.name].length;
    if (carCount !== bestCount) {
      if (carCount < bestCount) best = car;
      continue;
    }
    const bestCap = parseInt(best.capacity, 10) || 0;
    const carCap = parseInt(car.capacity, 10) || 0;
    if (kid.motionSick) {
      if (carCap > bestCap) best = car;
    } else if (carCap < bestCap) {
      best = car;
    }
  }
  return best;
}

function modeAffinityScore(kid, car, assignments, mode) {
  const riders = (assignments && assignments[car.name]) || [];
  if (mode === 'pos_same' || mode === 'pos_diff') {
    const pos = typeof canonicalPosition === 'function' ? canonicalPosition(kid && kid.pos) : '';
    if (!pos) return 0;
    const has = riders.some((rider) => canonicalPosition(rider && rider.pos) === pos);
    if (mode === 'pos_same') {
      if (has) return 10;
      return riders.length ? -10 : 0;
    }
    return has ? -10 : 0;
  }
  if (mode === 'grade_same' || mode === 'grade_diff') {
    const grade = parseInt(kid && kid.grade, 10);
    if (isNaN(grade) || grade <= 0) return 0;
    const has = riders.some((rider) => parseInt(rider && rider.grade, 10) === grade);
    if (mode === 'grade_same') {
      if (has) return 10;
      return riders.length ? -10 : 0;
    }
    return has ? 0 : 10;
  }
  return 0;
}

function highestAffinityCars(kid, list, assignments, mode) {
  let best = -Infinity;
  list.forEach((car) => {
    const score = modeAffinityScore(kid, car, assignments, mode);
    if (score > best) best = score;
  });
  return list.filter((car) => modeAffinityScore(kid, car, assignments, mode) === best);
}

function chooseCarForFreeKid(kid, assignments, activeCars, carsToUse, mode) {
  const fitting = activeCars.filter((car) => remainingSeats(car, assignments) >= seatCost(kid) && !hasAvoidPairConflict(assignments[car.name], kid));
  if (!fitting.length) return null;
  const pool = highestAffinityCars(kid, fitting, assignments, mode);
  const singles = pool.filter((car) => assignments[car.name].length === 1);
  if (singles.length) return preferCar(singles, kid, assignments);

  const nonEmpty = activeCars.reduce((count, car) => (
    count + ((assignments[car.name] || []).length > 0 ? 1 : 0)
  ), 0);
  const empties = pool.filter((car) => assignments[car.name].length === 0);
  if (nonEmpty < carsToUse && empties.length) return preferCar(empties, kid, assignments);

  const used = pool.filter((car) => assignments[car.name].length > 0);
  if (used.length) return preferCar(used, kid, assignments);
  return preferCar(pool, kid, assignments);
}

function repairLeftovers(leftover, assignments, activeCars) {
  const still = [];
  leftover.forEach((kid) => {
    let placed = false;
    for (let a = 0; a < activeCars.length && !placed; a++) {
      const from = activeCars[a];
      const list = assignments[from.name];
      for (let i = 0; i < list.length && !placed; i++) {
        const mover = list[i];
        if (!isSwappable(mover, activeCars)) continue;
        list.splice(i, 1);
        const dest = remainingSeats(from, assignments) >= seatCost(kid) && !hasAvoidPairConflict(list, kid)
          ? activeCars.find((car) => car !== from && remainingSeats(car, assignments) >= seatCost(mover) && !hasAvoidPairConflict(assignments[car.name], mover))
          : null;
        if (!dest) {
          list.splice(i, 0, mover);
          continue;
        }
        assignments[dest.name].push(mover);
        assignments[from.name].push(kid);
        placed = true;
      }
    }
    if (!placed) still.push(kid);
  });
  return still;
}

function collectSoftWarnings(assignments, activeCars) {
  const warnings = [];
  const median = medianCapacity(activeCars);
  activeCars.forEach((car) => {
    const riders = assignments[car.name] || [];
    if (riders.length === 1) warnings.push(`※${car.name}は選手1名のみの乗車です`);
    if (resolveCarpoolMode() !== 'pos_same') {
      Object.keys(positionCounts(riders)).forEach((pos) => {
        if (positionCounts(riders)[pos] >= 2) warnings.push(`※${car.name}に${pos}が重複しています`);
      });
    }
    const cap = parseInt(car.capacity, 10) || 0;
    if (cap < median) {
      riders.forEach((kid) => {
        if (kid.motionSick) warnings.push(`※${kid.name}は車酔いしやすいですが、定員や他の制約の都合で定員${cap}の${car.name}に乗っています`);
      });
    }
  });
  return warnings;
}

function attachAssignmentWarnings(assignments, warnings) {
  const list = warnings.slice();
  Object.defineProperty(assignments, 'warnings', {
    value: list,
    enumerable: false,
    configurable: true,
    writable: true
  });
  lastAssignmentWarnings = list;
  return list;
}

/**
 * フェーズ1で固定ピン・親車・最低2名の骨格を作り、フェーズ2でソフト制約をスワップする。
 * 席が物理的に足りないときだけ leftover を返す。
 */
function buildTwoPhaseAssignment(activeCars, ridingKids, rerunSalt, mode) {
  loadRideHistoryStats();
  const salt = normalizeRerunSalt(rerunSalt);
  const assignments = {};
  activeCars.forEach((car) => { assignments[car.name] = []; });

  const overflowedCars = [];
  const afterPins = [];
  ridingKids.forEach((kid) => {
    if (!kid.fixedCar) {
      afterPins.push(kid);
      return;
    }
    const car = activeCars.find((item) => item.name === kid.fixedCar);
    if (car && remainingSeats(car, assignments) >= seatCost(kid) && !hasAvoidPairConflict(assignments[car.name], kid)) {
      assignments[car.name].push(kid);
      return;
    }
    if (car && remainingSeats(car, assignments) < seatCost(kid) && !overflowedCars.includes(car.name)) overflowedCars.push(car.name);
    afterPins.push(kid);
  });

  const free = [];
  afterPins.forEach((kid) => {
    const pinnedElsewhere = kid.fixedCar && activeCars.some((car) => car.name === kid.fixedCar);
    if (!pinnedElsewhere && kid.parentCar) {
      const car = activeCars.find((item) => item.name === kid.parentCar);
      if (car && remainingSeats(car, assignments) >= seatCost(kid) && !hasAvoidPairConflict(assignments[car.name], kid)) {
        assignments[car.name].push(kid);
        return;
      }
      // 親の車が休み、またはその車に席が無いときはエラーにせずフリー枠へ戻す
    }
    free.push(kid);
  });

  free.sort((a, b) => {
    const sick = (b.motionSick ? 1 : 0) - (a.motionSick ? 1 : 0);
    if (sick) return sick;
    const cost = seatCost(b) - seatCost(a);
    if (cost) return cost;
    return freeKidRank(a, salt) - freeKidRank(b, salt);
  });

  const carsToUse = Math.min(
    activeCars.length,
    Math.max(1, Math.floor(ridingKids.length / 2))
  );
  let leftover = [];
  free.forEach((kid) => {
    const car = chooseCarForFreeKid(kid, assignments, activeCars, carsToUse, mode);
    if (!car) leftover.push(kid);
    else assignments[car.name].push(kid);
  });

  if (leftover.length) leftover = repairLeftovers(leftover, assignments, activeCars);
  if (!leftover.length) optimizeBySwaps(assignments, activeCars, salt, mode);

  if (salt > 0 && activeCars.length >= 2) {
    const movableSlots = [];
    activeCars.forEach((car) => {
      const list = assignments[car.name] || [];
      list.forEach((kid, idx) => {
        if (isSwappable(kid, activeCars)) movableSlots.push({ car, index: idx, kid });
      });
    });

    const currentScore = evaluateAssignmentScore(assignments, mode);
    const candidates = [];
    for (let i = 0; i < movableSlots.length; i++) {
      for (let j = i + 1; j < movableSlots.length; j++) {
        const slotA = movableSlots[i];
        const slotB = movableSlots[j];
        if (slotA.car.name === slotB.car.name) continue;
        if (!canSwapSeats(slotA.car, slotA.kid, slotB.car, slotB.kid, assignments)) continue;
        if (rerunSwapIsDestructive(slotA, slotB, assignments, mode)) continue;
        const listA = assignments[slotA.car.name];
        const listB = assignments[slotB.car.name];
        const tempA = listA[slotA.index];
        const tempB = listB[slotB.index];
        listA[slotA.index] = tempB;
        listB[slotB.index] = tempA;
        const afterScore = evaluateAssignmentScore(assignments, mode);
        listA[slotA.index] = tempA;
        listB[slotB.index] = tempB;
        if (afterScore >= currentScore - 1e-6) candidates.push({ slotA, slotB, afterScore });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.afterScore - a.afterScore);
      const topScore = candidates[0].afterScore;
      const bestCandidates = candidates.filter((candidate) => Math.abs(candidate.afterScore - topScore) <= 1e-6);
      const pick = bestCandidates[(salt - 1) % bestCandidates.length];
      const slotA = pick.slotA;
      const slotB = pick.slotB;
      const listA = assignments[slotA.car.name];
      const listB = assignments[slotB.car.name];
      const temp = listA[slotA.index];
      listA[slotA.index] = listB[slotB.index];
      listB[slotB.index] = temp;
    }
  }
  return { assignments, overflowedCars, leftover };
}

function rerunSwapIsDestructive(slotA, slotB, assignments, mode) {
  const listA = assignments[slotA.car.name] || [];
  const listB = assignments[slotB.car.name] || [];
  if (mode === 'pos_same' || mode === 'pos_diff') {
    const posA = typeof canonicalPosition === 'function' ? canonicalPosition(slotA.kid.pos) : '';
    const posB = typeof canonicalPosition === 'function' ? canonicalPosition(slotB.kid.pos) : '';
    if (mode === 'pos_same') {
      const sameInA = posA ? listA.filter((kid) => canonicalPosition(kid.pos) === posA).length : 0;
      const sameInB = posB ? listB.filter((kid) => canonicalPosition(kid.pos) === posB).length : 0;
      return posA !== posB && (sameInA >= 2 || sameInB >= 2);
    }
    if (!posA || !posB || posA === posB) return false;
    const otherHasA = listB.some((kid) => kid !== slotB.kid && canonicalPosition(kid.pos) === posA);
    const otherHasB = listA.some((kid) => kid !== slotA.kid && canonicalPosition(kid.pos) === posB);
    return otherHasA || otherHasB;
  }
  if (mode === 'grade_same' || mode === 'grade_diff') {
    const gradeA = parseInt(slotA.kid.grade, 10);
    const gradeB = parseInt(slotB.kid.grade, 10);
    if (mode === 'grade_same') {
      const sameInA = !isNaN(gradeA) ? listA.filter((kid) => parseInt(kid.grade, 10) === gradeA).length : 0;
      const sameInB = !isNaN(gradeB) ? listB.filter((kid) => parseInt(kid.grade, 10) === gradeB).length : 0;
      return gradeA !== gradeB && (sameInA >= 2 || sameInB >= 2);
    }
    if (isNaN(gradeA) || isNaN(gradeB) || gradeA === gradeB) return false;
    const otherHasA = listB.some((kid) => kid !== slotB.kid && parseInt(kid.grade, 10) === gradeA);
    const otherHasB = listA.some((kid) => kid !== slotA.kid && parseInt(kid.grade, 10) === gradeB);
    return otherHasA || otherHasB;
  }
  return false;
}

function planDatePhrase() {
  try {
    if (typeof getActivePlanDateLabel === 'function') {
      const label = getActivePlanDateLabel();
      if (label) return label;
    }
  } catch (e) { /* ignore */ }
  return '本日';
}

let lastAppliedCarpoolMode = '';

function carpoolModeBadgeText(mode, mobility) {
  const labels = {
    balance: '⚖️ バランス（標準）',
    grade_same: '🎒 学年を揃える',
    grade_diff: '🤝 学年を散らす',
    pos_diff: '🛡️ ポジションを散らす',
    pos_same: '🗣️ ポジションを揃える'
  };
  const base = '適用モード：' + (labels[mode] || labels.balance);
  if (!mobility) return base;
  return `${base}（固定: ${mobility.fixed}名 / 自由枠: ${mobility.free}名）`;
}

function countPlanMobility(assignments) {
  let fixed = 0;
  let free = 0;
  const seen = {};
  const poolNames = {};
  if (typeof cars !== 'undefined' && Array.isArray(cars)) {
    cars.forEach((car) => {
      if (typeof isPoolCar === 'function' && isPoolCar(car)) poolNames[car.name] = true;
    });
  }
  const add = (kid, isFixed) => {
    if (!kid || kid.id == null || kid.id === '') return;
    const id = String(kid.id);
    if (seen[id]) return;
    seen[id] = true;
    if (isFixed) fixed += 1;
    else free += 1;
  };
  Object.keys(assignments || {}).forEach((carName) => {
    (assignments[carName] || []).forEach((kid) => {
      const inPool = !!poolNames[carName];
      const pinned = (kid && kid.parentCar && String(kid.parentCar).trim() === String(carName).trim())
        || (kid && kid.fixedCar && String(kid.fixedCar).trim());
      add(kid, !inPool || !!pinned);
    });
  });
  if (typeof children !== 'undefined' && Array.isArray(children)) {
    children.forEach((kid) => {
      if (!kid || seen[String(kid.id)]) return;
      const onHoldCar = Array.isArray(cars) && cars.some((car) => (
        typeof isHoldCar === 'function' && isHoldCar(car)
        && typeof isChildOfCar === 'function' && isChildOfCar(kid, car)
      ));
      const hold = typeof isHoldKid === 'function' && isHoldKid(kid);
      const onSite = typeof isOnSite === 'function' && isOnSite(kid);
      const riding = typeof isRiding === 'function' && isRiding(kid);
      if (onHoldCar || hold || onSite) add(kid, true);
      else if (riding) add(kid, false);
    });
  }
  return { fixed, free };
}

function assignmentMemberSignature(assignments) {
  return Object.keys(assignments || {}).sort().map((name) => {
    const ids = (assignments[name] || [])
      .map((kid) => (kid && kid.id != null ? String(kid.id) : ''))
      .filter(Boolean)
      .sort();
    if (!ids.length) return '';
    return `${name}:${ids.join(',')}`;
  }).filter(Boolean).join('|');
}

function syncResultModeBadge() {
  const el = pageElement('resultModeBadge');
  if (!el) return;
  if (!currentAssignments) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const mode = lastAppliedCarpoolMode || (typeof getCarpoolMode === 'function' ? getCarpoolMode() : 'balance');
  el.hidden = false;
  el.innerHTML = '<span class="badge badge-info">' + escapeHtml(carpoolModeBadgeText(mode, countPlanMobility(currentAssignments))) + '</span>';
}

function syncResultHeading() {
  const el = pageElement('resultHeading');
  if (el) el.textContent = typeof planResultHeading === 'function' ? planResultHeading() : '本日の配車結果';
  syncResultModeBadge();
}

function realAssignedPlayers(riders) {
  const roster = Array.isArray(children) ? children : [];
  return (riders || []).filter((player) => {
    if (!player || typeof player !== 'object') return false;
    if (player.isCompanion) return false;
    if (typeof isHoldKid === 'function' && isHoldKid(player)) return false;
    if (player.id == null || player.id === '') return false;
    return roster.some((orig) => String(orig.id) === String(player.id) && !(typeof isHoldKid === 'function' && isHoldKid(orig)));
  });
}

function directCarShareLine(car, assignments) {
  const riders = realAssignedPlayers((assignments && assignments[car.name]) || []);
  const role = car.driverRole && String(car.driverRole).trim();
  const head = role ? `${car.name}（${role}）` : car.name;
  const who = riders.map((kid) => kid.name).join('、');
  return who ? `・${head}：${who}（自走直行）` : `・${head}（自走直行）`;
}

function directSectionLines(assignments) {
  const lines = [];
  cars.filter(isDirectCar).forEach((car) => lines.push(directCarShareLine(car, assignments)));
  children.filter(isOnSite).forEach((kid) => lines.push(`・${kid.name}（現地合流）`));
  return lines;
}

function holdSectionLines() {
  const lines = [];
  const indCars = cars.filter((car) => carDayMode(car) === 'individual' || car.dispatchStatus === 'individual');
  indCars.forEach((car) => {
    let headerText = car.name;
    if (typeof formatCarCompanionHeader === 'function') {
      headerText = `${car.name}${formatCarCompanionHeader(car)}`;
    }
    const myKids = children.filter((player) => isChildOfCar(player, car) && (player.dayMode === 'individual' || player.dispatchStatus === 'individual' || player.status === 'individual'));
    if (myKids.length > 0) {
      lines.push(`・${headerText}：${myKids.map((kid) => kid.name).join('、')}`);
    } else {
      lines.push(`・${headerText}`);
    }
  });
  return lines;
}

function buildPlanTexts(assignments) {
  const poolCars = cars.filter(isPoolCar);
  const ridingKids = children.filter(isRiding);
  const phrase = planDatePhrase();
  const hasPoolRide = poolCars.some((car) => {
    const riders = realAssignedPlayers((assignments && assignments[car.name]) || []);
    return riders.length > 0 || companionSeatsOf(car) > 0;
  });
  const directLines = directSectionLines(assignments);
  const holdLines = holdSectionLines();

  let line = `【連絡】${phrase}の配車です🚗\n---------------------\n`;
  if (hasPoolRide) {
    poolCars.forEach(c => {
      const riders = realAssignedPlayers((assignments && assignments[c.name]) || []);
      const header = typeof formatCarCompanionHeader === 'function' ? formatCarCompanionHeader(c, riders) : '';
      const lineNames = riders.map(k => k.name);
      line += `■ ${c.name}${header}${c.isEquipmentCar ? ' 【道具車】' : ''}\n`;
      line += `${lineNames.length > 0 ? lineNames.join('、') : 'なし'}\n\n`;
    });
  }
  const placedIds = new Set();
  Object.keys(assignments || {}).forEach((carName) => {
    realAssignedPlayers(assignments[carName]).forEach((kid) => placedIds.add(String(kid.id)));
  });
  const looseKids = ridingKids.filter((kid) => !placedIds.has(String(kid.id)));
  if (looseKids.length > 0) {
    line += `■ 未割当\n${looseKids.map(k => k.name).join('、')}\n\n`;
  }
  if (!hasPoolRide && looseKids.length === 0 && directLines.length === 0 && holdLines.length === 0) {
    line += `${phrase}の乗車配車はありません。\n\n`;
  }
  if (directLines.length > 0) {
    line += `■ 現地集合（直行）\n${directLines.join('\n')}\n\n`;
  }
  if (holdLines.length > 0) {
    line += `■ 個人（家庭送迎・自走）\n${holdLines.join('\n')}\n\n`;
  }
  line += "---------------------\nよろしくお願いいたします！";
  return { line };
}

function showPlanTexts(texts) {
  syncResultHeading();
  const resultText = pageElement('resultText');
  const resultCard = pageElement('resultCard');
  if (resultText) {
    const editor = typeof buildAssignmentMoveHtml === 'function'
      ? buildAssignmentMoveHtml(currentAssignments)
      : '';
    const preview = `<p class="result-share-label">共有される文章</p><pre class="result-share-preview">${escapeHtml(texts.line || '')}</pre>`;
    resultText.innerHTML = editor + preview;
  }
  if (resultCard) resultCard.style.display = 'block';
  lastGeneratedPlan = texts.line;
}

function stripAssignedPlayer(childId) {
  if (!currentAssignments) return;
  Object.keys(currentAssignments).forEach((name) => {
    const list = currentAssignments[name];
    if (!Array.isArray(list)) return;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] && String(list[i].id) === String(childId)) list.splice(i, 1);
    }
  });
}

function finishManualMove() {
  const poolCars = cars.filter(isPoolCar);
  const warnings = collectSoftWarnings(currentAssignments || {}, poolCars);
  attachAssignmentWarnings(currentAssignments, warnings);
  showPlanTexts(buildPlanTexts(currentAssignments));
  renderAssignmentWarnings(warnings);
  saveData();
  renderChildren();
  renderCars();
  updateStatusBar();
}

function reconcileOpenCarMode(car) {
  if (!currentAssignments || !car) return;
  const list = Array.isArray(currentAssignments[car.name]) ? currentAssignments[car.name] : [];
  if (isDirectCar(car)) {
    const family = list.filter((kid) => kid && isRiding(kid) && kid.parentCar === car.name);
    if (family.length) currentAssignments[car.name] = family;
    else delete currentAssignments[car.name];
    return;
  }
  if (isHoldCar(car)) delete currentAssignments[car.name];
}

function moveAssignedPlayer(childId, destination) {
  if (!currentAssignments) return;
  const child = children.find((item) => String(item.id) === String(childId));
  const dest = String(destination || '');
  if (!child || !dest) return;

  if (dest === 'site' || dest === 'off' || dest === 'hold') {
    stripAssignedPlayer(child.id);
    setAttendMode(child, dest === 'site' ? 'site' : dest === 'hold' ? 'hold' : 'off');
    finishManualMove();
    return;
  }

  const carName = dest.indexOf('car:') === 0 ? dest.slice(4) : '';
  const car = cars.find((item) => isPoolCar(item) && item.name === carName);
  if (!car) {
    refreshDisplayedPlan();
    return;
  }
  if (!Array.isArray(currentAssignments[car.name])) currentAssignments[car.name] = [];
  const alreadyThere = (currentAssignments[car.name] || []).some((kid) => String(kid.id) === String(child.id));
  if (alreadyThere) {
    refreshDisplayedPlan();
    return;
  }
  const ridingPreview = Object.assign({}, child, { active: true, meetOnSite: false, dayMode: 'normal' });
  if (hasAvoidPairConflict(currentAssignments[car.name], child)) {
    alert('同乗配慮のため、同じ車には指定できません。');
    refreshDisplayedPlan();
    return;
  }
  if (remainingSeats(car, currentAssignments) < seatCost(ridingPreview)) {
    alert(`「${car.name}」の定員を超えるため移動できません。`);
    refreshDisplayedPlan();
    return;
  }
  stripAssignedPlayer(child.id);
  if (!isRiding(child)) setAttendMode(child, 'ride');
  currentAssignments[car.name].push(child);
  finishManualMove();
}

function refreshDisplayedPlan() {
  syncResultHeading();
  const card = document.getElementById('resultCard');
  if (!currentAssignments || !card || card.style.display !== 'block') return;
  showPlanTexts(buildPlanTexts(currentAssignments));
}

function restoreDisplayedPlan(payload) {
  if (!payload || !payload.assignments || typeof payload.assignments !== 'object') {
    currentAssignments = null;
    lastGeneratedPlan = '';
    renderAssignmentWarnings([]);
    const resultCard = pageElement('resultCard');
    if (resultCard) resultCard.style.display = 'none';
    const resultText = pageElement('resultText');
    if (resultText) resultText.textContent = '';
    syncResultHeading();
    if (pageElement('resultPattern') && typeof showResultPattern === 'function') showResultPattern(0);
    if (pageElement('carList') && typeof renderCars === 'function') renderCars();
    return;
  }
  const assignments = {};
  Object.keys(payload.assignments).forEach((carName) => {
    const ids = payload.assignments[carName];
    if (!Array.isArray(ids)) return;
    assignments[carName] = ids
      .map((id) => children.find((child) => String(child.id) === String(id)))
      .filter(Boolean);
  });
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.slice() : [];
  attachAssignmentWarnings(assignments, warnings);
  currentAssignments = assignments;
  showPlanTexts(buildPlanTexts(assignments));
  renderAssignmentWarnings(warnings);
  if (pageElement('resultPattern') && typeof showResultPattern === 'function') showResultPattern(0);
  if (pageElement('carList') && typeof renderCars === 'function') renderCars();
}

// 骨格確定のあと、入れ替えでソフト制約を上げる
function assignDirectFamilies() {
  const assignments = {};
  cars.filter(isDirectCar).forEach((car) => {
    const seated = [];
    children.filter((kid) => isRiding(kid) && kid.parentCar === car.name).forEach((kid) => {
      const scratch = {};
      scratch[car.name] = seated;
      if (remainingSeats(car, scratch) >= seatCost(kid) && !hasAvoidPairConflict(seated, kid)) seated.push(kid);
    });
    if (seated.length) assignments[car.name] = seated;
  });
  return assignments;
}

function generateCarpool(rerunSalt, mode) {
  const salt = normalizeRerunSalt(rerunSalt);
  const selected = resolveCarpoolMode(mode);
  lastAppliedCarpoolMode = selected;
  clearCarpoolDiagnosis();
  renderAssignmentWarnings([]);
  if (typeof excludePlayersOfIndividualCars === 'function') excludePlayersOfIndividualCars();

  const directAssignments = assignDirectFamilies();
  const placedDirect = new Set();
  Object.keys(directAssignments).forEach((name) => {
    directAssignments[name].forEach((kid) => placedDirect.add(String(kid.id)));
  });
  const poolCars = cars.filter(isPoolCar);
  const individualCars = cars.filter((car) => carDayMode(car) === 'individual' || car.dispatchStatus === 'individual');
  const ridingKids = children.filter((kid) => {
    if (!isRiding(kid) || placedDirect.has(String(kid.id))) return false;
    if (kid.dispatchStatus === 'individual' || kid.status === 'individual' || !kid.active) return false;
    if (individualCars.some((car) => isChildOfCar(kid, car))) {
      kid.dispatchStatus = 'individual';
      return false;
    }
    return true;
  });
  const onSiteKids = children.filter(isOnSite);
  const holdKids = children.filter(isHoldKid);
  const holdCars = cars.filter(isHoldCar);
  const directCars = cars.filter(isDirectCar);

  if (ridingKids.length === 0 && onSiteKids.length === 0 && holdKids.length === 0 && holdCars.length === 0 && directCars.length === 0) {
    alert("参加する子供（乗車・現地集合・個人）または当日の車両状態を選んでください。");
    return;
  }

  let assignments = {};
  Object.keys(directAssignments).forEach((name) => {
    assignments[name] = directAssignments[name].slice();
  });
  const warnings = [];

  if (ridingKids.length > 0) {
    if (poolCars.length === 0) {
      presentCarpoolFailure();
      return;
    }

    const totalCap = poolCars.reduce((sum, c) => sum + (parseInt(c.capacity, 10) || 0), 0);
    const familyDemand = poolCars.reduce((sum, c) => sum + familySeatsOf(c), 0);
    const seatDemand = ridingKids.reduce((sum, c) => sum + seatCost(c), 0) + familyDemand;
    if (totalCap < seatDemand) {
      const shortage = seatDemand - totalCap;
      const guide = parentCancelShortageWarnings(ridingKids, shortage);
      alert(guide[0] || `座席が${shortage}席不足しています`);
      presentCarpoolFailure();
      revealResultWarnings(guide);
      return;
    }

    if (poolCars.length * 2 > ridingKids.length) {
      warnings.push('車両数が多いため、1名乗車の車両が発生します');
    }

    const built = buildTwoPhaseAssignment(poolCars, ridingKids, salt, selected);
    if (built.overflowedCars.length > 0) {
      alert(`${built.overflowedCars.map(n => `「${n}」`).join('、')}の定員を超えて指定されています。\nあふれた分は自動配車に回します。`);
    }
    if (built.leftover.length > 0) {
      presentCarpoolFailure({ leftoverKids: built.leftover });
      return;
    }
    Object.keys(built.assignments).forEach((name) => {
      assignments[name] = built.assignments[name];
    });
    collectSoftWarnings(assignments, poolCars).forEach((text) => warnings.push(text));
  }

  clearCarpoolDiagnosis();
  const previousSignature = salt > 0 ? assignmentMemberSignature(currentAssignments) : '';
  attachAssignmentWarnings(assignments, warnings);
  currentAssignments = assignments;
  const unchanged = salt > 0 && previousSignature !== '' && previousSignature === assignmentMemberSignature(assignments);
  showPlanTexts(buildPlanTexts(assignments));
  renderAssignmentWarnings(lastAssignmentWarnings);
  if (pageElement('resultPattern') && typeof showResultPattern === 'function') showResultPattern(salt, unchanged);
  if (pageElement('carList') && typeof renderCars === 'function') renderCars();
  if (pageElement('resultCard') && typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  return { assignments: currentAssignments, unchanged: unchanged };
}

function copyResult() {
  if (!currentAssignments && !lastGeneratedPlan) return;

  if (currentAssignments) {
    // 同セッション内の再コピー: 直前確定分を差し戻してから今回分を加算
    rollbackLastSessionCommit();
    rollbackLastDispatchCommit();
    const commitMap = applyAssignmentHistoryCommit(currentAssignments);
    recordConfirmedDispatches(currentAssignments);
    writeLastSessionCommit(commitMap);
    saveData();
    renderChildren();
    renderCars();
    updateStatusBar();
  }

  // 履歴確定後にクリップボード＋iOS共有シート（Capacitor Share）
  shareDispatchText(lastGeneratedPlan || '').catch((err) => {
    console.error('shareDispatchText failed:', err);
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
    restoreDisplayedPlan,
    refreshDisplayedPlan,
    presentCarpoolFailure,
    showCarpoolDiagnosis,
    buildLinePlanText: function buildLinePlanText() { return lastGeneratedPlan || ''; },
    get lastGeneratedPlan() { return lastGeneratedPlan; },
    set lastGeneratedPlan(v) { lastGeneratedPlan = v; },
    get currentAssignments() { return currentAssignments; },
    set currentAssignments(v) { currentAssignments = v; },
    get assignmentWarnings() { return lastAssignmentWarnings.slice(); },
    evaluateAssignmentScore,
    hasAvoidPairConflict,
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
  global.restoreDisplayedPlan = restoreDisplayedPlan;
  global.refreshDisplayedPlan = refreshDisplayedPlan;
  global.exportPlanSessionCommits = exportPlanSessionCommits;
  global.importPlanSessionCommits = importPlanSessionCommits;
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
  global.realAssignedPlayers = realAssignedPlayers;
  global.moveAssignedPlayer = moveAssignedPlayer;
  global.finishManualMove = finishManualMove;
  global.reconcileOpenCarMode = reconcileOpenCarMode;
  global.parentCancelShortageWarnings = parentCancelShortageWarnings;
  global.hasAvoidPairConflict = hasAvoidPairConflict;
  global.evaluateAssignmentScore = evaluateAssignmentScore;

})(typeof window !== 'undefined' ? window : globalThis);
