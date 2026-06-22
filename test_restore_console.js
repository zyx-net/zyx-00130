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
