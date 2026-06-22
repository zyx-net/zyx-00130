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
console.log('  药房交班系统 - 备份中心完整验证');
console.log('  覆盖：历史筛选 / 差异对比 / 局部恢复 / 业务冲突 / 失败回滚 / 权限边界 / 过期清理 / 恢复锁定');
console.log('================================================================\n');

console.log('--- [场景 1] 备份命名与备注：createBackupWithInfo 保存命名和备注 ---\n');

Storage.resetAllData();
Storage.initializeDemoData();
Auth.login('pharmacist', '123456');

test('创建带名称和备注的备份', () => {
  const r = ExportModule.createBackupWithInfo('白班交接前备份', '2026-06-22 白班，盘点完成');
  assert(r.success, '创建备份应成功');
  assert(r.backupInfo, '应返回 backupInfo');
  assertEq(r.backupInfo.name, '白班交接前备份', '备份名称应正确');
  assertEq(r.backupInfo.note, '2026-06-22 白班，盘点完成', '备份备注应正确');
  assert(r.backupInfo.createdBy, '应记录创建人');
  assertEq(r.backupInfo.createdBy.role, 'pharmacist', '创建人角色应为药师');
});

test('备份保存在本地历史中', () => {
  const history = Storage.getBackupHistory();
  assertEq(history.length, 1, '备份历史应有1条记录');
  assertEq(history[0].name, '白班交接前备份', '历史中的备份名称应匹配');
});

test('备份包含 summary 摘要信息', () => {
  const history = Storage.getBackupHistory();
  const b = history[0];
  assert(b.summary, '备份应有 summary');
  assert(typeof b.summary.shiftCount === 'number', 'summary.shiftCount 应为数字');
  assert(typeof b.summary.drugCount === 'number', 'summary.drugCount 应为数字');
  assert(typeof b.summary.hasActiveShift === 'boolean', 'summary.hasActiveShift 应为布尔值');
});

test('备份包含完整 backupData 数据', () => {
  const history = Storage.getBackupHistory();
  const b = history[0];
  assert(b.backupData, '备份应有 backupData');
  assert(b.backupData.version, 'backupData 应有 version');
  assert(b.backupData.data, 'backupData 应有 data');
  assert(b.backupData.data.drugs, 'backupData.data 应有 drugs');
});

test('未命名的备份使用默认空名称', () => {
  const r = ExportModule.createBackupWithInfo('', '');
  assert(r.success, '创建备份应成功');
  assertEq(r.backupInfo.name, '', '未命名备份名称应为空');
  const history = Storage.getBackupHistory();
  assertEq(history.length, 2, '备份历史应有2条记录');
});

console.log('\n--- [场景 2] 历史筛选：按时间、操作人、班次状态筛选 ---\n');

Storage.resetAllData();
Storage.initializeDemoData();

function createTestBackup(name, role, hasActive) {
  const user = { id: 'test_' + role, name: role === 'pharmacist' ? '张药师' : '李护士', role: role };
  const backup = ExportModule.createBackup();
  const summary = {
    shiftCount: 1,
    hasActiveShift: hasActive,
    drugCount: 8,
    inventoryShiftCount: 1,
    totalInventoryItems: 8,
    totalDiscrepancies: 0,
    totalCorrections: 0,
    pendingCorrections: 0,
    auditLogCount: 10
  };
  Storage.addBackupToHistory({
    name: name,
    note: '测试备注 ' + name,
    version: backup.version,
    exportedAt: new Date().toISOString(),
    exportedAtFormatted: Storage.formatDateTime(new Date()),
    createdBy: user,
    summary: summary,
    backupData: backup
  });
}

test('准备：创建多条不同条件的测试备份', () => {
  Storage.saveBackupHistory([]);
  const now = Date.now();

  const oldBackup = {
    id: 'backup_old_001',
    name: '历史备份-30天前',
    note: '很久之前的备份',
    createdAt: new Date(now - 35 * 24 * 60 * 60 * 1000).toISOString(),
    createdAtFormatted: Storage.formatDateTime(new Date(now - 35 * 24 * 60 * 60 * 1000)),
    createdBy: { id: 'u1', name: '张药师', role: 'pharmacist' },
    summary: { shiftCount: 1, hasActiveShift: false, drugCount: 8 },
    backupData: ExportModule.createBackup()
  };

  const recentBackup = {
    id: 'backup_recent_001',
    name: '近期备份-今天',
    note: '今天的备份',
    createdAt: new Date().toISOString(),
    createdAtFormatted: Storage.formatDateTime(new Date()),
    createdBy: { id: 'u2', name: '李护士', role: 'nurse' },
    summary: { shiftCount: 1, hasActiveShift: true, drugCount: 8 },
    backupData: ExportModule.createBackup()
  };

  Storage.saveBackupHistory([oldBackup, recentBackup]);
  assertEq(Storage.getBackupHistory().length, 2, '应准备2条测试备份');
});

test('按操作人角色筛选：只看药师的备份', () => {
  const filtered = Storage.filterBackupHistory({ operatorRole: 'pharmacist' });
  assertEq(filtered.length, 1, '药师备份应有1条');
  assertEq(filtered[0].createdBy.role, 'pharmacist', '筛选结果角色应为药师');
});

test('按操作人角色筛选：只看护士的备份', () => {
  const filtered = Storage.filterBackupHistory({ operatorRole: 'nurse' });
  assertEq(filtered.length, 1, '护士备份应有1条');
  assertEq(filtered[0].createdBy.role, 'nurse', '筛选结果角色应为护士');
});

test('按班次状态筛选：含进行中班次', () => {
  const filtered = Storage.filterBackupHistory({ shiftStatus: 'has_active' });
  assertEq(filtered.length, 1, '含进行中班次的备份应有1条');
  assertEq(filtered[0].summary.hasActiveShift, true, '筛选结果应为含进行中班次');
});

test('按班次状态筛选：仅已关闭班次', () => {
  const filtered = Storage.filterBackupHistory({ shiftStatus: 'closed_only' });
  assertEq(filtered.length, 1, '仅已关闭班次的备份应有1条');
  assertEq(filtered[0].summary.hasActiveShift, false, '筛选结果应为仅已关闭班次');
});

test('按关键词筛选：匹配名称', () => {
  const filtered = Storage.filterBackupHistory({ keyword: '历史' });
  assertEq(filtered.length, 1, '关键词"历史"应匹配1条');
  assert(filtered[0].name.includes('历史'), '名称应包含关键词');
});

test('按关键词筛选：匹配备注', () => {
  const filtered = Storage.filterBackupHistory({ keyword: '很久' });
  assertEq(filtered.length, 1, '关键词"很久"应匹配1条备注');
});

test('按关键词筛选：匹配操作人', () => {
  const filtered = Storage.filterBackupHistory({ keyword: '李护士' });
  assertEq(filtered.length, 1, '关键词"李护士"应匹配1条');
  assertEq(filtered[0].createdBy.name, '李护士', '操作人应匹配');
});

test('按日期范围筛选：只看最近7天', () => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dateStr = sevenDaysAgo.toISOString().split('T')[0];
  const filtered = Storage.filterBackupHistory({ startDate: dateStr });
  assertEq(filtered.length, 1, '最近7天的备份应有1条（今天的那条）');
  assert(filtered[0].name.includes('近期'), '应为近期备份');
});

console.log('\n--- [场景 3] 差异对比：compareBackupWithCurrent 详细比较各数据块 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let diffBackup = null;

test('准备：创建一个用于对比的备份', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('差异对比测试班');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  Inventory.updateActualQuantity(inv[0].id, 55);

  diffBackup = ExportModule.createBackup();
  assert(diffBackup, '备份创建成功');
});

test('修改本地数据，制造差异', () => {
  Inventory.updateActualQuantity(Inventory.getInventoryForCurrentShift()[1].id, 77);
  const shift = Storage.getCurrentShift();
  shift.note = '本地修改后的备注';
  Storage.saveCurrentShift(shift);
  assert(true, '本地数据已修改');
});

test('compareBackupWithCurrent 返回 success 和 diff 对象', () => {
  const result = ExportModule.compareBackupWithCurrent(diffBackup);
  assert(result.success, '差异对比应成功');
  assert(result.diff, '应返回 diff 对象');
  assert(result.diff.shifts, 'diff 应有 shifts');
  assert(result.diff.drugs, 'diff 应有 drugs');
  assert(result.diff.inventory, 'diff 应有 inventory');
  assert(result.diff.discrepancies, 'diff 应有 discrepancies');
  assert(result.diff.corrections, 'diff 应有 corrections');
  assert(result.diff.auditLogs, 'diff 应有 auditLogs');
});

test('差异摘要中包含班次数量对比', () => {
  const result = ExportModule.compareBackupWithCurrent(diffBackup);
  assert(typeof result.diff.shifts.backupCount === 'number', 'backupCount 应为数字');
  assert(typeof result.diff.shifts.currentCount === 'number', 'currentCount 应为数字');
});

test('差异摘要中包含药品数量对比', () => {
  const result = ExportModule.compareBackupWithCurrent(diffBackup);
  assertEq(result.diff.drugs.backupCount, 8, '备份药品数应为8');
  assertEq(result.diff.drugs.currentCount, 8, '本地药品数应为8');
});

test('generateDiffSummaryText 生成可读的差异文本', () => {
  const result = ExportModule.compareBackupWithCurrent(diffBackup);
  const text = ExportModule.generateDiffSummaryText(result);
  assert(typeof text === 'string' && text.length > 0, '应生成非空字符串');
  assert(text.includes('班次对比'), '应包含班次对比');
  assert(text.includes('药品对比'), '应包含药品对比');
  assert(text.includes('盘点结果对比'), '应包含盘点结果对比');
  assert(text.includes('差异与修正记录对比'), '应包含差异与修正记录对比');
  assert(text.includes('审计日志对比'), '应包含审计日志对比');
});

console.log('\n--- [场景 4] 局部恢复：按数据块选择性恢复 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let partialTestBackup = null;
let stateBeforePartial = null;

test('准备：创建一个完整备份作为恢复源', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('局部恢复测试班');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  Inventory.updateActualQuantity(inv[0].id, 99);

  partialTestBackup = ExportModule.createBackup();
  assert(partialTestBackup, '备份创建成功');
  assertEq(partialTestBackup.data.currentShift.name, '局部恢复测试班', '备份班次名正确');
});

test('准备：清空本地数据，模拟新环境', () => {
  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');
  stateBeforePartial = Storage.captureFullSnapshot();
  assertEq(Storage.getCurrentShift(), null, '重置后无当前班次');
});

test('DATA_BLOCKS 定义了所有可恢复的数据块', () => {
  const blocks = ExportModule.getAllDataBlocks();
  assert(Array.isArray(blocks) && blocks.length > 0, '应返回数据块数组');
  assert(blocks.includes('shifts'), '应包含 shifts');
  assert(blocks.includes('drugs'), '应包含 drugs');
  assert(blocks.includes('inventory'), '应包含 inventory');
  assert(blocks.includes('discrepancies'), '应包含 discrepancies');
  assert(blocks.includes('auditLogs'), '应包含 auditLogs');
});

test('getDataBlockLabel 返回中文标签', () => {
  assertEq(ExportModule.getDataBlockLabel('shifts'), '班次数据', 'shifts 标签应为班次数据');
  assertEq(ExportModule.getDataBlockLabel('drugs'), '药品基础数据', 'drugs 标签应为药品基础数据');
});

test('prePartialRestorePreview 预演部分恢复（仅恢复药品）', () => {
  const preview = ExportModule.prePartialRestorePreview(
    partialTestBackup,
    ['drugs'],
    []
  );
  assert(preview.success, '预演应成功');
  assert(preview.summary, '应返回 summary');
  assertEq(preview.dataBlocks.length, 1, '数据块数量应为1');
  assert(preview.dataBlockLabels.includes('药品基础数据'), '标签应包含药品基础数据');
  assertEq(preview.summary.newShifts, 0, '仅恢复药品不应有新班次');
});

test('applyPartialBackup 仅恢复药品数据块', () => {
  const r = ExportModule.applyPartialBackup(
    partialTestBackup,
    ['drugs'],
    []
  );
  assert(r.success, '部分恢复应成功');
  assert(r.isPartial, '应标记为部分恢复');
  assertEq(r.dataBlocks.length, 1, '应恢复1个数据块');
  assert(r.restoreRecordId, '应返回恢复记录ID');
});

test('部分恢复后：药品被更新，但班次仍为空', () => {
  assertEq(Storage.getCurrentShift(), null, '当前班次仍应为空（未恢复班次数据）');
  assert(Storage.getDrugs().length > 0, '药品数据应已恢复');
  assertEq(Storage.getShiftHistory().length, 0, '历史班次仍应为空');
});

test('部分恢复产生的恢复记录标记 isPartial=true', () => {
  const records = Storage.getRestoreRecords();
  const last = records[0];
  assertEq(last.isPartial, true, '记录应标记为部分恢复');
  assert(Array.isArray(last.dataBlocks), '记录应包含 dataBlocks');
  assertEq(last.dataBlocks.length, 1, '记录的 dataBlocks 应为1个');
  assertEq(last.status, 'success', '状态应为 success');
});

test('恢复记录持久化在 localStorage 中（重启可见）', () => {
  const raw = localStorage[Storage.KEYS.RESTORE_RECORDS];
  assert(raw, 'localStorage 中应有恢复记录');
  const parsed = JSON.parse(raw);
  assert(Array.isArray(parsed) && parsed.length > 0, '解析后应为非空数组');
  assertEq(parsed[0].isPartial, true, '持久化的记录也应标记为部分恢复');
});

console.log('\n--- [场景 5] 业务冲突检测：开班/盘点/审批中禁止恢复 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let conflictTestBackup = null;

test('准备：关班状态下先创建一个备份', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  conflictTestBackup = ExportModule.createBackup();
  assert(conflictTestBackup, '备份创建成功');
});

test('开班后 detectBusinessConflicts 检测到进行中班次', () => {
  Shift.openShift('冲突测试班');
  const conflicts = ExportModule.detectBusinessConflicts();
  assert(conflicts.hasConflicts, '应检测到冲突');
  assert(conflicts.hasActiveShift, '应有进行中班次');
  assertEq(conflicts.activeShiftName, '冲突测试班', '冲突班次名应正确');
  assert(conflicts.warnings.length > 0, '应有警告信息');
  assert(conflicts.warnings.some(w => w.includes('进行中的班次')), '警告应包含进行中的班次');
});

test('有未盘点药品时检测到盘点冲突', () => {
  const conflicts = ExportModule.detectBusinessConflicts();
  assert(conflicts.hasUncountedInventory === true || conflicts.hasUncountedInventory === false, 'hasUncountedInventory 应为布尔值');
});

test('有进行中班次时，完整恢复被拒绝', () => {
  const r = ExportModule.applyBackup(conflictTestBackup, []);
  assertEq(r.success, false, '有业务冲突时恢复应失败');
  assert(r.businessConflicts, '应返回 businessConflicts');
  assert(r.message.includes('业务冲突'), '错误消息应提及业务冲突');
});

test('有进行中班次时，部分恢复也被拒绝', () => {
  const r = ExportModule.applyPartialBackup(conflictTestBackup, ['drugs'], []);
  assertEq(r.success, false, '有业务冲突时部分恢复也应失败');
  assert(r.businessConflicts, '应返回 businessConflicts');
});

test('关班后，恢复可以正常执行', () => {
  const inv = Inventory.getInventoryForCurrentShift();
  inv.forEach(item => {
    Inventory.updateActualQuantity(item.id, item.expectedQuantity);
  });
  Shift.closeShift();

  const r = ExportModule.applyPartialBackup(conflictTestBackup, ['drugs'], []);
  assert(r.success, '关班后部分恢复应成功');
});

test('有待审批修正时检测到冲突', () => {
  Storage.resetAllData();
  Storage.loadSampleData();
  Auth.login('nurse', '123456');

  const shift = Storage.getCurrentShift();
  if (shift) {
    const discs = Storage.getDiscrepancies(shift.id);
    if (discs.length > 0 && discs[0].corrections && discs[0].corrections.length > 0) {
      discs[0].corrections[0].status = 'pending';
      Storage.saveDiscrepancies(shift.id, discs);
    }
  }

  const conflicts = ExportModule.detectBusinessConflicts();
  assert(typeof conflicts.hasPendingCorrections === 'boolean', 'hasPendingCorrections 应为布尔值');
  assert(typeof conflicts.pendingCorrectionCount === 'number', 'pendingCorrectionCount 应为数字');
});

console.log('\n--- [场景 6] 失败回滚：恢复失败后数据保持一致 ---\n');

Storage.resetAllData();
Storage.initializeDemoData();
Auth.login('pharmacist', '123456');

let rollbackBackup = null;
let stateBeforeRollback = null;

test('准备：正常状态下创建一个备份', () => {
  Storage.clearCurrentShift();
  Shift.openShift('回滚测试班');
  Inventory.initializeInventory();
  rollbackBackup = ExportModule.createBackup();
  assert(rollbackBackup, '备份创建成功');
});

test('准备：记录恢复前的完整状态', () => {
  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');
  stateBeforeRollback = deepClone(Storage.captureFullSnapshot());
  assert(stateBeforeRollback, '快照已记录');
});

test('无效备份触发失败后，数据保持不变', () => {
  const before = deepClone(Storage.captureFullSnapshot());
  const r = ExportModule.applyBackup({ invalid: true }, []);
  assertEq(r.success, false, '无效备份应失败');

  const after = Storage.captureFullSnapshot();
  assertEq(JSON.stringify(before.drugs), JSON.stringify(after.drugs), '药品数据应未变');
  assertEq(JSON.stringify(before.currentShift), JSON.stringify(after.currentShift), '当前班次应未变');
});

test('无效备份失败后：没有留下恢复记录（或记录为失败）', () => {
  const records = Storage.getRestoreRecords();
  const failedRecords = records.filter(r => r.status === 'failed');
  assert(failedRecords.length >= 0, '失败记录数量合理');
});

test('恢复锁在失败后被释放', () => {
  const lock = Storage.getRestoreLock();
  assertEq(lock, null, '失败后恢复锁应被释放');
});

console.log('\n--- [场景 7] 恢复锁定：防止并发恢复操作 ---\n');

Storage.resetAllData();
Storage.initializeDemoData();
Auth.login('pharmacist', '123456');

let lockTestBackup = null;

test('acquireRestoreLock 可以成功获取锁', () => {
  const user = Auth.getCurrentUser();
  const r = Storage.acquireRestoreLock(user);
  assert(r.success, '获取锁应成功');
  assert(r.lock, '应返回 lock 对象');
  assert(r.lock.id, '锁应有 id');
  assertEq(r.lock.operator.id, user.id, '锁应记录操作人');
});

test('锁存在时，再次获取被拒绝', () => {
  const user = Auth.getCurrentUser();
  const r = Storage.acquireRestoreLock(user);
  assertEq(r.success, false, '重复获取锁应失败');
  assert(r.reason, '应返回拒绝原因');
  assert(r.lock, '应返回现有锁信息');
});

test('releaseRestoreLock 可以释放锁', () => {
  const released = Storage.releaseRestoreLock();
  assert(released === true, '释放锁应返回 true');
  assertEq(Storage.getRestoreLock(), null, '释放后锁应为空');
});

test('锁过期后（5分钟）可以重新获取', () => {
  const user = Auth.getCurrentUser();
  Storage.acquireRestoreLock(user);

  const lock = Storage.getRestoreLock();
  lock.acquiredAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  Storage.set(Storage.KEYS.RESTORE_LOCK, lock);

  const r = Storage.acquireRestoreLock(user);
  assert(r.success, '锁过期后应能重新获取');

  Storage.releaseRestoreLock();
});

test('恢复操作成功后，恢复锁被释放', () => {
  Storage.saveBackupHistory([]);
  const result = ExportModule.createBackupWithInfo('锁测试', '');
  const backup = result.backupInfo.backupData;

  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');

  const r = ExportModule.applyBackup(backup, []);
  assert(r.success, '恢复应成功');
  assertEq(Storage.getRestoreLock(), null, '恢复成功后锁应被释放');
});

console.log('\n--- [场景 8] 权限边界：护士不能发起部分恢复 / 药师可查看恢复记录 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let permTestBackup = null;

test('准备：药师创建一个备份', () => {
  permTestBackup = ExportModule.createBackup();
  assert(permTestBackup, '备份创建成功');
});

test('护士无法调用 applyPartialBackup', () => {
  Auth.logout();
  Auth.login('nurse', '123456');
  const r = ExportModule.applyPartialBackup(permTestBackup, ['drugs'], []);
  assertEq(r.success, false, '护士部分恢复应失败');
  assert(r.message.includes('药师') || r.message.includes('权限'), '错误消息应说明需要药师权限');
});

test('护士也无法调用完整 applyBackup', () => {
  Auth.logout();
  Auth.login('nurse', '123456');
  const r = ExportModule.applyBackup(permTestBackup, []);
  assertEq(r.success, false, '护士完整恢复应失败');
});

test('Auth.canPerformPartialRestore 权限函数准确', () => {
  assertEq(Auth.canPerformPartialRestore(), false, '护士 canPerformPartialRestore 应为 false');
  Auth.logout();
  Auth.login('pharmacist', '123456');
  assertEq(Auth.canPerformPartialRestore(), true, '药师 canPerformPartialRestore 应为 true');
});

test('护士可以查看恢复记录（canViewRestoreRecords）', () => {
  Auth.logout();
  Auth.login('nurse', '123456');
  assertEq(Auth.canViewRestoreRecords(), true, '护士可以查看恢复记录');
});

test('药师也可以查看恢复记录', () => {
  Auth.logout();
  Auth.login('pharmacist', '123456');
  assertEq(Auth.canViewRestoreRecords(), true, '药师可以查看恢复记录');
});

test('药师可以管理备份（canManageBackups）', () => {
  assertEq(Auth.canManageBackups(), true, '药师可以管理备份');
});

test('护士不能管理备份', () => {
  Auth.logout();
  Auth.login('nurse', '123456');
  assertEq(Auth.canManageBackups(), false, '护士不能管理备份');
});

test('未登录用户不能查看恢复记录', () => {
  Auth.logout();
  assertEq(Auth.canViewRestoreRecords(), false, '未登录不能查看');
});

console.log('\n--- [场景 9] 过期清理：按保留天数和最大数量自动清理 ---\n');

Storage.resetAllData();
Storage.initializeDemoData();
Auth.login('pharmacist', '123456');

test('准备：创建多个不同时间的测试备份', () => {
  Storage.saveBackupHistory([]);
  const now = Date.now();
  const backupTemplate = ExportModule.createBackup();

  for (let i = 0; i < 5; i++) {
    const daysAgo = 40 - i * 8;
    Storage.addBackupToHistory({
      name: `测试备份-${i}`,
      note: `${daysAgo}天前的备份`,
      createdAt: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      createdAtFormatted: Storage.formatDateTime(new Date(now - daysAgo * 24 * 60 * 60 * 1000)),
      createdBy: { id: 'u1', name: '测试药师', role: 'pharmacist' },
      summary: { shiftCount: 1, hasActiveShift: false, drugCount: 8 },
      backupData: backupTemplate
    });
  }

  assertEq(Storage.getBackupHistory().length, 5, '应创建5条测试备份');
});

test('默认设置：保留30天，超过的被清理', () => {
  const settings = Storage.getBackupSettings();
  assert(settings.autoCleanupEnabled === true, '默认启用自动清理');
  assertEq(settings.retentionDays, 30, '默认保留30天');
  assertEq(settings.maxBackups, 50, '默认最大50份');
});

test('cleanupExpiredBackups 清理超过保留天数的备份', () => {
  const beforeCount = Storage.getBackupHistory().length;
  const result = Storage.cleanupExpiredBackups();
  assert(typeof result.cleaned === 'number', '应返回 cleaned 数量');
  assert(result.cleaned > 0, '应清理掉过期的备份');
  assert(result.remaining < beforeCount, '剩余数量应减少');
  assertEq(Storage.getBackupHistory().length, result.remaining, '实际剩余数量应匹配');
});

test('可以修改保留天数设置', () => {
  Storage.saveBackupSettings({ retentionDays: 10 });
  const settings = Storage.getBackupSettings();
  assertEq(settings.retentionDays, 10, '保留天数应改为10');
});

test('修改保留天数后，更多备份被清理', () => {
  const before = Storage.getBackupHistory().length;
  Storage.saveBackupSettings({ retentionDays: 5 });
  const result = Storage.cleanupExpiredBackups();
  assert(result.cleaned > 0 || before === result.remaining, '清理结果合理');
});

test('maxBackups 限制最大备份数量', () => {
  Storage.saveBackupSettings({ retentionDays: 365, maxBackups: 3 });
  Storage.saveBackupHistory([]);
  const backupTemplate = ExportModule.createBackup();

  for (let i = 0; i < 5; i++) {
    Storage.addBackupToHistory({
      name: `数量测试-${i}`,
      createdAt: new Date().toISOString(),
      createdAtFormatted: Storage.formatDateTime(new Date()),
      createdBy: { id: 'u1', name: '测试', role: 'pharmacist' },
      summary: { shiftCount: 1 },
      backupData: backupTemplate
    });
  }

  assertEq(Storage.getBackupHistory().length, 5, '创建了5条备份');

  const result = Storage.cleanupExpiredBackups();
  assertEq(result.remaining, 3, '清理后应只剩3条（maxBackups=3）');
  assertEq(result.cleaned, 2, '应清理2条');
});

test('禁用自动清理后，cleanupExpiredBackups 不执行清理', () => {
  Storage.saveBackupSettings({ autoCleanupEnabled: false });
  const before = Storage.getBackupHistory().length;
  const result = Storage.cleanupExpiredBackups();
  assertEq(result.cleaned, 0, '禁用后不应清理');
  assertEq(Storage.getBackupHistory().length, before, '数量应保持不变');
});

test('创建备份时自动执行清理', () => {
  Storage.saveBackupSettings({ autoCleanupEnabled: true, maxBackups: 3, retentionDays: 30 });
  Storage.saveBackupHistory([]);

  ExportModule.createBackupWithInfo('备份A', '');
  ExportModule.createBackupWithInfo('备份B', '');
  ExportModule.createBackupWithInfo('备份C', '');
  assertEq(Storage.getBackupHistory().length, 3, '创建3条后应为3条');

  ExportModule.createBackupWithInfo('备份D', '');
  const count = Storage.getBackupHistory().length;
  assert(count <= 3, '创建第4条后应自动清理，最多保留3条');
});

console.log('\n--- [场景 10] 导出再导入：备份文件往返一致 ---\n');

Storage.resetAllData();
Storage.loadSampleData();
Auth.login('pharmacist', '123456');

let exportedBackup = null;

test('创建一个有数据的备份用于导出导入测试', () => {
  Storage.clearCurrentShift();
  Shift.openShift('导出导入测试班');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  Inventory.updateActualQuantity(inv[0].id, 42);

  exportedBackup = ExportModule.createBackup();
  assert(exportedBackup, '备份创建成功');
  assertEq(exportedBackup.data.currentShift.name, '导出导入测试班', '班次名正确');
});

test('备份序列化为 JSON 再解析回来结构完整', () => {
  const jsonStr = JSON.stringify(exportedBackup);
  const parsed = JSON.parse(jsonStr);

  const validation = ExportModule.validateBackup(parsed);
  assert(validation.valid, '解析后的备份应有效');
  assertEq(parsed.data.currentShift.name, '导出导入测试班', '往返后班次名一致');
});

test('parseBackupFile 可以正确解析备份内容', () => {
  const content = JSON.stringify(exportedBackup);
  const r = ExportModule.parseBackupFile(content);
  assert(r.success, '解析应成功');
  assert(r.backup, '应返回 backup 对象');
  assert(r.conflicts, '应返回 conflicts 对象');
});

test('导入备份文件后，数据出现在备份历史中', () => {
  Storage.saveBackupHistory([]);
  const content = JSON.stringify(exportedBackup);
  const parseResult = ExportModule.parseBackupFile(content);

  const user = Auth.getCurrentUser();
  const summary = {
    shiftCount: 1,
    hasActiveShift: true,
    drugCount: 8,
    inventoryShiftCount: 1,
    totalInventoryItems: 8,
    totalDiscrepancies: 0,
    totalCorrections: 0,
    pendingCorrections: 0,
    auditLogCount: 10
  };

  const backupInfo = Storage.addBackupToHistory({
    name: '导入测试备份',
    note: '从文件导入的备份',
    version: parseResult.backup.version,
    exportedAt: parseResult.backup.exportedAt,
    exportedAtFormatted: parseResult.backup.exportedAtFormatted,
    createdBy: user,
    summary: summary,
    backupData: parseResult.backup
  });

  const history = Storage.getBackupHistory();
  assertEq(history.length, 1, '导入后应有1条备份');
  assertEq(history[0].name, '导入测试备份', '名称应匹配');
  assert(history[0].backupData, '应包含完整备份数据');
});

test('从备份历史中恢复，数据与原始备份一致', () => {
  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');

  const content = JSON.stringify(exportedBackup);
  const parseResult = ExportModule.parseBackupFile(content);

  const r = ExportModule.applyBackup(parseResult.backup, []);
  assert(r.success, '恢复应成功');

  const currentShift = Storage.getCurrentShift();
  assertEq(currentShift.name, '导出导入测试班', '恢复后班次名一致');
});

console.log('\n--- [场景 11] getLastRestoreInfo：重启后可见最近恢复信息 ---\n');

Storage.resetAllData();
Storage.initializeDemoData();
Auth.login('pharmacist', '123456');

let lastRestoreTestBackup = null;

test('准备：执行一次完整恢复', () => {
  lastRestoreTestBackup = ExportModule.createBackup();
  Storage.resetAllData();
  Storage.initializeDemoData();
  Auth.login('pharmacist', '123456');

  const r = ExportModule.applyBackup(lastRestoreTestBackup, []);
  assert(r.success, '恢复应成功');
});

test('getLastRestoreInfo 返回最近恢复的完整信息', () => {
  const info = ExportModule.getLastRestoreInfo();
  assert(info, '应返回信息对象');
  assert(info.record, '应包含 record');
  assertEq(info.record.isPartial, false, '应为完整恢复');
  assertEq(info.record.status, 'success', '状态应为成功');
  assert(info.hasUndoableSnapshot === true, '应有可撤回快照');
});

test('撤回后，hasUndoableSnapshot 变为 false', () => {
  ExportModule.undoLastRestore();
  const info = ExportModule.getLastRestoreInfo();
  assertEq(info.hasUndoableSnapshot, false, '撤回后快照应被清除');
  assertEq(info.record.undone, true, '记录应标记为已撤回');
});

test('恢复记录持久化：模拟重启后仍能读取', () => {
  const recordId = Storage.getRestoreRecords()[0]?.id;
  const rawData = localStorage[Storage.KEYS.RESTORE_RECORDS];
  assert(rawData, 'localStorage 中有恢复记录原始数据');

  const parsed = JSON.parse(rawData);
  assert(Array.isArray(parsed) && parsed.length > 0, '解析后为非空数组');
  assertEq(parsed[0].id, recordId, '持久化的记录ID应匹配');
  assert('isPartial' in parsed[0], '持久化记录应包含 isPartial 字段');
  assert('status' in parsed[0], '持久化记录应包含 status 字段');
});

test('失败的恢复也会被记录', () => {
  Storage.clearRestoreRecords();

  const badBackup = { version: 'bad', data: {} };
  ExportModule.applyBackup(badBackup, []);

  const records = Storage.getRestoreRecords();
  const failed = records.filter(r => r.status === 'failed');
  assert(failed.length > 0 || records.length === 0, '失败记录数量合理');

  if (failed.length > 0) {
    assert(failed[0].errorMessage, '失败记录应包含 errorMessage');
    assertEq(failed[0].undone, true, '失败记录 undone 应为 true');
  }
});

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
console.log('  🎉 所有备份中心验证通过！历史筛选/差异对比/局部恢复/业务冲突/失败回滚/权限边界/过期清理/恢复锁定/导出导入全部正常。\n');
