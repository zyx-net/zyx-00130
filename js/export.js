const ExportModule = (function() {

  function generateShiftReport(shift) {
    if (!shift) return '';

    const inventory = Storage.getInventory(shift.id);
    const discrepancies = Storage.getDiscrepancies(shift.id);

    const normalDrugs = inventory.filter(i => i.drugType === 'normal');
    const controlledDrugs = inventory.filter(i => i.drugType === 'controlled');

    const pendingControlledDiscrepancies = discrepancies.filter(
      d => d.drugType === 'controlled' && d.status === 'pending'
    );
    const resolvedControlledDiscrepancies = discrepancies.filter(
      d => d.drugType === 'controlled' && d.status === 'resolved'
    );
    const pendingNormalDiscrepancies = discrepancies.filter(
      d => d.drugType === 'normal' && d.status === 'pending'
    );
    const resolvedNormalDiscrepancies = discrepancies.filter(
      d => d.drugType === 'normal' && d.status === 'resolved'
    );

    let report = '';
    report += '========================================\n';
    report += '          药房交班单\n';
    report += '========================================\n\n';

    report += '【班次信息】\n';
    report += '班次名称：' + shift.name + '\n';
    report += '班次状态：' + Shift.getStatusText(shift.status) + '\n';
    report += '创建人：' + shift.createdByName + '\n';
    report += '创建时间：' + shift.createdAtFormatted + '\n';
    if (shift.closedByName) {
      report += '关闭人：' + shift.closedByName + '\n';
      report += '关闭时间：' + shift.closedAtFormatted + '\n';
    }
    if (shift.receivedByName) {
      report += '签收人：' + shift.receivedByName + '\n';
      report += '签收时间：' + shift.receivedAtFormatted + '\n';
    }
    if (shift.note) {
      report += '备注：' + shift.note + '\n';
    }
    report += '\n';

    report += '【统计汇总】\n';
    report += '药品总数：' + inventory.length + ' 种\n';
    report += '  - 普通药品：' + normalDrugs.length + ' 种\n';
    report += '  - 受控药品：' + controlledDrugs.length + ' 种\n';
    report += '差异总数：' + discrepancies.length + ' 项\n';
    report += '  - 待处理：' + (pendingNormalDiscrepancies.length + pendingControlledDiscrepancies.length) + ' 项\n';
    report += '  - 已处理：' + (resolvedNormalDiscrepancies.length + resolvedControlledDiscrepancies.length) + ' 项\n';
    report += '\n';

    report += '【普通药品盘点明细】\n';
    report += '-'.repeat(70) + '\n';
    report += padRight('编码', 12) + padRight('名称', 20) + padRight('规格', 16)
      + padRight('应存', 8) + padRight('实存', 8) + padRight('差异', 8) + '\n';
    report += '-'.repeat(70) + '\n';
    normalDrugs.forEach(item => {
      const diff = item.isCounted ? (item.actualQuantity - item.expectedQuantity) : '-';
      report += padRight(item.drugCode, 12)
        + padRight(truncate(item.drugName, 18), 20)
        + padRight(truncate(item.drugSpec, 14), 16)
        + padRight(String(item.expectedQuantity), 8)
        + padRight(item.isCounted ? String(item.actualQuantity) : '未盘点', 8)
        + padRight(item.isCounted ? String(diff) : '-', 8)
        + '\n';
    });
    report += '\n';

    report += '【受控药品盘点明细】\n';
    report += '-'.repeat(70) + '\n';
    report += padRight('编码', 12) + padRight('名称', 20) + padRight('规格', 16)
      + padRight('应存', 8) + padRight('实存', 8) + padRight('差异', 8) + '\n';
    report += '-'.repeat(70) + '\n';
    controlledDrugs.forEach(item => {
      const diff = item.isCounted ? (item.actualQuantity - item.expectedQuantity) : '-';
      report += padRight(item.drugCode, 12)
        + padRight(truncate(item.drugName, 18), 20)
        + padRight(truncate(item.drugSpec, 14), 16)
        + padRight(String(item.expectedQuantity), 8)
        + padRight(item.isCounted ? String(item.actualQuantity) : '未盘点', 8)
        + padRight(item.isCounted ? String(diff) : '-', 8)
        + '\n';
    });
    report += '\n';

    if (discrepancies.length > 0) {
      report += '【差异明细】\n';
      report += '='.repeat(70) + '\n';

      if (pendingControlledDiscrepancies.length > 0) {
        report += '\n[受控药品 - 待处理]\n';
        pendingControlledDiscrepancies.forEach(d => {
          report += '• ' + d.drugName + ' (' + d.drugCode + ')\n';
          report += '  应存：' + d.expectedQuantity + d.unit
            + '，实存：' + d.actualQuantity + d.unit
            + '，差异：' + (d.difference > 0 ? '+' : '') + d.difference + d.unit + '\n';
        });
      }

      if (resolvedControlledDiscrepancies.length > 0) {
        report += '\n[受控药品 - 已处理]\n';
        resolvedControlledDiscrepancies.forEach(d => {
          report += '• ' + d.drugName + ' (' + d.drugCode + ')\n';
          report += '  应存：' + d.expectedQuantity + d.unit
            + '，实存：' + d.actualQuantity + d.unit
            + '，差异：' + (d.difference > 0 ? '+' : '') + d.difference + d.unit + '\n';
          report += '  处理结果：' + d.resolution + '\n';
          report += '  处理人：' + d.resolvedByName + '，时间：' + d.resolvedAtFormatted + '\n';
        });
      }

      if (pendingNormalDiscrepancies.length > 0) {
        report += '\n[普通药品 - 待处理]\n';
        pendingNormalDiscrepancies.forEach(d => {
          report += '• ' + d.drugName + ' (' + d.drugCode + ')\n';
          report += '  应存：' + d.expectedQuantity + d.unit
            + '，实存：' + d.actualQuantity + d.unit
            + '，差异：' + (d.difference > 0 ? '+' : '') + d.difference + d.unit + '\n';
        });
      }

      if (resolvedNormalDiscrepancies.length > 0) {
        report += '\n[普通药品 - 已处理]\n';
        resolvedNormalDiscrepancies.forEach(d => {
          report += '• ' + d.drugName + ' (' + d.drugCode + ')\n';
          report += '  应存：' + d.expectedQuantity + d.unit
            + '，实存：' + d.actualQuantity + d.unit
            + '，差异：' + (d.difference > 0 ? '+' : '') + d.difference + d.unit + '\n';
          report += '  处理结果：' + d.resolution + '\n';
          report += '  处理人：' + d.resolvedByName + '，时间：' + d.resolvedAtFormatted + '\n';
        });
      }

      report += '\n';
    }

    report += '\n【修正审计记录】\n';
    report += '='.repeat(70) + '\n';
    let hasCorrections = false;
    discrepancies.forEach(d => {
      if (d.corrections && d.corrections.length > 0) {
        hasCorrections = true;
        d.corrections.forEach(c => {
          report += '• 药品：' + d.drugName + ' (' + d.drugCode + ')\n';
          report += '  原数量：' + c.oldActualQuantity + d.unit
            + ' → 申请：' + c.newActualQuantity + d.unit + '\n';
          report += '  申请人：' + c.requestedByName
            + '，时间：' + c.requestedAtFormatted + '\n';
          report += '  申请原因：' + (c.reason || '未填写') + '\n';
          report += '  审批状态：' + Discrepancy.getCorrectionStatusText(c.status);
          if (c.reviewedByName) {
            report += '，审批人：' + c.reviewedByName
              + '，时间：' + c.reviewedAtFormatted;
          }
          report += '\n';
          if (c.reviewNote) {
            report += '  审批意见：' + c.reviewNote + '\n';
          }
          report += '\n';
        });
      }
    });
    if (!hasCorrections) {
      report += '暂无修正记录\n';
    }

    report += '\n';
    report += '----------------------------------------\n';
    report += '交班人签字：___________  日期：___________\n';
    report += '接班人签字：___________  日期：___________\n';
    report += '========================================\n';
    report += '报告生成时间：' + Storage.formatDateTime(new Date()) + '\n';

    return report;
  }

  function padRight(str, length) {
    if (!str) str = '';
    str = String(str);
    while (str.length < length) {
      str += ' ';
    }
    return str;
  }

  function truncate(str, length) {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substr(0, length - 1) + '…';
  }

  function downloadReport(shift) {
    const content = generateShiftReport(shift);
    const filename = '交班单_' + shift.name + '_' + formatDateForFilename(new Date()) + '.txt';

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const user = Auth.getCurrentUser();
    Storage.addAuditLog('导出交班单', `导出班次 ${shift.name} 的交班单`, user);
  }

  function formatDateForFilename(date) {
    const d = new Date(date);
    const pad = n => n.toString().padStart(2, '0');
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
      + '_' + pad(d.getHours()) + pad(d.getMinutes());
  }

  function getAuditLogReport() {
    const logs = Storage.getAuditLogs();
    let report = '';
    report += '========================================\n';
    report += '        系统审计日志\n';
    report += '========================================\n\n';

    logs.forEach(log => {
      report += '[' + log.timestampFormatted + '] ';
      report += (log.userName || '系统') + ' (' + (log.userRole || '-') + ') ';
      report += '- ' + log.action + ': ';
      report += log.details + '\n';
    });

    return report;
  }

  const BACKUP_VERSION = '1.0.0';

  function deepCloneObj(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function createBackup() {
    const user = Auth.getCurrentUser();

    const currentShift = Storage.getCurrentShift();
    const shiftHistory = Storage.getShiftHistory();

    const allShiftIds = [];
    if (currentShift) allShiftIds.push(currentShift.id);
    shiftHistory.forEach(s => allShiftIds.push(s.id));

    const inventoryMap = {};
    const discrepanciesMap = {};
    allShiftIds.forEach(shiftId => {
      inventoryMap[shiftId] = Storage.getInventory(shiftId);
      discrepanciesMap[shiftId] = Storage.getDiscrepancies(shiftId);
    });

    const auditLogs = Storage.getAuditLogs();
    const drugs = Storage.getDrugs();

    const backup = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      exportedAtFormatted: Storage.formatDateTime(new Date()),
      exportedBy: user ? { id: user.id, name: user.name, role: user.role } : null,
      data: {
        currentShift: currentShift,
        shiftHistory: shiftHistory,
        inventory: inventoryMap,
        discrepancies: discrepanciesMap,
        auditLogs: auditLogs,
        drugs: drugs
      }
    };

    return backup;
  }

  function downloadBackup() {
    const backup = createBackup();
    const content = JSON.stringify(backup, null, 2);
    const filename = '药房交班数据备份_' + formatDateForFilename(new Date()) + '.json';

    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const user = Auth.getCurrentUser();
    Storage.addAuditLog('导出数据备份', '导出完整结构化数据备份', user);

    return { success: true, filename: filename };
  }

  function validateBackup(backup) {
    if (!backup || typeof backup !== 'object') {
      return { valid: false, reason: '备份文件格式无效' };
    }
    if (!backup.version) {
      return { valid: false, reason: '备份文件缺少版本信息' };
    }
    if (!backup.data || typeof backup.data !== 'object') {
      return { valid: false, reason: '备份文件缺少数据部分' };
    }
    const requiredKeys = ['currentShift', 'shiftHistory', 'inventory', 'discrepancies', 'auditLogs', 'drugs'];
    for (const key of requiredKeys) {
      if (!(key in backup.data)) {
        return { valid: false, reason: `备份文件缺少必要数据: ${key}` };
      }
    }
    return { valid: true };
  }

  function sanitizeAuditLogsForImport(importedLogs, existingLogs) {
    const existingIds = new Set(existingLogs.map(l => l.id));
    const sanitized = [];

    for (const log of importedLogs) {
      if (!log.id) continue;
      if (existingIds.has(log.id)) continue;

      if (!log.timestampFormatted && log.timestamp) {
        log.timestampFormatted = Storage.formatDateTime(new Date(log.timestamp));
      }

      sanitized.push(log);
    }

    return sanitized;
  }

  function sanitizeUsersForImport(backupData) {
    const discrepancies = backupData.discrepancies || {};
    Object.values(discrepancies).forEach(discList => {
      discList.forEach(d => {
        if (d.corrections) {
          d.corrections.forEach(c => {
            if (c.status === 'approved' || c.status === 'rejected') {
              if (c.reviewedBy && c.reviewedByName) {
                const isNurseApprover = c.reviewedByName && c.reviewedByName.includes('护士');
                if (isNurseApprover && c.status === 'approved') {
                  c.status = 'pending';
                  c.reviewedBy = null;
                  c.reviewedByName = null;
                  c.reviewedAt = null;
                  c.reviewedAtFormatted = null;
                  c.reviewNote = (c.reviewNote ? c.reviewNote + '；' : '') + '【系统保护】原审批人角色异常，已重置为待审批状态';
                }
              }
            }
          });
        }
      });
    });

    return discrepancies;
  }

  function detectConflicts(backup) {
    const conflicts = {
      shifts: [],
      corrections: [],
      drugs: []
    };

    const existingCurrentShift = Storage.getCurrentShift();
    const existingHistory = Storage.getShiftHistory();
    const existingShifts = existingHistory.slice();
    if (existingCurrentShift) existingShifts.push(existingCurrentShift);

    const importedShifts = [];
    if (backup.data.currentShift) importedShifts.push(backup.data.currentShift);
    backup.data.shiftHistory.forEach(s => importedShifts.push(s));

    importedShifts.forEach(impShift => {
      const existing = existingShifts.find(es => es.name === impShift.name);
      if (existing) {
        conflicts.shifts.push({
          type: 'shift_name_conflict',
          importedId: impShift.id,
          importedName: impShift.name,
          existingId: existing.id,
          existingName: existing.name,
          imported: impShift,
          existing: existing
        });
      }
    });

    const existingAllDisc = {};
    existingShifts.forEach(s => {
      existingAllDisc[s.id] = Storage.getDiscrepancies(s.id);
    });

    const importedDisc = backup.data.discrepancies || {};
    Object.entries(importedDisc).forEach(([shiftId, discList]) => {
      discList.forEach(d => {
        if (d.corrections && d.corrections.length > 0) {
          d.corrections.forEach(corr => {
            Object.entries(existingAllDisc).forEach(([existShiftId, existDiscList]) => {
              existDiscList.forEach(ed => {
                if (ed.corrections) {
                  ed.corrections.forEach(ec => {
                    const isSame = (
                      corr.requestedBy === ec.requestedBy &&
                      corr.requestedAt === ec.requestedAt &&
                      corr.newActualQuantity === ec.newActualQuantity
                    );
                    if (isSame) {
                      conflicts.corrections.push({
                        type: 'duplicate_correction',
                        importedShiftId: shiftId,
                        existingShiftId: existShiftId,
                        importedDiscrepancyDrug: d.drugName,
                        existingDiscrepancyDrug: ed.drugName,
                        correction: corr,
                        existingCorrection: ec
                      });
                    }
                  });
                }
              });
            });
          });
        }
      });
    });

    const existingDrugs = Storage.getDrugs();
    const importedDrugs = backup.data.drugs || [];

    importedDrugs.forEach(impDrug => {
      const existing = existingDrugs.find(ed => ed.code === impDrug.code);
      if (existing) {
        const isContentDifferent = (
          existing.name !== impDrug.name ||
          existing.spec !== impDrug.spec ||
          existing.type !== impDrug.type ||
          existing.unit !== impDrug.unit ||
          existing.initialStock !== impDrug.initialStock
        );
        if (isContentDifferent) {
          conflicts.drugs.push({
            type: 'drug_content_conflict',
            drugCode: impDrug.code,
            imported: impDrug,
            existing: existing
          });
        }
      }
    });

    return conflicts;
  }

  function resolveConflictStrategy(conflict, strategy) {
    return {
      conflict: conflict,
      strategy: strategy,
      description: describeConflictResolution(conflict, strategy)
    };
  }

  function describeConflictResolution(conflict, strategy) {
    switch (conflict.type) {
      case 'shift_name_conflict':
        if (strategy === 'skip') return `班次「${conflict.importedName}」已存在，跳过导入`;
        if (strategy === 'overwrite') return `班次「${conflict.importedName}」将覆盖现有班次数据`;
        if (strategy === 'merge') return `班次「${conflict.importedName}」将合并差异数据`;
        break;
      case 'duplicate_correction':
        if (strategy === 'skip') return `药品「${conflict.importedDiscrepancyDrug}」的修正申请重复，跳过导入`;
        if (strategy === 'overwrite') return `药品「${conflict.importedDiscrepancyDrug}」的修正申请将覆盖现有记录`;
        if (strategy === 'merge') return `药品「${conflict.importedDiscrepancyDrug}」的修正申请将保留两条记录`;
        break;
      case 'drug_content_conflict':
        if (strategy === 'skip') return `药品「${conflict.drugCode}」内容不一致，跳过导入（保留本地）`;
        if (strategy === 'overwrite') return `药品「${conflict.drugCode}」将被备份数据覆盖`;
        if (strategy === 'merge') return `药品「${conflict.drugCode}」将保留本地内容，不修改`;
        break;
    }
    return `冲突已选择策略：${strategy}`;
  }

  function applyBackup(backup, conflictResolutions) {
    const user = Auth.getCurrentUser();
    if (!user) {
      return { success: false, message: '请先登录后再导入数据' };
    }
    if (user.role !== 'pharmacist') {
      return { success: false, message: '只有药师可以执行数据恢复操作' };
    }

    const validation = validateBackup(backup);
    if (!validation.valid) {
      return { success: false, message: validation.reason };
    }

    const resolutionsMap = {};
    (conflictResolutions || []).forEach(r => {
      const key = r.conflict.type + '|' + (
        r.conflict.importedId ||
        r.conflict.drugCode ||
        (r.conflict.importedShiftId + '_' + r.conflict.correction.requestedAt)
      );
      resolutionsMap[key] = r.strategy;
    });

    const conflicts = detectConflicts(backup);

    const skipShiftIds = new Set();
    const overwriteShiftMap = {};
    const mergeShiftMap = {};
    conflicts.shifts.forEach(c => {
      const key = c.type + '|' + c.importedId;
      const strategy = resolutionsMap[key] || 'skip';
      if (strategy === 'skip') {
        skipShiftIds.add(c.importedId);
      } else if (strategy === 'overwrite') {
        overwriteShiftMap[c.importedId] = c.existingId;
      } else if (strategy === 'merge') {
        mergeShiftMap[c.importedId] = c.existingId;
      }
    });

    const skipCorrectionKeys = new Set();
    const overwriteCorrectionKeys = new Set();
    const mergeCorrectionKeys = new Set();
    conflicts.corrections.forEach(c => {
      const key = c.type + '|' + c.importedShiftId + '_' + c.correction.requestedAt;
      const strategy = resolutionsMap[key] || 'skip';
      const dataKey = c.importedShiftId + '|' + c.correction.requestedAt;
      if (strategy === 'skip') {
        skipCorrectionKeys.add(dataKey);
      } else if (strategy === 'overwrite') {
        overwriteCorrectionKeys.add(dataKey);
      } else if (strategy === 'merge') {
        mergeCorrectionKeys.add(dataKey);
      }
    });

    const skipDrugCodes = new Set();
    const overwriteDrugCodes = new Set();
    const mergeDrugCodes = new Set();
    conflicts.drugs.forEach(c => {
      const key = c.type + '|' + c.drugCode;
      const strategy = resolutionsMap[key] || 'skip';
      if (strategy === 'skip') {
        skipDrugCodes.add(c.drugCode);
      } else if (strategy === 'overwrite') {
        overwriteDrugCodes.add(c.drugCode);
      } else if (strategy === 'merge') {
        mergeDrugCodes.add(c.drugCode);
      }
    });

    const results = {
      importedShifts: 0,
      overwrittenShifts: 0,
      mergedShifts: 0,
      skippedShifts: 0,
      importedInventories: 0,
      importedDiscrepancies: 0,
      overwrittenCorrections: 0,
      mergedCorrections: 0,
      importedDrugs: 0,
      overwrittenDrugs: 0,
      mergedDrugs: 0,
      importedAuditLogs: 0,
      messages: []
    };

    backup.data.discrepancies = sanitizeUsersForImport(backup.data);

    const existingHistory = Storage.getShiftHistory();
    const existingShiftIds = new Set(existingHistory.map(s => s.id));
    const existingCurrentShift = Storage.getCurrentShift();
    if (existingCurrentShift) existingShiftIds.add(existingCurrentShift.id);

    const importedHistoryShifts = backup.data.shiftHistory || [];
    importedHistoryShifts.forEach(shift => {
      if (skipShiftIds.has(shift.id)) {
        results.skippedShifts++;
        results.messages.push(`跳过历史班次：${shift.name}`);
        return;
      }
      if (overwriteShiftMap[shift.id]) {
        const existId = overwriteShiftMap[shift.id];
        const idx = existingHistory.findIndex(s => s.id === existId);
        if (idx >= 0) {
          existingHistory[idx] = shift;
        } else {
          existingHistory.push(shift);
        }
        results.overwrittenShifts++;
        results.messages.push(`覆盖历史班次：${shift.name}（替换本地班次ID ${existId}）`);
      } else if (mergeShiftMap[shift.id]) {
        const existId = mergeShiftMap[shift.id];
        const existIdx = existingHistory.findIndex(s => s.id === existId);
        if (existIdx >= 0) {
          const existShift = existingHistory[existIdx];
          if (shift.summary) existShift.summary = shift.summary;
          if (shift.closedAt) existShift.closedAt = shift.closedAt;
          if (shift.closedAtFormatted) existShift.closedAtFormatted = shift.closedAtFormatted;
          if (shift.closedBy) existShift.closedBy = shift.closedBy;
          if (shift.closedByName) existShift.closedByName = shift.closedByName;
          if (shift.receivedBy) existShift.receivedBy = shift.receivedBy;
          if (shift.receivedByName) existShift.receivedByName = shift.receivedByName;
          existingHistory[existIdx] = existShift;
        }
        results.mergedShifts++;
        results.messages.push(`合并历史班次：${shift.name}（合入本地班次ID ${existId}）`);
      } else if (!existingShiftIds.has(shift.id)) {
        existingHistory.push(shift);
        results.importedShifts++;
        results.messages.push(`导入历史班次：${shift.name}`);
      }
    });
    Storage.saveShiftHistory(existingHistory);

    if (backup.data.currentShift && !skipShiftIds.has(backup.data.currentShift.id)) {
      const curr = backup.data.currentShift;
      const existingCurr = Storage.getCurrentShift();
      const isOverwrite = overwriteShiftMap[curr.id];
      const isMerge = mergeShiftMap[curr.id];
      if (isOverwrite) {
        Storage.saveCurrentShift(curr);
        results.overwrittenShifts++;
        results.messages.push(`覆盖当前班次：${curr.name}`);
      } else if (isMerge && existingCurr) {
        if (curr.summary) existingCurr.summary = curr.summary;
        if (curr.closedAt) existingCurr.closedAt = curr.closedAt;
        if (curr.closedAtFormatted) existingCurr.closedAtFormatted = curr.closedAtFormatted;
        if (curr.closedBy) existingCurr.closedBy = curr.closedBy;
        if (curr.closedByName) existingCurr.closedByName = curr.closedByName;
        Storage.saveCurrentShift(existingCurr);
        results.mergedShifts++;
        results.messages.push(`合并当前班次：${curr.name}`);
      } else if (!existingCurr || existingCurr.id === curr.id || !existingShiftIds.has(curr.id)) {
        if (!existingCurr || existingCurr.status === Shift.STATUS.CLOSED) {
          Storage.saveCurrentShift(curr);
          results.importedShifts++;
          results.messages.push(`恢复当前班次：${curr.name}`);
        } else {
          results.skippedShifts++;
          results.messages.push(`跳过当前班次（已有活跃班次）：${curr.name}`);
        }
      }
    } else if (backup.data.currentShift) {
      results.skippedShifts++;
      results.messages.push(`跳过当前班次（冲突策略）：${backup.data.currentShift.name}`);
    }

    const inventoryMap = backup.data.inventory || {};
    Object.entries(inventoryMap).forEach(([shiftId, items]) => {
      if (skipShiftIds.has(shiftId)) return;

      let targetShiftId = shiftId;
      if (overwriteShiftMap[shiftId]) {
        targetShiftId = overwriteShiftMap[shiftId];
      } else if (mergeShiftMap[shiftId]) {
        targetShiftId = mergeShiftMap[shiftId];
      }

      const existing = Storage.getInventory(targetShiftId);
      if (existing.length === 0 || overwriteShiftMap[shiftId]) {
        Storage.saveInventory(targetShiftId, items);
        if (targetShiftId !== shiftId) {
          Storage.saveInventory(shiftId, items);
        }
        results.importedInventories++;
      } else if (mergeShiftMap[shiftId]) {
        const existingByCode = {};
        existing.forEach(i => { existingByCode[i.drugCode] = i; });
        items.forEach(i => {
          existingByCode[i.drugCode] = i;
        });
        const merged = Object.values(existingByCode);
        Storage.saveInventory(targetShiftId, merged);
        results.importedInventories++;
      }
    });

    const discrepanciesMap = backup.data.discrepancies || {};
    Object.entries(discrepanciesMap).forEach(([shiftId, discList]) => {
      if (skipShiftIds.has(shiftId)) return;

      let targetShiftId = shiftId;
      if (overwriteShiftMap[shiftId]) {
        targetShiftId = overwriteShiftMap[shiftId];
      } else if (mergeShiftMap[shiftId]) {
        targetShiftId = mergeShiftMap[shiftId];
      }

      const processedDiscList = discList.map(d => {
        if (d.corrections) {
          d.corrections = d.corrections.filter(c => {
            const key = shiftId + '|' + c.requestedAt;
            return !skipCorrectionKeys.has(key);
          });
        }
        return d;
      });

      const existing = Storage.getDiscrepancies(targetShiftId);
      if (existing.length === 0) {
        Storage.saveDiscrepancies(targetShiftId, processedDiscList);
        if (targetShiftId !== shiftId) {
          Storage.saveDiscrepancies(shiftId, processedDiscList);
        }
        results.importedDiscrepancies++;
      } else {
        const isShiftOverwrite = !!overwriteShiftMap[shiftId];
        const baseByDrugId = {};
        if (isShiftOverwrite) {
          processedDiscList.forEach(d => { baseByDrugId[d.drugId] = deepCloneObj(d); });
        } else {
          existing.forEach(d => { baseByDrugId[d.drugId] = deepCloneObj(d); });
        }

        const secondaryList = isShiftOverwrite ? existing : processedDiscList;
        secondaryList.forEach(secDisc => {
          const baseDisc = baseByDrugId[secDisc.drugId];
          if (!baseDisc) {
            if (!isShiftOverwrite) {
              baseByDrugId[secDisc.drugId] = secDisc;
            }
          } else if (secDisc.corrections && secDisc.corrections.length > 0) {
            const baseCorrByTime = {};
            if (baseDisc.corrections) {
              baseDisc.corrections.forEach(c => {
                baseCorrByTime[c.requestedAt] = c;
              });
            }

            secDisc.corrections.forEach(secCorr => {
              const corrKey = shiftId + '|' + secCorr.requestedAt;
              if (overwriteCorrectionKeys.has(corrKey)) {
                baseCorrByTime[secCorr.requestedAt] = secCorr;
                results.overwrittenCorrections++;
              } else if (mergeCorrectionKeys.has(corrKey)) {
                if (!baseCorrByTime[secCorr.requestedAt]) {
                  baseCorrByTime[secCorr.requestedAt] = secCorr;
                }
                results.mergedCorrections++;
              } else {
                if (!baseCorrByTime[secCorr.requestedAt]) {
                  baseCorrByTime[secCorr.requestedAt] = secCorr;
                }
              }
            });

            baseDisc.corrections = Object.values(baseCorrByTime);
            baseByDrugId[secDisc.drugId] = baseDisc;
          }
        });

        Storage.saveDiscrepancies(targetShiftId, Object.values(baseByDrugId));
        if (targetShiftId !== shiftId) {
          Storage.saveDiscrepancies(shiftId, Object.values(baseByDrugId));
        }
        results.importedDiscrepancies++;
      }
    });

    const existingDrugs = Storage.getDrugs();
    const importedDrugs = backup.data.drugs || [];
    const existingDrugMap = {};
    existingDrugs.forEach(d => { existingDrugMap[d.code] = d; });

    importedDrugs.forEach(drug => {
      if (skipDrugCodes.has(drug.code)) {
        return;
      }
      if (overwriteDrugCodes.has(drug.code)) {
        existingDrugMap[drug.code] = drug;
        results.overwrittenDrugs++;
        results.messages.push(`覆盖药品：${drug.code} ${drug.name}`);
      } else if (mergeDrugCodes.has(drug.code)) {
        results.mergedDrugs++;
        results.messages.push(`合并药品：${drug.code}（保留本地）`);
      } else if (!existingDrugMap[drug.code]) {
        existingDrugMap[drug.code] = drug;
        results.importedDrugs++;
      }
    });
    Storage.saveDrugs(Object.values(existingDrugMap));

    const existingLogs = Storage.getAuditLogs();
    const sanitizedLogs = sanitizeAuditLogsForImport(backup.data.auditLogs || [], existingLogs);
    const mergedLogs = sanitizedLogs.concat(existingLogs);
    mergedLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    Storage.set(Storage.KEYS.AUDIT_LOGS, mergedLogs);
    results.importedAuditLogs = sanitizedLogs.length;

    Storage.addAuditLog(
      '导入数据备份',
      `数据恢复完成：导入班次${results.importedShifts}个，覆盖${results.overwrittenShifts}个，合并${results.mergedShifts}个，跳过${results.skippedShifts}个；覆盖修正${results.overwrittenCorrections}条，合并修正${results.mergedCorrections}条；覆盖药品${results.overwrittenDrugs}种，合并药品${results.mergedDrugs}种；导入审计日志${results.importedAuditLogs}条`,
      user
    );

    return {
      success: true,
      results: results,
      summary: `恢复完成：导入${results.importedShifts}个班次，覆盖${results.overwrittenShifts}个，合并${results.mergedShifts}个；覆盖修正${results.overwrittenCorrections}条，合并修正${results.mergedCorrections}条；导入审计日志${results.importedAuditLogs}条`
    };
  }

  function parseBackupFile(content) {
    try {
      const backup = JSON.parse(content);
      const validation = validateBackup(backup);
      if (!validation.valid) {
        return { success: false, message: validation.reason };
      }
      const conflicts = detectConflicts(backup);
      return {
        success: true,
        backup: backup,
        conflicts: conflicts,
        hasConflicts: conflicts.shifts.length > 0 || conflicts.corrections.length > 0 || conflicts.drugs.length > 0,
        conflictCount: conflicts.shifts.length + conflicts.corrections.length + conflicts.drugs.length
      };
    } catch (e) {
      return { success: false, message: '备份文件解析失败：' + e.message };
    }
  }

  return {
    generateShiftReport,
    downloadReport,
    getAuditLogReport,
    createBackup,
    downloadBackup,
    validateBackup,
    detectConflicts,
    resolveConflictStrategy,
    describeConflictResolution,
    applyBackup,
    parseBackupFile,
    sanitizeUsersForImport,
    sanitizeAuditLogsForImport
  };
})();
