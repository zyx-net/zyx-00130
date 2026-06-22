const fs = require('fs');
const path = require('path');
const vm = require('vm');

const localStorage = {};
globalThis.localStorage = {
  getItem: (k) => (k in localStorage ? localStorage[k] : null),
  setItem: (k, v) => { localStorage[k] = String(v); },
  removeItem: (k) => { delete localStorage[k]; }
};

globalThis.alert = (msg) => {};
globalThis.confirm = (msg) => true;
globalThis.prompt = (msg, def) => def || '测试';
globalThis.document = {
  body: { appendChild: () => {}, removeChild: () => {} },
  createElement: () => ({ innerHTML: '', style: {}, className: '', appendChild: () => {}, closest: () => null, value: '' }),
  getElementById: () => ({ value: '测试', addEventListener: () => {}, innerHTML: '', remove: () => {} }),
  querySelector: () => ({ remove: () => {} }),
  addEventListener: () => {},
  getElementsByName: () => []
};
globalThis.window = globalThis;
globalThis.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} };
globalThis.Blob = function(arr, opts) { this.content = arr.join(''); this.opts = opts; };
globalThis.navigator = {};
globalThis.FileReader = function() {};
globalThis.location = { reload: () => {} };

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
console.log('  药房交班系统 - 恢复操作台全面验证');
console.log('================================================================\n');

// ============================================================
// 场景 1：数据块基础 API
// ============================================================
console.log('--- [场景 1] 数据块基础 API ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

test('getAllDataBlocks 返回 5 个数据块', () => {
  const blocks = ExportModule.getAllDataBlocks();
  assertEq(blocks.length, 5, '应有 5 个数据块');
  assert(blocks.includes('shifts') && blocks.includes('drugs') &&
         blocks.includes('inventory') && blocks.includes('discrepancies') &&
         blocks.includes('auditLogs'), '应包含全部 5 类');
});

test('getDataBlockLabel 返回中文标签', () => {
  const label = ExportModule.getDataBlockLabel('shifts');
  assert(label && label.length > 0, '应有标签');
  assert(typeof label === 'string', '标签应为字符串');
});

let testBackup = null;

test('createBackupWithInfo 创建带信息备份', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  
  Shift.openShift('数据块测试班');
  Inventory.initializeInventory();
  
  const result = ExportModule.createBackupWithInfo('测试备份-控制台', '用于测试');
  assert(result.success, '备份应创建成功');
  assert(result.backup, '应返回 backup');
  assert(result.backupInfo, '应返回 backupInfo');
  
  testBackup = deepClone(result.backup);
});

test('getAllDataBlockChanges 返回所有数据块变更摘要', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  
  const changes = ExportModule.getAllDataBlockChanges(testBackup);
  assert(changes, '应返回变更对象');
  
  const blocks = ExportModule.getAllDataBlocks();
  blocks.forEach(b => {
    assert(b in changes, `应包含 ${b}`);
    assert(typeof changes[b].summary === 'string', `${b} 应有 summary`);
  });
});

test('getDataBlockChangeSummary 单块查询', () => {
  const s = ExportModule.getDataBlockChangeSummary(testBackup, 'drugs');
  assert(s && s.summary, '应返回摘要');
});

console.log('');

// ============================================================
// 场景 2：冲突分组检测
// ============================================================
console.log('--- [场景 2] 冲突分组检测 ---\n');

let conflictBackup = null;

test('准备：制造同名班次冲突（历史班次）', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  
  const r = Shift.openShift('冲突测试班次');
  assert(r.success, '开班应成功');
  Inventory.initializeInventory();
  
  const shiftData = deepClone(Storage.getCurrentShift());
  conflictBackup = deepClone(ExportModule.createBackup());
  
  Storage.clearCurrentShift();
  Storage.addShiftToHistory(shiftData);
  
  const conflicts = ExportModule.detectConflicts(conflictBackup);
  assert(conflicts.shifts.length >= 1, '应检测到班次冲突');
});

test('getConflictsGrouped 返回结构化分组', () => {
  const groups = ExportModule.getConflictsGrouped(conflictBackup);
  assertEq(groups.hasConflicts, true, '应有冲突');
  assert(groups.totalCount >= 1, '冲突总数 >= 1');
  assert(Array.isArray(groups.groups), '应有 groups 数组');
  assert(groups.highestSeverity, '应有 highestSeverity');
});

test('班次冲突分组存在且结构正确', () => {
  const groups = ExportModule.getConflictsGrouped(conflictBackup);
  const shiftGroup = groups.groups.find(g => g.groupKey === 'shifts');
  
  assert(shiftGroup, '应找到班次分组');
  assertEq(shiftGroup.groupKey, 'shifts', 'groupKey 应为 shifts');
  assert(shiftGroup.groupLabel, '应有 groupLabel');
  assert(shiftGroup.severity, '应有 severity');
  assertEq(typeof shiftGroup.count, 'number', 'count 应为数字');
  assert(shiftGroup.count >= 1, '班次冲突数 >= 1');
  assert(Array.isArray(shiftGroup.conflicts), '应有 conflicts 数组');
});

test('每个冲突项有完整结构', () => {
  const groups = ExportModule.getConflictsGrouped(conflictBackup);
  const shiftGroup = groups.groups.find(g => g.groupKey === 'shifts');
  const c = shiftGroup.conflicts[0];
  
  assert(c.type, '应有 type');
  assert(c.title, '应有 title');
  assert(c.severity, '应有 severity');
  assert(c.imported, '应有 imported');
  assert(c.existing, '应有 existing');
  assert(Array.isArray(c.strategies), '应有 strategies 数组');
  assert(c.defaultStrategy, '应有 defaultStrategy');
});

test('冲突策略包含 skip/overwrite/merge', () => {
  const groups = ExportModule.getConflictsGrouped(conflictBackup);
  const shiftGroup = groups.groups.find(g => g.groupKey === 'shifts');
  const strategies = shiftGroup.conflicts[0].strategies;
  const values = strategies.map(s => s.value);
  
  assert(values.includes('skip'), '应有 skip');
  assert(values.includes('overwrite'), '应有 overwrite');
  assert(values.includes('merge'), '应有 merge');
  assertEq(strategies.length, 3, '应有 3 种策略');
});

test('每个策略有 label 和 description', () => {
  const groups = ExportModule.getConflictsGrouped(conflictBackup);
  const shiftGroup = groups.groups.find(g => g.groupKey === 'shifts');
  const strategies = shiftGroup.conflicts[0].strategies;
  
  strategies.forEach(s => {
    assert(s.label && s.label.length > 0, '策略应有 label');
    assert(s.description && s.description.length > 0, '策略应有 description');
    assert(s.value, '策略应有 value');
  });
});

test('getConflictDetail 返回详情', () => {
  const rawConflicts = ExportModule.detectConflicts(conflictBackup);
  const detail = ExportModule.getConflictDetail(rawConflicts.shifts[0]);
  
  assert(detail, '应返回详情');
  assert(detail.type, '应有 type');
  assert(detail.imported, '应有 imported');
  assert(detail.existing, '应有 existing');
  assert(Array.isArray(detail.strategies), '应有 strategies');
});

console.log('');

// ============================================================
// 场景 3：业务冲突检测
// ============================================================
console.log('--- [场景 3] 业务冲突检测 ---\n');

test('活跃班次时 applyBackup 被阻止', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  
  Shift.openShift('业务冲突测试班');
  Inventory.initializeInventory();
  const backup = deepClone(ExportModule.createBackup());
  
  const result = ExportModule.applyBackup(backup, []);
  assertEq(result.success, false, '活跃班次时恢复应失败');
  assert(result.message && result.message.length > 0, '应有错误消息');
  assert(result.businessConflicts, '应返回 businessConflicts');
  assert(result.businessConflicts.hasActiveShift, '应检测到活跃班次');
});

test('清除当前班次后 applyBackup 可执行', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  
  Shift.openShift('测试班');
  Inventory.initializeInventory();
  const backup = deepClone(ExportModule.createBackup());
  
  Storage.clearCurrentShift();
  
  const result = ExportModule.applyBackup(backup, []);
  assert(result.success, '无活跃班次时恢复应成功');
});

console.log('');

// ============================================================
// 场景 4：局部恢复
// ============================================================
console.log('--- [场景 4] 局部恢复 ---\n');

let partialBackup = null;

test('准备：创建备份', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  
  Shift.openShift('局部恢复测试班');
  Inventory.initializeInventory();
  
  const backup = ExportModule.createBackupWithInfo('局部恢复备份', '');
  partialBackup = deepClone(backup.backup);
  assert(partialBackup, '备份应存在');
});

test('prePartialRestorePreview 预演单数据块', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  
  const preview = ExportModule.prePartialRestorePreview(
    partialBackup, ['shifts'], []
  );
  assert(preview.success, '预演应成功');
  assert(preview.summary, '应有 summary');
  assert(typeof preview.summary.newShifts === 'number', '应有 newShifts');
});

test('prePartialRestorePreview 全块预演与完整预演一致', () => {
  const allBlocks = ExportModule.getAllDataBlocks();
  
  const p1 = ExportModule.prePartialRestorePreview(partialBackup, allBlocks, []);
  const p2 = ExportModule.preRestorePreview(partialBackup, []);
  
  assert(p1.success && p2.success, '两个预演都应成功');
  assertEq(p1.summary.newShifts, p2.summary.newShifts, '新增班次应一致');
});

test('applyPartialBackup 执行局部恢复（仅班次）', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  
  const beforeCount = ExportModule.getRestoreRecords().length;
  
  const result = ExportModule.applyPartialBackup(
    partialBackup, ['shifts'], []
  );
  
  assert(result.success, '局部恢复应成功');
  assert(result.results, '应返回 results');
  assert(result.results.importedShifts !== undefined, '应有 importedShifts');
  
  const afterCount = ExportModule.getRestoreRecords().length;
  assert(afterCount > beforeCount, '恢复记录应增加');
});

test('局部恢复记录标记 isPartial 且有 dataBlocks', () => {
  const records = ExportModule.getRestoreRecords();
  const latest = records[0];
  
  assertEq(latest.isPartial, true, '应标记为局部恢复');
  assert(Array.isArray(latest.dataBlocks), '应有 dataBlocks 数组');
  assert(latest.dataBlocks.includes('shifts'), '应包含 shifts');
  assert(!latest.dataBlocks.includes('drugs'), '不应包含 drugs');
});

console.log('');

// ============================================================
// 场景 5：冲突决策生效
// ============================================================
console.log('--- [场景 5] 冲突决策生效验证 ---\n');

function makeShiftBackup(name) {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift(name);
  Inventory.initializeInventory();
  return deepClone(ExportModule.createBackup());
}

function addShiftToHistoryFromBackup(backup) {
  if (backup.data.currentShift) {
    Storage.addShiftToHistory(deepClone(backup.data.currentShift));
  }
}

test('skip 策略：保留本地班次', () => {
  const backup = makeShiftBackup('决策测试班');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  addShiftToHistoryFromBackup(backup);
  const historyBefore = Storage.getShiftHistory().length;
  const localShiftId = Storage.getShiftHistory()[0].id;
  
  const conflicts = ExportModule.detectConflicts(backup);
  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, 'skip')
  );
  
  const result = ExportModule.applyBackup(backup, resolutions);
  assert(result.success, '恢复应成功');
  assertEq(result.results.skippedShifts, 1, '应有 1 个被跳过');
  
  const history = Storage.getShiftHistory();
  assertEq(history.length, historyBefore, 'skip 后历史班次数量不变');
  assertEq(history[0].id, localShiftId, 'skip 后本地班次 ID 不变');
});

test('overwrite 策略：覆盖本地班次', () => {
  const backup = makeShiftBackup('覆盖测试班');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  addShiftToHistoryFromBackup(backup);
  const localShiftId = Storage.getShiftHistory()[0].id;
  
  const conflicts = ExportModule.detectConflicts(backup);
  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, 'overwrite')
  );
  
  const result = ExportModule.applyBackup(backup, resolutions);
  assert(result.success, '恢复应成功');
  assertEq(result.results.overwrittenShifts, 1, '应有 1 个被覆盖');
});

test('merge 策略：合并班次', () => {
  const backup = makeShiftBackup('合并测试班');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  addShiftToHistoryFromBackup(backup);
  
  const conflicts = ExportModule.detectConflicts(backup);
  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, 'merge')
  );
  
  const result = ExportModule.applyBackup(backup, resolutions);
  assert(result.success, '恢复应成功');
  assert(typeof result.results.mergedShifts === 'number', 'mergedShifts 应为数字');
  assert(result.results.mergedShifts >= 0, '合并班次数量应 >= 0');
});

test('冲突决策保存到恢复记录', () => {
  const records = ExportModule.getRestoreRecords();
  const withRes = records.filter(r =>
    r.conflictResolutions && r.conflictResolutions.length > 0
  );
  
  assert(withRes.length > 0, '应有包含冲突决策的记录');
  
  const record = withRes[0];
  assert(Array.isArray(record.conflictResolutions), '应为数组');
  assert(record.conflictResolutions[0].strategy, '每个决策应有 strategy');
  assert(record.conflictResolutions[0].type, '每个决策应有 type');
});

console.log('');

// ============================================================
// 场景 6：权限边界
// ============================================================
console.log('--- [场景 6] 权限边界验证 ---\n');

test('护士无恢复和撤回权限', () => {
  Auth.login('nurse', '123456');
  assertEq(Auth.canPerformRestore(), false, '护士无恢复权限');
  assertEq(Auth.canUndoRestore(), false, '护士无撤回权限');
  assertEq(Auth.canPerformPartialRestore(), false, '护士无局部恢复权限');
  assertEq(Auth.canViewRestoreRecords(), true, '护士可查看记录');
  assertEq(Auth.canManageBackups(), false, '护士无备份管理权限');
});

test('护士调用 applyBackup 被拒绝', () => {
  Auth.login('nurse', '123456');
  
  Storage.clearCurrentShift();
  const backup = makeShiftBackup('权限测试班');
  Storage.clearCurrentShift();
  
  const result = ExportModule.applyBackup(backup, []);
  assertEq(result.success, false, '护士恢复应失败');
  assert(result.message, '应有错误消息');
});

test('护士调用 undoLastRestore 被拒绝', () => {
  Auth.login('pharmacist', '123456');
  
  Storage.clearCurrentShift();
  const backup = makeShiftBackup('撤回权限测试班');
  Storage.clearCurrentShift();
  ExportModule.applyBackup(backup, []);
  
  Auth.login('nurse', '123456');
  const r = ExportModule.undoLastRestore();
  assertEq(r.success, false, '护士撤回应失败');
  assert(r.message, '应有错误消息');
});

test('护士调用 applyPartialBackup 被拒绝', () => {
  Auth.login('nurse', '123456');
  
  Storage.clearCurrentShift();
  const backup = makeShiftBackup('局部权限测试班');
  Storage.clearCurrentShift();
  
  const result = ExportModule.applyPartialBackup(backup, ['shifts'], []);
  assertEq(result.success, false, '护士局部恢复应失败');
});

test('药师有完整权限', () => {
  Auth.login('pharmacist', '123456');
  assertEq(Auth.canPerformRestore(), true, '药师有恢复权限');
  assertEq(Auth.canUndoRestore(), true, '药师有撤回权限');
  assertEq(Auth.canManageBackups(), true, '药师有备份管理权限');
});

console.log('');

// ============================================================
// 场景 7：恢复记录详情
// ============================================================
console.log('--- [场景 7] 恢复记录详情 ---\n');

let testRecordId = null;

test('准备：执行一次完整恢复', () => {
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  
  Shift.openShift('记录详情测试班');
  Inventory.initializeInventory();
  const backup = deepClone(ExportModule.createBackup());
  
  Storage.clearCurrentShift();
  
  const result = ExportModule.applyBackup(backup, []);
  assert(result.success, '恢复应成功');
  assert(result.restoreRecordId, '应返回记录 ID');
  
  testRecordId = result.restoreRecordId;
});

test('getRestoreRecordDetail 返回完整详情', () => {
  const detail = ExportModule.getRestoreRecordDetail(testRecordId);
  assert(detail, '应返回详情');
  assert(detail.record, '应有 record');
  assert(detail.summary, '应有 summary');
  assert(Array.isArray(detail.dataBlocks), '应有 dataBlocks');
  assertEq(typeof detail.isUndoable, 'boolean', 'isUndoable 应为布尔值');
  assert(Array.isArray(detail.conflictResolutions), '应有 conflictResolutions');
});

test('buildRestoreChangeSummary 生成摘要', () => {
  const records = ExportModule.getRestoreRecords();
  const summary = ExportModule.buildRestoreChangeSummary(records[0]);
  assert(typeof summary === 'string', '摘要应为字符串');
});

test('getRestoreRecords 按时间倒序', () => {
  const records = ExportModule.getRestoreRecords();
  assert(records.length >= 2, '应有至少 2 条记录');
  
  for (let i = 1; i < records.length; i++) {
    assert(records[i - 1].timestamp >= records[i].timestamp,
      '应按时间倒序');
  }
});

test('getLastRestoreInfo 返回最近信息', () => {
  const info = ExportModule.getLastRestoreInfo();
  assert(info, '应返回信息');
  assert(info.hasUndoableSnapshot !== undefined, '应有 hasUndoableSnapshot');
  assert(info.record || info.record === null, '应有 record');
  assert(info.hasActiveLock !== undefined, '应有 hasActiveLock');
});

console.log('');

// ============================================================
// 场景 8：重启后记录可见性
// ============================================================
console.log('--- [场景 8] 重启后记录可见性 ---\n');

let recordCountBefore = 0;

test('准备：执行恢复', () => {
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  
  Shift.openShift('持久化测试班');
  Inventory.initializeInventory();
  const backup = deepClone(ExportModule.createBackup());
  
  Storage.clearCurrentShift();
  ExportModule.applyBackup(backup, []);
  
  recordCountBefore = ExportModule.getRestoreRecords().length;
  assert(recordCountBefore > 0, '应有恢复记录');
});

test('模拟重启：重新加载模块后记录存在', () => {
  const savedLS = deepClone(localStorage);
  
  const ls2 = {};
  Object.keys(savedLS).forEach(k => { ls2[k] = savedLS[k]; });
  
  globalThis.localStorage = {
    getItem: (k) => (k in ls2 ? ls2[k] : null),
    setItem: (k, v) => { ls2[k] = String(v); },
    removeItem: (k) => { delete ls2[k]; }
  };
  
  const Storage2 = loadModule('storage.js');
  const Auth2 = loadModule('auth.js');
  const Export2 = loadModule('export.js');
  
  Auth2.login('pharmacist', '123456');
  
  const records = Export2.getRestoreRecords();
  assertEq(records.length, recordCountBefore, '重启后记录数一致');
  
  const lastInfo = Export2.getLastRestoreInfo();
  assert(lastInfo, '重启后可获取最近恢复信息');
  
  globalThis.localStorage = {
    getItem: (k) => (k in localStorage ? localStorage[k] : null),
    setItem: (k, v) => { localStorage[k] = String(v); },
    removeItem: (k) => { delete localStorage[k]; }
  };
});

test('重启后撤回功能正常', () => {
  const savedLS = deepClone(localStorage);
  
  const ls2 = {};
  Object.keys(savedLS).forEach(k => { ls2[k] = savedLS[k]; });
  
  globalThis.localStorage = {
    getItem: (k) => (k in ls2 ? ls2[k] : null),
    setItem: (k, v) => { ls2[k] = String(v); },
    removeItem: (k) => { delete ls2[k]; }
  };
  
  const Storage2 = loadModule('storage.js');
  const Auth2 = loadModule('auth.js');
  const Export2 = loadModule('export.js');
  
  Auth2.login('pharmacist', '123456');
  
  const undoResult = Export2.undoLastRestore();
  assert(undoResult.success, '重启后撤回应成功');
  
  const records = Export2.getRestoreRecords();
  assertEq(records[0].undone, true, '撤回后记录标记 undone');
  
  globalThis.localStorage = {
    getItem: (k) => (k in localStorage ? localStorage[k] : null),
    setItem: (k, v) => { localStorage[k] = String(v); },
    removeItem: (k) => { delete localStorage[k]; }
  };
});

console.log('');

// ============================================================
// 场景 9：导出导入往返 + 撤销校对
// ============================================================
console.log('--- [场景 9] 导出导入往返 + 撤销校对 ---\n');

let roundtripBackup = null;
let stateBeforeRestore = null;

test('准备：创建备份并序列化为 JSON', () => {
  Auth.login('pharmacist', '123456');
  Storage.resetAllData();
  Storage.loadSampleData();
  
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  
  Shift.openShift('往返测试班');
  Inventory.initializeInventory();
  
  roundtripBackup = deepClone(ExportModule.createBackup());
  const jsonStr = JSON.stringify(roundtripBackup);
  assert(jsonStr.length > 0, 'JSON 非空');
});

test('parseBackupFile 解析 JSON', () => {
  const jsonStr = JSON.stringify(roundtripBackup);
  const result = ExportModule.parseBackupFile(jsonStr);
  
  assert(result.success, '解析应成功');
  assert(result.backup, '应返回 backup');
  assert(result.backup.version, '应有版本');
  assert(Array.isArray(result.conflicts.shifts), '应有冲突信息');
});

test('往返解析后数据一致', () => {
  const jsonStr = JSON.stringify(roundtripBackup);
  const result = ExportModule.parseBackupFile(jsonStr);
  
  assertEq(
    result.backup.data.currentShift?.name,
    roundtripBackup.data.currentShift?.name,
    '班次名一致'
  );
  assertEq(
    result.backup.data.drugs.length,
    roundtripBackup.data.drugs.length,
    '药品数量一致'
  );
});

test('撤销后数据回到恢复前', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  
  Shift.openShift('撤销校对班');
  Inventory.initializeInventory();
  const backup = deepClone(ExportModule.createBackup());
  
  Storage.clearCurrentShift();
  Shift.openShift('本地班');
  Inventory.initializeInventory();
  
  stateBeforeRestore = {
    shiftCount: Storage.getShiftHistory().length +
      (Storage.getCurrentShift() ? 1 : 0),
    drugCount: Storage.getDrugs().length
  };
  
  Storage.clearCurrentShift();
  
  const applyResult = ExportModule.applyBackup(backup, []);
  assert(applyResult.success, `恢复应成功：${applyResult.message || ''}`);
  
  const undoResult = ExportModule.undoLastRestore();
  assert(undoResult.success, `撤回应成功：${undoResult.message || ''}`);
  
  const afterUndo = {
    shiftCount: Storage.getShiftHistory().length +
      (Storage.getCurrentShift() ? 1 : 0),
    drugCount: Storage.getDrugs().length
  };
  
  assertEq(afterUndo.drugCount, stateBeforeRestore.drugCount,
    '撤销后药品数恢复');
});

test('审计日志记录恢复操作', () => {
  const logs = Storage.getAuditLogs();
  const restoreLogs = logs.filter(l =>
    l.action && (
      l.action.includes('导入数据备份') ||
      l.action.includes('部分数据恢复') ||
      l.action.includes('恢复')
    )
  );
  assert(restoreLogs.length > 0, '应有恢复相关审计日志');
});

test('审计日志记录撤回操作', () => {
  const logs = Storage.getAuditLogs();
  const undoLogs = logs.filter(l =>
    l.action && l.action.includes('撤回数据恢复')
  );
  assert(undoLogs.length > 0, '应有撤回审计日志');
});

console.log('');

// ============================================================
// 场景 10：恢复方案草稿 CRUD
// ============================================================
console.log('--- [场景 10] 恢复方案草稿 CRUD ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let testDraft = null;

test('药师可以创建恢复方案草稿', () => {
  const result = ExportModule.createRestoreDraft({
    name: '测试草稿-001',
    note: '这是一个测试草稿',
    dataBlocks: ['shifts', 'drugs'],
    conflictResolutions: []
  });
  assert(result.success, '创建草稿应成功');
  assert(result.draft, '应返回草稿对象');
  assert(result.draft.status === 'draft', '状态应为 draft');
  assert(result.draft.name === '测试草稿-001', '名称应正确');
  assert(result.draft.dataBlocks.length === 2, '数据块数量应正确');
  testDraft = result.draft;
});

test('getRestoreDraft 可以获取草稿详情', () => {
  const result = ExportModule.getRestoreDraft(testDraft.id);
  assert(result.success, '获取草稿应成功');
  assert(result.draft.id === testDraft.id, 'ID 应匹配');
  assert(result.draft.name === '测试草稿-001', '名称应匹配');
});

test('listRestoreDrafts 可以列出草稿', () => {
  const result = ExportModule.listRestoreDrafts();
  assert(result.success, '列草稿应成功');
  assert(result.total >= 1, '至少有 1 个草稿');
  assert(result.drafts.length >= 1, '草稿列表非空');
});

test('updateRestoreDraft 可以更新草稿', () => {
  const result = ExportModule.updateRestoreDraft(testDraft.id, {
    name: '测试草稿-已更新',
    note: '备注已更新',
    dataBlocks: ['shifts', 'drugs', 'inventory']
  });
  assert(result.success, '更新草稿应成功');
  assert(result.draft.name === '测试草稿-已更新', '名称应已更新');
  assert(result.draft.note === '备注已更新', '备注应已更新');
  assert(result.draft.dataBlocks.length === 3, '数据块应已更新');
  assert(result.draft.updatedAt !== testDraft.updatedAt, '更新时间应变化');
  testDraft = result.draft;
});

test('listRestoreDrafts 按状态筛选', () => {
  const result = ExportModule.listRestoreDrafts({ status: 'draft' });
  assert(result.success, '筛选应成功');
  assert(result.drafts.every(d => d.status === 'draft'), '筛选结果都应是草稿状态');
});

test('deleteRestoreDraft 可以删除草稿', () => {
  const result = ExportModule.deleteRestoreDraft(testDraft.id);
  assert(result.success, '删除草稿应成功');

  const getResult = ExportModule.getRestoreDraft(testDraft.id);
  assert(!getResult.success, '删除后应无法获取');
});

console.log('');

// ============================================================
// 场景 11：草稿跨重启持久化验证
// ============================================================
console.log('--- [场景 11] 草稿跨重启持久化验证 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let persistentDraftId = null;

test('先创建一个草稿', () => {
  const result = ExportModule.createRestoreDraft({
    name: '持久化测试草稿',
    note: '验证跨重启后仍存在',
    dataBlocks: ['shifts', 'inventory', 'discrepancies'],
    conflictResolutions: []
  });
  assert(result.success, '创建应成功');
  persistentDraftId = result.draft.id;
});

test('模拟重启：重新加载模块后草稿仍存在', () => {
  const savedDrafts = Storage.getRestoreDrafts();
  assert(savedDrafts.length > 0, 'localStorage 中应有草稿');

  const found = savedDrafts.find(d => d.id === persistentDraftId);
  assert(found, '指定草稿应存在于存储中');
  assert(found.name === '持久化测试草稿', '名称应一致');
  assert(found.dataBlocks.length === 3, '数据块应一致');
});

test('模拟重启：重新加载后可正常读取草稿', () => {
  const result = ExportModule.getRestoreDraft(persistentDraftId);
  assert(result.success, '重启后获取草稿应成功');
  assert(result.draft.name === '持久化测试草稿', '重启后名称应一致');
});

console.log('');

// ============================================================
// 场景 12：草稿权限控制
// ============================================================
console.log('--- [场景 12] 草稿权限控制 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let nurseTestDraftId = null;

test('药师先创建一个草稿用于权限测试', () => {
  const result = ExportModule.createRestoreDraft({
    name: '权限测试草稿',
    dataBlocks: ['shifts'],
    conflictResolutions: []
  });
  assert(result.success, '药师创建草稿应成功');
  nurseTestDraftId = result.draft.id;
});

test('护士登录后可以查看草稿列表', () => {
  Auth.login('nurse', '123456');
  const result = ExportModule.listRestoreDrafts();
  assert(result.success, '护士查看草稿列表应成功');
  assert(result.total >= 1, '应能看到草稿');
});

test('护士登录后可以查看草稿详情', () => {
  const result = ExportModule.getRestoreDraft(nurseTestDraftId);
  assert(result.success, '护士查看草稿详情应成功');
});

test('护士无法创建草稿', () => {
  const result = ExportModule.createRestoreDraft({
    name: '护士尝试创建',
    dataBlocks: ['shifts'],
    conflictResolutions: []
  });
  assert(!result.success, '护士创建草稿应失败');
  assert(result.message.includes('药师'), '错误信息应提到药师');
});

test('护士无法更新草稿', () => {
  const result = ExportModule.updateRestoreDraft(nurseTestDraftId, {
    name: '护士尝试修改'
  });
  assert(!result.success, '护士更新草稿应失败');
});

test('护士无法删除草稿', () => {
  const result = ExportModule.deleteRestoreDraft(nurseTestDraftId);
  assert(!result.success, '护士删除草稿应失败');
});

test('护士无法提交草稿', () => {
  const backup = ExportModule.createBackup();
  const result = ExportModule.submitRestoreDraft(nurseTestDraftId, backup);
  assert(!result.success, '护士提交草稿应失败');
});

test('切回药师后可以正常操作草稿', () => {
  Auth.login('pharmacist', '123456');
  const result = ExportModule.updateRestoreDraft(nurseTestDraftId, {
    name: '药师已修改'
  });
  assert(result.success, '药师更新草稿应成功');
  assert(result.draft.name === '药师已修改', '名称应已修改');
});

console.log('');

// ============================================================
// 场景 13：提交草稿执行恢复 + 撤回联动
// ============================================================
console.log('--- [场景 13] 提交草稿执行恢复 + 撤回联动 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let submitBackup = null;
let submitDraftId = null;
let submitRecordId = null;

test('准备：创建一个有差异的备份', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('草稿提交测试班');
  Inventory.initializeInventory();
  submitBackup = deepClone(ExportModule.createBackup());

  Storage.clearCurrentShift();
  Shift.openShift('本地现有班');
  Inventory.initializeInventory();
});

test('创建草稿并提交执行恢复', () => {
  const conflicts = ExportModule.detectConflicts(submitBackup);
  const resolutions = [];
  conflicts.shifts.forEach(c => {
    resolutions.push(ExportModule.resolveConflictStrategy(c, 'overwrite'));
  });

  const draftResult = ExportModule.createRestoreDraft({
    name: '提交执行草稿',
    note: '测试草稿提交后执行恢复',
    dataBlocks: ExportModule.getAllDataBlocks(),
    conflictResolutions: resolutions
  });
  assert(draftResult.success, '创建草稿应成功');
  submitDraftId = draftResult.draft.id;

  Storage.clearCurrentShift();

  const submitResult = ExportModule.submitRestoreDraft(submitDraftId, submitBackup);
  assert(submitResult.success, `提交执行应成功：${submitResult.message || ''}`);
  assert(submitResult.restoreRecordId, '应有恢复记录ID');
  submitRecordId = submitResult.restoreRecordId;
});

test('提交后草稿状态变为 executed', () => {
  const result = ExportModule.getRestoreDraft(submitDraftId);
  assert(result.success, '获取草稿应成功');
  assert(result.draft.status === 'executed', '草稿状态应为 executed');
  assert(result.draft.restoreRecordId === submitRecordId, '草稿应关联恢复记录ID');
});

test('恢复记录应关联草稿信息', () => {
  const records = Storage.getRestoreRecords();
  const record = records.find(r => r.id === submitRecordId);
  assert(record, '应找到恢复记录');
  assert(record.draftId === submitDraftId, '记录应关联草稿ID');
  assert(record.draftName === '提交执行草稿', '记录应关联草稿名称');
});

test('已执行的草稿不能再次编辑', () => {
  const result = ExportModule.updateRestoreDraft(submitDraftId, {
    name: '尝试修改已执行的草稿'
  });
  assert(!result.success, '修改已执行的草稿应失败');
});

test('已执行的草稿不能再次提交', () => {
  const result = ExportModule.submitRestoreDraft(submitDraftId, submitBackup);
  assert(!result.success, '重复提交应失败');
});

console.log('');

// ============================================================
// 场景 14：冲突策略历史记录与复用提示
// ============================================================
console.log('--- [场景 14] 冲突策略历史记录与复用提示 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let strategyTestBackup = null;

test('准备：制造冲突并执行一次恢复以记录策略', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('策略测试班A');
  Inventory.initializeInventory();

  const drugs = Storage.getDrugs();
  const drug = { ...drugs[0], initialStock: 999 };
  const allDrugs = drugs.map(d => d.code === drug.code ? drug : d);
  Storage.saveDrugs(allDrugs);

  strategyTestBackup = deepClone(ExportModule.createBackup());

  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
});

test('首次导入：checkConflictStrategyReuse 提示无历史策略', () => {
  const conflicts = ExportModule.detectConflicts(strategyTestBackup);
  const result = ExportModule.checkConflictStrategyReuse(conflicts);
  assert(result.success, '检查应成功');
  assert(!result.hasMatches, '首次应没有匹配的历史策略');
  assert(result.matchedCount === 0, '匹配数应为 0');
});

test('执行一次恢复（选择 overwrite 策略），策略会被记录', () => {
  const conflicts = ExportModule.detectConflicts(strategyTestBackup);
  const resolutions = [];

  conflicts.shifts.forEach(c => {
    resolutions.push(ExportModule.resolveConflictStrategy(c, 'overwrite'));
  });
  conflicts.drugs.forEach(c => {
    resolutions.push(ExportModule.resolveConflictStrategy(c, 'overwrite'));
  });

  Storage.clearCurrentShift();
  const result = ExportModule.applyBackup(strategyTestBackup, resolutions);
  assert(result.success, `恢复应成功：${result.message || ''}`);

  const history = Storage.getConflictStrategyHistory();
  assert(history.length > 0, '冲突策略历史应有记录');
});

test('再次导入同一备份：checkConflictStrategyReuse 提示可复用', () => {
  const savedStrategyHistory = Storage.getConflictStrategyHistory();

  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');

  Storage.saveConflictStrategyHistory(savedStrategyHistory);

  const conflicts = ExportModule.detectConflicts(strategyTestBackup);
  const result = ExportModule.checkConflictStrategyReuse(conflicts);
  assert(result.success, '检查应成功');
  assert(result.hasMatches, '应有匹配的历史策略');
  assert(result.matchedCount > 0, '匹配数应大于 0');
  assert(result.promptMessage && result.promptMessage.length > 0, '应有提示消息');
});

test('applyConflictStrategyReuse 可以批量复用策略', () => {
  const conflicts = ExportModule.detectConflicts(strategyTestBackup);
  const result = ExportModule.applyConflictStrategyReuse(conflicts, true);
  assert(result.success, '复用应成功');
  assert(result.appliedCount > 0, '应用数应大于 0');
  assert(result.resolutions.length === result.appliedCount, '返回的决议数应等于应用数');

  result.resolutions.forEach(r => {
    assert(r.strategy === 'overwrite', '复用的策略应为 overwrite');
    assert(r.conflict, '每个决议都应关联冲突对象');
  });
});

test('复用的策略不是静默套用，需要显式调用', () => {
  const conflicts = ExportModule.detectConflicts(strategyTestBackup);
  const checkResult = ExportModule.checkConflictStrategyReuse(conflicts);
  assert(checkResult.hasMatches, '检测到可复用策略');

  const historyBefore = Storage.getConflictStrategyHistory();
  const countBefore = historyBefore.length;

  Storage.clearCurrentShift();
  const result = ExportModule.applyBackup(strategyTestBackup, []);
  assert(result.success, '不传入复用策略时，使用默认策略');

  const historyAfter = Storage.getConflictStrategyHistory();
  assert(historyAfter.length >= countBefore, '策略历史数量不应减少');
});

console.log('');

// ============================================================
// 场景 15：恢复记录筛选与前后数据对比
// ============================================================
console.log('--- [场景 15] 恢复记录筛选与前后数据对比 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let filterBackup = null;
let filterRecordId = null;

test('准备：执行几次恢复以便筛选', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('筛选测试班');
  Inventory.initializeInventory();
  filterBackup = deepClone(ExportModule.createBackup());

  Storage.clearCurrentShift();

  const result = ExportModule.applyBackup(filterBackup, []);
  assert(result.success, '恢复应成功');
  filterRecordId = result.restoreRecordId;
});

test('filterRestoreRecords 可以按操作者筛选', () => {
  const result = ExportModule.filterRestoreRecords({
    operatorName: '张药师'
  });
  assert(result.success, '筛选应成功');
  assert(result.records.every(r => r.restoredBy && r.restoredBy.name === '张药师'),
    '所有记录都应由张药师操作');
});

test('filterRestoreRecords 可以按数据块筛选', () => {
  const result = ExportModule.filterRestoreRecords({
    dataBlock: 'shifts'
  });
  assert(result.success, '按数据块筛选应成功');
  assert(result.records.every(r => r.dataBlocks && r.dataBlocks.includes('shifts')),
    '所有记录都应包含班次数据块');
});

test('filterRestoreRecords 可以按状态筛选', () => {
  const result = ExportModule.filterRestoreRecords({ status: 'success' });
  assert(result.success, '按状态筛选应成功');
  assert(result.records.every(r => r.status === 'success'),
    '所有记录都应为成功状态');
});

test('filterRestoreRecords 可以按是否撤回筛选', () => {
  const result = ExportModule.filterRestoreRecords({ undone: false });
  assert(result.success, '按撤回状态筛选应成功');
  assert(result.records.every(r => r.undone === false),
    '所有记录都应为未撤回状态');
});

test('getRestoreRecordWithChanges 返回带变更详情的记录', () => {
  const result = ExportModule.getRestoreRecordWithChanges(filterRecordId);
  assert(result.success, '获取详情应成功');
  assert(result.record, '应有记录数据');
  assert(result.changes, '应有变更数据');
  assert(result.changes.shifts, '应有班次变更统计');
  assert(result.changes.drugs, '应有药品变更统计');
  assert(result.changes.corrections, '应有修正变更统计');
  assert(result.changes.auditLogs, '应有审计日志变更统计');
  assert(result.conflictResolutions, '应有冲突决议');
  assert(result.dataBlocks, '应有数据块列表');
});

test('getRestoreRecordWithChanges 指示是否可撤回', () => {
  const result = ExportModule.getRestoreRecordWithChanges(filterRecordId);
  assert(result.success, '获取详情应成功');
  assert(result.isUndoable === true, '最新成功的恢复应可撤回');
});

console.log('');

// ============================================================
// 场景 16：撤回后禁止重复撤回
// ============================================================
console.log('--- [场景 16] 撤回后禁止重复撤回 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let undoTestBackup = null;
let undoTestRecordId = null;

test('准备：执行一次成功的恢复', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('撤回测试班');
  Inventory.initializeInventory();
  undoTestBackup = deepClone(ExportModule.createBackup());

  Storage.clearCurrentShift();

  const result = ExportModule.applyBackup(undoTestBackup, []);
  assert(result.success, '恢复应成功');
  undoTestRecordId = result.restoreRecordId;
});

test('第一次撤回应成功', () => {
  const result = ExportModule.undoRestoreByRecordId(undoTestRecordId);
  assert(result.success, `第一次撤回应成功：${result.message || ''}`);
  assert(result.record.undone === true, '记录应标记为已撤回');
  assert(result.record.undoneBy, '应有撤回人信息');
  assert(result.record.undoneAt, '应有撤回时间');
});

test('撤回后再次撤回应被拒绝', () => {
  const result = ExportModule.undoRestoreByRecordId(undoTestRecordId);
  assert(!result.success, '重复撤回应失败');
  assert(result.message.includes('已被撤回') || result.message.includes('重复'),
    '错误信息应说明已被撤回');
});

test('undoLastRestore 也不能重复撤回', () => {
  const result = ExportModule.undoLastRestore();
  assert(!result.success, 'undoLastRestore 重复撤回应失败');
});

test('撤回后恢复记录的 undone 状态保持为 true', () => {
  const records = Storage.getRestoreRecords();
  const record = records.find(r => r.id === undoTestRecordId);
  assert(record, '记录应存在');
  assert(record.undone === true, 'undone 应保持为 true');
});

test('撤回后快照已被清除', () => {
  const snapshot = Storage.getLastRestoreSnapshot();
  assert(!snapshot, '撤回后快照应被清除');
});

console.log('');

// ============================================================
// 场景 17：草稿执行后撤回联动
// ============================================================
console.log('--- [场景 17] 草稿执行后撤回联动 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let draftUndoBackup = null;
let draftUndoDraftId = null;
let draftUndoRecordId = null;

test('准备：创建草稿并提交执行', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('草稿撤回测试班');
  Inventory.initializeInventory();
  draftUndoBackup = deepClone(ExportModule.createBackup());

  const draftResult = ExportModule.createRestoreDraft({
    name: '撤回联动测试草稿',
    dataBlocks: ExportModule.getAllDataBlocks(),
    conflictResolutions: []
  });
  assert(draftResult.success, '创建草稿应成功');
  draftUndoDraftId = draftResult.draft.id;

  Storage.clearCurrentShift();

  const submitResult = ExportModule.submitRestoreDraft(draftUndoDraftId, draftUndoBackup);
  assert(submitResult.success, '提交执行应成功');
  draftUndoRecordId = submitResult.restoreRecordId;
});

test('撤回后草稿状态变为 undone', () => {
  const result = ExportModule.undoRestoreByRecordId(draftUndoRecordId);
  assert(result.success, '撤回应成功');

  const draftResult = ExportModule.getRestoreDraft(draftUndoDraftId);
  assert(draftResult.success, '获取草稿应成功');
  assert(draftResult.draft.status === 'undone', '草稿状态应为 undone');
  assert(draftResult.draft.undoneAt, '草稿应有撤回时间');
});

test('已撤回的草稿不能再次提交', () => {
  const result = ExportModule.submitRestoreDraft(draftUndoDraftId, draftUndoBackup);
  assert(!result.success, '已撤回草稿提交应失败');
});

console.log('');

// ============================================================
// 汇总
// ============================================================
const passed = results.filter(r => r.pass).length;
const total = results.length;
const failed = total - passed;

console.log('\n================================================================');
console.log(`  测试完成：${passed}/${total} 通过，${failed} 失败`);
console.log('================================================================\n');

if (failed > 0) {
  console.log('失败详情：');
  results.filter(r => !r.pass).forEach(r => {
    console.log(`  ✗ ${r.name}`);
    console.log(`    错误：${r.error}`);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('  所有恢复操作台测试通过！ ✓\n');
  process.exit(0);
}
