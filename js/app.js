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
    case 'remove-preassign':
      removePreassign(id);
      break;
    case 'add-family':
      addFamilySeat(id);
      break;
    case 'remove-family':
      removeFamilySeat(id);
      break;
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
    case 'toggle-guardian':
      toggleGuardianRide(id);
      break;
    case 'set-fixed-car':
      setChildFixedCar(id, target.value);
      break;
    case 'add-preassign':
      addPreassign(id, target.value);
      break;
    default:
      break;
  }
}

function initApp() {
  document.body.addEventListener('click', handleAppClick);
  document.body.addEventListener('change', handleAppChange);
  renderCars();
  renderChildren();
  updateStatusBar();
}

initApp();
