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

console.log('\n=== 最小化验证：班次 overwrite 核心逻辑 ===\n');

Storage.resetAllData();
Storage.initializeDemoData();
Auth.login('pharmacist', '123456');

const shiftName = '验证班次-OVERWRITE-' + Date.now();
const specialNote = '这是备份中的专属备注-' + Date.now();

test('Step 1: 创建本地同名班次（无备注），然后关班', () => {
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift(shiftName);
  Inventory.initializeInventory();
  Inventory.getInventoryForCurrentShift().forEach(i =>
    Inventory.updateActualQuantity(i.id, i.expectedQuantity));
  Shift.closeShift();
  const localShift = Storage.getShiftHistory().find(s => s.name === shiftName);
  assert(localShift, '本地班次存在');
  assert(!localShift.note || localShift.note === '', '初始无备注');
  console.log('    [DEBUG] 本地班次 ID:', localShift.id, 'note:', JSON.stringify(localShift.note));
});

test('Step 2: 再次开同名班次（设置特殊备注），关班，创建备份', () => {
  Shift.openShift(shiftName);
  Inventory.initializeInventory();
  const s = Storage.getCurrentShift();
  s.note = specialNote;
  Storage.saveCurrentShift(s);
  Inventory.getInventoryForCurrentShift().forEach(i =>
    Inventory.updateActualQuantity(i.id, i.expectedQuantity));
  Shift.closeShift();
  const backupShifts = Storage.getShiftHistory().filter(s => s.name === shiftName);
  console.log('    [DEBUG] 备份历史中同名班次数量:', backupShifts.length);
  backupShifts.forEach((bs, i) => console.log('    [DEBUG]   #', i, 'id:', bs.id, 'note:', JSON.stringify(bs.note)));
  const backup = ExportModule.createBackup();
  globalThis._testBackup = backup;
  assert(backup, '备份创建成功');
});

test('Step 3: 清空本地，只保留第一个同名班次（模拟原始场景）', () => {
  const all = Storage.getShiftHistory();
  // 只保留第一个创建的（无备注的）
  const first = all.find(s => s.name === shiftName && (!s.note || s.note === ''));
  assert(first, '找到第一个（无备注）班次');
  Storage.saveShiftHistory([first]);
  console.log('    [DEBUG] 清理后历史班次数量:', Storage.getShiftHistory().length);
  const remain = Storage.getShiftHistory().find(s => s.name === shiftName);
  console.log('    [DEBUG] 保留班次 id:', remain.id, 'note:', JSON.stringify(remain.note));
});

test('Step 4: 检测冲突并构建 resolutions', () => {
  const backup = globalThis._testBackup;
  const conflicts = ExportModule.detectConflicts(backup);
  console.log('    [DEBUG] 冲突班次数量:', conflicts.shifts.length);
  conflicts.shifts.forEach((c, i) => {
    console.log('    [DEBUG]   #', i, 'name:', c.importedName, 'importedId:', c.importedId, 'existingId:', c.existingId);
    console.log('    [DEBUG]     imported.note:', JSON.stringify(c.imported.note));
    console.log('    [DEBUG]     existing.note:', JSON.stringify(c.existing.note));
  });
  // 找到 note 是 specialNote 的那个冲突
  const target = conflicts.shifts.find(c => c.imported.note === specialNote);
  assert(target, '找到有特殊备注的冲突项');

  const resolutions = conflicts.shifts.map(c =>
    ExportModule.resolveConflictStrategy(c, c.imported.note === specialNote ? 'overwrite' : 'skip')
  );
  console.log('    [DEBUG] resolutions:', resolutions.map(r => ({ target: r.target, strategy: r.strategy })));
  globalThis._testResolutions = resolutions;
});

test('Step 5: 执行 overwrite 恢复', () => {
  const backup = globalThis._testBackup;
  const resolutions = globalThis._testResolutions;
  const result = ExportModule.applyBackup(backup, resolutions);
  console.log('    [DEBUG] result.success:', result.success);
  console.log('    [DEBUG] result.message:', result.message);
  if (result.restoreRecord) {
    console.log('    [DEBUG] record.conflictResolutions:', result.restoreRecord.conflictResolutions);
  }
  assert(result.success, '恢复成功');
});

test('Step 6: 验证本地班次备注被覆盖', () => {
  const target = Storage.getShiftHistory().find(s => s.name === shiftName);
  console.log('    [DEBUG] 最终班次 note:', JSON.stringify(target ? target.note : '<未找到>'));
  assert(target, '目标班次存在');
  assertEq(target.note, specialNote, '备注被覆盖');
});

test('Step 7: 验证恢复记录中 conflictResolutions 字段', () => {
  const last = Storage.getRestoreRecords()[0];
  assert(last && last.conflictResolutions, '恢复记录有 conflictResolutions');
  const hasOverwrite = last.conflictResolutions.some(r => r.strategy === 'overwrite');
  assert(hasOverwrite, '有 overwrite 策略记录');
  console.log('    [DEBUG] conflictResolutions:', last.conflictResolutions);
});

console.log('\n=== 结果：', results.filter(r => r.pass).length, '/', results.length, '通过 ===\n');
if (results.some(r => !r.pass)) {
  results.filter(r => !r.pass).forEach(r => console.log('失败:', r.name, r.error));
  process.exit(1);
}
