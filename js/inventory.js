const Inventory = (function() {

  function getInventory(shiftId) {
    return Storage.getInventory(shiftId);
  }

  function getInventoryForCurrentShift() {
    const shift = Shift.getCurrentShift();
    if (!shift) return [];
    return getInventory(shift.id);
  }

  function initializeInventory() {
    const shift = Shift.getCurrentShift();
    if (!shift) {
      return { success: false, message: '请先开班' };
    }

    const existing = getInventory(shift.id);
    if (existing.length > 0) {
      return { success: true, items: existing };
    }

    const drugs = Storage.getDrugs();
    const items = drugs.map(drug => ({
      id: Storage.generateId('inv'),
      drugId: drug.id,
      drugCode: drug.code,
      drugName: drug.name,
      drugSpec: drug.spec,
      drugType: drug.type,
      unit: drug.unit,
      expectedQuantity: drug.initialStock,
      actualQuantity: null,
      isCounted: false,
      countedAt: null,
      countedBy: null,
      countedByName: null
    }));

    Storage.saveInventory(shift.id, items);

    return { success: true, items: items };
  }

  function updateActualQuantity(inventoryId, actualQuantity) {
    const user = Auth.getCurrentUser();
    if (!user) {
      return { success: false, message: '请先登录' };
    }

    if (!Auth.canEditInventory()) {
      return { success: false, message: '无权限操作' };
    }

    const shift = Shift.getCurrentShift();
    if (!shift) {
      return { success: false, message: '请先开班' };
    }

    if (shift.status === Shift.STATUS.CLOSED) {
      return { success: false, message: '班次已关闭，无法修改' };
    }

    const qty = parseInt(actualQuantity, 10);
    if (isNaN(qty)) {
      return { success: false, message: '请输入有效数字' };
    }

    if (qty < 0) {
      return { success: false, message: '数量不能为负数' };
    }

    const items = getInventory(shift.id);
    const item = items.find(i => i.id === inventoryId);

    if (!item) {
      return { success: false, message: '盘点记录不存在' };
    }

    const drug = Storage.getDrugByCode(item.drugCode);
    if (!drug) {
      return { success: false, message: '未知药品编码，无法保存' };
    }

    const oldQty = item.actualQuantity;
    item.actualQuantity = qty;
    item.isCounted = true;
    item.countedAt = new Date().toISOString();
    item.countedBy = user.id;
    item.countedByName = user.name;

    Storage.saveInventory(shift.id, items);

    updateOrCreateDiscrepancy(shift.id, item, oldQty, user);

    Storage.addAuditLog(
      '录入盘点数量',
      `药品 ${item.drugName} (${item.drugCode}) 盘点数量：${qty} ${item.unit}`,
      user
    );

    return { success: true, item: item };
  }

  function updateOrCreateDiscrepancy(shiftId, inventoryItem, oldQty, user) {
    const discrepancies = Storage.getDiscrepancies(shiftId);
    const expectedQty = inventoryItem.expectedQuantity;
    const actualQty = inventoryItem.actualQuantity;
    const diff = actualQty - expectedQty;

    let discrepancy = discrepancies.find(d => d.drugId === inventoryItem.drugId);

    if (diff === 0) {
      if (discrepancy) {
        const idx = discrepancies.indexOf(discrepancy);
        if (discrepancy.status !== 'resolved') {
          discrepancies.splice(idx, 1);
        }
      }
    } else {
      if (!discrepancy) {
        discrepancy = {
          id: Storage.generateId('disc'),
          drugId: inventoryItem.drugId,
          drugCode: inventoryItem.drugCode,
          drugName: inventoryItem.drugName,
          drugSpec: inventoryItem.drugSpec,
          drugType: inventoryItem.drugType,
          unit: inventoryItem.unit,
          expectedQuantity: expectedQty,
          actualQuantity: actualQty,
          difference: diff,
          status: 'pending',
          resolution: null,
          resolvedBy: null,
          resolvedByName: null,
          resolvedAt: null,
          createdAt: new Date().toISOString(),
          createdBy: user.id,
          createdByName: user.name,
          corrections: []
        };
        discrepancies.push(discrepancy);
      } else {
        discrepancy.expectedQuantity = expectedQty;
        discrepancy.actualQuantity = actualQty;
        discrepancy.difference = diff;
        if (discrepancy.status === 'resolved') {
          discrepancy.status = 'pending';
          discrepancy.resolution = null;
          discrepancy.resolvedBy = null;
          discrepancy.resolvedByName = null;
          discrepancy.resolvedAt = null;
        }
      }
    }

    Storage.saveDiscrepancies(shiftId, discrepancies);
  }

  function getInventoryByType(type) {
    const items = getInventoryForCurrentShift();
    if (!type) return items;
    return items.filter(i => i.drugType === type);
  }

  function getInventoryStats() {
    const items = getInventoryForCurrentShift();
    const total = items.length;
    const counted = items.filter(i => i.isCounted).length;
    const controlled = items.filter(i => i.drugType === 'controlled').length;
    const controlledCounted = items.filter(i => i.drugType === 'controlled' && i.isCounted).length;
    const normal = items.filter(i => i.drugType === 'normal').length;
    const normalCounted = items.filter(i => i.drugType === 'normal' && i.isCounted).length;

    return {
      total,
      counted,
      remaining: total - counted,
      controlled,
      controlledCounted,
      normal,
      normalCounted,
      progress: total > 0 ? Math.round((counted / total) * 100) : 0
    };
  }

  function getInventoryItemByDrugCode(drugCode) {
    const items = getInventoryForCurrentShift();
    return items.find(i => i.drugCode === drugCode) || null;
  }

  return {
    getInventory,
    getInventoryForCurrentShift,
    initializeInventory,
    updateActualQuantity,
    getInventoryByType,
    getInventoryStats,
    getInventoryItemByDrugCode
  };
})();
