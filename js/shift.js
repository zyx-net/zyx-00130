const Shift = (function() {

  const STATUS = {
    ACTIVE: 'active',
    PENDING_CLOSE: 'pending_close',
    CLOSED: 'closed'
  };

  function getCurrentShift() {
    return Storage.getCurrentShift();
  }

  function hasActiveShift() {
    const shift = getCurrentShift();
    return shift && shift.status !== STATUS.CLOSED;
  }

  function openShift(shiftName, note = '') {
    const user = Auth.getCurrentUser();
    if (!user) {
      return { success: false, message: '请先登录' };
    }

    const permission = Auth.requirePharmacist();
    if (!permission.allowed) {
      Storage.addAuditLog('越权拦截', `用户 ${user.name} (${user.roleName}) 尝试开班，已被拒绝`, user);
      return { success: false, message: permission.message };
    }

    if (hasActiveShift()) {
      return { success: false, message: '当前已有进行中的班次，请先完成交班' };
    }

    const now = new Date();
    const shift = {
      id: Storage.generateId('shift'),
      name: shiftName || '班次-' + formatDate(now),
      status: STATUS.ACTIVE,
      createdBy: user.id,
      createdByName: user.name,
      createdAt: now.toISOString(),
      createdAtFormatted: Storage.formatDateTime(now),
      closedAt: null,
      closedAtFormatted: null,
      closedBy: null,
      closedByName: null,
      receivedBy: null,
      receivedByName: null,
      receivedAt: null,
      receivedAtFormatted: null,
      note: note,
      summary: {
        totalDrugs: 0,
        controlledDrugs: 0,
        normalDrugs: 0,
        discrepancies: 0,
        resolvedDiscrepancies: 0
      }
    };

    Storage.saveCurrentShift(shift);
    Storage.addAuditLog('开班', `开班：${shift.name}，由 ${user.name} 创建`, user);

    return { success: true, shift: shift };
  }

  function closeShift() {
    const user = Auth.getCurrentUser();
    if (!user) {
      return { success: false, message: '请先登录' };
    }

    const permission = Auth.requirePharmacist();
    if (!permission.allowed) {
      return { success: false, message: permission.message };
    }

    const shift = getCurrentShift();
    if (!shift || shift.status === STATUS.CLOSED) {
      return { success: false, message: '没有可关闭的班次' };
    }

    const discrepancies = Storage.getDiscrepancies(shift.id);
    const controlledDiscrepancies = discrepancies.filter(d => d.drugType === 'controlled');
    const unresolvedControlled = controlledDiscrepancies.filter(d => d.status !== 'resolved');

    if (unresolvedControlled.length > 0) {
      return {
        success: false,
        message: '存在未解决的受控药品差异，无法关班。请先处理所有受控药品差异。'
      };
    }

    const now = new Date();
    shift.status = STATUS.CLOSED;
    shift.closedAt = now.toISOString();
    shift.closedAtFormatted = Storage.formatDateTime(now);
    shift.closedBy = user.id;
    shift.closedByName = user.name;

    const inventory = Storage.getInventory(shift.id);
    const allDiscrepancies = Storage.getDiscrepancies(shift.id);

    shift.summary = {
      totalDrugs: inventory.length,
      controlledDrugs: inventory.filter(i => i.drugType === 'controlled').length,
      normalDrugs: inventory.filter(i => i.drugType === 'normal').length,
      discrepancies: allDiscrepancies.length,
      resolvedDiscrepancies: allDiscrepancies.filter(d => d.status === 'resolved').length
    };

    Storage.saveCurrentShift(shift);
    Storage.addShiftToHistory(shift);
    Storage.addAuditLog('关班', `关班：${shift.name}，由 ${user.name} 关闭`, user);

    return { success: true, shift: shift };
  }

  function receiveShift(signatureNote = '') {
    const user = Auth.getCurrentUser();
    if (!user) {
      return { success: false, message: '请先登录' };
    }

    const shift = getCurrentShift();
    if (!shift) {
      return { success: false, message: '没有待签收的班次' };
    }

    if (shift.status !== STATUS.CLOSED) {
      return { success: false, message: '班次尚未关闭，无法签收' };
    }

    const now = new Date();
    shift.receivedBy = user.id;
    shift.receivedByName = user.name;
    shift.receivedAt = now.toISOString();
    shift.receivedAtFormatted = Storage.formatDateTime(now);
    shift.receiveNote = signatureNote;

    Storage.saveCurrentShift(shift);

    const history = Storage.getShiftHistory();
    const idx = history.findIndex(s => s.id === shift.id);
    if (idx >= 0) {
      history[idx] = shift;
      Storage.saveShiftHistory(history);
    }

    Storage.addAuditLog('交班签收', `班次 ${shift.name} 已由 ${user.name} 签收`, user);

    return { success: true, shift: shift };
  }

  function getShiftHistory() {
    return Storage.getShiftHistory();
  }

  function canCloseCurrentShift() {
    const shift = getCurrentShift();
    if (!shift || shift.status === STATUS.CLOSED) return false;

    const discrepancies = Storage.getDiscrepancies(shift.id);
    const controlledDiscrepancies = discrepancies.filter(d => d.drugType === 'controlled');
    const unresolvedControlled = controlledDiscrepancies.filter(d => d.status !== 'resolved');

    return unresolvedControlled.length === 0;
  }

  function formatDate(date) {
    const d = new Date(date);
    const pad = n => n.toString().padStart(2, '0');
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  function getStatusText(status) {
    switch (status) {
      case STATUS.ACTIVE: return '进行中';
      case STATUS.PENDING_CLOSE: return '待关闭';
      case STATUS.CLOSED: return '已关闭';
      default: return '未知';
    }
  }

  function getStatusClass(status) {
    switch (status) {
      case STATUS.ACTIVE: return 'status-active';
      case STATUS.PENDING_CLOSE: return 'status-pending';
      case STATUS.CLOSED: return 'status-closed';
      default: return '';
    }
  }

  return {
    STATUS,
    getCurrentShift,
    hasActiveShift,
    openShift,
    closeShift,
    receiveShift,
    getShiftHistory,
    canCloseCurrentShift,
    getStatusText,
    getStatusClass
  };
})();
