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
  addEventListener: () => {}
};
globalThis.window = globalThis;
globalThis.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} };
globalThis.Blob = function(arr, opts) { this.content = arr.join(''); this.opts = opts; };
globalThis.navigator = {};

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

console.log('\n========================================');
console.log('  药房交班系统 - 权限链路回归测试');
console.log('========================================\n');

console.log('--- [初始化] 重置数据 + 加载演示样例 ---');
Storage.resetAllData();
Storage.loadSampleData();
console.log('    演示样例加载完成\n');

console.log('--- 1. 用户登录测试 ---');
test('药师登录成功', () => {
  const r = Auth.login('pharmacist', '123456');
  assert(r.success, '药师应登录成功');
  assertEq(Auth.isPharmacist(), true, '登录后应识别为药师');
});
Auth.logout();

test('护士登录成功', () => {
  const r = Auth.login('nurse', '123456');
  assert(r.success, '护士应登录成功');
  assertEq(Auth.isNurse(), true, '登录后应识别为护士');
});
Auth.logout();

test('错误密码登录失败', () => {
  const r = Auth.login('pharmacist', 'wrongpass');
  assertEq(r.success, false, '错误密码应登录失败');
});

console.log('\n--- 2. ★ 核心修复：护士开班权限测试 ★ ---');
test('【回归用例】护士调用 openShift 业务层被拦截', () => {
  Auth.login('nurse', '123456');
  Storage.clearCurrentShift();
  const r = Shift.openShift('护士尝试开班');
  assertEq(r.success, false, '护士调用 openShift 必须失败');
  assert(r.message.includes('药师权限'), `错误消息应说明权限，实际: ${r.message}`);
  Auth.logout();
});

test('药师调用 openShift 成功', () => {
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  const r = Shift.openShift('药师正规班次');
  assertEq(r.success, true, '药师调用 openShift 应成功');
  assertEq(r.shift.createdByName, '张药师', '责任人应为张药师');
});

test('护士重复调用尝试开班 (已有关班的药师班次)', () => {
  Shift.closeShift();
  Auth.logout();
  Auth.login('nurse', '123456');
  const r = Shift.openShift('护士再次尝试');
  assertEq(r.success, false, '护士仍被拦截');
  Auth.logout();
});

console.log('\n--- 3. 护士关班 / 差异处理权限测试 ---');
Auth.login('pharmacist', '123456');
{
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  Shift.openShift('权限测试班次');
  Inventory.initializeInventory();
  const inv = Inventory.getInventoryForCurrentShift();
  const controlledInv = inv.find(i => i.drugType === 'controlled');
  Inventory.updateActualQuantity(controlledInv.id, 20);
}

test('护士调用 closeShift 被拦截', () => {
  Auth.logout();
  Auth.login('nurse', '123456');
  const r = Shift.closeShift();
  assertEq(r.success, false, '护士关班必须失败');
  Auth.logout();
});

test('护士调用 resolveDiscrepancy 被拦截', () => {
  Auth.login('nurse', '123456');
  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  assert(discs.length > 0, '应存在差异');
  const r = Discrepancy.resolveDiscrepancy(discs[0].id, '护士尝试处理');
  assertEq(r.success, false, '护士处理差异必须失败');
  Auth.logout();
});

test('药师处理差异成功', () => {
  Auth.login('pharmacist', '123456');
  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  const r = Discrepancy.resolveDiscrepancy(discs[0].id, '正常损耗，已登记');
  assertEq(r.success, true, '药师处理差异应成功');
  assertEq(r.discrepancy.resolvedByName, '张药师', '处理人应为张药师');
});

console.log('\n--- 4. 护士修正申请 vs 审批权限测试 ---');
{
  const inv = Inventory.getInventoryForCurrentShift();
  const normalInv = inv.find(i => i.drugType === 'normal');
  Inventory.updateActualQuantity(normalInv.id, 50);
}

test('护士申请修正成功 (允许申请，不允许审批)', () => {
  Auth.logout();
  Auth.login('nurse', '123456');
  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  const normalDisc = discs.find(d => d.drugType === 'normal' && d.status === 'pending');
  assert(normalDisc, '应存在普通药品差异');
  const r = Discrepancy.requestCorrection(normalDisc.id, 55, '漏盘了5盒');
  assertEq(r.success, true, '护士应允许申请修正');
  assertEq(r.correction.requestedByName, '李护士', '申请人应为李护士');
});

test('【核心】护士审批修正申请被拒绝', () => {
  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  const normalDisc = discs.find(d => d.drugType === 'normal');
  const corr = normalDisc.corrections[0];
  const r = Discrepancy.reviewCorrection(normalDisc.id, corr.id, true, '护士试图审批');
  assertEq(r.success, false, '护士审批修正必须失败');
  assert(r.message.includes('药师'), `错误消息应说明药师权限，实际: ${r.message}`);
});

test('药师审批修正申请成功', () => {
  Auth.logout();
  Auth.login('pharmacist', '123456');
  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  const normalDisc = discs.find(d => d.drugType === 'normal');
  const corr = normalDisc.corrections[0];
  const r = Discrepancy.reviewCorrection(normalDisc.id, corr.id, true, '核实无误');
  assertEq(r.success, true, '药师审批应成功');
  assertEq(r.correction.reviewedByName, '张药师', '审批人应为张药师');

  const discsAfter = Discrepancy.getDiscrepanciesForCurrentShift();
  const discAfter = discsAfter.find(d => d.id === normalDisc.id);
  assertEq(discAfter.actualQuantity, corr.newActualQuantity, '实存数量应更新为修正值');
});

console.log('\n--- 5. 负数数量/未知编码 保存校验 ---');
test('负数数量不能保存', () => {
  const inv = Inventory.getInventoryForCurrentShift();
  const r = Inventory.updateActualQuantity(inv[0].id, -5);
  assertEq(r.success, false, '负数必须拒绝');
});

test('非数字数量不能保存', () => {
  const inv = Inventory.getInventoryForCurrentShift();
  const r = Inventory.updateActualQuantity(inv[0].id, 'abc');
  assertEq(r.success, false, '非数字必须拒绝');
});

console.log('\n--- 6. 受控药差异未解决不能关班 ---');
test('未解决受控差异时关班被拒绝', () => {
  const inv = Inventory.getInventoryForCurrentShift();
  const controlled = inv.find(i => i.drugType === 'controlled');
  Inventory.updateActualQuantity(controlled.id, 5);
  const r = Shift.closeShift();
  assertEq(r.success, false, '存在未处理受控差异时关班必须失败');
  assert(r.message.includes('受控药'), `消息应提及受控药，实际: ${r.message}`);
});

test('解决受控差异后关班成功', () => {
  const discs = Discrepancy.getDiscrepanciesForCurrentShift();
  const cd = discs.find(d => d.drugType === 'controlled' && d.status === 'pending');
  Discrepancy.resolveDiscrepancy(cd.id, '已核实，补登记领用');
  const r = Shift.closeShift();
  assertEq(r.success, true, '所有受控差异解决后应能关班');
  assertEq(r.shift.closedByName, '张药师', '关班人应为张药师');
});

console.log('\n--- 7. 审计日志与责任人追溯 ---');
test('开班越权尝试会写入审计日志', () => {
  const logs = Storage.getAuditLogs();
  const intercept = logs.find(l => l.action === '越权拦截' && l.userName === '李护士');
  assert(intercept, '护士越权开班应有审计记录');
  assert(intercept.details.includes('尝试开班'), `详情应说明越权，实际: ${intercept.details}`);
});

test('开班责任人记录正确', () => {
  const logs = Storage.getAuditLogs();
  const openShiftLogs = logs.filter(l => l.action === '开班');
  assert(openShiftLogs.length > 0, '存在开班日志');
  const last = openShiftLogs[0];
  assertEq(last.userName, '张药师', '开班操作人应为张药师');
  assertEq(last.userRole, 'pharmacist', '角色应为药师');
});

test('差异处理责任人记录正确', () => {
  const logs = Storage.getAuditLogs();
  const resolveLogs = logs.filter(l => l.action === '处理差异');
  assert(resolveLogs.length > 0, '存在差异处理日志');
  resolveLogs.forEach(l => {
    assertEq(l.userName, '张药师', '差异处理操作人必须是张药师');
  });
});

test('护士审批尝试未通过（审计追溯）', () => {
  const logs = Storage.getAuditLogs();
  const rejectLogs = logs.filter(l => l.action === '批准修正' || l.action === '拒绝修正');
  rejectLogs.forEach(l => {
    assertEq(l.userName, '张药师', '修正审批操作人必须是张药师');
  });
});

console.log('\n--- 8. 数据持久化一致性（模拟重启） ---');
test('重启模拟：重新加载后数据一致', () => {
  const shiftBefore = Storage.getCurrentShift();
  const invBefore = Storage.getInventory(shiftBefore.id);
  const discBefore = Storage.getDiscrepancies(shiftBefore.id);
  const logsBefore = Storage.getAuditLogs();
  const histBefore = Storage.getShiftHistory();

  const dataSnapshot = {};
  Object.keys(localStorage).forEach(k => { dataSnapshot[k] = localStorage[k]; });
  Object.keys(localStorage).forEach(k => { delete localStorage[k]; });

  Storage.initializeDemoData();
  Object.keys(dataSnapshot).forEach(k => { localStorage[k] = dataSnapshot[k]; });

  const shiftAfter = Storage.getCurrentShift();
  const invAfter = Storage.getInventory(shiftAfter.id);
  const discAfter = Storage.getDiscrepancies(shiftAfter.id);
  const logsAfter = Storage.getAuditLogs();
  const histAfter = Storage.getShiftHistory();

  assertEq(shiftAfter.name, shiftBefore.name, '班次名称应一致');
  assertEq(shiftAfter.id, shiftBefore.id, '班次ID应一致');
  assertEq(invAfter.length, invBefore.length, '盘点条目数应一致');
  assertEq(discAfter.length, discBefore.length, '差异条目数应一致');
  assertEq(logsAfter.length, logsBefore.length, '审计日志数应一致');
  assertEq(histAfter.length, histBefore.length, '历史班次数量应一致');
  assertEq(shiftAfter.closedByName, shiftBefore.closedByName, '关班责任人应一致');
  assertEq(shiftAfter.createdByName, shiftBefore.createdByName, '开班责任人应一致');
});

Auth.logout();

console.log('\n--- 9. 角色切换：药师 -> 护士 -> 药师 ---');
test('完整角色切换流程：各权限边界正确', () => {
  Auth.login('pharmacist', '123456');
  Storage.clearCurrentShift();
  Storage.saveShiftHistory([]);
  const r1 = Shift.openShift('角色切换测试班次');
  assert(r1.success, '药师开班成功');
  Inventory.initializeInventory();
  Auth.logout();

  Auth.login('nurse', '123456');
  const r2 = Shift.openShift('护士偷偷开班');
  assertEq(r2.success, false, '切换到护士后仍不能开班');
  const r3 = Shift.closeShift();
  assertEq(r3.success, false, '护士也不能关班');

  const inv = Inventory.getInventoryForCurrentShift();
  const r4 = Inventory.updateActualQuantity(inv[0].id, 90);
  assert(r4.success, '护士可以录入盘点');
  Auth.logout();

  Auth.login('pharmacist', '123456');
  const invAfter = Inventory.getInventoryForCurrentShift();
  const controlled = invAfter.find(i => i.drugType === 'controlled');
  if (controlled && !controlled.isCounted) {
    Inventory.updateActualQuantity(controlled.id, controlled.expectedQuantity);
  }
  const r5 = Shift.closeShift();
  assert(r5.success, '切回药师后能正常关班');
  assertEq(r5.shift.closedByName, '张药师', '关班人仍为张药师');
  Auth.logout();
});

console.log('\n========================================');
const passed = results.filter(r => r.pass).length;
const total = results.length;
console.log(`  测试结果：${passed}/${total} 通过`);
console.log('========================================\n');

if (passed < total) {
  console.log('失败用例详情：');
  results.filter(r => !r.pass).forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
  process.exit(1);
}
console.log('  🎉 所有权限链路回归测试通过！\n');
