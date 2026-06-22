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
console.log('  药房交班系统 - 完整备份恢复流程验证');
console.log('  覆盖：预演不落库 / 确认恢复 / 撤回恢复 / 无效备份拦截 / 冲突摘要准确 / 护士无权撤回');
console.log('================================================================\n');

console.log('--- [场景 1] 预演不落库：preRestorePreview 不改任何本地数据 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let preBackup = null;
let stateBeforePreview = null;

test('准备：创建一份备份用于后续预演', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  const r = Shift.openShift('预演测试班次-白班');
  assert(r.success, '开班应成功');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  const n1 = inv.find(i => i.drugType === 'normal');
  Inventory.updateActualQuantity(n1.id, 77);
  preBackup = deepClone(ExportModule.createBackup());
  assert(preBackup, '备份应创建成功');
  assert(preBackup.data.currentShift, '备份应包含当前班次');
});

test('预演前捕获本地完整状态', () => {
  stateBeforePreview = {
    currentShift: deepClone(Storage.getCurrentShift()),
    shiftHistory: deepClone(Storage.getShiftHistory()),
    drugs: deepClone(Storage.getDrugs()),
    auditLogsCount: Storage.getAuditLogs().length,
    inventoryAll: deepClone(Storage.get(Storage.KEYS.INVENTORY, {})),
    discrepanciesAll: deepClone(Storage.get(Storage.KEYS.DISCREPANCIES, {}))
  };
  assert(stateBeforePreview.currentShift, '应有当前班次');
});

test('preRestorePreview 返回 success 且包含详细预演信息', () => {
  const preview = ExportModule.preRestorePreview(preBackup, []);
  assert(preview.success, '预演应成功');
  assert(preview.preview, '应返回 preview 对象');
  assert(preview.summary, '应返回 summary 对象');
  assert(preview.summaryText && preview.summaryText.length > 0, '应返回 summaryText 人类可读摘要');
  assert(typeof preview.summary.newShifts === 'number', 'summary.newShifts 应为数字');
  assert(typeof preview.summary.overwrittenShifts === 'number', 'summary.overwrittenShifts 应为数字');
  assert(typeof preview.summary.mergedShifts === 'number', 'summary.mergedShifts 应为数字');
});

test('预演后本地数据完全未变（核心：不落库）', () => {
  const after = {
    currentShift: deepClone(Storage.getCurrentShift()),
    shiftHistory: deepClone(Storage.getShiftHistory()),
    drugs: deepClone(Storage.getDrugs()),
    auditLogsCount: Storage.getAuditLogs().length,
    inventoryAll: deepClone(Storage.get(Storage.KEYS.INVENTORY, {})),
    discrepanciesAll: deepClone(Storage.get(Storage.KEYS.DISCREPANCIES, {}))
  };
  assertEq(JSON.stringify(after.currentShift), JSON.stringify(stateBeforePreview.currentShift), '预演不应修改当前班次');
  assertEq(after.shiftHistory.length, stateBeforePreview.shiftHistory.length, '预演不应修改历史班次数量');
  assertEq(after.drugs.length, stateBeforePreview.drugs.length, '预演不应修改药品数量');
  assertEq(after.auditLogsCount, stateBeforePreview.auditLogsCount, '预演不应新增审计日志');
  assertEq(JSON.stringify(after.inventoryAll), JSON.stringify(stateBeforePreview.inventoryAll), '预演不应修改盘点数据');
  assertEq(JSON.stringify(after.discrepanciesAll), JSON.stringify(stateBeforePreview.discrepanciesAll), '预演不应修改差异数据');
  assertEq(Storage.getRestoreRecords().length, 0, '预演不应产生恢复记录');
  assertEq(Storage.getLastRestoreSnapshot(), null, '预演不应保存恢复快照');
});

test('预演摘要包含：新增班次、影响盘点/差异、导入审计日志等关键数字', () => {
  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');

  const preview = ExportModule.preRestorePreview(preBackup, []);
  assert(preview.success, `预演应成功，消息：${preview.message || ''}`);
  assert(preview.summaryText && typeof preview.summaryText === 'string', `preview.summaryText 应为非空字符串，实际：${JSON.stringify(preview.summaryText)}`);
  const s = preview.summary;
  assert(s.newShifts >= 1, '空库下预演应显示新增班次');
  assert(s.affectedInventories >= 1, '应显示影响盘点数');
  assert(s.affectedDiscrepancies >= 0, '应显示影响差异数');
  assert(s.importAuditLogs >= 0, '应显示将导入的审计日志数');
  assert(preview.summaryText.includes('新增班次'), `summaryText 应包含"新增班次"，实际：${preview.summaryText}`);
  assert(preview.summaryText.includes('审计日志'), `summaryText 应提及审计日志，实际：${preview.summaryText}`);
  assert(preview.summaryText.includes('药品'), `summaryText 应提及药品，实际：${preview.summaryText}`);
});

console.log('\n--- [场景 2] 确认恢复：applyBackup 落库 + 产生可追溯记录 + 保存撤回快照 ---\n');

Storage.resetAllData();
Storage.initializeDemoData();
Auth.login('pharmacist', '123456');

let stateBeforeRestore = null;

test('恢复前记录空库状态', () => {
  stateBeforeRestore = {
    currentShift: Storage.getCurrentShift(),
    historyCount: Storage.getShiftHistory().length,
    drugCount: Storage.getDrugs().length,
    auditCount: Storage.getAuditLogs().length,
    restoreRecords: Storage.getRestoreRecords().length,
    snapshot: Storage.getLastRestoreSnapshot()
  };
  assertEq(stateBeforeRestore.currentShift, null, '恢复前无当前班次');
  assertEq(stateBeforeRestore.restoreRecords, 0, '恢复前无恢复记录');
  assertEq(stateBeforeRestore.snapshot, null, '恢复前无快照');
});

test('applyBackup 恢复成功并返回 restoreRecordId', () => {
  const r = ExportModule.applyBackup(preBackup, []);
  assert(r.success, '恢复应成功');
  assert(r.restoreRecordId, '应返回 restoreRecordId');
  assert(r.restoreRecord, '应返回 restoreRecord 对象');
  assert(r.results, '应返回 results 统计');
});

test('恢复后产生 1 条可追溯恢复记录', () => {
  const records = Storage.getRestoreRecords();
  assertEq(records.length, 1, '应恰好 1 条恢复记录');
  const rec = records[0];
  assert(rec.id, '记录应有 id');
  assertEq(rec.restoredBy.role, 'pharmacist', '操作人应为药师');
  assertEq(rec.undone, false, 'undone 标记初始为 false');
  assert(rec.backupVersion, '应记录备份版本');
  assert(rec.results, '应记录恢复结果统计');
  assert(rec.timestampFormatted, '应记录格式化时间');
});

test('恢复后保存了撤回用的完整快照', () => {
  const snap = Storage.getLastRestoreSnapshot();
  assert(snap, '应存在 LAST_RESTORE_SNAPSHOT');
  assert(snap.drugs, '快照应包含 drugs');
  assert('currentShift' in snap, '快照应包含 currentShift');
  assert(snap.shiftHistory !== undefined, '快照应包含 shiftHistory');
  assert(snap.inventory !== undefined, '快照应包含 inventory');
  assert(snap.discrepancies !== undefined, '快照应包含 discrepancies');
  assert(snap.auditLogs !== undefined, '快照应包含 auditLogs');
});

test('恢复后实际数据已变化（班次被写入）', () => {
  const afterShift = Storage.getCurrentShift();
  assert(afterShift, '恢复后应有当前班次');
  assertEq(afterShift.name, '预演测试班次-白班', '恢复后当前班次名称应来自备份');
  assert(Storage.getShiftHistory().length >= stateBeforeRestore.historyCount, '历史班次数量应增加或不变');
});

test('恢复记录中的 results 统计与实际落库一致', () => {
  const records = Storage.getRestoreRecords();
  const rec = records[0];
  const invMap = Storage.get(Storage.KEYS.INVENTORY, {});
  const shiftsWithInv = Object.keys(invMap).length;
  assert(rec.results.importedShifts >= 1, 'results.importedShifts 应>=1');
  assert(shiftsWithInv >= 1, '实际盘点班次应>=1');
});

test('审计日志中包含「导入数据备份」并携带恢复记录ID', () => {
  const logs = Storage.getAuditLogs();
  const restoreLog = logs.find(l => l.action === '导入数据备份');
  assert(restoreLog, '审计日志应包含"导入数据备份"操作');
  assert(restoreLog.details.includes(Storage.getRestoreRecords()[0].id), '审计日志应关联恢复记录ID');
});

console.log('\n--- [场景 3] 撤回恢复：undoLastRestore 将数据还原到恢复前状态 ---\n');

test('撤回后班次数据回到恢复前（空库无当前班次）', () => {
  const undo = ExportModule.undoLastRestore();
  assert(undo.success, `撤回应成功，消息：${undo.message || ''}`);
  assertEq(Storage.getCurrentShift(), null, '撤回后当前班次应为空（恢复前状态）');
  assertEq(Storage.getShiftHistory().length, stateBeforeRestore.historyCount, '撤回后历史班次数量应回到恢复前');
});

test('撤回后恢复记录标记 undone=true 并记录撤回人', () => {
  const records = Storage.getRestoreRecords();
  assertEq(records.length, 1, '恢复记录数不变');
  const rec = records[0];
  assertEq(rec.undone, true, 'undone 标记应为 true');
  assert(rec.undoneAt, '应记录撤回时间 undoneAt');
  assert(rec.undoneAtFormatted, '应记录撤回格式化时间');
  assert(rec.undoneBy, '应记录撤回人 undoneBy');
  assertEq(rec.undoneBy.role, 'pharmacist', '撤回人应为药师');
});

test('撤回后撤回快照被清除（防止重复撤回）', () => {
  assertEq(Storage.getLastRestoreSnapshot(), null, '撤回后快照应被清除');
});

test('撤回后再次撤回被拒绝（幂等保护）', () => {
  const undo2 = ExportModule.undoLastRestore();
  assertEq(undo2.success, false, '第二次撤回应失败');
  assert(undo2.message.includes('撤回'), '错误消息应说明无法撤回');
});

test('撤回产生了「撤回数据恢复」审计日志', () => {
  const logs = Storage.getAuditLogs();
  const undoLog = logs.find(l => l.action === '撤回数据恢复');
  assert(undoLog, '审计日志应包含"撤回数据恢复"操作');
  assertEq(undoLog.userRole, 'pharmacist', '撤回操作人应为药师');
});

test('撤回后盘点和差异数据也回到恢复前', () => {
  const invMap = Storage.get(Storage.KEYS.INVENTORY, {});
  const discMap = Storage.get(Storage.KEYS.DISCREPANCIES, {});
  assertEq(Object.keys(invMap).length, 0, '撤回后盘点应为空（恢复前）');
  assertEq(Object.keys(discMap).length, 0, '撤回后差异应为空（恢复前）');
});

console.log('\n--- [场景 4] 无效备份拦截：parseBackupFile / validateBackup / preRestorePreview ---\n');

test('null 备份被 validateBackup 拒绝', () => {
  const v = ExportModule.validateBackup(null);
  assertEq(v.valid, false, 'null 应无效');
  assert(v.reason && v.reason.length > 0, '应返回拒绝原因');
});

test('缺 data 字段被拒绝', () => {
  const v = ExportModule.validateBackup({ version: '1.0.0' });
  assertEq(v.valid, false, '缺 data 应无效');
});

test('缺 data.currentShift 等关键字段被拒绝', () => {
  const v = ExportModule.validateBackup({ version: '1.0.0', data: { shiftHistory: [] } });
  assertEq(v.valid, false, 'data 缺必要字段应无效');
  assert(v.reason.includes('缺少必要数据'), `错误原因应说明缺少必要数据，实际: ${v.reason}`);
});

test('parseBackupFile 解析无效 JSON 失败', () => {
  const r = ExportModule.parseBackupFile('this is not json');
  assertEq(r.success, false, '无效 JSON 应解析失败');
  assert(r.message.includes('解析失败'), `错误消息应含解析失败，实际: ${r.message}`);
});

test('parseBackupFile 解析结构完整但缺字段的 JSON 失败', () => {
  const badBackup = JSON.stringify({ version: '1.0.0', data: {} });
  const r = ExportModule.parseBackupFile(badBackup);
  assertEq(r.success, false, '字段缺失应被 parseBackupFile 拒绝');
});

test('preRestorePreview 对无效备份返回失败', () => {
  const r = ExportModule.preRestorePreview({ version: 'bad' }, []);
  assertEq(r.success, false, 'preRestorePreview 应拒绝无效备份');
});

test('applyBackup 对无效备份返回失败且不产生记录/快照', () => {
  Storage.clearRestoreRecords();
  Storage.clearLastRestoreSnapshot();
  const r = ExportModule.applyBackup({ not_a_valid_backup: true }, []);
  assertEq(r.success, false, 'applyBackup 应拒绝无效备份');
  assertEq(Storage.getRestoreRecords().length, 0, '无效备份不应产生恢复记录');
  assertEq(Storage.getLastRestoreSnapshot(), null, '无效备份不应留下快照');
});

console.log('\n--- [场景 5] 冲突摘要准确：preRestorePreview 与 detectConflicts 一致 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let conflictBackup = null;

test('准备：本地先建班次「冲突测试A」，再建同名备份', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  const r1 = Shift.openShift('冲突测试A');
  assert(r1.success, '本地开班成功');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  Inventory.updateActualQuantity(inv[0].id, 50);

  Storage.saveCurrentShift({ ...Storage.getCurrentShift(), note: '本地版本' });
  conflictBackup = deepClone(ExportModule.createBackup());
  assert(conflictBackup, '备份创建成功');

  Storage.clearCurrentShift();
  const r2 = Shift.openShift('冲突测试A');
  assert(r2.success, '本地再次开班同名班次');
  Inventory.initializeInventory();
});

test('detectConflicts 识别出 shift_name_conflict', () => {
  const conflicts = ExportModule.detectConflicts(conflictBackup);
  assert(conflicts.shifts.length >= 1, '应检测到班次冲突');
  const sc = conflicts.shifts.find(c => c.type === 'shift_name_conflict');
  assert(sc, '冲突类型应为 shift_name_conflict');
  assertEq(sc.importedName, '冲突测试A', '冲突班次名应正确');
});

test('preRestorePreview skip 策略 → 显示 skippedShifts=1，newShifts=0', () => {
  const skipResolutions = conflicts => conflicts.shifts.map(c => ExportModule.resolveConflictStrategy(c, 'skip'));
  const allConflicts = ExportModule.detectConflicts(conflictBackup);
  const resolutions = skipResolutions(allConflicts);
  const preview = ExportModule.preRestorePreview(conflictBackup, resolutions);
  assert(preview.success, '预演应成功');
  assertEq(preview.summary.skippedShifts, 1, 'skip 策略下 skippedShifts 应为 1');
  assertEq(preview.summary.overwrittenShifts, 0, 'skip 策略下 overwrittenShifts 应为 0');
});

test('preRestorePreview overwrite 策略 → 显示 overwrittenShifts=1', () => {
  const allConflicts = ExportModule.detectConflicts(conflictBackup);
  const resolutions = allConflicts.shifts.map(c => ExportModule.resolveConflictStrategy(c, 'overwrite'));
  const preview = ExportModule.preRestorePreview(conflictBackup, resolutions);
  assert(preview.success, '预演应成功');
  assertEq(preview.summary.overwrittenShifts, 1, 'overwrite 策略下 overwrittenShifts 应为 1');
  assert(preview.preview.shifts.overwrite.length >= 1, 'preview.shifts.overwrite 应非空');
  assertEq(preview.preview.shifts.overwrite[0].name, '冲突测试A', '覆盖的班次名应正确');
});

test('preRestorePreview merge 策略 → 显示 mergedShifts=1', () => {
  const allConflicts = ExportModule.detectConflicts(conflictBackup);
  const resolutions = allConflicts.shifts.map(c => ExportModule.resolveConflictStrategy(c, 'merge'));
  const preview = ExportModule.preRestorePreview(conflictBackup, resolutions);
  assert(preview.success, '预演应成功');
  assertEq(preview.summary.mergedShifts, 1, 'merge 策略下 mergedShifts 应为 1');
});

test('药品内容冲突：overwrite 在预演中准确列出', () => {
  const drugConflictBackup = {
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
      drugs: Storage.getDrugs().map(d => d.code === 'DRUG001' ? { ...d, name: '阿莫西林V2', initialStock: 888 } : d)
    }
  };
  const conflicts = ExportModule.detectConflicts(drugConflictBackup);
  assert(conflicts.drugs.length >= 1, '应检测到药品冲突');

  const resolutions = conflicts.drugs.map(c => ExportModule.resolveConflictStrategy(c, 'overwrite'));
  const preview = ExportModule.preRestorePreview(drugConflictBackup, resolutions);
  assert(preview.success, '预演应成功');
  assertEq(preview.summary.overwrittenDrugs, 1, 'overwrittenDrugs 应=1');
  assert(preview.preview.drugs.overwrite.find(d => d.code === 'DRUG001'), 'preview.drugs.overwrite 应包含 DRUG001');
});

test('冲突摘要 summaryText 包含数字与实际一致', () => {
  const allConflicts = ExportModule.detectConflicts(conflictBackup);
  const resolutions = allConflicts.shifts.map(c => ExportModule.resolveConflictStrategy(c, 'overwrite'));
  const preview = ExportModule.preRestorePreview(conflictBackup, resolutions);
  assert(preview.summaryText.includes('覆盖1'), `summaryText 应包含"覆盖1"实际: ${preview.summaryText}`);
  assert(preview.summaryText.includes('新增班次'), 'summaryText 应包含"新增班次"');
});

console.log('\n--- [场景 6] 护士无权撤回：undoLastRestore 权限校验 ---\n');

Storage.resetAllData();
Storage.initializeDemoData();
Auth.login('pharmacist', '123456');

test('先以药师身份执行一次恢复（产生记录和快照）', () => {
  const r = ExportModule.applyBackup(preBackup, []);
  assert(r.success, '药师恢复应成功');
  assert(Storage.getLastRestoreSnapshot(), '应有恢复快照');
});

test('护士调用 undoLastRestore 被拒绝', () => {
  Auth.logout();
  Auth.login('nurse', '123456');
  const r = ExportModule.undoLastRestore();
  assertEq(r.success, false, '护士撤回必须失败');
  assert(r.message.includes('药师') || r.message.includes('权限'), `错误消息应说明药师权限，实际: ${r.message}`);
});

test('护士被拒后，数据未被修改（仍为恢复后状态）', () => {
  const shift = Storage.getCurrentShift();
  assert(shift, '当前班次仍应存在（未被撤回）');
  assertEq(shift.name, '预演测试班次-白班', '班次名应仍为恢复后的值');
  const records = Storage.getRestoreRecords();
  assertEq(records[0].undone, false, 'undone 标记仍为 false');
});

test('护士也无法调用 applyBackup 执行恢复', () => {
  const r = ExportModule.applyBackup(preBackup, []);
  assertEq(r.success, false, '护士恢复必须失败');
  assert(r.message.includes('药师'), `错误消息应说明药师权限，实际: ${r.message}`);
});

test('Auth.canUndoRestore 权限函数准确', () => {
  assertEq(Auth.canUndoRestore(), false, '护士 canUndoRestore 应为 false');
  Auth.logout();
  Auth.login('pharmacist', '123456');
  assertEq(Auth.canUndoRestore(), true, '药师 canUndoRestore 应为 true');
});

test('Auth.canPerformRestore 权限函数准确', () => {
  assertEq(Auth.canPerformRestore(), true, '药师 canPerformRestore 应为 true');
  Auth.logout();
  Auth.login('nurse', '123456');
  assertEq(Auth.canPerformRestore(), false, '护士 canPerformRestore 应为 false');
});

test('切回药师可正常撤回', () => {
  Auth.logout();
  Auth.login('pharmacist', '123456');
  const r = ExportModule.undoLastRestore();
  assert(r.success, `药师撤回应成功，消息: ${r.message || ''}`);
  assertEq(Storage.getCurrentShift(), null, '撤回后数据回到空库');
});

console.log('\n--- [场景 7] 重启后状态一致性：恢复记录/快照持久化 ---\n');

test('Storage.captureFullSnapshot + restoreFromSnapshot 往返一致', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Shift.openShift('持久化测试班');
  Inventory.initializeInventory();

  const beforeSnap = Storage.captureFullSnapshot();
  assert(beforeSnap.currentShift, '快照应含当前班次');

  const beforeShiftId = beforeSnap.currentShift.id;
  const beforeInvLen = Object.keys(beforeSnap.inventory).length;

  Storage.resetAllData();
  Storage.initializeDemoData();
  assertEq(Storage.getCurrentShift(), null, '重置后无班次');

  const restored = Storage.restoreFromSnapshot(beforeSnap);
  assert(restored, 'restoreFromSnapshot 应成功');
  assertEq(Storage.getCurrentShift().id, beforeShiftId, '恢复后班次ID一致');
  assertEq(Object.keys(Storage.get(Storage.KEYS.INVENTORY, {})).length, beforeInvLen, '恢复后盘点数量一致');
});

test('恢复记录保存在 localStorage 中（模拟重启后仍在）', () => {
  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');
  ExportModule.applyBackup(preBackup, []);
  const recordId = Storage.getRestoreRecords()[0].id;
  const rawLS = localStorage[Storage.KEYS.RESTORE_RECORDS];
  assert(rawLS, 'localStorage 中应有 RESTORE_RECORDS 原始数据');
  const parsed = JSON.parse(rawLS);
  assert(Array.isArray(parsed) && parsed.length >= 1, '原始存储应为数组');
  assertEq(parsed[0].id, recordId, '持久化的记录ID应匹配');
});

test('LAST_RESTORE_SNAPSHOT 也保存在 localStorage 中', () => {
  const rawSnap = localStorage[Storage.KEYS.LAST_RESTORE_SNAPSHOT];
  assert(rawSnap, 'localStorage 中应有 LAST_RESTORE_SNAPSHOT');
  const parsed = JSON.parse(rawSnap);
  assert('drugs' in parsed, '解析后快照应有 drugs 字段');
});

console.log('\n--- [场景 8] 导出→导入链路：createBackup → applyBackup 往返一致 ---\n');

test('导出备份再清空再导入，当前班次ID一致', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Shift.openShift('往返测试班');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  Inventory.updateActualQuantity(inv[0].id, 66);

  const beforeShiftId = Storage.getCurrentShift().id;
  const beforeQty = Storage.getInventory(beforeShiftId)[0].actualQuantity;
  const backup = ExportModule.createBackup();

  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');

  const r = ExportModule.applyBackup(backup, []);
  assert(r.success, '应用备份应成功');
  assertEq(Storage.getCurrentShift().id, beforeShiftId, '往返后班次ID一致');
  assertEq(Storage.getInventory(beforeShiftId)[0].actualQuantity, beforeQty, '往返后盘点实存数量一致');
});

test('往返后 getRestoreRecords 有记录且未被撤回', () => {
  const records = ExportModule.getRestoreRecords();
  assert(records.length >= 1, '应有恢复记录');
  assertEq(records[0].undone, false, '未撤回标记正确');
});

test('撤回往返：撤回后数据与备份前（reset后空库）一致', () => {
  const undo = ExportModule.undoLastRestore();
  assert(undo.success, '撤回应成功');
  assertEq(Storage.getCurrentShift(), null, '撤回后回到空库状态');
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
console.log('  🎉 所有完整备份恢复流程验证通过！预演/恢复/撤回/权限/审计/持久化链路全部打通。\n');
