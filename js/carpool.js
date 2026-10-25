let lastGeneratedPlan = "";
let currentAssignments = null;

function occupiedSeats(list) {
  return (list || []).reduce((sum, k) => sum + seatCost(k), 0);
}

function remainingSeats(car, assignments) {
  return (parseInt(car.capacity) || 0) - occupiedSeats(assignments[car.name] || []);
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

    const totalCap = activeCars.reduce((sum, c) => sum + (parseInt(c.capacity) || 0), 0);
    const seatDemand = ridingKids.reduce((sum, c) => sum + seatCost(c), 0);
    if (totalCap < seatDemand) {
      alert(`座席が足りません！\n乗車人数: ${seatDemand}人（選手＋同乗保護者）\n乗車定員: ${totalCap}席\nあと ${seatDemand - totalCap} 席の車が必要です。`);
      return;
    }

    // 1. 各車両に乗せる「目標座席数」を均等計算（同乗保護者分も含む）
    let targetCounts = {};
    let baseCount = Math.floor(seatDemand / activeCars.length);
    let remainder = seatDemand % activeCars.length;

    let sortedCars = [...activeCars].sort((a, b) => (parseInt(b.capacity) || 0) - (parseInt(a.capacity) || 0));
    sortedCars.forEach((c, idx) => {
      let ideal = baseCount + (idx < remainder ? 1 : 0);
      targetCounts[c.name] = Math.min(ideal, parseInt(c.capacity) || 0);
    });

    activeCars.forEach(c => {
      assignments[c.name] = [];
      currentCaps[c.name] = targetCounts[c.name];
    });

    let unassigned = [...ridingKids];

    // 2. 親の車が出ている子供を最優先固定
    for (let i = unassigned.length - 1; i >= 0; i--) {
      let kid = unassigned[i];
      let parentCarObj = activeCars.find(c => c.name === kid.parentCar);
      if (parentCarObj) {
        let cost = seatCost(kid);
        if (remainingSeats(parentCarObj, assignments) >= cost) {
          placeKid(kid, parentCarObj.name, assignments, currentCaps);
          unassigned.splice(i, 1);
        }
      }
    }

    // 3. 親の車がない「車酔いの子」を優先配備
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

    // 4. モード別ソート
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

    // 5. 残りの選手を割り当て（最低2人優先・過去履歴の公平化・モード別スコア）
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

        if (occupiedSeats(assignments[a.name]) < 2) scoreA -= 2000;
        if (occupiedSeats(assignments[b.name]) < 2) scoreB -= 2000;

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
        return occupiedSeats(assignments[a.name]) - occupiedSeats(assignments[b.name]);
      });

      placeKid(kid, availableCars[0].name, assignments, currentCaps);
    });
  }

  currentAssignments = assignments;

  // 結果テキストの生成（画面上の車の並び順通りに出力）
  let hasMotionSick = ridingKids.some(k => k.motionSick);
  let text = `【連絡】本日の配車です🚗\n---------------------\n`;

  if (ridingKids.length > 0) {
    activeCars.forEach(c => {
      let carName = c.name;
      let riders = assignments[carName] || [];
      let names = riders.map(formatRiderLabel).join('、');
      let people = occupiedSeats(riders);
      text += `■ ${carName} (${people}名)\n  乗車: ${names || 'なし'}\n\n`;
    });
  } else {
    text += "本日の乗車配車はありません。\n\n";
  }

  if (onSiteKids.length > 0) {
    text += `【現地集合】${onSiteKids.map(k => k.name).join('、')}\n\n`;
  }

  if (hasMotionSick) {
    text += "※「🤢」マークの選手は助手席または前寄りの座席をお願いします。\n";
  }
  text += "---------------------\nよろしくお願いいたします！";

  lastGeneratedPlan = text;
  document.getElementById('resultText').innerText = text;
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
