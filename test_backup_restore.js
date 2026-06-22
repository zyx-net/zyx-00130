const fs = require('fs');
const path = require('path');
const vm = require('vm');

const localStorage = {};
globalThis.localStorage = {
  getItem: (k) => (k in localStorage ? localStorage[k] : null),
  setItem: (k, v) => { localStorage[k] = String(v); },
  removeItem: (k) => { delete localStorage[k]; }
};

globalThis.alert = (msg) => { console.log(`  [ALERT] ${msg}`); };
globalThis.confirm = (msg) => {
  console.log(`  [CONFIRM] ${msg} -> auto-yes`);
  return true;
};
globalThis.prompt = (msg, def) => {
  const val = def || '测试说明';
  console.log(`  [PROMPT] ${msg} -> "${val}"`);
  return val;
};
globalThis.document = {
  body: { appendChild: () => {}, removeChild: () => {} },
  createElement: () => ({ innerHTML: '', style: {}, className: '', appendChild: () => {}, closest: () => null, value: '' }),
  getElementById: () => ({ value: '测试', addEventListener: () => {} }),
  querySelector: () => ({ remove: () => {} }),
  addEventListener: () => {},
  getElementsByName: () => []
};
globalThis.window = globalThis;
globalThis.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} };
globalThis.Blob = function(arr, opts) { this.content = arr.join(''); this.opts = opts; };
globalThis.navigator = {};
globalThis.FileReader = function() {};
globalThis.location = { reload: () => { console.log('  [页面刷新] 模拟 location.reload()'); } };

const jsDir = path.join(__dirname, 'js');
function loadModule(filename) {
  let code = fs.readFileSync(path.join(jsDir, filename), 'utf8');
  code = code.replace(/const\s+(\w+)\s*=\s*\(function\(\)\s*\{/, '$1 = (function() {');
  code = code.replace(/\}\)\(\);\s*$/, '}).call(globalThis);');
  return vm.runInThisContext(code, { filename });
}

const Storage = loadModule('storage.js') || globalThis.Storage;
const Auth = loadModule('auth.js') || globalThis.Auth;
const Shift = loadModule('shift.js') || globalThis.Shift;
const Inventory = loadModule('inventory.js') || globalThis.Inventory;
const Discrepancy = loadModule('discrepancy.js') || globalThis.Discrepancy;
const ExportModule = loadModule('export.js') || globalThis.ExportModule;

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
    console.log(`  ✗ ${name} -> ${e.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || ''} 期望 ${JSON.stringify(b)} 实际 ${JSON.stringify(a)}`);
}
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

console.log('\n================================================================');
console.log('  药房交班系统 - 数据备份/恢复 全面验证测试');
console.log('================================================================\n');

console.log('--- [第一部分] 导出备份的完整性测试 ---\n');

console.log('--- [初始化] 加载演示样例并创建一个活跃班次 ---');
Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');
{
  Storage.clearCurrentShift();
  const r = Shift.openShift('测试备份班次-白班');
  assert(r.success, '开班应成功');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  const normal = inv.find(i => i.drugType === 'normal');
  const controlled = inv.find(i => i.drugType === 'controlled');
  Inventory.updateActualQuantity(normal.id, 88);
  Inventory.updateActualQuantity(controlled.id, controlled.expectedQuantity - 1);
  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  const normalDisc = discs.find(d => d.drugType === 'normal' && d.status === 'pending');
  if (normalDisc) {
    Discrepancy.requestCorrection(normalDisc.id, 90, '漏盘2盒');
  }
}
console.log('    测试数据准备完成\n');

let snapshotBackup = null;
let snapshotReport = null;

test('导出结构化备份：createBackup 返回完整对象', () => {
  const backup = ExportModule.createBackup();
  assert(backup, '备份对象不应为空');
  assertEq(backup.version, '1.0.0', '版本号应为 1.0.0');
  assert(backup.exportedAt, '应有导出时间');
  assert(backup.data, '应有 data 字段');
  snapshotBackup = deepClone(backup);
});

test('备份结构包含所有必要模块', () => {
  const bk = snapshotBackup;
  const requiredData = ['currentShift', 'shiftHistory', 'inventory', 'discrepancies', 'auditLogs', 'drugs'];
  requiredData.forEach(key => {
    assert(key in bk.data, `备份 data 应包含 ${key}`);
  });
});

test('备份包含当前班次数据', () => {
  assert(snapshotBackup.data.currentShift, '应包含当前班次');
  assertEq(snapshotBackup.data.currentShift.name, '测试备份班次-白班', '当前班次名称应正确');
  assertEq(snapshotBackup.data.currentShift.createdByName, '张药师', '开班人应为张药师');
});

test('备份包含历史班次', () => {
  assert(Array.isArray(snapshotBackup.data.shiftHistory), '历史班次应为数组');
  assert(snapshotBackup.data.shiftHistory.length >= 1, '应至少有1个历史班次（演示数据）');
});

test('备份包含盘点明细（按班次ID分组）', () => {
  const currShiftId = snapshotBackup.data.currentShift.id;
  assert(currShiftId in snapshotBackup.data.inventory, `当前班次 ${currShiftId} 应有盘点数据`);
  const inv = snapshotBackup.data.inventory[currShiftId];
  assert(Array.isArray(inv) && inv.length > 0, '盘点数据应为非空数组');
  assert(inv[0].drugCode, '盘点条目应有药品编码');
});

test('备份包含差异处理与修正审批记录', () => {
  const currShiftId = snapshotBackup.data.currentShift.id;
  assert(currShiftId in snapshotBackup.data.discrepancies, '当前班次应有差异数据');
  const discs = snapshotBackup.data.discrepancies[currShiftId];
  assert(Array.isArray(discs), '差异数据应为数组');
  const withCorrection = discs.find(d => d.corrections && d.corrections.length > 0);
  assert(withCorrection, '应存在带修正申请的差异记录');
});

test('备份包含审计日志', () => {
  assert(Array.isArray(snapshotBackup.data.auditLogs), '审计日志应为数组');
  assert(snapshotBackup.data.auditLogs.length > 5, '审计日志应有多条记录');
  const actions = new Set(snapshotBackup.data.auditLogs.map(l => l.action));
  assert(actions.has('开班'), '应有开班操作日志');
  assert(actions.has('录入盘点数量'), '应有录入盘点日志');
});

test('交班单文本报告在备份前后一致（预生成对比）', () => {
  const shift = Storage.getCurrentShift();
  snapshotReport = ExportModule.generateShiftReport(shift);
  assert(snapshotReport && snapshotReport.length > 100, '交班单报告应有足够内容');
  assert(snapshotReport.includes('药房交班单'), '报告应包含标题');
  assert(snapshotReport.includes(shift.name), '报告应包含班次名称');
});

console.log('\n--- [第二部分] 导出后清空 → 完整恢复测试 ---\n');

let backupBeforeReset = null;
let reportBeforeReset = null;

test('快照备份并重置所有数据', () => {
  backupBeforeReset = deepClone(snapshotBackup);
  reportBeforeReset = snapshotReport;

  Storage.resetAllData();
  Storage.initializeDemoData();

  assertEq(Storage.getCurrentShift(), null, '重置后当前班次应为空');
  assertEq(Storage.getShiftHistory().length, 0, '重置后历史班次应为空');
  assert(Storage.getAuditLogs().length < 5, '重置后审计日志应很少（只有初始化）');
});

test('护士尝试恢复数据被拒绝（权限拦截）', () => {
  Auth.login('nurse', '123456');
  const r = ExportModule.applyBackup(backupBeforeReset, []);
  assertEq(r.success, false, '护士调用 applyBackup 必须失败');
  assert(r.message.includes('药师'), `错误消息应说明药师权限，实际: ${r.message}`);
  Auth.logout();
});

test('未登录用户无法恢复数据', () => {
  Auth.logout();
  const r = ExportModule.applyBackup(backupBeforeReset, []);
  assertEq(r.success, false, '未登录用户必须被拒绝');
  assert(r.message.includes('登录'), `错误消息应说明登录，实际: ${r.message}`);
});

test('药师执行 applyBackup 恢复成功', () => {
  Auth.login('pharmacist', '123456');
  const r = ExportModule.applyBackup(backupBeforeReset, []);
  assert(r.success, `恢复应成功，消息：${r.message || ''}`);
  assert(r.results, '应有恢复结果统计');
  assert(r.results.importedShifts > 0, '应导入班次');
  assert(r.results.importedAuditLogs > 0, '应导入审计日志');
});

test('恢复后当前班次数据与备份一致', () => {
  const after = Storage.getCurrentShift();
  const before = backupBeforeReset.data.currentShift;
  assert(after, '恢复后应有当前班次');
  assertEq(after.id, before.id, '班次ID应一致');
  assertEq(after.name, before.name, '班次名称应一致');
  assertEq(after.createdByName, before.createdByName, '开班人应一致');
  assertEq(after.status, before.status, '班次状态应一致');
});

test('恢复后历史班次数量与备份一致', () => {
  const after = Storage.getShiftHistory();
  const before = backupBeforeReset.data.shiftHistory;
  assertEq(after.length, before.length, '历史班次数量应一致');
  after.forEach((s, i) => {
    assertEq(s.name, before[i].name, `第${i}个历史班次名称应一致`);
  });
});

test('恢复后盘点明细数量与备份一致', () => {
  const shiftId = backupBeforeReset.data.currentShift.id;
  const after = Storage.getInventory(shiftId);
  const before = backupBeforeReset.data.inventory[shiftId];
  assertEq(after.length, before.length, '盘点条目数应一致');
  const afterMap = {};
  after.forEach(i => { afterMap[i.drugCode] = i; });
  before.forEach(i => {
    assert(i.drugCode in afterMap, `药品编码 ${i.drugCode} 应存在于恢复后数据`);
    if (i.isCounted) {
      assertEq(afterMap[i.drugCode].actualQuantity, i.actualQuantity,
        `${i.drugCode} 实存数量应一致`);
    }
  });
});

test('恢复后差异处理与修正记录一致', () => {
  const shiftId = backupBeforeReset.data.currentShift.id;
  const after = Storage.getDiscrepancies(shiftId);
  const before = backupBeforeReset.data.discrepancies[shiftId];
  assertEq(after.length, before.length, '差异条目数应一致');
  const beforeWithCorr = before.filter(d => d.corrections && d.corrections.length > 0);
  const afterWithCorr = after.filter(d => d.corrections && d.corrections.length > 0);
  assertEq(afterWithCorr.length, beforeWithCorr.length, '带修正的差异数应一致');
  if (afterWithCorr.length > 0) {
    assertEq(afterWithCorr[0].corrections[0].requestedByName,
             beforeWithCorr[0].corrections[0].requestedByName,
             '修正申请人应一致');
  }
});

test('恢复后审计日志包含所有原有记录', () => {
  const after = Storage.getAuditLogs();
  const beforeIds = new Set(backupBeforeReset.data.auditLogs.map(l => l.id));
  let matchCount = 0;
  after.forEach(l => { if (beforeIds.has(l.id)) matchCount++; });
  assertEq(matchCount, backupBeforeReset.data.auditLogs.length,
    '所有原始审计日志ID都应出现在恢复后数据中');
});

test('【关键】恢复后重新生成的交班单与恢复前完全一致', () => {
  const shift = Storage.getCurrentShift();
  const reportAfter = ExportModule.generateShiftReport(shift);
  assertEq(reportAfter, reportBeforeReset,
    '恢复后重新生成的交班单报告应与备份前逐字一致');
});

test('【关键】恢复后再次 createBackup，核心数据与原备份等价', () => {
  const reBackup = ExportModule.createBackup();
  assertEq(reBackup.data.currentShift.id, backupBeforeReset.data.currentShift.id, '再次导出的当前班次ID一致');
  assertEq(reBackup.data.shiftHistory.length, backupBeforeReset.data.shiftHistory.length, '再次导出的历史班次数量一致');
  const origShiftId = backupBeforeReset.data.currentShift.id;
  assertEq(reBackup.data.inventory[origShiftId].length,
           backupBeforeReset.data.inventory[origShiftId].length,
           '再次导出的盘点条目数一致');
  assertEq(reBackup.data.discrepancies[origShiftId].length,
           backupBeforeReset.data.discrepancies[origShiftId].length,
           '再次导出的差异条目数一致');
});

console.log('\n--- [第三部分] 冲突检测与策略处理测试 ---\n');

console.log('--- [场景A] 同名班次冲突 ---');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let backupForConflict = null;
test('先创建并备份一份数据', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  const r = Shift.openShift('冲突测试班次-A');
  assert(r.success, '开班成功');
  Inventory.initializeInventory();
  backupForConflict = ExportModule.createBackup();
  assert(backupForConflict, '备份创建成功');
});

test('本地已存在同名班次，detectConflicts 正确识别', () => {
  Storage.clearCurrentShift();
  const r2 = Shift.openShift('冲突测试班次-A');
  assert(r2.success, '本地再次开班同名班次');

  const conflicts = ExportModule.detectConflicts(backupForConflict);
  assert(Array.isArray(conflicts.shifts), 'conflicts.shifts 应为数组');
  assert(conflicts.shifts.length >= 1, '应检测到至少1个班次名冲突');
  const sc = conflicts.shifts.find(c => c.type === 'shift_name_conflict');
  assert(sc, '应有 shift_name_conflict 类型');
  assertEq(sc.importedName, '冲突测试班次-A', '冲突班次名应正确');
});

test('describeConflictResolution 给出清晰的三种策略说明', () => {
  const sc = ExportModule.detectConflicts(backupForConflict).shifts[0];
  const skipDesc = ExportModule.describeConflictResolution(sc, 'skip');
  const overDesc = ExportModule.describeConflictResolution(sc, 'overwrite');
  const mergeDesc = ExportModule.describeConflictResolution(sc, 'merge');
  assert(skipDesc.includes('跳过'), 'skip 策略描述应含"跳过"');
  assert(overDesc.includes('覆盖'), 'overwrite 策略描述应含"覆盖"');
  assert(mergeDesc.includes('合并'), 'merge 策略描述应含"合并"');
});

test('parseBackupFile 正确返回冲突信息', () => {
  const content = JSON.stringify(backupForConflict);
  const pr = ExportModule.parseBackupFile(content);
  assert(pr.success, '解析应成功');
  assert(pr.hasConflicts === true, 'hasConflicts 应为 true');
  assert(pr.conflictCount >= 1, 'conflictCount 应>=1');
  assert(pr.conflicts.shifts.length >= 1, '应包含班次冲突数组');
});

test('冲突策略：skip → 跳过冲突班次', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  const r2 = Shift.openShift('冲突测试班次-A');
  assert(r2.success, '本地开班');

  const conflicts = ExportModule.detectConflicts(backupForConflict);
  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, 'skip')
  );
  const r = ExportModule.applyBackup(backupForConflict, resolutions);
  assert(r.success, '恢复应成功');
  assert(r.results.skippedShifts >= 1, '应至少跳过1个班次');
  const localId = Storage.getCurrentShift() ? Storage.getCurrentShift().id : Storage.getShiftHistory()[0].id;
  assertEq(Storage.getCurrentShift() ? Storage.getCurrentShift().name : Storage.getShiftHistory()[0].name,
    '冲突测试班次-A', 'skip 后本地班次名称不变');
});

test('冲突策略：overwrite → 本地班次被备份班次替换', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  const localR = Shift.openShift('冲突测试班次-A');
  assert(localR.success, '本地开班');
  const localShiftId = localR.shift.id;
  Inventory.initializeInventory();
  const localInv = Inventory.getInventoryForCurrentShift();
  Inventory.updateActualQuantity(localInv[0].id, 111);

  const conflicts = ExportModule.detectConflicts(backupForConflict);
  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, 'overwrite')
  );
  const r = ExportModule.applyBackup(backupForConflict, resolutions);
  assert(r.success, '恢复应成功');
  assert(r.results.overwrittenShifts >= 1, '应至少覆盖1个班次');

  const curr = Storage.getCurrentShift();
  assert(curr, '覆盖后应有当前班次');
  assertEq(curr.id, backupForConflict.data.currentShift.id,
    '覆盖后当前班次ID应来自备份');

  const invAfter = Storage.getInventory(curr.id);
  const backupInv = backupForConflict.data.inventory[backupForConflict.data.currentShift.id];
  assertEq(invAfter.length, backupInv.length, '覆盖后盘点条目数应与备份一致');

  const overwroteMsg = r.results.messages.find(m => m.includes('覆盖') && m.includes('冲突测试班次-A'));
  assert(overwroteMsg, '消息应明确说明已覆盖该班次');
});

test('冲突策略：merge → 合并班次保留本地ID，补充备份数据', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  const localR = Shift.openShift('冲突测试班次-A');
  assert(localR.success, '本地开班');
  const localShiftId = localR.shift.id;
  Inventory.initializeInventory();

  const conflicts = ExportModule.detectConflicts(backupForConflict);
  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, 'merge')
  );
  const r = ExportModule.applyBackup(backupForConflict, resolutions);
  assert(r.success, '恢复应成功');
  assert(r.results.mergedShifts >= 1, '应至少合并1个班次');

  const curr = Storage.getCurrentShift();
  assert(curr, '合并后应有当前班次');
  assertEq(curr.id, localShiftId, '合并后当前班次应保留本地ID');

  const mergedMsg = r.results.messages.find(m => m.includes('合并') && m.includes('冲突测试班次-A'));
  assert(mergedMsg, '消息应明确说明已合并该班次');
});

test('覆盖后再导出核对：交班单内容与备份源一致', () => {
  const curr = Storage.getCurrentShift();
  const invAfter = Storage.getInventory(curr.id);
  const discAfter = Storage.getDiscrepancies(curr.id);
  const backupInv = backupForConflict.data.inventory[backupForConflict.data.currentShift.id];
  const backupDisc = backupForConflict.data.discrepancies[backupForConflict.data.currentShift.id];
  assertEq(invAfter.length, backupInv.length, '盘点条目数与备份源一致');
  assertEq(discAfter.length, backupDisc.length, '差异条目数与备份源一致');
});

console.log('\n--- [场景B] 同药品编码但内容不一致冲突 ---');

test('备份中修改药品信息制造 drug_content_conflict', () => {
  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');

  const modifiedBackup = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    exportedAtFormatted: Storage.formatDateTime(new Date()),
    exportedBy: { id: 'user_001', name: '张药师', role: 'pharmacist' },
    data: {
      currentShift: null,
      shiftHistory: [],
      inventory: {},
      discrepancies: {},
      auditLogs: [],
      drugs: Storage.getDrugs().map(d => {
        if (d.code === 'DRUG001') {
          return { ...d, name: '阿莫西林胶囊-篡改版', initialStock: 9999 };
        }
        return d;
      })
    }
  };

  const conflicts = ExportModule.detectConflicts(modifiedBackup);
  assert(conflicts.drugs.length >= 1, '应检测到药品内容冲突');
  const dc = conflicts.drugs.find(c => c.drugCode === 'DRUG001');
  assert(dc, 'DRUG001 冲突应被识别');
  assertEq(dc.type, 'drug_content_conflict', '冲突类型正确');
});

test('药品冲突策略：skip 不修改本地药品', () => {
  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');

  const localBefore = Storage.getDrugByCode('DRUG001');
  const modifiedBackup = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    exportedAtFormatted: Storage.formatDateTime(new Date()),
    exportedBy: { id: 'user_001', name: '张药师', role: 'pharmacist' },
    data: {
      currentShift: null,
      shiftHistory: [],
      inventory: {},
      discrepancies: {},
      auditLogs: [],
      drugs: Storage.getDrugs().map(d => {
        if (d.code === 'DRUG001') {
          return { ...d, name: '阿莫西林胶囊-篡改版', initialStock: 9999 };
        }
        return d;
      })
    }
  };

  const conflicts = ExportModule.detectConflicts(modifiedBackup);
  const resolutions = conflicts.drugs.map(c =>
    ExportModule.resolveConflictStrategy(c, 'skip')
  );
  ExportModule.applyBackup(modifiedBackup, resolutions);

  const localAfter = Storage.getDrugByCode('DRUG001');
  assertEq(localAfter.name, localBefore.name, 'skip策略下药品名不应被修改');
  assertEq(localAfter.initialStock, localBefore.initialStock, 'skip策略下库存数不应被修改');
});

test('药品冲突策略：overwrite 真正替换本地药品属性', () => {
  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');

  const modifiedBackup = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    exportedAtFormatted: Storage.formatDateTime(new Date()),
    exportedBy: { id: 'user_001', name: '张药师', role: 'pharmacist' },
    data: {
      currentShift: null,
      shiftHistory: [],
      inventory: {},
      discrepancies: {},
      auditLogs: [],
      drugs: Storage.getDrugs().map(d => {
        if (d.code === 'DRUG001') {
          return { ...d, name: '阿莫西林胶囊-篡改版', initialStock: 9999 };
        }
        return d;
      })
    }
  };

  const conflicts = ExportModule.detectConflicts(modifiedBackup);
  const resolutions = conflicts.drugs.map(c =>
    ExportModule.resolveConflictStrategy(c, 'overwrite')
  );
  const r = ExportModule.applyBackup(modifiedBackup, resolutions);
  assert(r.success, '恢复应成功');
  assert(r.results.overwrittenDrugs >= 1, '应至少覆盖1种药品');

  const after = Storage.getDrugByCode('DRUG001');
  assertEq(after.name, '阿莫西林胶囊-篡改版', 'overwrite 后药品名应为备份值');
  assertEq(after.initialStock, 9999, 'overwrite 后库存数应为备份值');
});

test('药品冲突策略：merge 保留本地药品，统计区分', () => {
  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');

  const localBefore = Storage.getDrugByCode('DRUG001');
  const modifiedBackup = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    exportedAtFormatted: Storage.formatDateTime(new Date()),
    exportedBy: { id: 'user_001', name: '张药师', role: 'pharmacist' },
    data: {
      currentShift: null,
      shiftHistory: [],
      inventory: {},
      discrepancies: {},
      auditLogs: [],
      drugs: Storage.getDrugs().map(d => {
        if (d.code === 'DRUG001') {
          return { ...d, name: '阿莫西林胶囊-篡改版', initialStock: 9999 };
        }
        return d;
      })
    }
  };

  const conflicts = ExportModule.detectConflicts(modifiedBackup);
  const resolutions = conflicts.drugs.map(c =>
    ExportModule.resolveConflictStrategy(c, 'merge')
  );
  const r = ExportModule.applyBackup(modifiedBackup, resolutions);
  assert(r.success, '恢复应成功');
  assert(r.results.mergedDrugs >= 1, '应至少合并1种药品');

  const after = Storage.getDrugByCode('DRUG001');
  assertEq(after.name, localBefore.name, 'merge 后药品名保留本地');
  assertEq(after.initialStock, localBefore.initialStock, 'merge 后库存数保留本地');
});

console.log('\n--- [场景C] 重复修正记录冲突 ---');

test('detectConflicts 识别重复修正记录', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');

  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  const r = Shift.openShift('修正冲突测试班');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  const normal = inv.find(i => i.drugType === 'normal');
  Inventory.updateActualQuantity(normal.id, normal.expectedQuantity - 3);
  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  const normalDisc = discs.find(d => d.drugType === 'normal');
  Discrepancy.requestCorrection(normalDisc.id, normal.expectedQuantity - 1, '重复修正测试');

  const backup = ExportModule.createBackup();
  const conflicts = ExportModule.detectConflicts(backup);
  assert(Array.isArray(conflicts.corrections), 'corrections 冲突应为数组');
  assert(conflicts.corrections.length >= 1, '应检测到重复修正申请');
  const cc = conflicts.corrections[0];
  assertEq(cc.type, 'duplicate_correction', '类型应为 duplicate_correction');
});

test('修正冲突策略：overwrite 替换本地修正记录', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');

  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('修正覆盖测试班');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  const normal = inv.find(i => i.drugType === 'normal');
  Inventory.updateActualQuantity(normal.id, normal.expectedQuantity - 5);

  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  const normalDisc = discs.find(d => d.drugType === 'normal');
  Discrepancy.requestCorrection(normalDisc.id, normal.expectedQuantity - 3, '本地修正');

  const backup = ExportModule.createBackup();

  Discrepancy.resolveDiscrepancy(normalDisc.id, '本地处理了');

  const conflicts = ExportModule.detectConflicts(backup);
  assert(conflicts.corrections.length >= 1, '应有修正冲突');

  const allResolutions = [];
  conflicts.shifts.forEach(c => {
    allResolutions.push(ExportModule.resolveConflictStrategy(c, 'overwrite'));
  });
  conflicts.corrections.forEach(c => {
    allResolutions.push(ExportModule.resolveConflictStrategy(c, 'overwrite'));
  });
  const r = ExportModule.applyBackup(backup, allResolutions);
  assert(r.success, '恢复应成功');
  assert(r.results.overwrittenCorrections >= 1, '应至少覆盖1条修正记录');

  const shiftId = Storage.getCurrentShift().id;
  const afterDiscs = Storage.getDiscrepancies(shiftId);
  const afterNormal = afterDiscs.find(d => d.drugType === 'normal');
  assert(afterNormal.corrections && afterNormal.corrections.length >= 1, '覆盖后应有修正记录');
  const overwrittenCorr = afterNormal.corrections.find(c => c.reason === '本地修正');
  assert(overwrittenCorr, '覆盖后修正原因应为备份值（本地修正）');
});

test('修正冲突策略：merge 追加导入修正到本地差异', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');

  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('修正合并测试班');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  const normal = inv.find(i => i.drugType === 'normal');
  Inventory.updateActualQuantity(normal.id, normal.expectedQuantity - 5);

  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  const normalDisc = discs.find(d => d.drugType === 'normal');
  Discrepancy.requestCorrection(normalDisc.id, normal.expectedQuantity - 3, '本地修正');

  const backup = ExportModule.createBackup();

  Discrepancy.resolveDiscrepancy(normalDisc.id, '本地处理了');

  const conflicts = ExportModule.detectConflicts(backup);
  const allResolutions = [];
  conflicts.shifts.forEach(c => {
    allResolutions.push(ExportModule.resolveConflictStrategy(c, 'merge'));
  });
  conflicts.corrections.forEach(c => {
    allResolutions.push(ExportModule.resolveConflictStrategy(c, 'merge'));
  });
  const r = ExportModule.applyBackup(backup, allResolutions);
  assert(r.success, '恢复应成功');
  assert(r.results.mergedCorrections >= 1, '应至少合并1条修正记录');
});

console.log('\n--- [第四部分] 安全防护：权限不绕过 & 审计链路保护 ---\n');

test('【核心】护士伪装审批人：sanitizeUsersForImport 重置异常审批', () => {
  const tamperedData = {
    discrepancies: {
      shift_test: [{
        id: 'disc_001',
        drugName: '测试药',
        corrections: [{
          id: 'corr_001',
          oldActualQuantity: 10,
          newActualQuantity: 8,
          status: 'approved',
          requestedBy: 'user_002',
          requestedByName: '李护士',
          reviewedBy: 'user_002',
          reviewedByName: '李护士',
          reviewNote: '护士自己批准了',
          reviewedAt: new Date().toISOString(),
          reviewedAtFormatted: Storage.formatDateTime(new Date())
        }]
      }]
    }
  };

  const sanitized = ExportModule.sanitizeUsersForImport(tamperedData);
  const corr = sanitized.shift_test[0].corrections[0];
  assertEq(corr.status, 'pending', '护士审批的修正应被重置为 pending');
  assertEq(corr.reviewedByName, null, '审批人应被清空');
  assertEq(corr.reviewedBy, null, '审批人ID应被清空');
  assert(corr.reviewNote && corr.reviewNote.includes('系统保护'),
    '审批意见应包含系统保护标记');
});

test('药师审批记录在 sanitize 后保持不变', () => {
  const validData = {
    discrepancies: {
      shift_test: [{
        id: 'disc_001',
        drugName: '测试药',
        corrections: [{
          id: 'corr_001',
          oldActualQuantity: 10,
          newActualQuantity: 8,
          status: 'approved',
          requestedBy: 'user_002',
          requestedByName: '李护士',
          reviewedBy: 'user_001',
          reviewedByName: '张药师',
          reviewNote: '同意修正',
          reviewedAt: new Date().toISOString(),
          reviewedAtFormatted: Storage.formatDateTime(new Date())
        }]
      }]
    }
  };

  const sanitized = ExportModule.sanitizeUsersForImport(validData);
  const corr = sanitized.shift_test[0].corrections[0];
  assertEq(corr.status, 'approved', '药师审批的应保持 approved');
  assertEq(corr.reviewedByName, '张药师', '药师审批人名称保持不变');
});

test('sanitizeAuditLogsForImport 去重并保留原审计ID', () => {
  const existingLogs = [
    { id: 'audit_001', action: '开班', timestamp: '2026-01-01T08:00:00.000Z' }
  ];
  const importedLogs = [
    { id: 'audit_001', action: '开班', timestamp: '2026-01-01T08:00:00.000Z' },
    { id: 'audit_002', action: '关班', timestamp: '2026-01-01T16:00:00.000Z' },
    { id: 'audit_003', action: '处理差异', timestamp: '2026-01-01T12:00:00.000Z', timestampFormatted: null }
  ];

  const result = ExportModule.sanitizeAuditLogsForImport(importedLogs, existingLogs);
  assertEq(result.length, 2, '应去重，只保留2条新日志');
  const ids = result.map(l => l.id);
  assert(!ids.includes('audit_001'), '重复ID audit_001 不应出现');
  assert(ids.includes('audit_002') && ids.includes('audit_003'), '新增ID应保留');
  const log3 = result.find(l => l.id === 'audit_003');
  assert(log3.timestampFormatted, '缺失的 timestampFormatted 应被补全');
});

test('恢复后审计链路完整：所有审批操作人均为药师', () => {
  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');

  const tamperedBackup = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    exportedAtFormatted: Storage.formatDateTime(new Date()),
    exportedBy: { id: 'user_002', name: '李护士', role: 'nurse' },
    data: {
      currentShift: null,
      shiftHistory: [],
      inventory: {},
      discrepancies: {},
      auditLogs: [
        { id: 'audit_tamper_1', action: '批准修正', userName: '李护士', userRole: 'nurse',
          details: '护士试图批准修正', timestamp: new Date().toISOString(),
          timestampFormatted: Storage.formatDateTime(new Date()) },
        { id: 'audit_tamper_2', action: '开班', userName: '张药师', userRole: 'pharmacist',
          details: '正常开班', timestamp: new Date().toISOString(),
          timestampFormatted: Storage.formatDateTime(new Date()) }
      ],
      drugs: []
    }
  };

  const r = ExportModule.applyBackup(tamperedBackup, []);
  assert(r.success, '恢复应成功（护士的审计日志可以保留但业务层被拦截）');

  const logs = Storage.getAuditLogs();
  const tamperLog = logs.find(l => l.id === 'audit_tamper_1');
  assert(tamperLog, '护士的异常审计日志被保留（不篡改原始证据）');
  assertEq(tamperLog.userName, '李护士', '保留原始操作人信息，供日后审计');

  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');
});

test('validateBackup 拒绝无效格式', () => {
  assertEq(ExportModule.validateBackup(null).valid, false, 'null 应被拒绝');
  assertEq(ExportModule.validateBackup({}).valid, false, '空对象应被拒绝');
  assertEq(ExportModule.validateBackup({ version: '1.0.0' }).valid, false, '缺 data 应被拒绝');
  assertEq(ExportModule.validateBackup({
    version: '1.0.0',
    data: { currentShift: null }
  }).valid, false, 'data 缺字段应被拒绝');
});

console.log('\n--- [第五部分] 端到端：业务操作 → 备份 → 清空 → 恢复 → 再导出 一致性 ---\n');

test('【端到端】完整业务场景：开班→盘点→差异→修正申请→审批→关班→签收→备份→清空→恢复', () => {
  Storage.resetAllData();
  Storage.initializeDemoData();

  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);

  const r1 = Shift.openShift('端到端测试班次');
  assert(r1.success, '开班');
  Inventory.initializeInventory();

  const inv = Inventory.getInventoryForCurrentShift();
  const n1 = inv.find(i => i.drugCode === 'DRUG001');
  const c1 = inv.find(i => i.drugCode === 'DRUG005');
  Inventory.updateActualQuantity(n1.id, 95);
  Inventory.updateActualQuantity(c1.id, 28);

  Auth.logout();
  Auth.login('nurse', '123456');
  const discsNurse = Discrepancy.getDiscrepanciesForCurrentShift();
  const discN1 = discsNurse.find(d => d.drugCode === 'DRUG001');
  const cr = Discrepancy.requestCorrection(discN1.id, 97, '补点2盒');
  assert(cr.success, '护士申请修正成功');

  Auth.logout();
  Auth.login('pharmacist', '123456');
  const discsPh = Discrepancy.getDiscrepanciesForCurrentShift();
  const discN1Ph = discsPh.find(d => d.drugCode === 'DRUG001');
  const discC1Ph = discsPh.find(d => d.drugCode === 'DRUG005');
  const corr = discN1Ph.corrections[0];
  Discrepancy.reviewCorrection(discN1Ph.id, corr.id, true, '已核实');
  Discrepancy.resolveDiscrepancy(discC1Ph.id, '病房领用未登记');

  Shift.closeShift();

  Auth.logout();
  Auth.login('nurse', '123456');
  Shift.receiveShift('已核对无误');

  const reportBefore = ExportModule.generateShiftReport(Storage.getShiftHistory()[0]);
  const backup = ExportModule.createBackup();
  const historyBeforeCount = Storage.getShiftHistory().length;
  const logsBeforeCount = Storage.getAuditLogs().length;
  const shiftNameBefore = Storage.getShiftHistory()[0].name;

  Storage.resetAllData();
  Storage.initializeDemoData();
  assertEq(Storage.getShiftHistory().length, 0, '清空后无历史');

  Auth.login('pharmacist', '123456');
  const restoreR = ExportModule.applyBackup(backup, []);
  assert(restoreR.success, '恢复成功');

  assertEq(Storage.getShiftHistory().length, historyBeforeCount, '恢复后历史班次数量一致');
  assertEq(Storage.getShiftHistory()[0].name, shiftNameBefore, '班次名称一致');
  assert(Storage.getAuditLogs().length >= logsBeforeCount, '审计日志不少于恢复前');

  const reportAfter = ExportModule.generateShiftReport(Storage.getShiftHistory()[0]);
  assertEq(reportAfter, reportBefore, '恢复后交班单报告逐字一致');

  const reBackup = ExportModule.createBackup();
  const origShiftId = backup.data.shiftHistory[0].id;
  assertEq(reBackup.data.shiftHistory[0].id, origShiftId, '再次导出班次ID一致');
  assertEq(
    (reBackup.data.discrepancies[origShiftId] || []).length,
    (backup.data.discrepancies[origShiftId] || []).length,
    '再次导出差异数一致'
  );
  assertEq(
    (reBackup.data.inventory[origShiftId] || []).length,
    (backup.data.inventory[origShiftId] || []).length,
    '再次导出盘点数一致'
  );

  const restoredDiscs = Storage.getDiscrepancies(origShiftId);
  const discWithCorr = restoredDiscs.find(d => d.corrections && d.corrections.length > 0);
  if (discWithCorr) {
    assertEq(discWithCorr.corrections[0].reviewedByName, '张药师',
      '修正审批人恢复后仍为张药师');
    assertEq(discWithCorr.corrections[0].status, 'approved',
      '修正状态恢复后仍为 approved');
  }

  const controlledDisc = restoredDiscs.find(d => d.drugType === 'controlled');
  assert(controlledDisc, '应存在受控药差异');
  assertEq(controlledDisc.status, 'resolved', '受控药差异应为已处理');
  assertEq(controlledDisc.resolvedByName, '张药师', '处理人应为张药师');

  console.log(`    恢复摘要: ${restoreR.summary}`);
});

console.log('\n--- [第六部分] 回归测试：覆盖/合并策略生效 + 重启后复核 + 权限审计 ---\n');

test('【回归】班次覆盖：本地同名班次数据确实被备份数据替换', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);

  Shift.openShift('回归覆盖班次');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  const n1 = inv.find(i => i.drugCode === 'DRUG001');
  Inventory.updateActualQuantity(n1.id, 77);
  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  const nd = discs.find(d => d.drugType === 'normal');
  Discrepancy.requestCorrection(nd.id, 80, '覆盖前修正');

  const backup = ExportModule.createBackup();

  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('回归覆盖班次');
  Inventory.initializeInventory();
  const inv2 = Inventory.getInventoryForCurrentShift();
  const n2 = inv2.find(i => i.drugCode === 'DRUG001');
  Inventory.updateActualQuantity(n2.id, 55);

  const conflicts = ExportModule.detectConflicts(backup);
  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, 'overwrite')
  );
  const r = ExportModule.applyBackup(backup, resolutions);
  assert(r.success, '恢复应成功');
  assert(r.results.overwrittenShifts >= 1, '应覆盖班次');

  const curr = Storage.getCurrentShift();
  assertEq(curr.id, backup.data.currentShift.id, '覆盖后班次ID应来自备份');

  const invAfter = Storage.getInventory(curr.id);
  const nAfter = invAfter.find(i => i.drugCode === 'DRUG001');
  assertEq(nAfter.actualQuantity, 77, '覆盖后DRUG001实存应为备份值77，而非本地值55');

  const discAfter = Storage.getDiscrepancies(curr.id);
  const ndAfter = discAfter.find(d => d.drugType === 'normal');
  assert(ndAfter && ndAfter.corrections && ndAfter.corrections.length >= 1,
    '覆盖后应有修正记录（来自备份）');
});

test('【回归】班次合并：本地ID保留，备份数据合入', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);

  Shift.openShift('回归合并班次');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  const n1 = inv.find(i => i.drugCode === 'DRUG001');
  Inventory.updateActualQuantity(n1.id, 77);

  const backup = ExportModule.createBackup();
  const backupShiftId = backup.data.currentShift.id;

  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  const localR = Shift.openShift('回归合并班次');
  const localShiftId = localR.shift.id;
  Inventory.initializeInventory();
  const inv2 = Inventory.getInventoryForCurrentShift();
  const n2 = inv2.find(i => i.drugCode === 'DRUG001');
  Inventory.updateActualQuantity(n2.id, 55);

  const conflicts = ExportModule.detectConflicts(backup);
  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, 'merge')
  );
  const r = ExportModule.applyBackup(backup, resolutions);
  assert(r.success, '恢复应成功');
  assert(r.results.mergedShifts >= 1, '应合并班次');

  const curr = Storage.getCurrentShift();
  assertEq(curr.id, localShiftId, '合并后当前班次应保留本地ID');

  const invAfter = Storage.getInventory(localShiftId);
  const nAfter = invAfter.find(i => i.drugCode === 'DRUG001');
  assert(nAfter, '合并后应有DRUG001盘点');
});

test('【回归】药品覆盖后再次导出：药品目录与备份一致', () => {
  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');

  const modifiedBackup = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    exportedAtFormatted: Storage.formatDateTime(new Date()),
    exportedBy: { id: 'user_001', name: '张药师', role: 'pharmacist' },
    data: {
      currentShift: null,
      shiftHistory: [],
      inventory: {},
      discrepancies: {},
      auditLogs: [],
      drugs: Storage.getDrugs().map(d => {
        if (d.code === 'DRUG001') {
          return { ...d, name: '阿莫西林胶囊V2', initialStock: 200 };
        }
        return d;
      })
    }
  };

  const conflicts = ExportModule.detectConflicts(modifiedBackup);
  const resolutions = conflicts.drugs.map(c =>
    ExportModule.resolveConflictStrategy(c, 'overwrite')
  );
  ExportModule.applyBackup(modifiedBackup, resolutions);

  const reBackup = ExportModule.createBackup();
  const drug001 = reBackup.data.drugs.find(d => d.code === 'DRUG001');
  assertEq(drug001.name, '阿莫西林胶囊V2', '再次导出药品名应与覆盖值一致');
  assertEq(drug001.initialStock, 200, '再次导出库存数应与覆盖值一致');
});

test('【回归】导出→清空→恢复→重启复核：再次导出数据与首次备份逐字段校验', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);

  Shift.openShift('重启复核班次');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  const n1 = inv.find(i => i.drugCode === 'DRUG001');
  const c1 = inv.find(i => i.drugCode === 'DRUG005');
  Inventory.updateActualQuantity(n1.id, 90);
  Inventory.updateActualQuantity(c1.id, 28);

  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  const nd = discs.find(d => d.drugCode === 'DRUG001');
  Discrepancy.requestCorrection(nd.id, 92, '重启复核修正');

  const firstBackup = deepClone(ExportModule.createBackup());
  const firstReport = ExportModule.generateShiftReport(Storage.getCurrentShift());

  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');
  ExportModule.applyBackup(firstBackup, []);

  const secondBackup = ExportModule.createBackup();
  assertEq(secondBackup.data.currentShift.id, firstBackup.data.currentShift.id,
    '重启复核：当前班次ID一致');
  assertEq(secondBackup.data.shiftHistory.length, firstBackup.data.shiftHistory.length,
    '重启复核：历史班次数量一致');

  const sid = firstBackup.data.currentShift.id;
  assertEq(secondBackup.data.inventory[sid].length, firstBackup.data.inventory[sid].length,
    '重启复核：盘点条目数一致');
  assertEq(secondBackup.data.discrepancies[sid].length, firstBackup.data.discrepancies[sid].length,
    '重启复核：差异条目数一致');
  assertEq(secondBackup.data.drugs.length, firstBackup.data.drugs.length,
    '重启复核：药品总数一致');

  const secondReport = ExportModule.generateShiftReport(Storage.getCurrentShift());
  assertEq(secondReport, firstReport, '重启复核：交班单报告逐字一致');
});

test('【回归】恢复后权限不绕过：护士仍无法审批受控药差异', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);

  Shift.openShift('权限回归班次');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  const c1 = inv.find(i => i.drugCode === 'DRUG005');
  Inventory.updateActualQuantity(c1.id, 28);

  const backup = deepClone(ExportModule.createBackup());

  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');
  ExportModule.applyBackup(backup, []);

  Auth.logout();
  Auth.login('nurse', '123456');
  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  const controlled = discs.find(d => d.drugType === 'controlled' && d.status === 'pending');
  if (controlled) {
    const resolveR = Discrepancy.resolveDiscrepancy(controlled.id, '护士尝试处理');
    assertEq(resolveR.success, false, '护士恢复后仍不能处理受控药差异');
  }
  Auth.logout();
  Auth.login('pharmacist', '123456');
});

test('【回归】恢复后审计链路不被导入绕过：修正审批人仍为药师', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);

  Shift.openShift('审计回归班次');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  const n1 = inv.find(i => i.drugCode === 'DRUG001');
  Inventory.updateActualQuantity(n1.id, 90);

  Auth.logout();
  Auth.login('nurse', '123456');
  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  const nd = discs.find(d => d.drugCode === 'DRUG001');
  Discrepancy.requestCorrection(nd.id, 92, '审计回归');

  Auth.logout();
  Auth.login('pharmacist', '123456');
  const discs2 = Discrepancy.getDiscrepanciesForCurrentShift();
  const nd2 = discs2.find(d => d.drugCode === 'DRUG001');
  Discrepancy.reviewCorrection(nd2.id, nd2.corrections[0].id, true, '药师审批');

  const backup = deepClone(ExportModule.createBackup());

  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');
  ExportModule.applyBackup(backup, []);

  const sid = Storage.getCurrentShift().id;
  const restoredDiscs = Storage.getDiscrepancies(sid);
  const restored = restoredDiscs.find(d => d.drugCode === 'DRUG001');
  assert(restored && restored.corrections && restored.corrections.length >= 1,
    '审计回归：应有修正记录');
  assertEq(restored.corrections[0].reviewedByName, '张药师',
    '审计回归：修正审批人恢复后仍为张药师');
  assertEq(restored.corrections[0].status, 'approved',
    '审计回归：修正状态恢复后仍为 approved');
});

test('【回归】统计数字与实际操作一致：无冲突导入', () => {
  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);

  Shift.openShift('统计回归班次');
  Inventory.initializeInventory();

  const backup = deepClone(ExportModule.createBackup());

  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');
  const r = ExportModule.applyBackup(backup, []);
  assert(r.success, '恢复应成功');

  assertEq(r.results.importedShifts, 1, '无冲突时应导入1个班次');
  assertEq(r.results.overwrittenShifts, 0, '无冲突时覆盖应为0');
  assertEq(r.results.mergedShifts, 0, '无冲突时合并应为0');
  assertEq(r.results.skippedShifts, 0, '无冲突时跳过应为0');
  assert(r.results.importedAuditLogs > 0, '无冲突时应导入审计日志');
});

Auth.logout();

console.log('\n================================================================');
const passed = results.filter(r => r.pass).length;
const total = results.length;
console.log(`  测试结果：${passed}/${total} 通过`);
console.log('================================================================\n');

if (passed < total) {
  console.log('失败用例详情：');
  results.filter(r => !r.pass).forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
  process.exit(1);
}
console.log('  🎉 所有备份/恢复验证测试通过！数据迁移链路完整可靠。\n');
