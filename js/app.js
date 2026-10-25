function handleAppClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const id = Number(target.dataset.id);
  switch (target.dataset.action) {
    case 'clear-checks':
      clearAllChecks();
      break;
    case 'manual-save':
      manualSave();
      break;
    case 'sort-cars':
      sortCarsByName();
      break;
    case 'sort-grade':
      sortChildrenByGrade();
      break;
    case 'sort-name':
      sortChildrenByName();
      break;
    case 'promote':
      promoteAllGrades();
      break;
    case 'add-car':
      addCar();
      break;
    case 'add-child':
      addChild();
      break;
    case 'generate':
      generateCarpool();
      break;
    case 'copy-result':
      copyResult();
      break;
    case 'reset-data':
      resetAllData();
      break;
    case 'copy-backup':
      copyBackupData();
      break;
    case 'open-restore':
      openRestoreModal();
      break;
    case 'close-restore':
      closeRestoreModal();
      break;
    case 'apply-restore':
      applyRestore();
      break;
    case 'close-modal':
      closeEditModal();
      break;
    case 'save-child':
      saveEditChild();
      break;
    case 'delete-car':
      deleteCar(id);
      break;
    case 'edit-child':
      openEditModal(id);
      break;
    case 'delete-child':
      deleteChild(id);
      break;
    case 'add-companion':
      addCompanion(id, target.dataset.label || '');
      break;
    case 'add-companion-custom':
      addCompanionCustom(id);
      break;
    case 'remove-companion': {
      const carId = Number(target.dataset.carId);
      const companionId = target.dataset.companionId;
      removeCompanion(carId, companionId);
      break;
    }
    default:
      break;
  }
}

function handleAppChange(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const id = Number(target.dataset.id);
  switch (target.dataset.action) {
    case 'toggle-car':
      toggleCar(id);
      break;
    case 'update-capacity':
      updateCapacity(id, target.value);
      break;
    case 'set-attend':
      setChildAttend(id, target.value);
      break;
    case 'set-fixed-car':
      setChildFixedCar(id, target.value);
      break;
    case 'toggle-guardian':
      toggleGuardianRide(id);
      break;
    case 'set-guardian-name':
      setGuardianName(id, target.value);
      break;
    default:
      break;
  }
}

function handleAppInput(event) {
  const target = event.target.closest('[data-action="set-guardian-name"]');
  if (!target) return;
  setGuardianName(Number(target.dataset.id), target.value);
}

function initApp() {
  document.body.addEventListener('click', handleAppClick);
  document.body.addEventListener('change', handleAppChange);
  document.body.addEventListener('input', handleAppInput);
  document.body.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const input = event.target.closest('.companion-input');
    if (!input || !input.id) return;
    const match = input.id.match(/^companionInput-(\d+)$/);
    if (!match) return;
    event.preventDefault();
    addCompanionCustom(Number(match[1]));
  });
  renderCars();
  renderChildren();
  updateStatusBar();
}

initApp();
