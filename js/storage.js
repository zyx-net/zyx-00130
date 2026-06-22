const Storage = (function() {
  const PREFIX = 'pharmacy_shift_';

  const KEYS = {
    DRUGS: PREFIX + 'drugs',
    USERS: PREFIX + 'users',
    CURRENT_SHIFT: PREFIX + 'current_shift',
    SHIFT_HISTORY: PREFIX + 'shift_history',
    INVENTORY: PREFIX + 'inventory',
    DISCREPANCIES: PREFIX + 'discrepancies',
    AUDIT_LOGS: PREFIX + 'audit_logs',
    CURRENT_USER: PREFIX + 'current_user',
    INITIALIZED: PREFIX + 'initialized'
  };

  function get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (e) {
      console.error('Storage get error:', e);
      return defaultValue;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage set error:', e);
      return false;
    }
  }

  function remove(key) {
    localStorage.removeItem(key);
  }

  function generateId(prefix = 'id') {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function formatDateTime(date) {
    const d = new Date(date);
    const pad = n => n.toString().padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function getDrugs() {
    return get(KEYS.DRUGS, []);
  }

  function getDrugByCode(code) {
    const drugs = getDrugs();
    return drugs.find(d => d.code === code) || null;
  }

  function saveDrugs(drugs) {
    return set(KEYS.DRUGS, drugs);
  }

  function getUsers() {
    return get(KEYS.USERS, []);
  }

  function saveUsers(users) {
    return set(KEYS.USERS, users);
  }

  function getCurrentShift() {
    return get(KEYS.CURRENT_SHIFT, null);
  }

  function saveCurrentShift(shift) {
    return set(KEYS.CURRENT_SHIFT, shift);
  }

  function clearCurrentShift() {
    remove(KEYS.CURRENT_SHIFT);
  }

  function getShiftHistory() {
    return get(KEYS.SHIFT_HISTORY, []);
  }

  function saveShiftHistory(history) {
    return set(KEYS.SHIFT_HISTORY, history);
  }

  function addShiftToHistory(shift) {
    const history = getShiftHistory();
    history.unshift(shift);
    return saveShiftHistory(history);
  }

  function getInventory(shiftId) {
    const allInventory = get(KEYS.INVENTORY, {});
    return allInventory[shiftId] || [];
  }

  function saveInventory(shiftId, items) {
    const allInventory = get(KEYS.INVENTORY, {});
    allInventory[shiftId] = items;
    return set(KEYS.INVENTORY, allInventory);
  }

  function getDiscrepancies(shiftId) {
    const allDiscrepancies = get(KEYS.DISCREPANCIES, {});
    return allDiscrepancies[shiftId] || [];
  }

  function saveDiscrepancies(shiftId, items) {
    const allDiscrepancies = get(KEYS.DISCREPANCIES, {});
    allDiscrepancies[shiftId] = items;
    return set(KEYS.DISCREPANCIES, allDiscrepancies);
  }

  function getAuditLogs() {
    return get(KEYS.AUDIT_LOGS, []);
  }

  function addAuditLog(action, details, user) {
    const logs = getAuditLogs();
    const log = {
      id: generateId('audit'),
      action: action,
      details: details,
      userId: user ? user.id : null,
      userName: user ? user.name : '系统',
      userRole: user ? user.role : null,
      timestamp: new Date().toISOString(),
      timestampFormatted: formatDateTime(new Date())
    };
    logs.unshift(log);
    return set(KEYS.AUDIT_LOGS, logs);
  }

  function getCurrentUser() {
    return get(KEYS.CURRENT_USER, null);
  }

  function setCurrentUser(user) {
    return set(KEYS.CURRENT_USER, user);
  }

  function clearCurrentUser() {
    remove(KEYS.CURRENT_USER);
  }

  function isInitialized() {
    return get(KEYS.INITIALIZED, false);
  }

  function setInitialized(val) {
    return set(KEYS.INITIALIZED, val);
  }

  function initializeDemoData() {
    if (isInitialized()) {
      return false;
    }

    const drugs = [
      {
        id: 'drug_001',
        code: 'DRUG001',
        name: '阿莫西林胶囊',
        spec: '0.25g*24粒',
        type: 'normal',
        unit: '盒',
        initialStock: 100,
        manufacturer: '华北制药'
      },
      {
        id: 'drug_002',
        code: 'DRUG002',
        name: '布洛芬缓释胶囊',
        spec: '0.3g*20粒',
        type: 'normal',
        unit: '盒',
        initialStock: 80,
        manufacturer: '中美史克'
      },
      {
        id: 'drug_003',
        code: 'DRUG003',
        name: '维生素C片',
        spec: '0.1g*100片',
        type: 'normal',
        unit: '瓶',
        initialStock: 150,
        manufacturer: '东北制药'
      },
      {
        id: 'drug_004',
        code: 'DRUG004',
        name: '蒙脱石散',
        spec: '3g*10袋',
        type: 'normal',
        unit: '盒',
        initialStock: 60,
        manufacturer: '博福-益普生'
      },
      {
        id: 'drug_005',
        code: 'DRUG005',
        name: '盐酸吗啡注射液',
        spec: '10mg/1ml',
        type: 'controlled',
        unit: '支',
        initialStock: 30,
        manufacturer: '沈阳第一制药'
      },
      {
        id: 'drug_006',
        code: 'DRUG006',
        name: '盐酸哌替啶注射液',
        spec: '100mg/2ml',
        type: 'controlled',
        unit: '支',
        initialStock: 25,
        manufacturer: '宜昌人福药业'
      },
      {
        id: 'drug_007',
        code: 'DRUG007',
        name: '枸橼酸芬太尼注射液',
        spec: '0.1mg/2ml',
        type: 'controlled',
        unit: '支',
        initialStock: 40,
        manufacturer: '宜昌人福药业'
      },
      {
        id: 'drug_008',
        code: 'DRUG008',
        name: '氯硝西泮片',
        spec: '2mg*100片',
        type: 'controlled',
        unit: '瓶',
        initialStock: 20,
        manufacturer: '上海信谊'
      }
    ];

    const users = [
      {
        id: 'user_001',
        username: 'pharmacist',
        password: '123456',
        name: '张药师',
        role: 'pharmacist',
        roleName: '药师'
      },
      {
        id: 'user_002',
        username: 'nurse',
        password: '123456',
        name: '李护士',
        role: 'nurse',
        roleName: '护士'
      }
    ];

    saveDrugs(drugs);
    saveUsers(users);
    setInitialized(true);

    addAuditLog('系统初始化', '内置药品数据和用户数据已加载', null);

    return true;
  }

  function loadSampleData() {
    resetAllData();
    initializeDemoData();

    const users = getUsers();
    const drugs = getDrugs();
    const pharmacist = users.find(u => u.role === 'pharmacist');
    const nurse = users.find(u => u.role === 'nurse');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(8, 0, 0, 0);

    const historyShift = {
      id: 'shift_sample_001',
      name: '早班-20260621',
      status: 'closed',
      createdBy: pharmacist.id,
      createdByName: pharmacist.name,
      createdAt: yesterday.toISOString(),
      createdAtFormatted: formatDateTime(yesterday),
      closedAt: new Date(yesterday.getTime() + 8 * 60 * 60 * 1000).toISOString(),
      closedAtFormatted: formatDateTime(new Date(yesterday.getTime() + 8 * 60 * 60 * 1000)),
      closedBy: pharmacist.id,
      closedByName: pharmacist.name,
      receivedBy: nurse.id,
      receivedByName: nurse.name,
      receivedAt: new Date(yesterday.getTime() + 8.5 * 60 * 60 * 1000).toISOString(),
      receivedAtFormatted: formatDateTime(new Date(yesterday.getTime() + 8.5 * 60 * 60 * 1000)),
      note: '正常交班，无特殊情况',
      receiveNote: '已核对无误',
      summary: {
        totalDrugs: 8,
        controlledDrugs: 4,
        normalDrugs: 4,
        discrepancies: 2,
        resolvedDiscrepancies: 2
      }
    };

    const historyInventory = drugs.map(drug => {
      let actualQty = drug.initialStock;
      if (drug.code === 'DRUG001') actualQty = 95;
      if (drug.code === 'DRUG005') actualQty = 28;
      return {
        id: generateId('inv'),
        drugId: drug.id,
        drugCode: drug.code,
        drugName: drug.name,
        drugSpec: drug.spec,
        drugType: drug.type,
        unit: drug.unit,
        expectedQuantity: drug.initialStock,
        actualQuantity: actualQty,
        isCounted: true,
        countedAt: yesterday.toISOString(),
        countedBy: pharmacist.id,
        countedByName: pharmacist.name
      };
    });

    const historyDiscrepancies = [
      {
        id: 'disc_sample_001',
        drugId: drugs[0].id,
        drugCode: 'DRUG001',
        drugName: '阿莫西林胶囊',
        drugSpec: '0.25g*24粒',
        drugType: 'normal',
        unit: '盒',
        expectedQuantity: 100,
        actualQuantity: 95,
        difference: -5,
        status: 'resolved',
        resolution: '发药时误发2盒，已登记报损',
        resolvedBy: pharmacist.id,
        resolvedByName: pharmacist.name,
        resolvedAt: new Date(yesterday.getTime() + 6 * 60 * 60 * 1000).toISOString(),
        resolvedAtFormatted: formatDateTime(new Date(yesterday.getTime() + 6 * 60 * 60 * 1000)),
        createdAt: yesterday.toISOString(),
        createdBy: pharmacist.id,
        createdByName: pharmacist.name,
        corrections: []
      },
      {
        id: 'disc_sample_002',
        drugId: drugs[4].id,
        drugCode: 'DRUG005',
        drugName: '盐酸吗啡注射液',
        drugSpec: '10mg/1ml',
        drugType: 'controlled',
        unit: '支',
        expectedQuantity: 30,
        actualQuantity: 28,
        difference: -2,
        status: 'resolved',
        resolution: '病房领用未登记，已补登领用记录',
        resolvedBy: pharmacist.id,
        resolvedByName: pharmacist.name,
        resolvedAt: new Date(yesterday.getTime() + 7 * 60 * 60 * 1000).toISOString(),
        resolvedAtFormatted: formatDateTime(new Date(yesterday.getTime() + 7 * 60 * 60 * 1000)),
        createdAt: yesterday.toISOString(),
        createdBy: pharmacist.id,
        createdByName: pharmacist.name,
        corrections: [
          {
            id: 'corr_sample_001',
            oldActualQuantity: 29,
            newActualQuantity: 28,
            reason: '重新盘点发现少1支',
            requestedBy: nurse.id,
            requestedByName: nurse.name,
            requestedAt: new Date(yesterday.getTime() + 5 * 60 * 60 * 1000).toISOString(),
            requestedAtFormatted: formatDateTime(new Date(yesterday.getTime() + 5 * 60 * 60 * 1000)),
            status: 'approved',
            reviewedBy: pharmacist.id,
            reviewedByName: pharmacist.name,
            reviewedAt: new Date(yesterday.getTime() + 5.5 * 60 * 60 * 1000).toISOString(),
            reviewedAtFormatted: formatDateTime(new Date(yesterday.getTime() + 5.5 * 60 * 60 * 1000)),
            reviewNote: '同意修正，已核实'
          }
        ]
      }
    ];

    const history = [historyShift];
    saveShiftHistory(history);

    const allInventory = {};
    allInventory[historyShift.id] = historyInventory;
    set(KEYS.INVENTORY, allInventory);

    const allDiscrepancies = {};
    allDiscrepancies[historyShift.id] = historyDiscrepancies;
    set(KEYS.DISCREPANCIES, allDiscrepancies);

    const historyAuditLogs = [
      {
        id: generateId('audit'),
        action: '开班',
        details: '开班：早班-20260621，由 张药师 创建',
        userId: pharmacist.id,
        userName: pharmacist.name,
        userRole: pharmacist.role,
        timestamp: yesterday.toISOString(),
        timestampFormatted: formatDateTime(yesterday)
      },
      {
        id: generateId('audit'),
        action: '录入盘点数量',
        details: '药品 阿莫西林胶囊 (DRUG001) 盘点数量：95 盒',
        userId: pharmacist.id,
        userName: pharmacist.name,
        userRole: pharmacist.role,
        timestamp: new Date(yesterday.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        timestampFormatted: formatDateTime(new Date(yesterday.getTime() + 2 * 60 * 60 * 1000))
      },
      {
        id: generateId('audit'),
        action: '申请修正',
        details: '药品 盐酸吗啡注射液 申请修正：29 → 28，原因：重新盘点发现少1支',
        userId: nurse.id,
        userName: nurse.name,
        userRole: nurse.role,
        timestamp: new Date(yesterday.getTime() + 5 * 60 * 60 * 1000).toISOString(),
        timestampFormatted: formatDateTime(new Date(yesterday.getTime() + 5 * 60 * 60 * 1000))
      },
      {
        id: generateId('audit'),
        action: '批准修正',
        details: '批准 李护士 的修正申请：盐酸吗啡注射液 29 → 28',
        userId: pharmacist.id,
        userName: pharmacist.name,
        userRole: pharmacist.role,
        timestamp: new Date(yesterday.getTime() + 5.5 * 60 * 60 * 1000).toISOString(),
        timestampFormatted: formatDateTime(new Date(yesterday.getTime() + 5.5 * 60 * 60 * 1000))
      },
      {
        id: generateId('audit'),
        action: '处理差异',
        details: '药品 阿莫西林胶囊 差异已处理：发药时误发2盒，已登记报损',
        userId: pharmacist.id,
        userName: pharmacist.name,
        userRole: pharmacist.role,
        timestamp: new Date(yesterday.getTime() + 6 * 60 * 60 * 1000).toISOString(),
        timestampFormatted: formatDateTime(new Date(yesterday.getTime() + 6 * 60 * 60 * 1000))
      },
      {
        id: generateId('audit'),
        action: '处理差异',
        details: '药品 盐酸吗啡注射液 差异已处理：病房领用未登记，已补登领用记录',
        userId: pharmacist.id,
        userName: pharmacist.name,
        userRole: pharmacist.role,
        timestamp: new Date(yesterday.getTime() + 7 * 60 * 60 * 1000).toISOString(),
        timestampFormatted: formatDateTime(new Date(yesterday.getTime() + 7 * 60 * 60 * 1000))
      },
      {
        id: generateId('audit'),
        action: '关班',
        details: '关班：早班-20260621，由 张药师 关闭',
        userId: pharmacist.id,
        userName: pharmacist.name,
        userRole: pharmacist.role,
        timestamp: new Date(yesterday.getTime() + 8 * 60 * 60 * 1000).toISOString(),
        timestampFormatted: formatDateTime(new Date(yesterday.getTime() + 8 * 60 * 60 * 1000))
      },
      {
        id: generateId('audit'),
        action: '交班签收',
        details: '班次 早班-20260621 已由 李护士 签收',
        userId: nurse.id,
        userName: nurse.name,
        userRole: nurse.role,
        timestamp: new Date(yesterday.getTime() + 8.5 * 60 * 60 * 1000).toISOString(),
        timestampFormatted: formatDateTime(new Date(yesterday.getTime() + 8.5 * 60 * 60 * 1000))
      }
    ];
    set(KEYS.AUDIT_LOGS, historyAuditLogs);

    addAuditLog('加载演示数据', '已加载演示样例数据，包含1个历史班次', null);

    return true;
  }

  function resetAllData() {
    Object.values(KEYS).forEach(key => remove(key));
  }

  return {
    KEYS,
    get,
    set,
    remove,
    generateId,
    formatDateTime,
    getDrugs,
    getDrugByCode,
    saveDrugs,
    getUsers,
    saveUsers,
    getCurrentShift,
    saveCurrentShift,
    clearCurrentShift,
    getShiftHistory,
    saveShiftHistory,
    addShiftToHistory,
    getInventory,
    saveInventory,
    getDiscrepancies,
    saveDiscrepancies,
    getAuditLogs,
    addAuditLog,
    getCurrentUser,
    setCurrentUser,
    clearCurrentUser,
    isInitialized,
    setInitialized,
    initializeDemoData,
    loadSampleData,
    resetAllData
  };
})();
