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
console.log('  恢复工作台链路验证 — 草案续编 / 撤回禁二次 / 权限 / 旧决定提示');
console.log('================================================================\n');

// ============================================================
// 场景 A：草案跨重启续编
// ============================================================
console.log('--- [场景 A] 草案跨重启续编 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let draftA = null;
let backupA = null;

test('创建有备份关联的草案', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('草案续编测试班');
  Inventory.initializeInventory();
  backupA = deepClone(ExportModule.createBackup());

  const result = ExportModule.createRestoreDraft({
    name: '续编测试草案',
    note: '验证跨重启后续编能力',
    dataBlocks: ['shifts', 'drugs', 'inventory'],
    conflictResolutions: [],
    backupInfo: {
      version: backupA.version,
      exportedAt: backupA.exportedAt,
      exportedAtFormatted: backupA.exportedAtFormatted,
      exportedBy: backupA.exportedBy,
      backupId: null,
      summary: null
    }
  });
  assert(result.success, '创建草案应成功');
  assert(result.draft.status === 'draft', '状态应为草稿');
  assert(result.draft.dataBlocks.length === 3, '应有 3 个数据块');
  draftA = result.draft;
});

test('草案在 localStorage 中持久化', () => {
  const raw = localStorage[Storage.KEYS.RESTORE_DRAFTS];
  assert(raw, 'localStorage 应有草案数据');
  const parsed = JSON.parse(raw);
  const found = parsed.find(d => d.id === draftA.id);
  assert(found, '应找到指定草案');
  assert(found.name === '续编测试草案', '名称应一致');
});

test('模拟重启：重新加载模块后草案可读取', () => {
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
  const result = Export2.getRestoreDraft(draftA.id);
  assert(result.success, '重启后获取草案应成功');
  assert(result.draft.name === '续编测试草案', '重启后名称应一致');
  assert(result.draft.dataBlocks.length === 3, '重启后数据块应一致');

  globalThis.localStorage = {
    getItem: (k) => (k in localStorage ? localStorage[k] : null),
    setItem: (k, v) => { localStorage[k] = String(v); },
    removeItem: (k) => { delete localStorage[k]; }
  };
});

test('模拟重启：可继续编辑草案', () => {
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
  const updateResult = Export2.updateRestoreDraft(draftA.id, {
    name: '续编测试草案-已续编',
    note: '跨重启后续编成功',
    dataBlocks: ['shifts', 'drugs', 'inventory', 'discrepancies']
  });
  assert(updateResult.success, '重启后更新草案应成功');
  assert(updateResult.draft.name === '续编测试草案-已续编', '名称应已更新');
  assert(updateResult.draft.dataBlocks.length === 4, '数据块应已增加');

  globalThis.localStorage = {
    getItem: (k) => (k in localStorage ? localStorage[k] : null),
    setItem: (k, v) => { localStorage[k] = String(v); },
    removeItem: (k) => { delete localStorage[k]; }
  };
});

test('同一批备份重新导入后能匹配到已有草案', () => {
  const allDrafts = Storage.getRestoreDrafts();
  const matched = allDrafts.filter(d =>
    d.backupInfo &&
    d.backupInfo.exportedAt === backupA.exportedAt
  );
  assert(matched.length >= 1, '应能通过备份导出时间匹配到已有草案');
});

test('草案的 updatedAt 在每次编辑后变化', () => {
  const before = draftA.updatedAt;
  const updateResult = ExportModule.updateRestoreDraft(draftA.id, {
    note: '再次修改'
  });
  assert(updateResult.success, '更新应成功');
  assert(updateResult.draft.updatedAt !== before, 'updatedAt 应变化');
});

console.log('');

// ============================================================
// 场景 B：恢复后撤回且不可二次撤回
// ============================================================
console.log('--- [场景 B] 恢复后撤回且不可二次撤回 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let backupB = null;
let recordBId = null;

test('准备：创建备份并执行恢复', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('撤回禁二次测试班');
  Inventory.initializeInventory();
  backupB = deepClone(ExportModule.createBackup());

  Storage.clearCurrentShift();

  const result = ExportModule.applyBackup(backupB, []);
  assert(result.success, '恢复应成功');
  recordBId = result.restoreRecordId;
});

test('恢复记录初始状态：未撤回、可撤回', () => {
  const records = Storage.getRestoreRecords();
  const record = records.find(r => r.id === recordBId);
  assert(record, '记录应存在');
  assertEq(record.undone, false, '应未撤回');
  assertEq(record.status, 'success', '应为成功状态');
});

test('第一次撤回应成功', () => {
  const result = ExportModule.undoRestoreByRecordId(recordBId);
  assert(result.success, `第一次撤回应成功：${result.message || ''}`);
  assert(result.record.undone === true, '记录应标记为已撤回');
  assert(result.record.undoneBy, '应有撤回人');
  assert(result.record.undoneAt, '应有撤回时间');
});

test('撤回后记录状态变为 undone=true', () => {
  const records = Storage.getRestoreRecords();
  const record = records.find(r => r.id === recordBId);
  assert(record.undone === true, 'undone 应为 true');
});

test('undoRestoreByRecordId 不能重复撤回同一记录', () => {
  const result = ExportModule.undoRestoreByRecordId(recordBId);
  assert(!result.success, '重复撤回应失败');
  assert(
    result.message.includes('已被撤回') || result.message.includes('重复'),
    '错误信息应提及已撤回或重复'
  );
});

test('undoLastRestore 也不能重复撤回', () => {
  const result = ExportModule.undoLastRestore();
  assert(!result.success, 'undoLastRestore 重复撤回应失败');
});

test('撤回后快照被清除，无法再次撤回', () => {
  const snapshot = Storage.getLastRestoreSnapshot();
  assert(!snapshot, '快照应被清除');
});

test('草稿执行后撤回联动：草稿状态变为 undone', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');

  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('草案撤回联动班');
  Inventory.initializeInventory();
  const bk = deepClone(ExportModule.createBackup());

  const draftResult = ExportModule.createRestoreDraft({
    name: '撤回联动草案',
    dataBlocks: ExportModule.getAllDataBlocks(),
    conflictResolutions: []
  });
  assert(draftResult.success, '创建草案应成功');

  Storage.clearCurrentShift();

  const submitResult = ExportModule.submitRestoreDraft(draftResult.draft.id, bk);
  assert(submitResult.success, '提交执行应成功');

  const undoResult = ExportModule.undoRestoreByRecordId(submitResult.restoreRecordId);
  assert(undoResult.success, '撤回应成功');

  const draftAfter = ExportModule.getRestoreDraft(draftResult.draft.id);
  assert(draftAfter.success, '获取草稿应成功');
  assert(draftAfter.draft.status === 'undone', '草稿状态应为 undone');
});

test('undone 状态的草稿不能再次提交', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');

  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('undone草稿测试');
  Inventory.initializeInventory();
  const bk = deepClone(ExportModule.createBackup());

  const draftResult = ExportModule.createRestoreDraft({
    name: 'undone草案',
    dataBlocks: ExportModule.getAllDataBlocks(),
    conflictResolutions: []
  });

  Storage.clearCurrentShift();
  ExportModule.submitRestoreDraft(draftResult.draft.id, bk);

  const recordId = Storage.getRestoreRecords()[0].id;
  ExportModule.undoRestoreByRecordId(recordId);

  const reSubmit = ExportModule.submitRestoreDraft(draftResult.draft.id, bk);
  assert(!reSubmit.success, 'undone 草稿不能再次提交');
});

console.log('');

// ============================================================
// 场景 C：权限限制 — 草案和恢复操作
// ============================================================
console.log('--- [场景 C] 权限限制 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let permissionDraftId = null;

test('药师创建草案', () => {
  const result = ExportModule.createRestoreDraft({
    name: '权限测试草案',
    dataBlocks: ['shifts'],
    conflictResolutions: []
  });
  assert(result.success, '药师创建应成功');
  permissionDraftId = result.draft.id;
});

test('护士可以查看草案列表', () => {
  Auth.login('nurse', '123456');
  const result = ExportModule.listRestoreDrafts();
  assert(result.success, '护士查看列表应成功');
  assert(result.total >= 1, '应能看到草案');
});

test('护士可以查看草案详情', () => {
  const result = ExportModule.getRestoreDraft(permissionDraftId);
  assert(result.success, '护士查看详情应成功');
});

test('护士不能创建草案', () => {
  const result = ExportModule.createRestoreDraft({
    name: '护士创建',
    dataBlocks: ['shifts'],
    conflictResolutions: []
  });
  assert(!result.success, '护士创建应失败');
  assert(result.message.includes('药师'), '错误信息应提及药师');
});

test('护士不能编辑草案', () => {
  const result = ExportModule.updateRestoreDraft(permissionDraftId, {
    name: '护士修改'
  });
  assert(!result.success, '护士编辑应失败');
});

test('护士不能删除草案', () => {
  const result = ExportModule.deleteRestoreDraft(permissionDraftId);
  assert(!result.success, '护士删除应失败');
});

test('护士不能提交草案', () => {
  const bk = ExportModule.createBackup();
  const result = ExportModule.submitRestoreDraft(permissionDraftId, bk);
  assert(!result.success, '护士提交应失败');
});

test('护士不能执行恢复', () => {
  Storage.clearCurrentShift();
  const bk = ExportModule.createBackup();
  Storage.clearCurrentShift();
  const result = ExportModule.applyBackup(bk, []);
  assert(!result.success, '护士执行恢复应失败');
});

test('护士不能撤回恢复', () => {
  const result = ExportModule.undoLastRestore();
  assert(!result.success, '护士撤回应失败');
});

test('护士可以查看恢复记录', () => {
  const result = ExportModule.filterRestoreRecords({});
  assert(result.success, '护士查看记录应成功');
});

test('切回药师后可以正常操作', () => {
  Auth.login('pharmacist', '123456');
  const result = ExportModule.updateRestoreDraft(permissionDraftId, {
    name: '药师修改成功'
  });
  assert(result.success, '药师修改应成功');
  assert(result.draft.name === '药师修改成功', '名称应已修改');
});

test('草案 CRUD 权限函数一致性', () => {
  Auth.login('pharmacist', '123456');
  assertEq(Auth.canCreateRestoreDraft(), true, '药师可创建草案');
  assertEq(Auth.canSubmitRestoreDraft(), true, '药师可提交草案');
  assertEq(Auth.canDeleteRestoreDraft(), true, '药师可删除草案');
  assertEq(Auth.canViewRestoreDrafts(), true, '药师可查看草案');

  Auth.login('nurse', '123456');
  assertEq(Auth.canCreateRestoreDraft(), false, '护士不可创建草案');
  assertEq(Auth.canSubmitRestoreDraft(), false, '护士不可提交草案');
  assertEq(Auth.canDeleteRestoreDraft(), false, '护士不可删除草案');
  assertEq(Auth.canViewRestoreDrafts(), true, '护士可查看草案');
});

console.log('');

// ============================================================
// 场景 D：旧决定提示 — 不默认套用，用户取消后可重新选择
// ============================================================
console.log('--- [场景 D] 旧决定提示 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let strategyBackup = null;

test('准备：创建一个有药品冲突的备份', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('旧决定测试班');
  Inventory.initializeInventory();

  const drugs = Storage.getDrugs();
  const modified = drugs.map(d =>
    d.code === 'DRUG001' ? { ...d, initialStock: 999, name: '阿莫西林-修改版' } : d
  );
  Storage.saveDrugs(modified);

  strategyBackup = deepClone(ExportModule.createBackup());

  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
});

test('首次导入：checkConflictStrategyReuse 无历史策略', () => {
  const conflicts = ExportModule.detectConflicts(strategyBackup);
  const result = ExportModule.checkConflictStrategyReuse(conflicts);
  assert(result.success, '检查应成功');
  assert(!result.hasMatches, '首次应无匹配');
  assert(result.matchedCount === 0, '匹配数应为 0');
});

test('执行一次恢复（选择 overwrite），策略被记录', () => {
  const conflicts = ExportModule.detectConflicts(strategyBackup);
  const resolutions = [];
  conflicts.shifts.forEach(c => {
    resolutions.push(ExportModule.resolveConflictStrategy(c, 'overwrite'));
  });
  conflicts.drugs.forEach(c => {
    resolutions.push(ExportModule.resolveConflictStrategy(c, 'overwrite'));
  });

  Storage.clearCurrentShift();
  const result = ExportModule.applyBackup(strategyBackup, resolutions);
  assert(result.success, `恢复应成功：${result.message || ''}`);

  const history = Storage.getConflictStrategyHistory();
  assert(history.length > 0, '策略历史应有记录');
});

test('再次导入同一备份：checkConflictStrategyReuse 检测到旧决定', () => {
  const savedHistory = Storage.getConflictStrategyHistory();

  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.saveConflictStrategyHistory(savedHistory);

  const conflicts = ExportModule.detectConflicts(strategyBackup);
  const result = ExportModule.checkConflictStrategyReuse(conflicts);
  assert(result.success, '检查应成功');
  assert(result.hasMatches, '应有匹配的旧策略');
  assert(result.matchedCount > 0, '匹配数应大于 0');
  assert(result.promptMessage && result.promptMessage.length > 0, '应有提示消息');
});

test('旧决定提示包含策略详情', () => {
  const conflicts = ExportModule.detectConflicts(strategyBackup);
  const result = ExportModule.checkConflictStrategyReuse(conflicts);
  assert(result.matched.length > 0, 'matched 列表非空');

  const match = result.matched[0];
  assert(match.previousStrategy, '应有 previousStrategy');
  assert(match.previousUsedAt, '应有 previousUsedAt');
  assert(match.conflict, '应有 conflict 对象');
});

test('不调用 applyConflictStrategyReuse 时不自动套用旧策略', () => {
  const conflicts = ExportModule.detectConflicts(strategyBackup);
  const checkResult = ExportModule.checkConflictStrategyReuse(conflicts);
  assert(checkResult.hasMatches, '检测到可复用策略');

  Storage.clearCurrentShift();
  const result = ExportModule.applyBackup(strategyBackup, []);
  assert(result.success, '不传复用策略时用默认策略');

  const historyAfter = Storage.getConflictStrategyHistory();
  const drugStrategies = historyAfter.filter(h => h.conflictType === 'drug_content_conflict');
  const hasOverwrite = drugStrategies.some(h => h.strategy === 'overwrite');
  assert(hasOverwrite, '策略历史中应有 overwrite 记录（来自之前的恢复）');
});

test('用户取消沿用后可选择不同策略', () => {
  const savedHistory = Storage.getConflictStrategyHistory();

  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.saveConflictStrategyHistory(savedHistory);

  const conflicts = ExportModule.detectConflicts(strategyBackup);
  const checkResult = ExportModule.checkConflictStrategyReuse(conflicts);
  assert(checkResult.hasMatches, '检测到可复用');

  const allConflicts = [
    ...(conflicts.shifts || []),
    ...(conflicts.corrections || []),
    ...(conflicts.drugs || [])
  ];

  const manualResolutions = allConflicts.map(c =>
    ExportModule.resolveConflictStrategy(c, 'skip')
  );

  Storage.clearCurrentShift();
  const result = ExportModule.applyBackup(strategyBackup, manualResolutions);
  assert(result.success, '使用不同策略应成功');

  if (result.results) {
    assert(result.results.skippedShifts >= 0, '跳过数应合法');
  }
});

test('applyConflictStrategyReuse 显式调用后才应用旧策略', () => {
  const savedHistory = Storage.getConflictStrategyHistory();

  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.saveConflictStrategyHistory(savedHistory);

  const conflicts = ExportModule.detectConflicts(strategyBackup);
  const reuseResult = ExportModule.applyConflictStrategyReuse(conflicts, true);
  assert(reuseResult.success, '复用应成功');
  assert(reuseResult.appliedCount > 0, '应用数应大于 0');
  assert(reuseResult.resolutions.length > 0, '应有决议');

  reuseResult.resolutions.forEach(r => {
    assert(r.strategy === 'skip' || r.strategy === 'overwrite', '复用的策略应为历史策略');
    assert(r.conflict, '每个决议应关联冲突');
  });

  Storage.clearCurrentShift();
  const applyResult = ExportModule.applyBackup(strategyBackup, reuseResult.resolutions);
  assert(applyResult.success, '使用复用策略恢复应成功');
});

test('部分冲突有旧决定、部分没有时只提示有历史的', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');

  const newBackup = deepClone(ExportModule.createBackup());

  const conflicts = ExportModule.detectConflicts(newBackup);
  const result = ExportModule.checkConflictStrategyReuse(conflicts);

  assert(result.success, '检查应成功');
  assert(result.unmatched !== undefined, '应有 unmatched 列表');
  assert(result.matchedCount + result.unmatched.length === result.totalCount,
    'matched + unmatched 应等于 total');
});

console.log('');

// ============================================================
// 场景 E：恢复记录筛选 — 按时间、处理人、数据分类、是否撤回
// ============================================================
console.log('--- [场景 E] 恢复记录筛选 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

test('按处理人筛选', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('筛选测试班');
  Inventory.initializeInventory();
  const bk = deepClone(ExportModule.createBackup());
  Storage.clearCurrentShift();
  ExportModule.applyBackup(bk, []);

  const result = ExportModule.filterRestoreRecords({ operatorName: '张药师' });
  assert(result.success, '筛选应成功');
  assert(result.records.every(r => r.restoredBy && r.restoredBy.name === '张药师'),
    '所有记录都应由张药师操作');
});

test('按数据分类筛选', () => {
  const result = ExportModule.filterRestoreRecords({ dataBlock: 'shifts' });
  assert(result.success, '按数据块筛选应成功');
  assert(result.records.every(r => r.dataBlocks && r.dataBlocks.includes('shifts')),
    '所有记录都应包含班次数据块');
});

test('按是否撤回筛选 — 未撤回', () => {
  const result = ExportModule.filterRestoreRecords({ undone: false });
  assert(result.success, '按撤回状态筛选应成功');
  assert(result.records.every(r => r.undone === false), '都应为未撤回');
});

test('执行撤回后按已撤回筛选', () => {
  const records = Storage.getRestoreRecords();
  const latestRecord = records[0];

  ExportModule.undoRestoreByRecordId(latestRecord.id);

  const result = ExportModule.filterRestoreRecords({ undone: true });
  assert(result.success, '筛选已撤回应成功');
  assert(result.records.length > 0, '应有已撤回记录');
  assert(result.records.every(r => r.undone === true), '都应为已撤回');
});

test('按时间范围筛选', () => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const y = yesterday.toISOString().split('T')[0];
  const t = tomorrow.toISOString().split('T')[0];

  const result = ExportModule.filterRestoreRecords({ startDate: y, endDate: t });
  assert(result.success, '按时间筛选应成功');
  assert(result.records.length > 0, '时间范围内应有记录');
});

test('组合筛选', () => {
  const result = ExportModule.filterRestoreRecords({
    operatorName: '张药师',
    dataBlock: 'shifts',
    undone: false
  });
  assert(result.success, '组合筛选应成功');
  result.records.forEach(r => {
    assert(r.restoredBy && r.restoredBy.name === '张药师', '应为张药师');
    assert(r.dataBlocks && r.dataBlocks.includes('shifts'), '应包含班次');
    assert(r.undone === false, '应为未撤回');
  });
});

console.log('');

// ============================================================
// 场景 F：记录详情 — 前后对比 + 草案关联 + 审计链
// ============================================================
console.log('--- [场景 F] 记录详情与审计链 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let detailRecordId = null;
let detailDraftId = null;

test('准备：通过草案提交执行恢复', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('详情测试班');
  Inventory.initializeInventory();
  const bk = deepClone(ExportModule.createBackup());

  const draftResult = ExportModule.createRestoreDraft({
    name: '详情测试草案',
    note: '用于验证详情与审计链',
    dataBlocks: ExportModule.getAllDataBlocks(),
    conflictResolutions: []
  });
  assert(draftResult.success, '创建草案应成功');
  detailDraftId = draftResult.draft.id;

  Storage.clearCurrentShift();

  const submitResult = ExportModule.submitRestoreDraft(detailDraftId, bk);
  assert(submitResult.success, '提交执行应成功');
  detailRecordId = submitResult.restoreRecordId;
});

test('getRestoreRecordWithChanges 返回变更对比', () => {
  const result = ExportModule.getRestoreRecordWithChanges(detailRecordId);
  assert(result.success, '获取详情应成功');
  assert(result.changes, '应有 changes');
  assert(result.changes.shifts, '应有班次变更');
  assert(result.changes.drugs, '应有药品变更');
  assert(result.changes.corrections, '应有修正变更');
  assert(result.changes.auditLogs, '应有审计日志变更');
});

test('变更对比包含前后数据统计', () => {
  const result = ExportModule.getRestoreRecordWithChanges(detailRecordId);
  const c = result.changes;
  assert(typeof c.shifts.imported === 'number', 'shifts.imported 应为数字');
  assert(typeof c.shifts.overwritten === 'number', 'shifts.overwritten 应为数字');
  assert(typeof c.shifts.merged === 'number', 'shifts.merged 应为数字');
  assert(typeof c.drugs.imported === 'number', 'drugs.imported 应为数字');
  assert(typeof c.auditLogs.imported === 'number', 'auditLogs.imported 应为数字');
});

test('记录关联草案信息', () => {
  const result = ExportModule.getRestoreRecordWithChanges(detailRecordId);
  assert(result.draftInfo, '应有草案信息');
  assert(result.draftInfo.draftId === detailDraftId, '草案ID应匹配');
  assert(result.draftInfo.draftName === '详情测试草案', '草案名称应匹配');
});

test('审计日志记录恢复操作', () => {
  const logs = Storage.getAuditLogs();
  const restoreLogs = logs.filter(l =>
    l.action && (l.action.includes('导入数据备份') || l.action.includes('恢复'))
  );
  assert(restoreLogs.length > 0, '应有恢复相关审计日志');
});

test('审计日志记录草案提交', () => {
  const logs = Storage.getAuditLogs();
  const draftLogs = logs.filter(l =>
    l.action && l.action.includes('提交恢复方案草稿')
  );
  assert(draftLogs.length > 0, '应有草案提交审计日志');
});

test('撤回后审计日志记录撤回操作', () => {
  ExportModule.undoRestoreByRecordId(detailRecordId);

  const logs = Storage.getAuditLogs();
  const undoLogs = logs.filter(l =>
    l.action && l.action.includes('撤回数据恢复')
  );
  assert(undoLogs.length > 0, '应有撤回审计日志');
});

test('撤回后草案状态联动', () => {
  const draftResult = ExportModule.getRestoreDraft(detailDraftId);
  assert(draftResult.success, '获取草稿应成功');
  assert(draftResult.draft.status === 'undone', '草稿应为 undone 状态');
});

console.log('');

// ============================================================
// 场景 G：完整值班链路 — 草案创建 → 编辑 → 续编 → 提交 → 撤回
// ============================================================
console.log('--- [场景 G] 完整值班链路 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let flowBackup = null;
let flowDraftId = null;

test('步骤1：创建备份', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('完整链路测试班');
  Inventory.initializeInventory();
  flowBackup = deepClone(ExportModule.createBackup());
  assert(flowBackup, '备份应存在');
});

test('步骤2：创建草案并保存数据范围', () => {
  const result = ExportModule.createRestoreDraft({
    name: '完整链路草案',
    note: '值班恢复操作',
    dataBlocks: ['shifts', 'drugs'],
    conflictResolutions: [],
    backupInfo: {
      version: flowBackup.version,
      exportedAt: flowBackup.exportedAt,
      exportedAtFormatted: flowBackup.exportedAtFormatted,
      exportedBy: flowBackup.exportedBy,
      backupId: null,
      summary: null
    }
  });
  assert(result.success, '创建草案应成功');
  flowDraftId = result.draft.id;
  assert(result.draft.dataBlocks.length === 2, '数据块应为 2');
});

test('步骤3：退出后重新进入，继续编辑草案', () => {
  const updateResult = ExportModule.updateRestoreDraft(flowDraftId, {
    dataBlocks: ['shifts', 'drugs', 'inventory'],
    note: '续编：增加了盘点数据'
  });
  assert(updateResult.success, '续编应成功');
  assert(updateResult.draft.dataBlocks.length === 3, '数据块应增加');
});

test('步骤4：检测冲突，设置策略，保存到草案', () => {
  const conflicts = ExportModule.detectConflicts(flowBackup);
  const resolutions = [];
  conflicts.shifts.forEach(c => {
    resolutions.push(ExportModule.resolveConflictStrategy(c, 'overwrite'));
  });
  conflicts.drugs.forEach(c => {
    resolutions.push(ExportModule.resolveConflictStrategy(c, 'overwrite'));
  });

  const updateResult = ExportModule.updateRestoreDraft(flowDraftId, {
    conflictResolutions: resolutions
  });
  assert(updateResult.success, '保存冲突策略应成功');
});

test('步骤5：提交执行恢复', () => {
  Storage.clearCurrentShift();

  const result = ExportModule.submitRestoreDraft(flowDraftId, flowBackup);
  assert(result.success, `提交执行应成功：${result.message || ''}`);
  assert(result.restoreRecordId, '应有恢复记录ID');
});

test('步骤6：恢复后查看记录详情', () => {
  const records = Storage.getRestoreRecords();
  const record = records.find(r => r.draftId === flowDraftId);
  assert(record, '应找到关联草案的记录');
  assert(record.status === 'success', '应为成功');
  assert(record.undone === false, '应未撤回');
});

test('步骤7：撤回恢复', () => {
  const records = Storage.getRestoreRecords();
  const record = records[0];
  const result = ExportModule.undoRestoreByRecordId(record.id);
  assert(result.success, '撤回应成功');
});

test('步骤8：不可二次撤回', () => {
  const records = Storage.getRestoreRecords();
  const record = records[0];
  const result = ExportModule.undoRestoreByRecordId(record.id);
  assert(!result.success, '二次撤回应失败');
});

test('步骤9：草案状态为 undone，不可再提交', () => {
  const draftResult = ExportModule.getRestoreDraft(flowDraftId);
  assert(draftResult.draft.status === 'undone', '草案应为 undone');

  const reSubmit = ExportModule.submitRestoreDraft(flowDraftId, flowBackup);
  assert(!reSubmit.success, 'undone 草稿不能再提交');
});

console.log('');

// ============================================================
// 场景 H：旧决定提示 — 取消后重新选择不同策略
// ============================================================
console.log('--- [场景 H] 旧决定提示取消后重新选择 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let reuseBackup = null;

test('准备：创建有药品冲突的备份并先执行一次 overwrite', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('旧决定取消测试班');
  Inventory.initializeInventory();

  const drugs = Storage.getDrugs();
  const modified = drugs.map(d =>
    d.code === 'DRUG002' ? { ...d, initialStock: 500, name: '布洛芬-修改版' } : d
  );
  Storage.saveDrugs(modified);

  reuseBackup = deepClone(ExportModule.createBackup());

  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');

  const conflicts = ExportModule.detectConflicts(reuseBackup);
  const resolutions = [];
  conflicts.drugs.forEach(c => {
    resolutions.push(ExportModule.resolveConflictStrategy(c, 'overwrite'));
  });
  conflicts.shifts.forEach(c => {
    resolutions.push(ExportModule.resolveConflictStrategy(c, 'overwrite'));
  });

  Storage.clearCurrentShift();
  ExportModule.applyBackup(reuseBackup, resolutions);

  const history = Storage.getConflictStrategyHistory();
  assert(history.length > 0, '策略历史应有记录');
});

test('再次遇到同类冲突：检测到旧决定 overwrite', () => {
  const savedHistory = Storage.getConflictStrategyHistory();

  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.saveConflictStrategyHistory(savedHistory);

  const conflicts = ExportModule.detectConflicts(reuseBackup);
  const result = ExportModule.checkConflictStrategyReuse(conflicts);
  assert(result.hasMatches, '应有旧决定');

  const drugMatch = result.matched.find(m => m.previousStrategy === 'overwrite');
  assert(drugMatch, '应有 overwrite 策略的旧决定');
});

test('用户取消沿用，选择 skip 策略', () => {
  const conflicts = ExportModule.detectConflicts(reuseBackup);

  const manualResolutions = [];
  conflicts.drugs.forEach(c => {
    manualResolutions.push(ExportModule.resolveConflictStrategy(c, 'skip'));
  });
  conflicts.shifts.forEach(c => {
    manualResolutions.push(ExportModule.resolveConflictStrategy(c, 'skip'));
  });

  Storage.clearCurrentShift();
  const result = ExportModule.applyBackup(reuseBackup, manualResolutions);
  assert(result.success, '使用 skip 策略应成功');
});

test('skip 策略生效：本地数据未被覆盖', () => {
  const drugs = Storage.getDrugs();
  const drug002 = drugs.find(d => d.code === 'DRUG002');
  assert(drug002, '药品 DRUG002 应存在');
  assert(drug002.initialStock !== 500, 'skip 后本地数据不应被覆盖');
});

test('策略历史更新：skip 也被记录', () => {
  const history = Storage.getConflictStrategyHistory();
  const drugStrategies = history.filter(h =>
    h.conflictType === 'drug_content_conflict' && h.strategy === 'skip'
  );
  assert(drugStrategies.length > 0, 'skip 策略也应被记录');
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
  console.log('  所有恢复工作台链路测试通过！ ✓\n');
  process.exit(0);
}
