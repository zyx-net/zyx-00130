const fs = require('fs');
const path = require('path');
const vm = require('vm');

const localStorageMap = {};
globalThis.localStorage = {
  getItem: (k) => (k in localStorageMap ? localStorageMap[k] : null),
  setItem: (k, v) => { localStorageMap[k] = String(v); },
  removeItem: (k) => { delete localStorageMap[k]; }
};
globalThis.alert = (msg) => {};
globalThis.confirm = (msg) => true;
globalThis.prompt = (msg, def) => def || '';
globalThis.document = {
  body: { appendChild: () => {} },
  createElement: () => ({ innerHTML: '', style: {}, className: '', appendChild: () => {}, closest: () => null, value: '' }),
  getElementById: () => ({ value: '', addEventListener: () => {}, innerHTML: '', remove: () => {}, files: [] }),
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
  try { fn(); results.push({ name, pass: true }); console.log(`  ✓ ${name}`); }
  catch (e) { results.push({ name, pass: false, error: e.message }); console.log(`  ✗ ${name} -> ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`${msg || ''} 期望 ${JSON.stringify(b)} 实际 ${JSON.stringify(a)}`); }

// Helper: 开完班并关班，做好盘点
function openAndCloseShift(name, note) {
  Shift.openShift(name);
  Inventory.initializeInventory();
  if (note) {
    const s = Storage.getCurrentShift();
    s.note = note;
    Storage.saveCurrentShift(s);
  }
  Inventory.getInventoryForCurrentShift().forEach(i =>
    Inventory.updateActualQuantity(i.id, i.expectedQuantity));
  Shift.closeShift();
}

// Helper: 生成 skip 全部的 resolutions
function skipAllResolutions(conflicts) {
  const res = [];
  conflicts.shifts.forEach(c => res.push(ExportModule.resolveConflictStrategy(c, 'skip')));
  conflicts.corrections.forEach(c => res.push(ExportModule.resolveConflictStrategy(c, 'skip')));
  conflicts.drugs.forEach(c => res.push(ExportModule.resolveConflictStrategy(c, 'skip')));
  return res;
}

console.log('\n================================================================');
console.log('  冲突链路专项回归（自包含版本）');
console.log('================================================================\n');

// ======================= 场景 1：基础链路 =======================
console.log('\n--- [1] 基础链路：detectConflicts / resolveConflictStrategy ---\n');
Storage.resetAllData();
Storage.initializeDemoData();
Auth.login('pharmacist', '123456');

const shiftA = 'T1-同名-' + Date.now();
const noteA = '备份中的备注A-' + Date.now();

let backup1 = null;

test('1.1 本地先开班（同名，无备注），关班', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  openAndCloseShift(shiftA, '');
  const s = Storage.getShiftHistory().find(x => x.name === shiftA);
  assert(!s.note || s.note === '', '初始无备注');
});

test('1.2 开同名班次（有特殊备注），关班，创建备份', () => {
  openAndCloseShift(shiftA, noteA);
  backup1 = ExportModule.createBackup();
  assert(backup1, '备份创建成功');
});

test('1.3 清理本地，只保留无备注的班次', () => {
  const noNote = Storage.getShiftHistory().find(x => x.name === shiftA && (!x.note || x.note === ''));
  assert(noNote, '找到无备注班次');
  Storage.saveShiftHistory([noNote]);
  assertEq(Storage.getShiftHistory().length, 1, '只剩 1 个历史班次');
});

test('1.4 detectConflicts 能识别同名冲突', () => {
  const conflicts = ExportModule.detectConflicts(backup1);
  const target = conflicts.shifts.find(c => c.imported.note === noteA);
  assert(target, '识别到有备注的冲突项');
  assertEq(target.importedName, shiftA, '冲突名正确');
  assertEq(target.existing.note, '', '本地项备注为空');
});

test('1.5 resolveConflictStrategy 生成完整结构', () => {
  const c = ExportModule.detectConflicts(backup1).shifts[0];
  const r = ExportModule.resolveConflictStrategy(c, 'overwrite');
  assertEq(r.strategy, 'overwrite', '策略字段正确');
  assert(typeof r.description === 'string' && r.description.length > 0, 'description 非空');
});

// ======================= 场景 2：SKIP 策略 =======================
console.log('\n--- [2] SKIP 策略：冲突班次不改变本地 ---\n');
Storage.resetAllData();
Storage.initializeDemoData();
Auth.login('pharmacist', '123456');

const shiftB = 'T2-SKIP-' + Date.now();
const noteB = '备份备注B-' + Date.now();
let backup2 = null;

test('2.1 准备：同名班次，本地（无备注）→ 备份（有备注）', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  openAndCloseShift(shiftB, '');               // 本地：无备注
  openAndCloseShift(shiftB, noteB);            // 备份：有备注
  backup2 = ExportModule.createBackup();
  const noNote = Storage.getShiftHistory().find(x => x.name === shiftB && (!x.note || x.note === ''));
  Storage.saveShiftHistory([noNote]);           // 清回本地：无备注
  assertEq(Storage.getShiftHistory().find(x => x.name === shiftB).note, '', '本地无备注');
});

test('2.2 SKIP 策略预演：skippedShifts 正确，overwritten=0', () => {
  const conflicts = ExportModule.detectConflicts(backup2);
  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, c.imported.note === noteB ? 'skip' : 'skip')
  ).concat(skipAllResolutions(conflicts).slice(conflicts.shifts.length));
  const preview = ExportModule.preRestorePreview(backup2, resolutions);
  assert(preview.success, '预演成功');
  assert(preview.summary.skippedShifts > 0, 'skippedShifts > 0');
  assertEq(preview.summary.overwrittenShifts, 0, 'overwrittenShifts = 0');
});

test('2.3 SKIP 策略执行：本地班次备注保持不变', () => {
  const conflicts = ExportModule.detectConflicts(backup2);
  const resolutions = skipAllResolutions(conflicts);
  const result = ExportModule.applyBackup(backup2, resolutions);
  assert(result.success, '恢复成功');
  const local = Storage.getShiftHistory().find(x => x.name === shiftB);
  assert(!local.note || local.note === '', 'SKIP 后本地仍无备注');
});

// ======================= 场景 3：OVERWRITE 策略 =======================
console.log('\n--- [3] OVERWRITE 策略：冲突班次备注被覆盖 ---\n');
Storage.resetAllData();
Storage.initializeDemoData();
Auth.login('pharmacist', '123456');

const shiftC = 'T3-OVERWRITE-' + Date.now();
const noteC = '备份备注C-' + Date.now();
let backup3 = null;
let conflictCount3 = 0;

test('3.1 准备：本地同名（无备注），备份同名（有备注）', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  openAndCloseShift(shiftC, '');               // 本地：无备注
  openAndCloseShift(shiftC, noteC);            // 备份：有备注
  backup3 = ExportModule.createBackup();
  const noNote = Storage.getShiftHistory().find(x => x.name === shiftC && (!x.note || x.note === ''));
  Storage.saveShiftHistory([noNote]);
  const conflicts = ExportModule.detectConflicts(backup3);
  conflictCount3 = conflicts.shifts.filter(c => c.imported.note === noteC).length;
  assert(conflictCount3 > 0, '至少有 1 个目标冲突');
});

test('3.2 OVERWRITE 预演：overwrittenShifts >= 1', () => {
  const conflicts = ExportModule.detectConflicts(backup3);
  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, c.imported.note === noteC ? 'overwrite' : 'skip')
  ).concat(
    conflicts.corrections.map(c => ExportModule.resolveConflictStrategy(c, 'skip')),
    conflicts.drugs.map(c => ExportModule.resolveConflictStrategy(c, 'skip'))
  );
  const preview = ExportModule.preRestorePreview(backup3, resolutions);
  assert(preview.success, '预演成功');
  assert(preview.summary.overwrittenShifts >= 1, 'overwrittenShifts >= 1');
});

test('3.3 OVERWRITE 执行：本地备注变备份备注', () => {
  const conflicts = ExportModule.detectConflicts(backup3);
  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, c.imported.note === noteC ? 'overwrite' : 'skip')
  ).concat(
    conflicts.corrections.map(c => ExportModule.resolveConflictStrategy(c, 'skip')),
    conflicts.drugs.map(c => ExportModule.resolveConflictStrategy(c, 'skip'))
  );
  const result = ExportModule.applyBackup(backup3, resolutions);
  assert(result.success, '执行成功');
  const local = Storage.getShiftHistory().find(x => x.name === shiftC);
  assertEq(local.note, noteC, '备注被覆盖为备份备注');
  assert(result.restoreRecord, '返回 restoreRecord');
  const hasOverwrite = result.restoreRecord.conflictResolutions.some(
    r => r.strategy === 'overwrite' && r.type === 'shift_name_conflict'
  );
  assert(hasOverwrite, '恢复记录有 overwrite 处理决定');
});

// ======================= 场景 4：恢复记录 conflictResolutions =======================
console.log('\n--- [4] 恢复记录 conflictResolutions 完整结构 ---\n');

test('4.1 最近恢复记录有 conflictResolutions 数组', () => {
  const last = Storage.getRestoreRecords()[0];
  assert(Array.isArray(last.conflictResolutions), '数组');
  assert(last.conflictResolutions.length > 0, '非空');
});

test('4.2 conflictResolutions 每项有 type/strategy/target/description', () => {
  const cr = Storage.getRestoreRecords()[0].conflictResolutions[0];
  assert(typeof cr.type === 'string' && cr.type.length > 0, 'type');
  assert(['overwrite','skip','merge'].includes(cr.strategy), 'strategy 合法');
  assert(typeof cr.target === 'string' && cr.target.length > 0, 'target');
  assert(typeof cr.description === 'string' && cr.description.length > 0, 'description');
});

// ======================= 场景 5：部分恢复（局部恢复）冲突处理 =======================
console.log('\n--- [5] 部分恢复（局部恢复）冲突链路 ---\n');
Storage.resetAllData();
Storage.initializeDemoData();
Auth.login('pharmacist', '123456');

const shiftD = 'T5-PARTIAL-' + Date.now();
const noteD = '局部备份备注-' + Date.now();
let backup5 = null;

test('5.1 准备同名班次冲突', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  openAndCloseShift(shiftD, '');                // 本地：无备注
  openAndCloseShift(shiftD, noteD);             // 备份：有备注
  backup5 = ExportModule.createBackup();
  const noNote = Storage.getShiftHistory().find(x => x.name === shiftD && (!x.note || x.note === ''));
  Storage.saveShiftHistory([noNote]);
});

test('5.2 部分恢复（仅 shifts 块），merge 策略', () => {
  const conflicts = ExportModule.detectConflicts(backup5);
  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, c.imported.note === noteD ? 'merge' : 'skip')
  ).concat(
    conflicts.corrections.map(c => ExportModule.resolveConflictStrategy(c, 'skip')),
    conflicts.drugs.map(c => ExportModule.resolveConflictStrategy(c, 'skip'))
  );
  const result = ExportModule.applyPartialBackup(backup5, ['shifts'], resolutions);
  assert(result.success, '局部恢复成功');
  assertEq(result.isPartial, true, 'isPartial true');
});

test('5.3 部分恢复记录 isPartial=true 且有 conflictResolutions', () => {
  const records = Storage.getRestoreRecords();
  const pr = records.find(r => r.isPartial);
  assert(pr, '找到局部恢复记录');
  assertEq(pr.isPartial, true, 'isPartial true');
  assert(pr.conflictResolutions.length > 0, 'conflictResolutions 有值');
  assert(pr.conflictResolutions.some(r => r.strategy === 'merge'), '存在 merge 记录');
});

// ======================= 场景 6：重启可见 =======================
console.log('\n--- [6] 重启可见：localStorage + getLastRestoreInfo ---\n');
Storage.resetAllData();
Storage.initializeDemoData();
Auth.login('pharmacist', '123456');

const shiftE = 'T6-RESTART-' + Date.now();
const noteE = '重启验证备注-' + Date.now();
let backup6 = null;

test('6.1 准备 overwrite 场景并执行', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  openAndCloseShift(shiftE, '');
  openAndCloseShift(shiftE, noteE);
  backup6 = ExportModule.createBackup();

  const noNote = Storage.getShiftHistory().find(x => x.name === shiftE && (!x.note || x.note === ''));
  Storage.saveShiftHistory([noNote]);

  const conflicts = ExportModule.detectConflicts(backup6);
  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, c.imported.note === noteE ? 'overwrite' : 'skip')
  ).concat(
    conflicts.corrections.map(c => ExportModule.resolveConflictStrategy(c, 'skip')),
    conflicts.drugs.map(c => ExportModule.resolveConflictStrategy(c, 'skip'))
  );
  const r = ExportModule.applyBackup(backup6, resolutions);
  assert(r.success, '恢复成功');
});

test('6.2 localStorage 中 RESTORE_RECORDS 有完整原始数据', () => {
  const raw = localStorageMap[Storage.KEYS.RESTORE_RECORDS];
  assert(raw, 'localStorage 有原始记录');
  const parsed = JSON.parse(raw);
  assert(Array.isArray(parsed) && parsed.length > 0, '解析为非空数组');
  const last = parsed[0];
  assert('isPartial' in last && 'status' in last && 'conflictResolutions' in last, '关键字段全');
  assert(last.conflictResolutions.length > 0, 'conflictResolutions 非空');
  assert(last.backupVersion, '有 backupVersion');
  assert(last.backupExportedAtFormatted, '有 backupExportedAtFormatted');
  assert(last.restoredBy && last.restoredBy.role, '有操作人角色');
});

test('6.3 getLastRestoreInfo() 返回完整信息', () => {
  const info = ExportModule.getLastRestoreInfo();
  assert(info && info.record, '有返回');
  assertEq(info.record.status, 'success', 'status=success');
  assert(info.hasUndoableSnapshot === true, '有可撤回快照');
});

test('6.4 记录有来源（版本/导出时间）和范围（dataBlocks 数组）', () => {
  const last = Storage.getRestoreRecords()[0];
  assert(last.backupVersion.length > 0, '来源：备份版本');
  assert(last.backupExportedAtFormatted.length > 0, '来源：导出时间');
  assert(Array.isArray(last.dataBlocks) && last.dataBlocks.length > 0, '范围：dataBlocks');
});

// ======================= 场景 7：失败记录 errorMessage 可见 =======================
console.log('\n--- [7] 失败恢复：errorMessage 可见 ---\n');
Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

test('7.1 无效备份恢复失败，留下 status=failed 记录', () => {
  Storage.clearRestoreRecords();
  // 构造通过 validateBackup 但执行时会报错的备份（格式对，但数据损坏：shiftHistory 不是数组）
  const badBackup = {
    version: '1.0-test',
    exportedAt: Date.now(),
    exportedAtFormatted: '2025-01-01 00:00',
    data: {
      currentShift: null,
      shiftHistory: null,          // 不是数组，调用 forEach 会报错
      inventory: [],
      discrepancies: {},
      auditLogs: [],
      drugs: {}
    }
  };
  const result = ExportModule.applyBackup(badBackup, []);
  assert(!result.success, '恢复返回 failure, 实际 ' + JSON.stringify(result));
  assert(result.rolledBack, 'rolledBack=true');
  const records = Storage.getRestoreRecords();
  assert(records.length > 0, '至少有 1 条记录, 实际数: ' + records.length);
  const failed = records.find(r => r.status === 'failed');
  assert(failed, '有失败记录, 记录状态: ' + records.map(r => r.status).join(','));
  assert(failed.errorMessage && failed.errorMessage.length > 0, 'errorMessage 非空');
  assertEq(failed.undone, true, 'undone=true');
});

test('7.2 getLastRestoreInfo() 正确返回失败记录及原因', () => {
  const info = ExportModule.getLastRestoreInfo();
  assert(info && info.record, '有记录');
  assertEq(info.record.status, 'failed', 'status=failed');
  assert(info.record.errorMessage.length > 0, '错误信息可读');
});

// ======================= 总结 =======================
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
console.log('  🎉 冲突链路专项回归全部通过！\n');
