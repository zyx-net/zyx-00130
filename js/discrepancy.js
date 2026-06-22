const Discrepancy = (function() {

  function getDiscrepancies(shiftId) {
    return Storage.getDiscrepancies(shiftId);
  }

  function getDiscrepanciesForCurrentShift() {
    const shift = Shift.getCurrentShift();
    if (!shift) return [];
    return getDiscrepancies(shift.id);
  }

  function getDiscrepanciesByType(type) {
    const items = getDiscrepanciesForCurrentShift();
    if (!type) return items;
    return items.filter(d => d.drugType === type);
  }

  function getDiscrepancyById(discrepancyId) {
    const items = getDiscrepanciesForCurrentShift();
    return items.find(d => d.id === discrepancyId) || null;
  }

  function resolveDiscrepancy(discrepancyId, resolution) {
    const user = Auth.getCurrentUser();
    if (!user) {
      return { success: false, message: '请先登录' };
    }

    if (!Auth.canResolveDiscrepancy()) {
      return { success: false, message: '只有药师可以处理差异' };
    }

    const shift = Shift.getCurrentShift();
    if (!shift) {
      return { success: false, message: '请先开班' };
    }

    if (shift.status === Shift.STATUS.CLOSED) {
      return { success: false, message: '班次已关闭，无法处理差异' };
    }

    if (!resolution || resolution.trim() === '') {
      return { success: false, message: '请输入处理说明' };
    }

    const discrepancies = getDiscrepancies(shift.id);
    const discrepancy = discrepancies.find(d => d.id === discrepancyId);

    if (!discrepancy) {
      return { success: false, message: '差异记录不存在' };
    }

    const now = new Date();
    discrepancy.status = 'resolved';
    discrepancy.resolution = resolution.trim();
    discrepancy.resolvedBy = user.id;
    discrepancy.resolvedByName = user.name;
    discrepancy.resolvedAt = now.toISOString();
    discrepancy.resolvedAtFormatted = Storage.formatDateTime(now);

    Storage.saveDiscrepancies(shift.id, discrepancies);

    Storage.addAuditLog(
      '处理差异',
      `药品 ${discrepancy.drugName} 差异已处理：${resolution}`,
      user
    );

    return { success: true, discrepancy: discrepancy };
  }

  function requestCorrection(discrepancyId, newActualQuantity, reason) {
    const user = Auth.getCurrentUser();
    if (!user) {
      return { success: false, message: '请先登录' };
    }

    const shift = Shift.getCurrentShift();
    if (!shift) {
      return { success: false, message: '请先开班' };
    }

    if (shift.status === Shift.STATUS.CLOSED) {
      return { success: false, message: '班次已关闭，无法申请修正' };
    }

    const qty = parseInt(newActualQuantity, 10);
    if (isNaN(qty) || qty < 0) {
      return { success: false, message: '请输入有效的非负数量' };
    }

    const discrepancies = getDiscrepancies(shift.id);
    const discrepancy = discrepancies.find(d => d.id === discrepancyId);

    if (!discrepancy) {
      return { success: false, message: '差异记录不存在' };
    }

    const correction = {
      id: Storage.generateId('corr'),
      oldActualQuantity: discrepancy.actualQuantity,
      newActualQuantity: qty,
      reason: reason || '',
      requestedBy: user.id,
      requestedByName: user.name,
      requestedAt: new Date().toISOString(),
      requestedAtFormatted: Storage.formatDateTime(new Date()),
      status: 'pending',
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      reviewNote: null
    };

    if (!discrepancy.corrections) {
      discrepancy.corrections = [];
    }
    discrepancy.corrections.push(correction);

    Storage.saveDiscrepancies(shift.id, discrepancies);

    Storage.addAuditLog(
      '申请修正',
      `药品 ${discrepancy.drugName} 申请修正：${discrepancy.actualQuantity} → ${qty}，原因：${reason || '未填写'}`,
      user
    );

    return { success: true, correction: correction };
  }

  function reviewCorrection(discrepancyId, correctionId, approved, reviewNote) {
    const user = Auth.getCurrentUser();
    if (!user) {
      return { success: false, message: '请先登录' };
    }

    if (!Auth.canApproveCorrection()) {
      return { success: false, message: '只有药师可以审批修正申请' };
    }

    const shift = Shift.getCurrentShift();
    if (!shift) {
      return { success: false, message: '请先开班' };
    }

    if (shift.status === Shift.STATUS.CLOSED) {
      return { success: false, message: '班次已关闭' };
    }

    const discrepancies = getDiscrepancies(shift.id);
    const discrepancy = discrepancies.find(d => d.id === discrepancyId);

    if (!discrepancy) {
      return { success: false, message: '差异记录不存在' };
    }

    const correction = discrepancy.corrections.find(c => c.id === correctionId);

    if (!correction) {
      return { success: false, message: '修正申请不存在' };
    }

    if (correction.status !== 'pending') {
      return { success: false, message: '该申请已被处理' };
    }

    const now = new Date();
    correction.status = approved ? 'approved' : 'rejected';
    correction.reviewedBy = user.id;
    correction.reviewedByName = user.name;
    correction.reviewedAt = now.toISOString();
    correction.reviewedAtFormatted = Storage.formatDateTime(now);
    correction.reviewNote = reviewNote || '';

    if (approved) {
      discrepancy.actualQuantity = correction.newActualQuantity;
      discrepancy.difference = correction.newActualQuantity - discrepancy.expectedQuantity;

      if (discrepancy.difference === 0 && discrepancy.status === 'pending') {
        // 差异消除后无需处理
      }

      const inventory = Storage.getInventory(shift.id);
      const invItem = inventory.find(i => i.drugId === discrepancy.drugId);
      if (invItem) {
        invItem.actualQuantity = correction.newActualQuantity;
        Storage.saveInventory(shift.id, inventory);
      }

      Storage.addAuditLog(
        '批准修正',
        `批准 ${correction.requestedByName} 的修正申请：${discrepancy.drugName} ${correction.oldActualQuantity} → ${correction.newActualQuantity}`,
        user
      );
    } else {
      Storage.addAuditLog(
        '拒绝修正',
        `拒绝 ${correction.requestedByName} 的修正申请：${discrepancy.drugName}，原因：${reviewNote || '未说明'}`,
        user
      );
    }

    Storage.saveDiscrepancies(shift.id, discrepancies);

    return { success: true, correction: correction };
  }

  function getDiscrepancyStats() {
    const items = getDiscrepanciesForCurrentShift();
    const total = items.length;
    const pending = items.filter(d => d.status === 'pending').length;
    const resolved = items.filter(d => d.status === 'resolved').length;
    const controlled = items.filter(d => d.drugType === 'controlled').length;
    const controlledPending = items.filter(d => d.drugType === 'controlled' && d.status === 'pending').length;
    const normal = items.filter(d => d.drugType === 'normal').length;
    const normalPending = items.filter(d => d.drugType === 'normal' && d.status === 'pending').length;

    let pendingCorrections = 0;
    items.forEach(d => {
      if (d.corrections) {
        pendingCorrections += d.corrections.filter(c => c.status === 'pending').length;
      }
    });

    return {
      total,
      pending,
      resolved,
      controlled,
      controlledPending,
      normal,
      normalPending,
      pendingCorrections
    };
  }

  function getStatusText(status) {
    switch (status) {
      case 'pending': return '待处理';
      case 'resolved': return '已处理';
      default: return '未知';
    }
  }

  function getCorrectionStatusText(status) {
    switch (status) {
      case 'pending': return '待审批';
      case 'approved': return '已批准';
      case 'rejected': return '已拒绝';
      default: return '未知';
    }
  }

  return {
    getDiscrepancies,
    getDiscrepanciesForCurrentShift,
    getDiscrepanciesByType,
    getDiscrepancyById,
    resolveDiscrepancy,
    requestCorrection,
    reviewCorrection,
    getDiscrepancyStats,
    getStatusText,
    getCorrectionStatusText
  };
})();
