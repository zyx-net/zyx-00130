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

  return {
    generateShiftReport,
    downloadReport,
    getAuditLogReport
  };
})();
