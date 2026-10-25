let lastGeneratedPlan = "";
let currentAssignments = null;

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

// 親の車優先 ＆ 均等配車ロジック
function generateCarpool() {
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
      alert("出せる車にチェックを入れてください。");
      return;
    }

    const totalCap = activeCars.reduce((sum, c) => sum + (parseInt(c.capacity, 10) || 0), 0);
    const familyDemand = activeCars.reduce((sum, c) => sum + familySeatsOf(c), 0);
    const seatDemand = ridingKids.reduce((sum, c) => sum + seatCost(c), 0) + familyDemand;
    if (totalCap < seatDemand) {
      alert(`座席が足りません！\n必要席数: ${seatDemand}席（選手＋同乗保護者＋身内）\n乗車定員: ${totalCap}席\nあと ${seatDemand - totalCap} 席の車が必要です。`);
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
    unassigned.forEach(kid => {
      if (!kid.rideHistory) kid.rideHistory = {};
      const cost = seatCost(kid);

      let availableCars = activeCars.filter(c => currentCaps[c.name] >= cost);
      if (availableCars.length === 0) {
        availableCars = activeCars.filter(c => remainingSeats(c, assignments) >= cost);
      }
      if (availableCars.length === 0) return;

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
  }

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
        text += `■ ${c.name} (${people}名)\n  乗車: ${names || 'なし'}\n\n`;
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

  // LINE用テキスト（名前のみ・箇条書き／注記なし）
  function buildLinePlanText() {
    let text = `【連絡】本日の配車です🚗\n---------------------\n`;

    if (ridingKids.length > 0 || activeCars.some(c => companionSeatsOf(c) > 0)) {
      activeCars.forEach(c => {
        const riders = assignments[c.name] || [];
        const bullets = buildNameBullets(c, riders);
        const people = carPeopleCount(c, riders);
        text += `■ ${c.name} (${people}名)\n`;
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
    for (let carName in currentAssignments) {
      currentAssignments[carName].forEach(k => {
        let orig = children.find(x => x.id === k.id);
        if (orig) {
          if (!orig.rideHistory) orig.rideHistory = {};
          orig.rideHistory[carName] = (orig.rideHistory[carName] || 0) + 1;
          orig.lastCar = carName;
        }
      });
    }
    saveData();
    renderChildren();
    updateStatusBar();
  }

  navigator.clipboard.writeText(lastGeneratedPlan).then(() => {
    alert("📋 LINE用テキストをコピーしました！\n今回の乗車履歴も正常に確定保存されました。");
  });
}
