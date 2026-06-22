const App = (function() {
  let currentTab = 'dashboard';
  let inventoryFilter = 'all';
  let backupSubTab = 'history';
  let backupFilters = {
    keyword: '',
    operatorRole: '',
    shiftStatus: '',
    startDate: '',
    endDate: ''
  };
  let restoreDraftFilters = { keyword: '', status: '' };
  let restoreRecordFilters = { keyword: '', operatorName: '', dataBlock: '', undone: '', startDate: '', endDate: '' };
  let selectedBackupId = null;
  let selectedDataBlocks = [];
  let backupPendingPreview = null;
  let backupPendingConflicts = null;
  let backupPendingResolutions = [];
  let backupStrategyReuseInfo = null;

  function init() {
    Storage.initializeDemoData();

    if (Auth.isLoggedIn()) {
      renderApp();
    } else {
      renderLogin();
    }
  }

  function renderLogin() {
    const main = document.getElementById('main-content');
    const userInfo = document.getElementById('user-info');
    userInfo.innerHTML = '';

    main.innerHTML = `
      <div class="login-container">
        <h2>药房交班库存管理系统</h2>
        <div id="login-error"></div>
        <div class="form-group">
          <label>用户名</label>
          <input type="text" id="login-username" placeholder="请输入用户名">
        </div>
        <div class="form-group">
          <label>密码</label>
          <input type="password" id="login-password" placeholder="请输入密码">
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="App.handleLogin()">登 录</button>
        <div style="margin-top:20px; padding-top:16px; border-top:1px solid #f0f0f0;">
          <p style="font-size:12px; color:#8c8c8c; margin-bottom:8px;">演示账号：</p>
          <p style="font-size:12px; color:#595959;">药师：pharmacist / 123456</p>
          <p style="font-size:12px; color:#595959;">护士：nurse / 123456</p>
        </div>
        <div style="margin-top:16px; display:flex; gap:8px;">
          <button class="btn btn-default" style="flex:1; font-size:12px;" onclick="App.loadSampleData()">
            加载演示样例
          </button>
          <button class="btn btn-default" style="flex:1; font-size:12px;" onclick="App.resetData()">
            重置数据
          </button>
        </div>
        <div style="margin-top:16px; display:flex; gap:8px;">
          <button class="btn btn-default" style="flex:1; font-size:12px;" onclick="App.showBackupOptions()">
            数据备份/恢复
          </button>
        </div>
      </div>
    `;

    document.getElementById('login-password').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        handleLogin();
      }
    });
  }

  function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');

    if (!username || !password) {
      errorDiv.innerHTML = '<div class="alert alert-error">请输入用户名和密码</div>';
      return;
    }

    const result = Auth.login(username, password);
    if (result.success) {
      renderApp();
    } else {
      errorDiv.innerHTML = '<div class="alert alert-error">' + result.message + '</div>';
    }
  }

  function handleLogout() {
    Auth.logout();
    currentTab = 'dashboard';
    renderLogin();
  }

  function renderApp() {
    const user = Auth.getCurrentUser();
    const userInfo = document.getElementById('user-info');
    userInfo.innerHTML = `
      <span>${user.name}</span>
      <span class="role-badge">${user.roleName}</span>
      <button class="logout-btn" onclick="App.handleLogout()">退出</button>
    `;

    renderMainContent();
  }

  function renderMainContent() {
    const main = document.getElementById('main-content');
    const user = Auth.getCurrentUser();
    const shift = Shift.getCurrentShift();

    let tabs = [];
    if (shift && shift.status !== Shift.STATUS.CLOSED) {
      tabs = [
        { key: 'dashboard', label: '工作台' },
        { key: 'inventory', label: '药品盘点' },
        { key: 'discrepancy', label: '差异处理' }
      ];
    } else {
      tabs = [{ key: 'dashboard', label: '工作台' }];
    }
    tabs.push({ key: 'history', label: '历史班次' });
    tabs.push({ key: 'audit', label: '审计日志' });
    if (Auth.canViewRestoreRecords()) {
      tabs.push({ key: 'backup', label: '备份中心' });
    }

    main.innerHTML = `
      <div class="nav-tabs">
        ${tabs.map(t => `
          <div class="nav-tab ${currentTab === t.key ? 'active' : ''}"
               onclick="App.switchTab('${t.key}')">${t.label}</div>
        `).join('')}
      </div>
      <div id="tab-content"></div>
    `;

    renderTabContent();
  }

  function switchTab(tab) {
    currentTab = tab;
    renderMainContent();
  }

  function renderTabContent() {
    const content = document.getElementById('tab-content');

    switch (currentTab) {
      case 'dashboard':
        renderDashboard(content);
        break;
      case 'inventory':
        renderInventory(content);
        break;
      case 'discrepancy':
        renderDiscrepancy(content);
        break;
      case 'history':
        renderHistory(content);
        break;
      case 'audit':
        renderAuditLog(content);
        break;
      case 'backup':
        renderBackupCenter(content);
        break;
      default:
        renderDashboard(content);
    }
  }

  function renderDashboard(container) {
    const shift = Shift.getCurrentShift();
    const user = Auth.getCurrentUser();

    if (!shift || shift.status === Shift.STATUS.CLOSED) {
      container.innerHTML = `
        <div class="dashboard">
          <div class="card card-full">
            <h3>当前班次</h3>
            <div class="shift-info">
              <p>当前没有进行中的班次。</p>
            </div>
            ${Auth.isPharmacist() ? `
              <div style="margin-top:20px;">
                <button class="btn btn-primary" onclick="App.showOpenShiftModal()">+ 开新班次</button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
      return;
    }

    Inventory.initializeInventory();
    const invStats = Inventory.getInventoryStats();
    const discStats = Discrepancy.getDiscrepancyStats();
    const canClose = Shift.canCloseCurrentShift();

    container.innerHTML = `
      <div class="dashboard">
        <div class="card">
          <h3>当前班次</h3>
          <div class="shift-status">
            <span class="status-badge ${Shift.getStatusClass(shift.status)}">
              ${Shift.getStatusText(shift.status)}
            </span>
          </div>
          <div class="shift-info">
            <p><strong>班次名称：</strong>${shift.name}</p>
            <p><strong>创建人：</strong>${shift.createdByName}</p>
            <p><strong>创建时间：</strong>${shift.createdAtFormatted}</p>
            ${shift.note ? `<p><strong>备注：</strong>${shift.note}</p>` : ''}
          </div>
          <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
            ${Auth.isPharmacist() && shift.status === Shift.STATUS.ACTIVE ? `
              <button class="btn btn-success ${canClose ? '' : 'btn-warning'}"
                      onclick="App.handleCloseShift()"
                      ${canClose ? '' : ''}>
                ${canClose ? '完成交班' : '完成交班（有待处理受控差异）'}
              </button>
            ` : ''}
            ${shift.status === Shift.STATUS.CLOSED && !shift.receivedBy ? `
              <button class="btn btn-primary" onclick="App.handleReceiveShift()">
                签收班次
              </button>
            ` : ''}
            <button class="btn btn-default" onclick="App.exportCurrentShift()">
              导出交班单
            </button>
          </div>
        </div>

        <div class="card">
          <h3>盘点进度</h3>
          <div class="two-col">
            <div class="stat-card">
              <div class="stat-value">${invStats.counted}/${invStats.total}</div>
              <div class="stat-label">已盘点 / 总数</div>
            </div>
            <div class="stat-card success">
              <div class="stat-value">${invStats.progress}%</div>
              <div class="stat-label">完成进度</div>
            </div>
          </div>
          <div style="margin-top:16px; display:flex; justify-content:space-between; font-size:13px;">
            <span style="color:#595959;">普通药品：${invStats.normalCounted}/${invStats.normal}</span>
            <span style="color:#ff4d4f;">受控药品：${invStats.controlledCounted}/${invStats.controlled}</span>
          </div>
        </div>

        <div class="card">
          <h3>差异概览</h3>
          <div class="two-col">
            <div class="stat-card warning">
              <div class="stat-value">${discStats.pending}</div>
              <div class="stat-label">待处理差异</div>
            </div>
            <div class="stat-card success">
              <div class="stat-value">${discStats.resolved}</div>
              <div class="stat-label">已处理差异</div>
            </div>
          </div>
          <div style="margin-top:16px;">
            <p style="font-size:13px; color:#ff4d4f;">
              受控药品待处理：${discStats.controlledPending} 项
            </p>
            <p style="font-size:13px; color:#faad14;">
              待审批修正：${discStats.pendingCorrections} 项
            </p>
          </div>
        </div>

        <div class="card">
          <h3>快捷操作</h3>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <button class="btn btn-default" onclick="App.switchTab('inventory')">
              前往药品盘点
            </button>
            <button class="btn btn-default" onclick="App.switchTab('discrepancy')">
              前往差异处理
            </button>
            <button class="btn btn-default" onclick="App.switchTab('history')">
              查看历史班次
            </button>
            <button class="btn btn-default" onclick="App.showBackupOptions()">
              数据备份/恢复
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function showOpenShiftModal() {
    if (!Auth.isPharmacist()) {
      alert('该操作需要药师权限');
      return;
    }

    const now = new Date();
    const defaultName = '早班-' + formatDateSimple(now);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h3>开新班次</h3>
        <div class="form-group">
          <label>班次名称</label>
          <input type="text" id="shift-name-input" value="${defaultName}">
        </div>
        <div class="form-group">
          <label>备注（可选）</label>
          <textarea id="shift-note-input" rows="3" placeholder="输入备注信息"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-default" onclick="this.closest('.modal-overlay').remove()">取消</button>
          <button class="btn btn-primary" onclick="App.handleOpenShift()">确认开班</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function handleOpenShift() {
    if (!Auth.isPharmacist()) {
      alert('该操作需要药师权限');
      return;
    }

    const name = document.getElementById('shift-name-input').value.trim();
    const note = document.getElementById('shift-note-input').value.trim();

    const result = Shift.openShift(name, note);
    if (result.success) {
      Inventory.initializeInventory();
      document.querySelector('.modal-overlay').remove();
      renderApp();
    } else {
      alert(result.message);
    }
  }

  function handleCloseShift() {
    if (!Auth.isPharmacist()) {
      alert('该操作需要药师权限');
      return;
    }

    if (!confirm('确认完成交班？关班后将无法再修改盘点数据。')) {
      return;
    }

    const result = Shift.closeShift();
    if (result.success) {
      alert('交班完成！');
      renderApp();
    } else {
      alert(result.message);
    }
  }

  function handleReceiveShift() {
    const note = prompt('请输入签收备注（可选）：') || '';
    const result = Shift.receiveShift(note);
    if (result.success) {
      alert('签收成功！');
      renderApp();
    } else {
      alert(result.message);
    }
  }

  function renderInventory(container) {
    const shift = Shift.getCurrentShift();
    if (!shift) {
      container.innerHTML = '<div class="card"><div class="empty-state">请先开班</div></div>';
      return;
    }

    if (shift.status === Shift.STATUS.CLOSED) {
      container.innerHTML = '<div class="card"><div class="empty-state">班次已关闭，无法修改盘点数据</div></div>';
      return;
    }

    Inventory.initializeInventory();
    const items = Inventory.getInventoryByType(
      inventoryFilter === 'all' ? null : inventoryFilter
    );

    container.innerHTML = `
      <div class="card">
        <h3>药品盘点</h3>
        <div class="filter-bar">
          <label>筛选：</label>
          <select onchange="App.filterInventory(this.value)">
            <option value="all" ${inventoryFilter === 'all' ? 'selected' : ''}>全部药品</option>
            <option value="normal" ${inventoryFilter === 'normal' ? 'selected' : ''}>普通药品</option>
            <option value="controlled" ${inventoryFilter === 'controlled' ? 'selected' : ''}>受控药品</option>
          </select>
          <span style="margin-left:auto; font-size:13px; color:#8c8c8c;">
            共 ${items.length} 种药品
          </span>
        </div>

        <table>
          <thead>
            <tr>
              <th>编码</th>
              <th>名称</th>
              <th>规格</th>
              <th>类型</th>
              <th>单位</th>
              <th>应存数量</th>
              <th>实存数量</th>
              <th>差异</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => {
              const diff = item.isCounted ? item.actualQuantity - item.expectedQuantity : null;
              const diffClass = diff === null ? '' : (diff > 0 ? 'color: #52c41a;' : (diff < 0 ? 'color: #ff4d4f;' : ''));
              return `
                <tr>
                  <td>${item.drugCode}</td>
                  <td>${item.drugName}</td>
                  <td>${item.drugSpec}</td>
                  <td>
                    <span class="${item.drugType === 'controlled' ? 'drug-controlled' : 'drug-normal'}">
                      ${item.drugType === 'controlled' ? '受控' : '普通'}
                    </span>
                  </td>
                  <td>${item.unit}</td>
                  <td>${item.expectedQuantity}</td>
                  <td>
                    <input type="number" class="quantity-input"
                           id="qty-${item.id}"
                           value="${item.isCounted ? item.actualQuantity : ''}"
                           placeholder="未盘点"
                           onchange="App.updateInventoryItem('${item.id}')"
                           min="0">
                  </td>
                  <td style="${diffClass}">
                    ${diff === null ? '-' : (diff > 0 ? '+' + diff : diff)}
                  </td>
                  <td>
                    ${item.isCounted && item.countedByName ?
                      `<span style="font-size:11px; color:#8c8c8c;">${item.countedByName}</span>` :
                      ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function filterInventory(type) {
    inventoryFilter = type;
    renderTabContent();
  }

  function updateInventoryItem(inventoryId) {
    const input = document.getElementById('qty-' + inventoryId);
    const value = input.value;

    const result = Inventory.updateActualQuantity(inventoryId, value);

    if (result.success) {
      input.classList.remove('error');
      renderTabContent();
    } else {
      input.classList.add('error');
      alert(result.message);
    }
  }

  function renderDiscrepancy(container) {
    const shift = Shift.getCurrentShift();
    if (!shift) {
      container.innerHTML = '<div class="card"><div class="empty-state">请先开班</div></div>';
      return;
    }

    const discrepancies = Discrepancy.getDiscrepanciesForCurrentShift();
    const controlledDisc = discrepancies.filter(d => d.drugType === 'controlled');
    const normalDisc = discrepancies.filter(d => d.drugType === 'normal');

    if (discrepancies.length === 0) {
      container.innerHTML = `
        <div class="card">
          <h3>差异处理</h3>
          <div class="empty-state">暂无差异记录</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="card">
        <h3>差异处理</h3>
        <div class="alert alert-warning" style="margin-bottom:16px;">
          <strong>注意：</strong>受控药品差异必须全部处理完成才能关班。
        </div>

        ${controlledDisc.length > 0 ? `
          <h4 style="color:#ff4d4f; margin-bottom:12px;">受控药品差异 (${controlledDisc.length})</h4>
          ${controlledDisc.map(d => renderDiscrepancyItem(d)).join('')}
        ` : ''}

        ${normalDisc.length > 0 ? `
          <h4 style="color:#52c41a; margin:20px 0 12px;">普通药品差异 (${normalDisc.length})</h4>
          ${normalDisc.map(d => renderDiscrepancyItem(d)).join('')}
        ` : ''}
      </div>
    `;
  }

  function renderDiscrepancyItem(d) {
    const isResolved = d.status === 'resolved';
    const canResolve = Auth.canResolveDiscrepancy() && !isResolved;
    const canRequestCorr = !isResolved && Shift.getCurrentShift().status !== Shift.STATUS.CLOSED;

    let correctionsHtml = '';
    if (d.corrections && d.corrections.length > 0) {
      correctionsHtml = `
        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #d9d9d9;">
          <p style="font-size:12px; color:#8c8c8c; margin-bottom:8px;">修正申请记录：</p>
          ${d.corrections.map(c => {
            let statusColor = '#faad14';
            if (c.status === 'approved') statusColor = '#52c41a';
            if (c.status === 'rejected') statusColor = '#ff4d4f';
            return `
              <div style="font-size:12px; padding:6px 10px; background:#fafafa; border-radius:4px; margin-bottom:6px;">
                <span style="color:${statusColor};">[${Discrepancy.getCorrectionStatusText(c.status)}]</span>
                ${c.oldActualQuantity} → ${c.newActualQuantity} ${d.unit}
                (申请人: ${c.requestedByName}, ${c.requestedAtFormatted})
                ${c.reason ? '<br>原因：' + c.reason : ''}
                ${c.reviewNote ? '<br>审批意见：' + c.reviewNote : ''}
                ${c.status === 'pending' && Auth.canApproveCorrection() ? `
                  <div style="margin-top:6px;">
                    <button class="btn btn-success btn-sm"
                            onclick="App.reviewCorrection('${d.id}', '${c.id}', true)">批准</button>
                    <button class="btn btn-danger btn-sm"
                            onclick="App.reviewCorrection('${d.id}', '${c.id}', false)">拒绝</button>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    return `
      <div class="discrepancy-item ${isResolved ? 'resolved' : ''}">
        <div class="discrepancy-header">
          <span class="discrepancy-drug">${d.drugName} (${d.drugCode})</span>
          <span class="discrepancy-status" style="background:${isResolved ? '#f6ffed' : '#fffbe6'};
                 color:${isResolved ? '#52c41a' : '#faad14'};
                 border:1px solid ${isResolved ? '#b7eb8f' : '#ffe58f'};">
            ${Discrepancy.getStatusText(d.status)}
          </span>
        </div>
        <div class="discrepancy-body">
          <p>规格：${d.drugSpec} | 单位：${d.unit}</p>
          <p>应存数量：<strong>${d.expectedQuantity}</strong> ${d.unit}
             | 实存数量：<strong>${d.actualQuantity}</strong> ${d.unit}
             | 差异：<strong style="color:${d.difference < 0 ? '#ff4d4f' : '#52c41a'};">
               ${d.difference > 0 ? '+' : ''}${d.difference} ${d.unit}</strong></p>
          ${isResolved ? `
            <p style="color:#52c41a;"><strong>处理结果：</strong>${d.resolution}</p>
            <p style="font-size:12px; color:#8c8c8c;">
              处理人：${d.resolvedByName} | 时间：${d.resolvedAtFormatted}
            </p>
          ` : ''}
          ${correctionsHtml}
        </div>
        <div class="discrepancy-actions">
          ${canResolve ? `
            <button class="btn btn-success btn-sm" onclick="App.resolveDiscrepancy('${d.id}')">
              处理差异
            </button>
          ` : ''}
          ${canRequestCorr && d.status === 'pending' ? `
            <button class="btn btn-warning btn-sm" onclick="App.showCorrectionModal('${d.id}')">
              申请修正
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  function resolveDiscrepancy(discrepancyId) {
    if (!Auth.canResolveDiscrepancy()) {
      alert('只有药师可以处理差异');
      return;
    }

    const resolution = prompt('请输入处理说明：');
    if (!resolution || resolution.trim() === '') {
      alert('请输入处理说明');
      return;
    }

    const result = Discrepancy.resolveDiscrepancy(discrepancyId, resolution);
    if (result.success) {
      renderTabContent();
    } else {
      alert(result.message);
    }
  }

  function showCorrectionModal(discrepancyId) {
    const discrepancy = Discrepancy.getDiscrepancyById(discrepancyId);
    if (!discrepancy) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h3>申请修正 - ${discrepancy.drugName}</h3>
        <p style="margin-bottom:12px; font-size:13px; color:#595959;">
          当前实存：${discrepancy.actualQuantity} ${discrepancy.unit}
        </p>
        <div class="form-group">
          <label>修正后数量</label>
          <input type="number" id="correction-qty" value="${discrepancy.actualQuantity}" min="0">
        </div>
        <div class="form-group">
          <label>申请原因</label>
          <textarea id="correction-reason" rows="3" placeholder="请说明申请修正的原因"></textarea>
        </div>
        ${Auth.isNurse() ? `
          <div class="alert alert-warning" style="margin-bottom:12px;">
            护士提交的修正申请需要药师审批。
          </div>
        ` : ''}
        <div class="modal-actions">
          <button class="btn btn-default" onclick="this.closest('.modal-overlay').remove()">取消</button>
          <button class="btn btn-primary" onclick="App.submitCorrection('${discrepancyId}')">提交申请</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function submitCorrection(discrepancyId) {
    const newQty = document.getElementById('correction-qty').value;
    const reason = document.getElementById('correction-reason').value.trim();

    const result = Discrepancy.requestCorrection(discrepancyId, newQty, reason);
    if (result.success) {
      document.querySelector('.modal-overlay').remove();
      alert('修正申请已提交');
      renderTabContent();
    } else {
      alert(result.message);
    }
  }

  function reviewCorrection(discrepancyId, correctionId, approved) {
    if (!Auth.canApproveCorrection()) {
      alert('只有药师可以审批修正申请');
      return;
    }

    const note = approved ? '' : (prompt('请输入拒绝原因：') || '');

    const result = Discrepancy.reviewCorrection(discrepancyId, correctionId, approved, note);
    if (result.success) {
      alert(approved ? '已批准修正申请' : '已拒绝修正申请');
      renderTabContent();
    } else {
      alert(result.message);
    }
  }

  function renderHistory(container) {
    const history = Shift.getShiftHistory();

    container.innerHTML = `
      <div class="card">
        <h3>历史班次</h3>
        ${history.length === 0 ? `
          <div class="empty-state">暂无历史班次</div>
        ` : `
          <table>
            <thead>
              <tr>
                <th>班次名称</th>
                <th>状态</th>
                <th>创建人</th>
                <th>创建时间</th>
                <th>关闭人</th>
                <th>签收人</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${history.map(shift => `
                <tr>
                  <td>${shift.name}</td>
                  <td>
                    <span class="status-badge ${Shift.getStatusClass(shift.status)}">
                      ${Shift.getStatusText(shift.status)}
                    </span>
                  </td>
                  <td>${shift.createdByName}</td>
                  <td>${shift.createdAtFormatted}</td>
                  <td>${shift.closedByName || '-'}</td>
                  <td>${shift.receivedByName || '-'}</td>
                  <td>
                    <button class="btn btn-default btn-sm" onclick="App.exportShiftById('${shift.id}')">
                      导出
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;
  }

  function exportCurrentShift() {
    const shift = Shift.getCurrentShift();
    if (!shift) {
      alert('没有可导出的班次');
      return;
    }
    ExportModule.downloadReport(shift);
  }

  function exportShiftById(shiftId) {
    const history = Shift.getShiftHistory();
    const shift = history.find(s => s.id === shiftId);
    if (shift) {
      ExportModule.downloadReport(shift);
    }
  }

  function renderAuditLog(container) {
    const logs = Storage.getAuditLogs();

    container.innerHTML = `
      <div class="card">
        <h3>审计日志</h3>
        <p style="font-size:12px; color:#8c8c8c; margin-bottom:12px;">
          共 ${logs.length} 条记录
        </p>
        ${logs.length === 0 ? `
          <div class="empty-state">暂无审计记录</div>
        ` : `
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>操作人</th>
                <th>角色</th>
                <th>操作</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(log => `
                <tr>
                  <td style="white-space:nowrap; font-size:12px;">${log.timestampFormatted}</td>
                  <td>${log.userName || '系统'}</td>
                  <td>${log.userRole || '-'}</td>
                  <td>${log.action}</td>
                  <td style="font-size:12px;">${log.details}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;
  }

  function renderBackupCenter(container) {
    const user = Auth.getCurrentUser();
    const isPharmacist = Auth.isPharmacist();
    const canManage = Auth.canManageBackups();

    container.innerHTML = `
      <div class="backup-center">
        <div class="backup-subtabs">
          <div class="backup-subtab ${backupSubTab === 'history' ? 'active' : ''}"
               onclick="App.switchBackupSubTab('history')">
            📦 备份历史
          </div>
          <div class="backup-subtab ${backupSubTab === 'records' ? 'active' : ''}"
               onclick="App.switchBackupSubTab('records')">
            📋 恢复记录
          </div>
          <div class="backup-subtab ${backupSubTab === 'drafts' ? 'active' : ''}"
               onclick="App.switchBackupSubTab('drafts')">
            📝 恢复草案
          </div>
          ${isPharmacist ? `
            <div class="backup-subtab ${backupSubTab === 'settings' ? 'active' : ''}"
                 onclick="App.switchBackupSubTab('settings')">
              ⚙️ 备份设置
            </div>
          ` : ''}
        </div>
        <div id="backup-subtab-content"></div>
      </div>
    `;

    const subContent = document.getElementById('backup-subtab-content');
    switch (backupSubTab) {
      case 'history':
        renderBackupHistory(subContent);
        break;
      case 'records':
        renderRestoreRecordsView(subContent);
        break;
      case 'drafts':
        renderRestoreDraftsView(subContent);
        break;
      case 'settings':
        renderBackupSettings(subContent);
        break;
    }
  }

  function switchBackupSubTab(tab) {
    backupSubTab = tab;
    selectedBackupId = null;
    renderBackupCenter(document.getElementById('tab-content'));
  }

  function renderBackupHistory(container) {
    const user = Auth.getCurrentUser();
    const isPharmacist = Auth.isPharmacist();
    const filtered = Storage.filterBackupHistory(backupFilters);
    const lastRestore = ExportModule.getLastRestoreInfo();

    container.innerHTML = `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="margin:0;">备份历史</h3>
          <div style="display:flex; gap:8px;">
            ${isPharmacist ? `
              <button class="btn btn-primary btn-sm" onclick="App.showCreateBackupModal()">
                + 创建备份
              </button>
              <button class="btn btn-default btn-sm" onclick="App.showImportBackupModal()">
                📥 导入备份
              </button>
            ` : ''}
          </div>
        </div>

        ${lastRestore && lastRestore.record ? `
          <div class="alert alert-info" style="margin-bottom:16px;">
            <strong>最近恢复：</strong>
            ${lastRestore.record.timestampFormatted}
            由 ${lastRestore.record.restoredBy ? lastRestore.record.restoredBy.name : '未知'}
            (${lastRestore.record.isPartial ? '部分恢复' : '完整恢复'})
            - ${lastRestore.record.status === 'success'
                ? (lastRestore.record.undone ? '已撤回' : '已生效')
                : '失败: ' + (lastRestore.record.errorMessage || '未知错误')}
            ${lastRestore.hasUndoableSnapshot ? `
              <button class="btn btn-warning btn-sm" style="margin-left:8px;" onclick="App.handleUndoRestore()">
                撤回恢复
              </button>
            ` : ''}
          </div>
        ` : ''}

        <div class="backup-filter-bar">
          <input type="text" class="backup-filter-input"
                 placeholder="🔍 搜索备份名称、备注、操作人..."
                 value="${backupFilters.keyword}"
                 oninput="App.filterBackups('keyword', this.value)">
          <select class="backup-filter-select" onchange="App.filterBackups('operatorRole', this.value)">
            <option value="">全部角色</option>
            <option value="pharmacist" ${backupFilters.operatorRole === 'pharmacist' ? 'selected' : ''}>药师</option>
            <option value="nurse" ${backupFilters.operatorRole === 'nurse' ? 'selected' : ''}>护士</option>
          </select>
          <select class="backup-filter-select" onchange="App.filterBackups('shiftStatus', this.value)">
            <option value="">全部班次状态</option>
            <option value="has_active" ${backupFilters.shiftStatus === 'has_active' ? 'selected' : ''}>含进行中班次</option>
            <option value="closed_only" ${backupFilters.shiftStatus === 'closed_only' ? 'selected' : ''}>仅已关闭班次</option>
          </select>
          <input type="date" class="backup-filter-input"
                 placeholder="开始日期"
                 value="${backupFilters.startDate}"
                 onchange="App.filterBackups('startDate', this.value)">
          <input type="date" class="backup-filter-input"
                 placeholder="结束日期"
                 value="${backupFilters.endDate}"
                 onchange="App.filterBackups('endDate', this.value)">
          <button class="btn btn-default btn-sm" onclick="App.clearBackupFilters()">重置</button>
        </div>

        <p style="font-size:12px; color:#8c8c8c; margin:12px 0;">
          共 ${filtered.length} 条备份记录
        </p>

        <div class="backup-list">
          ${filtered.length === 0 ? `
            <div class="empty-state">暂无备份记录</div>
          ` : filtered.map(b => renderBackupItem(b)).join('')}
        </div>
      </div>

      <div id="backup-detail-modal"></div>
    `;
  }

  function renderBackupItem(backup) {
    const isSelected = selectedBackupId === backup.id;
    const summary = backup.summary || {};

    return `
      <div class="backup-item ${isSelected ? 'selected' : ''}"
           onclick="App.viewBackupDetail('${backup.id}')">
        <div class="backup-item-header">
          <span class="backup-item-name">
            ${backup.name || '未命名备份'}
            ${summary.hasActiveShift
              ? '<span class="status-badge status-active" style="margin-left:8px; font-size:10px;">进行中</span>'
              : '<span class="status-badge status-closed" style="margin-left:8px; font-size:10px;">已关班</span>'}
          </span>
          <span class="backup-item-date">${backup.createdAtFormatted}</span>
        </div>
        <div class="backup-item-meta">
          <span>操作人：${backup.createdBy ? backup.createdBy.name : '未知'}</span>
          <span>班次：${summary.shiftCount || 0} 个</span>
          <span>药品：${summary.drugCount || 0} 种</span>
          <span>盘点：${summary.totalInventoryItems || 0} 条</span>
        </div>
        ${backup.note ? `<div class="backup-item-note">📝 ${backup.note}</div>` : ''}
      </div>
    `;
  }

  function filterBackups(key, value) {
    backupFilters[key] = value;
    renderBackupHistory(document.getElementById('backup-subtab-content'));
  }

  function clearBackupFilters() {
    backupFilters = {
      keyword: '',
      operatorRole: '',
      shiftStatus: '',
      startDate: '',
      endDate: ''
    };
    renderBackupHistory(document.getElementById('backup-subtab-content'));
  }

  function showCreateBackupModal() {
    if (!Auth.canManageBackups()) {
      alert('只有药师可以创建备份');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'create-backup-modal';
    modal.innerHTML = `
      <div class="modal">
        <h3>创建本地备份</h3>
        <div class="form-group">
          <label>备份名称</label>
          <input type="text" id="backup-name-input" placeholder="例如：中班交接前备份">
        </div>
        <div class="form-group">
          <label>备注（可选）</label>
          <textarea id="backup-note-input" rows="3" placeholder="记录备份原因或特殊说明"></textarea>
        </div>
        <div class="alert alert-info" style="font-size:12px; margin-bottom:16px;">
          备份将保存到本地浏览器存储中，包含全部班次、盘点、差异、修正和审计日志数据。
        </div>
        <div class="modal-actions">
          <button class="btn btn-default" onclick="document.getElementById('create-backup-modal').remove()">取消</button>
          <button class="btn btn-primary" onclick="App.handleCreateBackup()">确认创建</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function handleCreateBackup() {
    const name = document.getElementById('backup-name-input').value.trim();
    const note = document.getElementById('backup-note-input').value.trim();

    const result = ExportModule.createBackupWithInfo(name, note);
    if (result.success) {
      alert('✅ 备份创建成功！');
      document.getElementById('create-backup-modal').remove();
      renderBackupCenter(document.getElementById('tab-content'));
    } else {
      alert('创建失败：' + result.message);
    }
  }

  let restoreConsoleActiveTab = 'overview';

  function viewBackupDetail(backupId) {
    selectedBackupId = backupId;
    const backupInfo = Storage.getBackupById(backupId);
    if (!backupInfo || !backupInfo.backupData) {
      alert('备份数据不存在或已损坏');
      return;
    }

    const isPharmacist = Auth.isPharmacist();
    const allBlocks = ExportModule.getAllDataBlocks();
    const blockChanges = ExportModule.getAllDataBlockChanges(backupInfo.backupData);

    if (selectedDataBlocks.length === 0) {
      selectedDataBlocks = allBlocks.slice();
    }

    if (!backupPendingConflicts) {
      const conflicts = ExportModule.detectConflicts(backupInfo.backupData);
      backupPendingConflicts = conflicts;
      const strategyReuse = ExportModule.checkConflictStrategyReuse(conflicts);
      if (strategyReuse.hasMatches) {
        backupStrategyReuseInfo = strategyReuse;
      }
    }

    const conflictGroups = ExportModule.getConflictsGrouped(backupInfo.backupData);

    const modal = document.getElementById('backup-detail-modal');
    modal.innerHTML = `
      <div class="modal-overlay" style="z-index:1000;">
        <div class="modal restore-console-modal">
          <div class="restore-console-header">
            <div>
              <h3 style="margin:0 0 4px 0;">
                <span style="margin-right:8px;">🔧</span>
                恢复操作台 - ${backupInfo.name || '未命名备份'}
              </h3>
              <p style="font-size:12px; color:#8c8c8c; margin:0;">
                创建时间：${backupInfo.createdAtFormatted} |
                操作人：${backupInfo.createdBy ? backupInfo.createdBy.name : '未知'} |
                版本：${backupInfo.version || '-'}
                ${backupInfo.importedFrom ? ` | 来源：${backupInfo.importedFrom.name || '文件导入'}` : ''}
              </p>
            </div>
            <div style="display:flex; gap:8px;">
              ${conflictGroups.hasConflicts ? `
                <span class="conflict-badge conflict-badge-${conflictGroups.highestSeverity}">
                  ⚠️ ${conflictGroups.totalCount} 项冲突待处理
                </span>
              ` : `
                <span class="conflict-badge conflict-badge-none">
                  ✓ 无冲突
                </span>
              `}
              <button class="btn btn-default btn-sm" onclick="App.closeBackupDetail()">关闭</button>
            </div>
          </div>

          ${backupStrategyReuseInfo && backupStrategyReuseInfo.hasMatches ? `
            <div class="alert alert-info" style="margin:8px 0 0 0; display:flex; align-items:center; gap:8px;">
              <span>💡 检测到 ${backupStrategyReuseInfo.matchedCount} 项冲突曾处理过，是否沿用上次策略？</span>
              <button class="btn btn-primary btn-sm" onclick="App.applyReuseStrategies()">沿用旧决定</button>
              <button class="btn btn-default btn-sm" onclick="App.dismissReusePrompt()">手动选择</button>
            </div>
          ` : ''}

          ${backupInfo.note ? `
            <div class="restore-note-bar">
              📝 <strong>备份备注：</strong>${backupInfo.note}
            </div>
          ` : ''}

          <div class="restore-console-tabs">
            <div class="restore-tab ${restoreConsoleActiveTab === 'overview' ? 'active' : ''}"
                 onclick="App.switchRestoreConsoleTab('overview')">
              📊 恢复概览
            </div>
            <div class="restore-tab ${restoreConsoleActiveTab === 'datablocks' ? 'active' : ''}"
                 onclick="App.switchRestoreConsoleTab('datablocks')">
              📦 数据块选择
            </div>
            <div class="restore-tab ${restoreConsoleActiveTab === 'conflicts' ? 'active' : ''}"
                 onclick="App.switchRestoreConsoleTab('conflicts')">
              ⚔️ 冲突决策
              ${conflictGroups.hasConflicts ? `<span class="restore-tab-badge">${conflictGroups.totalCount}</span>` : ''}
            </div>
            <div class="restore-tab ${restoreConsoleActiveTab === 'preview' ? 'active' : ''}"
                 onclick="App.switchRestoreConsoleTab('preview')">
              👁 执行预演
            </div>
          </div>

          <div class="restore-console-body" id="restore-console-body">
            ${renderRestoreConsoleContent(backupInfo, blockChanges, conflictGroups)}
          </div>

          ${isPharmacist ? `
            <div class="restore-console-footer">
              <div class="restore-footer-summary">
                <span>已选 <strong>${selectedDataBlocks.length}/${allBlocks.length}</strong> 个数据块</span>
                ${conflictGroups.hasConflicts ? `<span>冲突策略已设 <strong>${backupPendingResolutions.length || 0}/${conflictGroups.totalCount}</strong> 项</span>` : ''}
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-default" onclick="App.closeBackupDetail()">取消</button>
                <button class="btn btn-success" onclick="App.applyBackupRestore()">
                  确认执行恢复
                </button>
              </div>
            </div>
          ` : `
            <div class="restore-console-footer">
              <div class="alert alert-info" style="font-size:12px; margin:0; flex:1;">
                护士账号可查看备份详情，恢复操作需药师权限。
              </div>
              <button class="btn btn-default" onclick="App.closeBackupDetail()">关闭</button>
            </div>
          `}
        </div>
      </div>
    `;

    renderBackupHistory(document.getElementById('backup-subtab-content'));
  }

  function switchRestoreConsoleTab(tab) {
    restoreConsoleActiveTab = tab;
    const backupInfo = Storage.getBackupById(selectedBackupId);
    if (!backupInfo || !backupInfo.backupData) return;

    const blockChanges = ExportModule.getAllDataBlockChanges(backupInfo.backupData);
    const conflictGroups = ExportModule.getConflictsGrouped(backupInfo.backupData);

    const tabs = document.querySelectorAll('.restore-tab');
    tabs.forEach(t => t.classList.remove('active'));
    const activeTab = Array.from(tabs).find(t => t.textContent.includes(
      tab === 'overview' ? '恢复概览' :
      tab === 'datablocks' ? '数据块选择' :
      tab === 'conflicts' ? '冲突决策' : '执行预演'
    ));
    if (activeTab) activeTab.classList.add('active');

    const body = document.getElementById('restore-console-body');
    if (body) {
      body.innerHTML = renderRestoreConsoleContent(backupInfo, blockChanges, conflictGroups);
    }
  }

  function renderRestoreConsoleContent(backupInfo, blockChanges, conflictGroups) {
    switch (restoreConsoleActiveTab) {
      case 'overview':
        return renderRestoreOverviewTab(backupInfo, blockChanges, conflictGroups);
      case 'datablocks':
        return renderRestoreDataBlocksTab(backupInfo, blockChanges);
      case 'conflicts':
        return renderRestoreConflictsTab(backupInfo, conflictGroups);
      case 'preview':
        return renderRestorePreviewTab(backupInfo);
      default:
        return '';
    }
  }

  function renderRestoreOverviewTab(backupInfo, blockChanges, conflictGroups) {
    const allBlocks = ExportModule.getAllDataBlocks();

    let blockCardsHtml = '';
    allBlocks.forEach(block => {
      const change = blockChanges[block];
      const isSelected = selectedDataBlocks.includes(block);
      const label = ExportModule.getDataBlockLabel(block);

      blockCardsHtml += `
        <div class="overview-block-card ${isSelected ? 'selected' : ''}"
             onclick="App.toggleDataBlock('${block}', ${!isSelected})">
          <div class="overview-block-header">
            <span class="overview-block-icon">${getBlockIcon(block)}</span>
            <span class="overview-block-title">${label}</span>
            <label class="overview-block-checkbox">
              <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
            </label>
          </div>
          <div class="overview-block-summary">
            ${change ? change.summary : '暂无数据'}
          </div>
          ${change && change.newItems && change.newItems.length > 0 ? `
            <div class="overview-block-detail">
              <span class="tag tag-new">+${change.newItems.length} 新增</span>
              ${change.modifiedItems && change.modifiedItems.length > 0 ? `<span class="tag tag-modified">~${change.modifiedItems.length} 变更</span>` : ''}
              ${change.deletedItems && change.deletedItems.length > 0 ? `<span class="tag tag-deleted">-${change.deletedItems.length} 本地独有</span>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    });

    const businessConflicts = ExportModule.detectBusinessConflicts();

    return `
      <div class="restore-overview">
        <div class="overview-section">
          <h4 class="overview-section-title">📦 数据块一览（点击切换选中状态）</h4>
          <div class="overview-block-grid">
            ${blockCardsHtml}
          </div>
          <div style="margin-top:10px; display:flex; gap:8px;">
            <button class="btn btn-default btn-sm" onclick="App.selectAllDataBlocks(true); App.refreshRestoreConsole();">全选</button>
            <button class="btn btn-default btn-sm" onclick="App.selectAllDataBlocks(false); App.refreshRestoreConsole();">全不选</button>
          </div>
        </div>

        ${businessConflicts.hasConflicts ? `
          <div class="overview-section">
            <h4 class="overview-section-title">⚠️ 业务状态提醒</h4>
            <div class="business-warnings">
              ${businessConflicts.warnings.map(w => `
                <div class="business-warning-item">
                  <span class="warning-dot"></span>
                  ${w}
                </div>
              `).join('')}
            </div>
            <p style="font-size:12px; color:#faad14; margin-top:8px;">
              💡 建议先处理完上述事项再执行恢复，避免数据冲突
            </p>
          </div>
        ` : ''}

        <div class="overview-section">
          <h4 class="overview-section-title">📋 备份基本信息</h4>
          <div class="backup-meta-grid">
            <div class="meta-item">
              <span class="meta-label">备份版本</span>
              <span class="meta-value">${backupInfo.version || '-'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">创建时间</span>
              <span class="meta-value">${backupInfo.createdAtFormatted}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">创建人</span>
              <span class="meta-value">${backupInfo.createdBy ? backupInfo.createdBy.name : '未知'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">班次数量</span>
              <span class="meta-value">${backupInfo.summary ? backupInfo.summary.shiftCount : '-'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">药品数量</span>
              <span class="meta-value">${backupInfo.summary ? backupInfo.summary.drugCount : '-'}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">审计日志</span>
              <span class="meta-value">${backupInfo.summary ? backupInfo.summary.auditLogCount : '-'}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderRestoreDataBlocksTab(backupInfo, blockChanges) {
    const allBlocks = ExportModule.getAllDataBlocks();

    let blocksHtml = '';
    allBlocks.forEach(block => {
      const change = blockChanges[block];
      const isSelected = selectedDataBlocks.includes(block);
      const label = ExportModule.getDataBlockLabel(block);

      let detailHtml = '';
      if (change) {
        if (change.newItems && change.newItems.length > 0) {
          detailHtml += `
            <div class="block-detail-section">
              <span class="block-detail-title">新增项 (${change.newItems.length})</span>
              <div class="block-detail-items">
                ${change.newItems.slice(0, 5).map(item => `<span class="block-detail-item tag tag-new">${item}</span>`).join('')}
                ${change.newItems.length > 5 ? `<span class="block-detail-more">...还有 ${change.newItems.length - 5} 项</span>` : ''}
              </div>
            </div>
          `;
        }
        if (change.modifiedItems && change.modifiedItems.length > 0) {
          detailHtml += `
            <div class="block-detail-section">
              <span class="block-detail-title">变更项 (${change.modifiedItems.length})</span>
              <div class="block-detail-items">
                ${change.modifiedItems.slice(0, 5).map(item => `<span class="block-detail-item tag tag-modified">${item}</span>`).join('')}
                ${change.modifiedItems.length > 5 ? `<span class="block-detail-more">...还有 ${change.modifiedItems.length - 5} 项</span>` : ''}
              </div>
            </div>
          `;
        }
        if (change.deletedItems && change.deletedItems.length > 0) {
          detailHtml += `
            <div class="block-detail-section">
              <span class="block-detail-title">本地独有 / 备份没有 (${change.deletedItems.length})</span>
              <div class="block-detail-items">
                ${change.deletedItems.slice(0, 5).map(item => `<span class="block-detail-item tag tag-deleted">${item}</span>`).join('')}
                ${change.deletedItems.length > 5 ? `<span class="block-detail-more">...还有 ${change.deletedItems.length - 5} 项</span>` : ''}
              </div>
            </div>
          `;
        }
      }

      blocksHtml += `
        <div class="datablock-panel ${isSelected ? 'active' : ''}">
          <div class="datablock-panel-header" onclick="App.toggleDataBlock('${block}', ${!isSelected}); App.refreshRestoreConsole();">
            <label class="datablock-checkbox">
              <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); App.toggleDataBlock('${block}', this.checked); App.refreshRestoreConsole();">
            </label>
            <span class="datablock-icon">${getBlockIcon(block)}</span>
            <span class="datablock-name">${label}</span>
            <span class="datablock-summary">${change ? change.summary : ''}</span>
            <span class="datablock-toggle">${isSelected ? '▾' : '▸'}</span>
          </div>
          ${isSelected ? `
            <div class="datablock-panel-body">
              ${detailHtml || '<p style="font-size:12px; color:#8c8c8c;">该数据块无变更项</p>'}
            </div>
          ` : ''}
        </div>
      `;
    });

    return `
      <div class="restore-datablocks">
        <div class="datablocks-header">
          <p style="font-size:13px; color:#595959; margin:0 0 8px 0;">
            选择需要恢复的数据块。取消勾选的数据块将保持本地原状，不会被备份覆盖。
          </p>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-default btn-sm" onclick="App.selectAllDataBlocks(true); App.refreshRestoreConsole();">全选</button>
            <button class="btn btn-default btn-sm" onclick="App.selectAllDataBlocks(false); App.refreshRestoreConsole();">全不选</button>
          </div>
        </div>
        <div class="datablocks-list">
          ${blocksHtml}
        </div>
      </div>
    `;
  }

  function renderRestoreConflictsTab(backupInfo, conflictGroups) {
    if (!conflictGroups.hasConflicts) {
      return `
        <div class="no-conflicts-container">
          <div class="no-conflicts-icon">✅</div>
          <h4 style="margin:12px 0 8px 0; color:#52c41a;">无冲突检测</h4>
          <p style="font-size:13px; color:#8c8c8c; margin:0;">
            备份数据与本地数据无冲突项，可以直接执行恢复。
          </p>
        </div>
      `;
    }

    let groupsHtml = '';
    conflictGroups.groups.forEach((group, groupIdx) => {
      let conflictsHtml = '';
      group.conflicts.forEach((conflict, conflictIdx) => {
        const currentStrategy = getConflictResolutionStrategy(group.groupKey, conflictIdx);
        const currentStrategyLabel = conflict.strategies.find(s => s.value === currentStrategy)?.label || '保留本地';

        let compareHtml = '';
        if (conflict.type === 'shift_name_conflict') {
          compareHtml = `
            <div class="conflict-compare">
              <div class="conflict-compare-side">
                <div class="conflict-side-label">📤 备份版本</div>
                <div class="conflict-side-content">
                  <p><strong>状态：</strong>${conflict.imported.statusText}</p>
                  <p><strong>创建：</strong>${conflict.imported.createdAt} (${conflict.imported.createdBy || '未知'})</p>
                  ${conflict.imported.summary ? `<p><strong>差异数：</strong>${conflict.imported.summary.discrepancies || 0} 项</p>` : ''}
                </div>
              </div>
              <div class="conflict-compare-vs">VS</div>
              <div class="conflict-compare-side">
                <div class="conflict-side-label local">📁 本地版本</div>
                <div class="conflict-side-content">
                  <p><strong>状态：</strong>${conflict.existing.statusText}</p>
                  <p><strong>创建：</strong>${conflict.existing.createdAt} (${conflict.existing.createdBy || '未知'})</p>
                  ${conflict.existing.summary ? `<p><strong>差异数：</strong>${conflict.existing.summary.discrepancies || 0} 项</p>` : ''}
                </div>
              </div>
            </div>
          `;
        } else if (conflict.type === 'drug_content_conflict') {
          compareHtml = `
            <div class="conflict-compare">
              <div class="conflict-compare-side">
                <div class="conflict-side-label">📤 备份版本</div>
                <div class="conflict-side-content">
                  ${conflict.diffFields.map(f => `
                    <p><strong>${f.field}：</strong>${f.imported}</p>
                  `).join('')}
                </div>
              </div>
              <div class="conflict-compare-vs">VS</div>
              <div class="conflict-compare-side">
                <div class="conflict-side-label local">📁 本地版本</div>
                <div class="conflict-side-content">
                  ${conflict.diffFields.map(f => `
                    <p><strong>${f.field}：</strong>${f.existing}</p>
                  `).join('')}
                </div>
              </div>
            </div>
          `;
        } else if (conflict.type === 'duplicate_correction') {
          compareHtml = `
            <div class="conflict-compare">
              <div class="conflict-compare-side">
                <div class="conflict-side-label">📤 备份版本</div>
                <div class="conflict-side-content">
                  <p><strong>变更：</strong>${conflict.imported.oldQty} → ${conflict.imported.newQty}</p>
                  <p><strong>申请人：</strong>${conflict.imported.requestedBy}</p>
                  <p><strong>时间：</strong>${conflict.imported.requestedAt}</p>
                  <p><strong>状态：</strong>${conflict.imported.statusText}</p>
                  ${conflict.imported.reason ? `<p><strong>原因：</strong>${conflict.imported.reason}</p>` : ''}
                </div>
              </div>
              <div class="conflict-compare-vs">VS</div>
              <div class="conflict-compare-side">
                <div class="conflict-side-label local">📁 本地版本</div>
                <div class="conflict-side-content">
                  <p><strong>变更：</strong>${conflict.existing.oldQty} → ${conflict.existing.newQty}</p>
                  <p><strong>申请人：</strong>${conflict.existing.requestedBy}</p>
                  <p><strong>时间：</strong>${conflict.existing.requestedAt}</p>
                  <p><strong>状态：</strong>${conflict.existing.statusText}</p>
                  ${conflict.existing.reason ? `<p><strong>原因：</strong>${conflict.existing.reason}</p>` : ''}
                </div>
              </div>
            </div>
          `;
        }

        conflictsHtml += `
          <div class="conflict-item conflict-severity-${conflict.severity}">
            <div class="conflict-item-header">
              <span class="conflict-severity-dot"></span>
              <span class="conflict-item-title">${conflict.title}</span>
              <span class="conflict-current-strategy">当前：${currentStrategyLabel}</span>
            </div>
            ${compareHtml}
            <div class="conflict-strategies">
              <span class="conflict-strategies-label">处理策略：</span>
              <div class="conflict-strategy-buttons">
                ${conflict.strategies.map(s => `
                  <button class="conflict-strategy-btn ${currentStrategy === s.value ? 'active' : ''}"
                          onclick="App.setConflictStrategy('${group.groupKey}', ${conflictIdx}, '${s.value}')"
                          title="${s.description}">
                    ${s.label}
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        `;
      });

      groupsHtml += `
        <div class="conflict-group">
          <div class="conflict-group-header">
            <span class="conflict-group-title">${group.groupLabel}</span>
            <span class="conflict-group-count">${group.count} 项</span>
            <div style="margin-left:auto; display:flex; gap:4px;">
              ${group.conflicts[0].strategies.map(s => `
                <button class="btn btn-xs btn-default"
                        onclick="App.setGroupStrategy('${group.groupKey}', '${s.value}')">
                  全部${s.label}
                </button>
              `).join('')}
            </div>
          </div>
          <div class="conflict-group-body">
            ${conflictsHtml}
          </div>
        </div>
      `;
    });

    return `
      <div class="restore-conflicts">
        <div class="conflicts-header">
          <p style="font-size:13px; color:#595959; margin:0 0 8px 0;">
            共检测到 <strong>${conflictGroups.totalCount}</strong> 项冲突。请逐项决定处理策略，或使用分组批量设置。
          </p>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-xs btn-default" onclick="App.setAllConflictStrategy('skip')">全部保留本地</button>
            <button class="btn btn-xs btn-warning" onclick="App.setAllConflictStrategy('overwrite')">全部覆盖</button>
            <button class="btn btn-xs btn-info" onclick="App.setAllConflictStrategy('merge')">全部合并</button>
          </div>
        </div>
        <div class="conflicts-list">
          ${groupsHtml}
        </div>
      </div>
    `;
  }

  function renderRestorePreviewTab(backupInfo) {
    const allBlocks = ExportModule.getAllDataBlocks();
    const isFull = selectedDataBlocks.length === allBlocks.length;

    let resolutions = [];
    if (backupPendingConflicts) {
      resolutions = collectBackupConflictResolutions();
    }

    let previewResult = null;
    if (isFull) {
      previewResult = ExportModule.preRestorePreview(backupInfo.backupData, resolutions);
    } else if (selectedDataBlocks.length > 0) {
      previewResult = ExportModule.prePartialRestorePreview(
        backupInfo.backupData,
        selectedDataBlocks,
        resolutions
      );
    }

    if (!previewResult || !previewResult.success) {
      return `
        <div class="preview-empty">
          <p style="font-size:13px; color:#8c8c8c;">
            ${selectedDataBlocks.length === 0 ? '请先选择至少一个数据块' : '正在生成预演结果...'}
          </p>
          ${selectedDataBlocks.length > 0 ? `
            <button class="btn btn-primary btn-sm" onclick="App.refreshRestoreConsole()">
              重新计算预演
            </button>
          ` : ''}
        </div>
      `;
    }

    const s = previewResult.summary;

    return `
      <div class="restore-preview">
        <div class="preview-summary-card">
          <div class="preview-summary-title">
            <span>📊 恢复预演结果</span>
            <span class="preview-note">（尚未写入，确认后才落库）</span>
          </div>
          <div class="preview-stats">
            <div class="preview-stat stat-new">
              <div class="preview-stat-value">${s.newShifts || 0}</div>
              <div class="preview-stat-label">新增班次</div>
            </div>
            <div class="preview-stat stat-overwrite">
              <div class="preview-stat-value">${s.overwrittenShifts || 0}</div>
              <div class="preview-stat-label">覆盖班次</div>
            </div>
            <div class="preview-stat stat-merge">
              <div class="preview-stat-value">${s.mergedShifts || 0}</div>
              <div class="preview-stat-label">合并班次</div>
            </div>
            <div class="preview-stat stat-skip">
              <div class="preview-stat-value">${s.skippedShifts || 0}</div>
              <div class="preview-stat-label">跳过班次</div>
            </div>
            <div class="preview-stat stat-drug">
              <div class="preview-stat-value">${(s.newDrugs || 0) + (s.overwrittenDrugs || 0)}</div>
              <div class="preview-stat-label">药品变动</div>
            </div>
            <div class="preview-stat stat-audit">
              <div class="preview-stat-value">${s.importAuditLogs || 0}</div>
              <div class="preview-stat-label">新增审计</div>
            </div>
          </div>
        </div>

        <div class="preview-detail-card">
          <h5 class="preview-detail-title">详细变更清单</h5>

          ${previewResult.preview && previewResult.preview.shifts ? `
            <div class="preview-section">
              <div class="preview-section-title">🚑 班次变更</div>
              ${previewResult.preview.shifts.new.length > 0 ? `
                <div class="preview-item-row">
                  <span class="preview-item-label new">新增 (${previewResult.preview.shifts.new.length})</span>
                  <span class="preview-item-values">
                    ${previewResult.preview.shifts.new.map(s => s.name).join('、')}
                  </span>
                </div>
              ` : ''}
              ${previewResult.preview.shifts.overwrite.length > 0 ? `
                <div class="preview-item-row">
                  <span class="preview-item-label overwrite">覆盖 (${previewResult.preview.shifts.overwrite.length})</span>
                  <span class="preview-item-values">
                    ${previewResult.preview.shifts.overwrite.map(s => s.name + '(本地:' + s.existingName + ')').join('、')}
                  </span>
                </div>
              ` : ''}
              ${previewResult.preview.shifts.merge.length > 0 ? `
                <div class="preview-item-row">
                  <span class="preview-item-label merge">合并 (${previewResult.preview.shifts.merge.length})</span>
                  <span class="preview-item-values">
                    ${previewResult.preview.shifts.merge.map(s => s.name).join('、')}
                  </span>
                </div>
              ` : ''}
              ${previewResult.preview.shifts.skip.length > 0 ? `
                <div class="preview-item-row">
                  <span class="preview-item-label skip">跳过 (${previewResult.preview.shifts.skip.length})</span>
                  <span class="preview-item-values">
                    ${previewResult.preview.shifts.skip.map(s => s.name).join('、')}
                  </span>
                </div>
              ` : ''}
            </div>
          ` : ''}

          ${previewResult.preview && previewResult.preview.drugs ? `
            <div class="preview-section">
              <div class="preview-section-title">💊 药品变更</div>
              ${previewResult.preview.drugs.new.length > 0 ? `
                <div class="preview-item-row">
                  <span class="preview-item-label new">新增 (${previewResult.preview.drugs.new.length})</span>
                  <span class="preview-item-values">
                    ${previewResult.preview.drugs.new.map(d => d.code + ' ' + d.name).join('、')}
                  </span>
                </div>
              ` : ''}
              ${previewResult.preview.drugs.overwrite.length > 0 ? `
                <div class="preview-item-row">
                  <span class="preview-item-label overwrite">覆盖 (${previewResult.preview.drugs.overwrite.length})</span>
                  <span class="preview-item-values">
                    ${previewResult.preview.drugs.overwrite.map(d => d.code).join('、')}
                  </span>
                </div>
              ` : ''}
              ${previewResult.preview.drugs.skip.length > 0 ? `
                <div class="preview-item-row">
                  <span class="preview-item-label skip">跳过/保留本地 (${previewResult.preview.drugs.skip.length})</span>
                  <span class="preview-item-values">
                    ${previewResult.preview.drugs.skip.map(d => d.code).join('、')}
                  </span>
                </div>
              ` : ''}
            </div>
          ` : ''}

          ${previewResult.preview && previewResult.preview.inventories ? `
            <div class="preview-section">
              <div class="preview-section-title">📋 盘点结果</div>
              <p style="font-size:12px; color:#595959;">
                将影响 ${previewResult.preview.inventories.affectedShiftIds.length} 个班次的盘点数据
              </p>
            </div>
          ` : ''}

          ${previewResult.preview && previewResult.preview.discrepancies ? `
            <div class="preview-section">
              <div class="preview-section-title">🔍 差异与修正</div>
              <p style="font-size:12px; color:#595959;">
                将影响 ${previewResult.preview.discrepancies.affectedShiftIds.length} 个班次的差异记录
                ${previewResult.preview.corrections ? `（覆盖${previewResult.preview.corrections.overwrite}条修正 / 合并${previewResult.preview.corrections.merge}条修正）` : ''}
              </p>
            </div>
          ` : ''}
        </div>

        <div class="preview-summary-text">
          ${previewResult.summaryText || ''}
        </div>
      </div>
    `;
  }

  function getBlockIcon(block) {
    switch (block) {
      case 'shifts': return '🚑';
      case 'drugs': return '💊';
      case 'inventory': return '📋';
      case 'discrepancies': return '🔍';
      case 'auditLogs': return '📝';
      default: return '📦';
    }
  }

  function refreshRestoreConsole() {
    const backupInfo = Storage.getBackupById(selectedBackupId);
    if (!backupInfo || !backupInfo.backupData) return;

    const blockChanges = ExportModule.getAllDataBlockChanges(backupInfo.backupData);
    const conflictGroups = ExportModule.getConflictsGrouped(backupInfo.backupData);

    const body = document.getElementById('restore-console-body');
    if (body) {
      body.innerHTML = renderRestoreConsoleContent(backupInfo, blockChanges, conflictGroups);
    }
  }

  function getConflictResolutionStrategy(groupKey, index) {
    if (!backupPendingConflicts) return 'skip';

    let rawConflict = null;
    if (groupKey === 'shifts') {
      rawConflict = backupPendingConflicts.shifts[index];
    } else if (groupKey === 'corrections') {
      rawConflict = backupPendingConflicts.corrections[index];
    } else if (groupKey === 'drugs') {
      rawConflict = backupPendingConflicts.drugs[index];
    }

    if (!rawConflict) return 'skip';

    const resolution = backupPendingResolutions.find(r => {
      const c = r.conflict;
      if (c.type !== rawConflict.type) return false;
      if (c.importedId && c.importedId === rawConflict.importedId) return true;
      if (c.drugCode && c.drugCode === rawConflict.drugCode) return true;
      if (c.correction && rawConflict.correction &&
          c.correction.requestedAt === rawConflict.correction.requestedAt &&
          c.correction.requestedBy === rawConflict.correction.requestedBy) return true;
      return false;
    });

    return resolution ? resolution.strategy : 'skip';
  }

  function setConflictStrategy(groupKey, index, strategy) {
    if (!backupPendingConflicts) return;

    let rawConflict = null;
    if (groupKey === 'shifts') {
      rawConflict = backupPendingConflicts.shifts[index];
    } else if (groupKey === 'corrections') {
      rawConflict = backupPendingConflicts.corrections[index];
    } else if (groupKey === 'drugs') {
      rawConflict = backupPendingConflicts.drugs[index];
    }

    if (!rawConflict) return;

    backupPendingResolutions = backupPendingResolutions.filter(r => {
      const c = r.conflict;
      if (c.type !== rawConflict.type) return true;
      if (c.importedId && c.importedId === rawConflict.importedId) return false;
      if (c.drugCode && c.drugCode === rawConflict.drugCode) return false;
      if (c.correction && rawConflict.correction &&
          c.correction.requestedAt === rawConflict.correction.requestedAt &&
          c.correction.requestedBy === rawConflict.correction.requestedBy) return false;
      return true;
    });

    backupPendingResolutions.push(ExportModule.resolveConflictStrategy(rawConflict, strategy));

    refreshRestoreConsole();
  }

  function setGroupStrategy(groupKey, strategy) {
    if (!backupPendingConflicts) return;

    let conflicts = [];
    if (groupKey === 'shifts') {
      conflicts = backupPendingConflicts.shifts;
    } else if (groupKey === 'corrections') {
      conflicts = backupPendingConflicts.corrections;
    } else if (groupKey === 'drugs') {
      conflicts = backupPendingConflicts.drugs;
    }

    conflicts.forEach((c, idx) => {
      setConflictStrategy(groupKey, idx, strategy);
    });
  }

  function setAllConflictStrategy(strategy) {
    if (!backupPendingConflicts) return;

    ['shifts', 'corrections', 'drugs'].forEach(groupKey => {
      setGroupStrategy(groupKey, strategy);
    });
  }

  function closeBackupDetail() {
    const modal = document.getElementById('backup-detail-modal');
    if (modal) modal.innerHTML = '';
    selectedBackupId = null;
    selectedDataBlocks = [];
    backupPendingPreview = null;
    backupStrategyReuseInfo = null;
    renderBackupHistory(document.getElementById('backup-subtab-content'));
  }

  function applyReuseStrategies() {
    if (!backupPendingConflicts) return;
    const result = ExportModule.applyConflictStrategyReuse(backupPendingConflicts, true);
    if (result.success && result.resolutions) {
      backupPendingResolutions = result.resolutions;
    }
    backupStrategyReuseInfo = null;
    viewBackupDetail(selectedBackupId);
  }

  function dismissReusePrompt() {
    backupStrategyReuseInfo = null;
    viewBackupDetail(selectedBackupId);
  }

  function toggleDataBlock(block, checked) {
    if (checked) {
      if (!selectedDataBlocks.includes(block)) {
        selectedDataBlocks.push(block);
      }
    } else {
      selectedDataBlocks = selectedDataBlocks.filter(b => b !== block);
    }
    viewBackupDetail(selectedBackupId);
  }

  function selectAllDataBlocks(selectAll) {
    if (selectAll) {
      selectedDataBlocks = ExportModule.getAllDataBlocks();
    } else {
      selectedDataBlocks = [];
    }
    viewBackupDetail(selectedBackupId);
  }

  function previewBackupRestore() {
    const backupInfo = Storage.getBackupById(selectedBackupId);
    if (!backupInfo || !backupInfo.backupData) return;

    const conflicts = ExportModule.detectConflicts(backupInfo.backupData);
    backupPendingConflicts = conflicts;

    const conflictArea = document.getElementById('backup-conflict-area');
    renderBackupConflictArea(conflictArea, conflicts, backupInfo);

    const defaultResolutions = collectBackupConflictResolutions();
    computeAndRenderPreview(defaultResolutions);
  }

  function refreshBackupPreview() {
    const resolutions = collectBackupConflictResolutions();
    computeAndRenderPreview(resolutions);
  }

  function computeAndRenderPreview(resolutions) {
    const backupInfo = Storage.getBackupById(selectedBackupId);
    if (!backupInfo || !backupInfo.backupData) return;

    const allBlocks = ExportModule.getAllDataBlocks();
    const isFull = selectedDataBlocks.length === allBlocks.length;
    const area = document.getElementById('backup-preview-area');

    let result;
    if (isFull) {
      result = ExportModule.preRestorePreview(backupInfo.backupData, resolutions);
    } else {
      result = ExportModule.prePartialRestorePreview(
        backupInfo.backupData,
        selectedDataBlocks,
        resolutions
      );
    }

    backupPendingPreview = result.success ? result : null;
    backupPendingResolutions = resolutions;

    if (result.success) {
      const s = result.summary;
      area.innerHTML = `
        <div style="padding:12px; background:#e6f7ff; border:1px solid #91d5ff; border-radius:4px;">
          <p style="font-size:13px; margin-bottom:8px;"><strong>📊 预演结果（尚未写入，确认后才落库）：</strong></p>
          <p style="font-size:12px; color:#1890ff; margin-bottom:8px;">${result.summaryText}</p>
          <div style="display:flex; flex-wrap:wrap; gap:6px; font-size:12px;">
            ${s.newShifts > 0 ? `<span style="background:#52c41a; color:#fff; padding:2px 8px; border-radius:10px;">新增班次 ${s.newShifts}</span>` : ''}
            ${s.overwrittenShifts > 0 ? `<span style="background:#ff4d4f; color:#fff; padding:2px 8px; border-radius:10px;">覆盖班次 ${s.overwrittenShifts}</span>` : ''}
            ${s.mergedShifts > 0 ? `<span style="background:#faad14; color:#fff; padding:2px 8px; border-radius:10px;">合并班次 ${s.mergedShifts}</span>` : ''}
            ${s.skippedShifts > 0 ? `<span style="background:#8c8c8c; color:#fff; padding:2px 8px; border-radius:10px;">跳过 ${s.skippedShifts}</span>` : ''}
            ${s.affectedInventories > 0 ? `<span style="background:#1890ff; color:#fff; padding:2px 8px; border-radius:10px;">影响盘点 ${s.affectedInventories}</span>` : ''}
            ${s.affectedDiscrepancies > 0 ? `<span style="background:#722ed1; color:#fff; padding:2px 8px; border-radius:10px;">影响差异 ${s.affectedDiscrepancies}</span>` : ''}
            ${s.newDrugs > 0 ? `<span style="background:#52c41a; color:#fff; padding:2px 8px; border-radius:10px;">新增药品 ${s.newDrugs}</span>` : ''}
            ${s.overwrittenDrugs > 0 ? `<span style="background:#ff4d4f; color:#fff; padding:2px 8px; border-radius:10px;">覆盖药品 ${s.overwrittenDrugs}</span>` : ''}
            ${s.importAuditLogs > 0 ? `<span style="background:#722ed1; color:#fff; padding:2px 8px; border-radius:10px;">导入审计 ${s.importAuditLogs}</span>` : ''}
          </div>
          <p style="font-size:11px; color:#595959; margin-top:10px;"><strong>冲突处理决定：</strong>共 ${resolutions.length} 项
            ${resolutions.length > 0 ? `（覆盖:${resolutions.filter(r => r.strategy === 'overwrite').length} / 跳过:${resolutions.filter(r => r.strategy === 'skip').length} / 合并:${resolutions.filter(r => r.strategy === 'merge').length}）` : ''}
          </p>
        </div>
      `;
    } else {
      area.innerHTML = `<div class="alert alert-error" style="font-size:12px;">${result.message}</div>`;
    }
  }

  function renderBackupConflictArea(container, conflicts, backupInfo) {
    const total = conflicts.shifts.length + conflicts.corrections.length + conflicts.drugs.length;

    if (total === 0) {
      container.innerHTML = `
        <div class="alert alert-success" style="font-size:12px; margin:0;">
          <strong>✓ 无冲突</strong>：备份与本地数据无重复班次/修正/药品冲突，可直接恢复。
        </div>
      `;
      return;
    }

    let html = `
      <div class="alert alert-error" style="font-size:12px; margin-bottom:10px;">
        <strong>⚠️ 检测到 ${total} 项冲突，请逐项选择处理策略（改变后重新计算预演）：</strong>
      </div>
    `;

    if (conflicts.shifts.length > 0) {
      html += `<h5 style="margin:10px 0 6px; color:#ff4d4f; font-size:13px;">班次名称冲突 (${conflicts.shifts.length})</h5>`;
      conflicts.shifts.forEach((c, idx) => {
        html += `
          <div style="background:#fafafa; padding:8px 10px; border-radius:4px; margin-bottom:6px; font-size:12px;">
            <p style="margin-bottom:4px;"><strong>${c.importedName}</strong></p>
            <p style="color:#8c8c8c; margin-bottom:6px;">备份：${c.imported.createdAtFormatted} | 本地：${c.existing.createdAtFormatted}</p>
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              <label style="font-size:12px; cursor:pointer;"><input type="radio" name="bk_shift_conflict_${idx}" value="skip" checked onchange="App.refreshBackupPreview()"> 跳过(保留本地)</label>
              <label style="font-size:12px; cursor:pointer;"><input type="radio" name="bk_shift_conflict_${idx}" value="overwrite" onchange="App.refreshBackupPreview()"> 覆盖</label>
              <label style="font-size:12px; cursor:pointer;"><input type="radio" name="bk_shift_conflict_${idx}" value="merge" onchange="App.refreshBackupPreview()"> 合并</label>
            </div>
          </div>
        `;
      });
    }

    if (conflicts.corrections.length > 0) {
      html += `<h5 style="margin:10px 0 6px; color:#faad14; font-size:13px;">重复修正记录 (${conflicts.corrections.length})</h5>`;
      conflicts.corrections.forEach((c, idx) => {
        html += `
          <div style="background:#fafafa; padding:8px 10px; border-radius:4px; margin-bottom:6px; font-size:12px;">
            <p style="margin-bottom:4px;"><strong>${c.importedDiscrepancyDrug}</strong>: ${c.correction.oldActualQuantity} → ${c.correction.newActualQuantity}</p>
            <p style="color:#8c8c8c; margin-bottom:6px;">申请人：${c.correction.requestedByName} | ${c.correction.requestedAtFormatted}</p>
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              <label style="font-size:12px; cursor:pointer;"><input type="radio" name="bk_corr_conflict_${idx}" value="skip" checked onchange="App.refreshBackupPreview()"> 跳过</label>
              <label style="font-size:12px; cursor:pointer;"><input type="radio" name="bk_corr_conflict_${idx}" value="overwrite" onchange="App.refreshBackupPreview()"> 覆盖</label>
              <label style="font-size:12px; cursor:pointer;"><input type="radio" name="bk_corr_conflict_${idx}" value="merge" onchange="App.refreshBackupPreview()"> 合并</label>
            </div>
          </div>
        `;
      });
    }

    if (conflicts.drugs.length > 0) {
      html += `<h5 style="margin:10px 0 6px; color:#1890ff; font-size:13px;">药品内容冲突 (${conflicts.drugs.length})</h5>`;
      conflicts.drugs.forEach((c, idx) => {
        html += `
          <div style="background:#fafafa; padding:8px 10px; border-radius:4px; margin-bottom:6px; font-size:12px;">
            <p style="margin-bottom:4px;"><strong>${c.drugCode}</strong>: 本地「${c.existing.name}」 vs 备份「${c.imported.name}」</p>
            <p style="color:#8c8c8c; margin-bottom:6px;">规格/数量不一致，保留本地或覆盖</p>
            <div style="display:flex; gap:12px; flex-wrap:wrap;">
              <label style="font-size:12px; cursor:pointer;"><input type="radio" name="bk_drug_conflict_${idx}" value="skip" checked onchange="App.refreshBackupPreview()"> 跳过(保留本地)</label>
              <label style="font-size:12px; cursor:pointer;"><input type="radio" name="bk_drug_conflict_${idx}" value="overwrite" onchange="App.refreshBackupPreview()"> 覆盖</label>
              <label style="font-size:12px; cursor:pointer;"><input type="radio" name="bk_drug_conflict_${idx}" value="merge" onchange="App.refreshBackupPreview()"> 合并</label>
            </div>
          </div>
        `;
      });
    }

    container.innerHTML = html;
  }

  function collectBackupConflictResolutions() {
    const resolutions = [];
    if (!backupPendingConflicts) return resolutions;

    backupPendingConflicts.shifts.forEach((c, idx) => {
      const radios = document.getElementsByName('bk_shift_conflict_' + idx);
      let strategy = 'skip';
      radios.forEach(r => { if (r.checked) strategy = r.value; });
      resolutions.push(ExportModule.resolveConflictStrategy(c, strategy));
    });
    backupPendingConflicts.corrections.forEach((c, idx) => {
      const radios = document.getElementsByName('bk_corr_conflict_' + idx);
      let strategy = 'skip';
      radios.forEach(r => { if (r.checked) strategy = r.value; });
      resolutions.push(ExportModule.resolveConflictStrategy(c, strategy));
    });
    backupPendingConflicts.drugs.forEach((c, idx) => {
      const radios = document.getElementsByName('bk_drug_conflict_' + idx);
      let strategy = 'skip';
      radios.forEach(r => { if (r.checked) strategy = r.value; });
      resolutions.push(ExportModule.resolveConflictStrategy(c, strategy));
    });
    return resolutions;
  }

  function applyBackupRestore() {
    const resolutions = backupPendingConflicts
      ? collectBackupConflictResolutions()
      : [];
    const total = resolutions.length;
    const overwriteCount = resolutions.filter(r => r.strategy === 'overwrite').length;
    const skipCount = resolutions.filter(r => r.strategy === 'skip').length;
    const mergeCount = resolutions.filter(r => r.strategy === 'merge').length;

    let confirmMsg = `确认执行恢复？\n\n恢复范围：${selectedDataBlocks.length}/${ExportModule.getAllDataBlocks().length} 个数据块`;
    if (total > 0) {
      confirmMsg += `\n\n冲突处理（共 ${total} 项）：\n  • 覆盖：${overwriteCount}\n  • 跳过：${skipCount}\n  • 合并：${mergeCount}`;
    }
    confirmMsg += '\n\n恢复失败会自动回滚，但仍建议确认备份后再操作。';
    if (!confirm(confirmMsg)) {
      return;
    }

    const backupInfo = Storage.getBackupById(selectedBackupId);
    if (!backupInfo || !backupInfo.backupData) {
      alert('备份数据不存在');
      return;
    }

    if (selectedDataBlocks.length === 0) {
      alert('请至少选择一个数据块');
      return;
    }

    const allBlocks = ExportModule.getAllDataBlocks();
    const isFull = selectedDataBlocks.length === allBlocks.length;

    let result;
    if (isFull) {
      result = ExportModule.applyBackup(backupInfo.backupData, resolutions);
    } else {
      result = ExportModule.applyPartialBackup(
        backupInfo.backupData,
        selectedDataBlocks,
        resolutions
      );
    }

    if (result.success) {
      const summaryText = result.summary || '恢复成功';
      const record = result.restoreRecord;
      let detailMsg = summaryText;
      if (record && record.conflictResolutions && record.conflictResolutions.length > 0) {
        detailMsg += `\n\n冲突处理记录：\n${record.conflictResolutions.slice(0, 5).map(r => `  • [${r.strategy}] ${r.description}`).join('\n')}`;
        if (record.conflictResolutions.length > 5) {
          detailMsg += `\n  （还有 ${record.conflictResolutions.length - 5} 项，详见恢复记录）`;
        }
      }
      detailMsg += '\n\n恢复记录ID: ' + result.restoreRecordId;
      alert('✅ ' + detailMsg);
      closeBackupDetail();
      location.reload();
    } else {
      if (result.businessConflicts) {
        let msg = '⚠️ 检测到业务冲突，请先处理：\n\n';
        result.businessConflicts.warnings.forEach(w => {
          msg += '• ' + w + '\n';
        });
        msg += '\n是否仍要继续恢复？（不建议）';
        if (confirm(msg)) {
          alert('为保证数据安全，存在业务冲突时不允许恢复。请先关班或处理完所有待办事项。');
        }
      } else {
        alert('❌ 恢复失败：' + result.message + (result.rolledBack ? '\n\n数据已自动回滚' : ''));
      }
    }
  }

  function showImportBackupModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'import-backup-modal';
    modal.innerHTML = `
      <div class="modal">
        <h3>导入备份文件</h3>
        <div class="alert alert-warning" style="font-size:12px; margin-bottom:16px;">
          选择从本系统导出的 .json 备份文件。导入后可在备份列表中查看和恢复。
        </div>
        <div class="form-group">
          <label>选择备份文件</label>
          <input type="file" id="import-file-input" accept=".json,application/json">
        </div>
        <div class="form-group">
          <label>备份名称（可选）</label>
          <input type="text" id="import-backup-name" placeholder="留空则使用默认名称">
        </div>
        <div class="form-group">
          <label>备注（可选）</label>
          <textarea id="import-backup-note" rows="2" placeholder="导入说明"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-default" onclick="document.getElementById('import-backup-modal').remove()">取消</button>
          <button class="btn btn-primary" onclick="App.handleImportBackupFile()">导入</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function handleImportBackupFile() {
    const fileInput = document.getElementById('import-file-input');
    if (!fileInput.files || fileInput.files.length === 0) {
      alert('请选择备份文件');
      return;
    }

    const name = document.getElementById('import-backup-name').value.trim();
    const note = document.getElementById('import-backup-note').value.trim();

    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      const content = e.target.result;
      const parseResult = ExportModule.parseBackupFile(content);

      if (!parseResult.success) {
        alert('导入失败：' + parseResult.message);
        return;
      }

      const backup = parseResult.backup;
      const user = Auth.getCurrentUser();

      const currentShift = backup.data.currentShift;
      const history = backup.data.shiftHistory || [];
      const allShifts = history.slice();
      if (currentShift) allShifts.push(currentShift);

      const invMap = backup.data.inventory || {};
      const discMap = backup.data.discrepancies || {};

      let totalDiscrepancies = 0;
      let totalCorrections = 0;
      let pendingCorrections = 0;
      Object.values(discMap).forEach(list => {
        totalDiscrepancies += list.length;
        list.forEach(d => {
          if (d.corrections) {
            totalCorrections += d.corrections.length;
            pendingCorrections += d.corrections.filter(c => c.status === 'pending').length;
          }
        });
      });

      const summary = {
        shiftCount: allShifts.length,
        hasActiveShift: allShifts.some(s => s.status && s.status !== 'closed'),
        activeShiftName: currentShift ? currentShift.name : null,
        drugCount: (backup.data.drugs || []).length,
        inventoryShiftCount: Object.keys(invMap).length,
        totalInventoryItems: Object.values(invMap).reduce((sum, arr) => sum + arr.length, 0),
        totalDiscrepancies: totalDiscrepancies,
        totalCorrections: totalCorrections,
        pendingCorrections: pendingCorrections,
        auditLogCount: (backup.data.auditLogs || []).length
      };

      const backupInfo = Storage.addBackupToHistory({
        name: name || ('导入备份-' + Storage.formatDateTime(new Date())),
        note: note || '从文件导入',
        version: backup.version,
        exportedAt: backup.exportedAt,
        exportedAtFormatted: backup.exportedAtFormatted,
        createdBy: user ? { id: user.id, name: user.name, role: user.role } : null,
        importedFrom: backup.exportedBy || null,
        summary: summary,
        backupData: backup
      });

      Storage.addAuditLog(
        '导入备份文件',
        `导入备份「${backupInfo.name}」，包含${summary.shiftCount}个班次`,
        user
      );

      alert('✅ 导入成功！备份已加入本地备份列表。');
      document.getElementById('import-backup-modal').remove();
      renderBackupCenter(document.getElementById('tab-content'));
    };
    reader.readAsText(file, 'UTF-8');
  }

  function renderRestoreDraftsView(container) {
    const result = ExportModule.listRestoreDrafts(restoreDraftFilters);
    const drafts = result.success ? result.drafts : [];
    const isPharmacist = Auth.isPharmacist();

    container.innerHTML = `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="margin:0;">恢复草案 <span style="font-size:12px; color:#8c8c8c;">(${drafts.length})</span></h3>
          <div style="display:flex; gap:8px;">
            ${isPharmacist ? `
              <button class="btn btn-primary btn-sm" onclick="App.showCreateDraftModal()">+ 创建草案</button>
              <button class="btn btn-default btn-sm" onclick="App.showCreateDraftFromBackup()">📥 从备份创建</button>
            ` : ''}
          </div>
        </div>

        <div class="backup-filter-bar">
          <input type="text" class="backup-filter-input"
                 placeholder="🔍 搜索草案名称、备注、创建人..."
                 value="${restoreDraftFilters.keyword}"
                 oninput="App.filterRestoreDraftsUI('keyword', this.value)">
          <select class="backup-filter-select" onchange="App.filterRestoreDraftsUI('status', this.value)">
            <option value="">全部状态</option>
            <option value="draft" ${restoreDraftFilters.status === 'draft' ? 'selected' : ''}>草稿中</option>
            <option value="executed" ${restoreDraftFilters.status === 'executed' ? 'selected' : ''}>已执行</option>
            <option value="undone" ${restoreDraftFilters.status === 'undone' ? 'selected' : ''}>已撤回</option>
          </select>
          <button class="btn btn-default btn-sm" onclick="App.clearRestoreDraftFilters()">重置</button>
        </div>

        <p style="font-size:12px; color:#8c8c8c; margin:12px 0;">
          共 ${drafts.length} 条草案
        </p>

        ${drafts.length === 0 ? `
          <div class="empty-state">暂无恢复草案</div>
        ` : `
          <div class="restore-records-list">
            ${drafts.map(d => renderRestoreDraftCard(d)).join('')}
          </div>
        `}
      </div>

      <div id="restore-draft-detail-modal"></div>
    `;
  }

  function renderRestoreDraftCard(draft) {
    const isPharmacist = Auth.isPharmacist();
    let statusBadge = '';
    if (draft.status === 'draft') {
      statusBadge = '<span style="background:#fffbe6; color:#faad14; border:1px solid #ffe58f; padding:2px 8px; border-radius:10px; font-size:11px;">草稿中</span>';
    } else if (draft.status === 'executed') {
      statusBadge = '<span style="background:#f6ffed; color:#52c41a; border:1px solid #b7eb8f; padding:2px 8px; border-radius:10px; font-size:11px;">已执行</span>';
    } else if (draft.status === 'undone') {
      statusBadge = '<span style="background:#fafafa; color:#8c8c8c; border:1px solid #d9d9d9; padding:2px 8px; border-radius:10px; font-size:11px;">已撤回</span>';
    }

    const allBlocks = ExportModule.getAllDataBlocks();
    const blockTags = (draft.dataBlocks || []).map(b => {
      return `<span style="display:inline-block; background:#f0f0f0; border-radius:3px; padding:1px 6px; font-size:11px; margin:2px 2px;">${getBlockIcon(b)} ${ExportModule.getDataBlockLabel(b)}</span>`;
    }).join('');

    let actionsHtml = '';
    if (draft.status === 'draft' && isPharmacist) {
      actionsHtml = `
        <div style="margin-top:8px; display:flex; gap:6px;">
          <button class="btn btn-default btn-sm" onclick="event.stopPropagation(); App.showEditDraftModal('${draft.id}')">编辑</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); App.handleDeleteDraft('${draft.id}')">删除</button>
          <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); App.handleSubmitDraft('${draft.id}')">提交执行</button>
        </div>
      `;
    }
    if (draft.status === 'executed' && draft.restoreRecordId) {
      actionsHtml = `
        <div style="margin-top:8px;">
          <button class="btn btn-default btn-sm" onclick="event.stopPropagation(); App.viewRestoreRecordDetail('${draft.restoreRecordId}')">查看恢复记录</button>
        </div>
      `;
    }

    return `
      <div class="restore-record-card" style="cursor:default;">
        <div class="record-card-header">
          <div class="record-card-title">
            ${statusBadge}
            <span style="margin-left:8px; font-weight:500;">${draft.name || '未命名草案'}</span>
          </div>
          <div class="record-card-meta">
            <span class="record-time">${draft.createdAtFormatted || '-'}</span>
            <span class="record-operator">${draft.createdBy ? draft.createdBy.name : '未知'}</span>
          </div>
        </div>
        <div class="record-card-body">
          <div style="margin-bottom:6px;">${blockTags}</div>
          ${draft.conflictResolutions && draft.conflictResolutions.length > 0 ? `
            <span style="font-size:11px; color:#faad14;">冲突策略 ${draft.conflictResolutions.length} 项</span>
          ` : ''}
          ${draft.note ? `<p style="font-size:12px; color:#8c8c8c; margin-top:4px;">📝 ${draft.note}</p>` : ''}
          ${actionsHtml}
        </div>
      </div>
    `;
  }

  function showCreateDraftModal() {
    if (!Auth.canCreateRestoreDraft()) {
      alert('只有药师可以创建恢复草案');
      return;
    }

    const allBlocks = ExportModule.getAllDataBlocks();
    const backupHistory = Storage.getBackupHistory();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'create-draft-modal';
    modal.innerHTML = `
      <div class="modal">
        <h3>创建恢复草案</h3>
        <div class="form-group">
          <label>草案名称</label>
          <input type="text" id="draft-name-input" placeholder="例如：早班恢复方案">
        </div>
        <div class="form-group">
          <label>备注（可选）</label>
          <textarea id="draft-note-input" rows="3" placeholder="记录草案说明"></textarea>
        </div>
        <div class="form-group">
          <label>数据块选择</label>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${allBlocks.map(b => `
              <label style="font-size:13px; cursor:pointer;">
                <input type="checkbox" class="draft-block-checkbox" value="${b}" checked>
                ${getBlockIcon(b)} ${ExportModule.getDataBlockLabel(b)}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>关联备份（可选）</label>
          <select id="draft-backup-select" style="width:100%;">
            <option value="">不关联备份</option>
            ${backupHistory.map(b => `
              <option value="${b.id}">${b.name || '未命名'} (${b.createdAtFormatted})</option>
            `).join('')}
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-default" onclick="document.getElementById('create-draft-modal').remove()">取消</button>
          <button class="btn btn-primary" onclick="App.handleCreateDraft()">保存草案</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function showCreateDraftFromBackup() {
    if (!Auth.canCreateRestoreDraft()) {
      alert('只有药师可以创建恢复草案');
      return;
    }
    showCreateDraftModal();
  }

  function handleCreateDraft() {
    const name = document.getElementById('draft-name-input').value.trim();
    const note = document.getElementById('draft-note-input').value.trim();
    const checkboxes = document.querySelectorAll('.draft-block-checkbox');
    const dataBlocks = [];
    checkboxes.forEach(cb => { if (cb.checked) dataBlocks.push(cb.value); });

    const backupSelect = document.getElementById('draft-backup-select');
    const backupId = backupSelect ? backupSelect.value : '';
    let backupInfo = null;
    if (backupId) {
      const bi = Storage.getBackupById(backupId);
      if (bi) {
        backupInfo = {
          id: bi.id,
          version: bi.version,
          exportedAt: bi.exportedAt,
          exportedAtFormatted: bi.exportedAtFormatted,
          exportedBy: bi.createdBy || null,
          summary: bi.summary || null,
          backupId: bi.id
        };
      }
    }

    const result = ExportModule.createRestoreDraft({
      name: name,
      note: note,
      dataBlocks: dataBlocks,
      conflictResolutions: [],
      backupInfo: backupInfo
    });

    if (result.success) {
      document.getElementById('create-draft-modal').remove();
      renderRestoreDraftsView(document.getElementById('backup-subtab-content'));
    } else {
      alert('创建失败：' + result.message);
    }
  }

  function showEditDraftModal(draftId) {
    if (!Auth.canEditRestoreDraft()) {
      alert('只有药师可以编辑恢复草案');
      return;
    }

    const result = ExportModule.getRestoreDraft(draftId);
    if (!result.success) {
      alert(result.message);
      return;
    }
    const draft = result.draft;
    const allBlocks = ExportModule.getAllDataBlocks();
    const backupHistory = Storage.getBackupHistory();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'edit-draft-modal';
    modal.innerHTML = `
      <div class="modal">
        <h3>编辑恢复草案</h3>
        <div class="form-group">
          <label>草案名称</label>
          <input type="text" id="edit-draft-name" value="${draft.name || ''}">
        </div>
        <div class="form-group">
          <label>备注</label>
          <textarea id="edit-draft-note" rows="3">${draft.note || ''}</textarea>
        </div>
        <div class="form-group">
          <label>数据块选择</label>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${allBlocks.map(b => `
              <label style="font-size:13px; cursor:pointer;">
                <input type="checkbox" class="edit-draft-block-checkbox" value="${b}" ${draft.dataBlocks && draft.dataBlocks.includes(b) ? 'checked' : ''}>
                ${getBlockIcon(b)} ${ExportModule.getDataBlockLabel(b)}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>关联备份</label>
          <select id="edit-draft-backup-select" style="width:100%;">
            <option value="">不关联备份</option>
            ${backupHistory.map(b => `
              <option value="${b.id}" ${draft.backupInfo && draft.backupInfo.backupId === b.id ? 'selected' : ''}>${b.name || '未命名'} (${b.createdAtFormatted})</option>
            `).join('')}
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-default" onclick="document.getElementById('edit-draft-modal').remove()">取消</button>
          <button class="btn btn-primary" onclick="App.handleUpdateDraft('${draftId}')">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function handleUpdateDraft(draftId) {
    const name = document.getElementById('edit-draft-name').value.trim();
    const note = document.getElementById('edit-draft-note').value.trim();
    const checkboxes = document.querySelectorAll('.edit-draft-block-checkbox');
    const dataBlocks = [];
    checkboxes.forEach(cb => { if (cb.checked) dataBlocks.push(cb.value); });

    const backupSelect = document.getElementById('edit-draft-backup-select');
    const backupId = backupSelect ? backupSelect.value : '';
    let backupInfo = null;
    if (backupId) {
      const bi = Storage.getBackupById(backupId);
      if (bi) {
        backupInfo = {
          id: bi.id,
          version: bi.version,
          exportedAt: bi.exportedAt,
          exportedAtFormatted: bi.exportedAtFormatted,
          exportedBy: bi.createdBy || null,
          summary: bi.summary || null,
          backupId: bi.id
        };
      }
    }

    const result = ExportModule.updateRestoreDraft(draftId, {
      name: name,
      note: note,
      dataBlocks: dataBlocks,
      conflictResolutions: [],
      backupInfo: backupInfo
    });

    if (result.success) {
      document.getElementById('edit-draft-modal').remove();
      renderRestoreDraftsView(document.getElementById('backup-subtab-content'));
    } else {
      alert('更新失败：' + result.message);
    }
  }

  function handleDeleteDraft(draftId) {
    if (!confirm('确认删除此恢复草案？此操作不可恢复。')) {
      return;
    }
    const result = ExportModule.deleteRestoreDraft(draftId);
    if (result.success) {
      renderRestoreDraftsView(document.getElementById('backup-subtab-content'));
    } else {
      alert('删除失败：' + result.message);
    }
  }

  function handleSubmitDraft(draftId) {
    if (!Auth.isPharmacist()) {
      alert('只有药师可以提交恢复草案');
      return;
    }

    const draftResult = ExportModule.getRestoreDraft(draftId);
    if (!draftResult.success) {
      alert(draftResult.message);
      return;
    }
    const draft = draftResult.draft;

    let confirmMsg = `确认提交并执行恢复草案？\n\n草案名称：${draft.name || '未命名'}\n数据块：${(draft.dataBlocks || []).map(b => ExportModule.getDataBlockLabel(b)).join('、')}\n`;
    if (draft.conflictResolutions && draft.conflictResolutions.length > 0) {
      confirmMsg += `冲突策略：${draft.conflictResolutions.length} 项\n`;
    }
    confirmMsg += '\n执行后数据将被修改，确认继续？';
    if (!confirm(confirmMsg)) {
      return;
    }

    let backupData = null;
    if (draft.backupInfo && draft.backupInfo.backupId) {
      const backupInfo = Storage.getBackupById(draft.backupInfo.backupId);
      if (backupInfo && backupInfo.backupData) {
        backupData = backupInfo.backupData;
      }
    }

    if (!backupData) {
      alert('无法获取关联的备份数据，请先编辑草案关联一个有效备份。');
      return;
    }

    const result = ExportModule.submitRestoreDraft(draftId, backupData);
    if (result.success) {
      alert('✅ 恢复草案已执行成功！\n恢复记录ID: ' + (result.restoreRecordId || ''));
      renderRestoreDraftsView(document.getElementById('backup-subtab-content'));
    } else {
      alert('执行失败：' + result.message);
    }
  }

  function filterRestoreDraftsUI(key, value) {
    restoreDraftFilters[key] = value;
    renderRestoreDraftsView(document.getElementById('backup-subtab-content'));
  }

  function clearRestoreDraftFilters() {
    restoreDraftFilters = { keyword: '', status: '' };
    renderRestoreDraftsView(document.getElementById('backup-subtab-content'));
  }

  let selectedRestoreRecordId = null;

  function renderRestoreRecordsView(container) {
    const filterResult = ExportModule.filterRestoreRecords(restoreRecordFilters);
    const records = filterResult.success ? filterResult.records : [];
    const allRecords = ExportModule.getRestoreRecords();
    const lastInfo = ExportModule.getLastRestoreInfo();
    const canUndo = lastInfo && lastInfo.hasUndoableSnapshot && Auth.canUndoRestore();
    const allBlocks = ExportModule.getAllDataBlocks();

    const operatorNames = [];
    const nameSet = new Set();
    allRecords.forEach(r => {
      if (r.restoredBy && r.restoredBy.name && !nameSet.has(r.restoredBy.name)) {
        nameSet.add(r.restoredBy.name);
        operatorNames.push(r.restoredBy.name);
      }
    });

    container.innerHTML = `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="margin:0;">恢复操作记录</h3>
          <div style="display:flex; gap:8px; align-items:center;">
            <span style="font-size:12px; color:#8c8c8c;">共 ${records.length} 条记录</span>
            ${canUndo ? `
              <button class="btn btn-warning btn-sm" onclick="App.handleUndoRestore()">
                ↩️ 撤回最近恢复
              </button>
            ` : ''}
          </div>
        </div>

        <div class="backup-filter-bar">
          <input type="text" class="backup-filter-input"
                 placeholder="🔍 搜索操作人、备份导出人..."
                 value="${restoreRecordFilters.keyword}"
                 oninput="App.filterRestoreRecordsUI('keyword', this.value)">
          <select class="backup-filter-select" onchange="App.filterRestoreRecordsUI('operatorName', this.value)">
            <option value="">全部操作人</option>
            ${operatorNames.map(n => `
              <option value="${n}" ${restoreRecordFilters.operatorName === n ? 'selected' : ''}>${n}</option>
            `).join('')}
          </select>
          <select class="backup-filter-select" onchange="App.filterRestoreRecordsUI('dataBlock', this.value)">
            <option value="">全部数据块</option>
            ${allBlocks.map(b => `
              <option value="${b}" ${restoreRecordFilters.dataBlock === b ? 'selected' : ''}>${ExportModule.getDataBlockLabel(b)}</option>
            `).join('')}
          </select>
          <select class="backup-filter-select" onchange="App.filterRestoreRecordsUI('undone', this.value)">
            <option value="">全部状态</option>
            <option value="false" ${restoreRecordFilters.undone === 'false' ? 'selected' : ''}>未撤回</option>
            <option value="true" ${restoreRecordFilters.undone === 'true' ? 'selected' : ''}>已撤回</option>
          </select>
          <input type="date" class="backup-filter-input"
                 value="${restoreRecordFilters.startDate}"
                 onchange="App.filterRestoreRecordsUI('startDate', this.value)">
          <input type="date" class="backup-filter-input"
                 value="${restoreRecordFilters.endDate}"
                 onchange="App.filterRestoreRecordsUI('endDate', this.value)">
          <button class="btn btn-default btn-sm" onclick="App.clearRestoreRecordFilters()">重置</button>
        </div>

        <p style="font-size:12px; color:#8c8c8c; margin:12px 0;">
          筛选结果：${records.length} / ${allRecords.length} 条记录
        </p>

        ${records.length === 0 ? `
          <div class="empty-state">暂无恢复操作记录</div>
        ` : `
          <div class="restore-records-list">
            ${records.map(r => renderRestoreRecordCard(r)).join('')}
          </div>
        `}
      </div>

      <div id="restore-record-detail-modal"></div>
    `;
  }

  function renderRestoreRecordCard(record) {
    const isSelected = selectedRestoreRecordId === record.id;
    const changeSummary = ExportModule.buildRestoreChangeSummary(record);
    const isSuccess = record.status === 'success';
    const isUndone = record.undone;

    let statusClass = 'record-status-success';
    let statusText = '恢复成功';
    if (!isSuccess) {
      statusClass = 'record-status-failed';
      statusText = '恢复失败';
    } else if (isUndone) {
      statusClass = 'record-status-undone';
      statusText = '已撤回';
    }

    return `
      <div class="restore-record-card ${isSelected ? 'selected' : ''} ${isUndone ? 'undone' : ''}"
           onclick="App.viewRestoreRecordDetail('${record.id}')">
        <div class="record-card-header">
          <div class="record-card-title">
            <span class="record-status-badge ${statusClass}">${statusText}</span>
            <span class="record-time">${record.timestampFormatted}</span>
          </div>
          <div class="record-card-meta">
            <span class="record-operator">${record.restoredBy ? record.restoredBy.name : '未知'}</span>
            <span class="record-type">${record.isPartial ? '部分恢复' : '完整恢复'}</span>
          </div>
        </div>
        <div class="record-card-body">
          <p class="record-summary">${changeSummary || '无详细变更记录'}</p>
          <div class="record-tags">
            ${record.dataBlocks ? record.dataBlocks.map(b => `
              <span class="record-tag">${ExportModule.getDataBlockLabel(b)}</span>
            `).join('') : ''}
            ${record.conflictResolutions && record.conflictResolutions.length > 0 ? `
              <span class="record-tag record-tag-conflict">
                冲突决策 ${record.conflictResolutions.length} 项
              </span>
            ` : ''}
          </div>
        </div>
        ${isUndone && record.undoneBy ? `
          <div class="record-card-footer">
            <span style="font-size:11px; color:#8c8c8c;">
              由 ${record.undoneBy.name} 于 ${record.undoneAtFormatted} 撤回
            </span>
          </div>
        ` : ''}
        ${!isSuccess && record.errorMessage ? `
          <div class="record-card-footer record-error">
            错误：${record.errorMessage}
          </div>
        ` : ''}
      </div>
    `;
  }

  function viewRestoreRecordDetail(recordId) {
    selectedRestoreRecordId = recordId;
    const detailResult = ExportModule.getRestoreRecordWithChanges(recordId);
    if (!detailResult || !detailResult.success) {
      alert('恢复记录不存在');
      return;
    }

    const record = detailResult.record;
    const changes = detailResult.changes;
    const changeSummary = ExportModule.buildRestoreChangeSummary(record);

    let changeCompareHtml = '';
    if (changes) {
      changeCompareHtml = `
        <div class="record-detail-section">
          <h4 style="margin:0 0 8px 0; font-size:14px; color:#262626;">变更对比</h4>
          <div style="display:flex; flex-wrap:wrap; gap:8px; font-size:12px;">
            ${changes.shifts ? `
              <div style="background:#f6ffed; padding:6px 10px; border-radius:4px; border:1px solid #b7eb8f;">
                <strong>班次：</strong>
                新增 ${changes.shifts.imported || 0} /
                覆盖 ${changes.shifts.overwritten || 0} /
                合并 ${changes.shifts.merged || 0} /
                跳过 ${changes.shifts.skipped || 0}
              </div>
            ` : ''}
            ${changes.drugs ? `
              <div style="background:#e6f7ff; padding:6px 10px; border-radius:4px; border:1px solid #91d5ff;">
                <strong>药品：</strong>
                新增/导入 ${changes.drugs.imported || 0} /
                覆盖 ${changes.drugs.overwritten || 0} /
                合并 ${changes.drugs.merged || 0}
              </div>
            ` : ''}
            ${changes.corrections ? `
              <div style="background:#fffbe6; padding:6px 10px; border-radius:4px; border:1px solid #ffe58f;">
                <strong>修正：</strong>
                覆盖 ${changes.corrections.overwritten || 0} /
                合并 ${changes.corrections.merged || 0}
              </div>
            ` : ''}
            ${changes.auditLogs ? `
              <div style="background:#f9f0ff; padding:6px 10px; border-radius:4px; border:1px solid #d3adf7;">
                <strong>审计日志：</strong>
                导入 ${changes.auditLogs.imported || 0}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    let draftInfoHtml = '';
    if (detailResult.draftInfo) {
      draftInfoHtml = `
        <div class="record-detail-section">
          <h4 style="margin:0 0 8px 0; font-size:14px; color:#262626;">草案信息</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">草案ID</span>
              <span class="detail-value">${detailResult.draftInfo.draftId || '-'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">草案名称</span>
              <span class="detail-value">${detailResult.draftInfo.draftName || '-'}</span>
            </div>
          </div>
        </div>
      `;
    }

    let auditTrailHtml = '';
    const auditLogs = Storage.getAuditLogs();
    const relatedLogs = auditLogs.filter(l => {
      if (l.details && l.details.includes(record.id)) return true;
      if (l.action && (l.action.includes('恢复') || l.action.includes('撤回')) && l.timestamp) {
        const logTime = new Date(l.timestamp).getTime();
        const recordTime = new Date(record.timestamp).getTime();
        return Math.abs(logTime - recordTime) < 60000;
      }
      return false;
    });
    if (relatedLogs.length > 0) {
      auditTrailHtml = `
        <div class="record-detail-section">
          <h4 style="margin:0 0 8px 0; font-size:14px; color:#262626;">审计追踪</h4>
          <div style="font-size:12px;">
            ${relatedLogs.slice(0, 10).map(l => `
              <div style="padding:4px 0; border-bottom:1px solid #f0f0f0;">
                <span style="color:#8c8c8c;">${l.timestampFormatted}</span>
                <span style="margin:0 6px;">${l.userName || '系统'}</span>
                <span style="color:#595959;">${l.action}：${l.details}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    let undoWarningHtml = '';
    if (record.undone && record.undoneBy) {
      undoWarningHtml = `
        <div class="record-detail-section undone-section">
          <h4 style="margin:0 0 8px 0; font-size:14px; color:#262626;">撤回信息</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">撤回时间</span>
              <span class="detail-value">${record.undoneAtFormatted || '-'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">撤回人</span>
              <span class="detail-value">${record.undoneBy.name + ' (' + record.undoneBy.role + ')'}</span>
            </div>
          </div>
          <div class="alert alert-error" style="margin-top:8px; font-size:12px;">
            ⚠️ <strong>不可二次撤回</strong>：该恢复已被撤回，无法再次撤回。
          </div>
        </div>
      `;
    }

    const modal = document.getElementById('restore-record-detail-modal');
    modal.innerHTML = `
      <div class="modal-overlay" style="z-index:1000;">
        <div class="modal" style="max-width:600px; max-height:85vh; overflow-y:auto;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="margin:0;">📋 恢复记录详情</h3>
            <button class="btn btn-default btn-sm" onclick="App.closeRestoreRecordDetail()">关闭</button>
          </div>

          <div class="record-detail-section">
            <h4 style="margin:0 0 8px 0; font-size:14px; color:#262626;">基本信息</h4>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">记录ID</span>
                <span class="detail-value">${record.id}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">执行时间</span>
                <span class="detail-value">${record.timestampFormatted}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">操作人</span>
                <span class="detail-value">${record.restoredBy ? record.restoredBy.name + ' (' + record.restoredBy.role + ')' : '未知'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">恢复类型</span>
                <span class="detail-value">${record.isPartial ? '部分恢复' : '完整恢复'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">状态</span>
                <span class="detail-value">
                  ${record.status === 'success'
                    ? (record.undone ? '<span style="color:#8c8c8c;">已撤回</span>' : '<span style="color:#52c41a;">成功</span>')
                    : `<span style="color:#ff4d4f;">失败</span>`}
                </span>
              </div>
              <div class="detail-item">
                <span class="detail-label">备份版本</span>
                <span class="detail-value">${record.backupVersion || '-'}</span>
              </div>
            </div>
          </div>

          <div class="record-detail-section">
            <h4 style="margin:0 0 8px 0; font-size:14px; color:#262626;">来源备份</h4>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">备份导出时间</span>
                <span class="detail-value">${record.backupExportedAtFormatted || '-'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">备份导出人</span>
                <span class="detail-value">${record.backupExportedBy ? record.backupExportedBy.name + ' (' + record.backupExportedBy.role + ')' : '未知'}</span>
              </div>
            </div>
          </div>

          <div class="record-detail-section">
            <h4 style="margin:0 0 8px 0; font-size:14px; color:#262626;">恢复数据块</h4>
            <div class="datablock-tags">
              ${record.dataBlocks ? record.dataBlocks.map(b => `
                <span class="datablock-tag">${getBlockIcon(b)} ${ExportModule.getDataBlockLabel(b)}</span>
              `).join('') : '-'}
            </div>
          </div>

          ${changeCompareHtml}

          ${record.results ? `
            <div class="record-detail-section">
              <h4 style="margin:0 0 8px 0; font-size:14px; color:#262626;">实际改动摘要</h4>
              <p style="font-size:13px; color:#595959; margin-bottom:8px;">${changeSummary || '-'}</p>
              <div class="result-stats">
                ${record.results.importedShifts ? `
                  <div class="result-stat stat-new">
                    <span class="result-stat-value">${record.results.importedShifts}</span>
                    <span class="result-stat-label">新增班次</span>
                  </div>
                ` : ''}
                ${record.results.overwrittenShifts ? `
                  <div class="result-stat stat-overwrite">
                    <span class="result-stat-value">${record.results.overwrittenShifts}</span>
                    <span class="result-stat-label">覆盖班次</span>
                  </div>
                ` : ''}
                ${record.results.mergedShifts ? `
                  <div class="result-stat stat-merge">
                    <span class="result-stat-value">${record.results.mergedShifts}</span>
                    <span class="result-stat-label">合并班次</span>
                  </div>
                ` : ''}
                ${record.results.skippedShifts ? `
                  <div class="result-stat stat-skip">
                    <span class="result-stat-value">${record.results.skippedShifts}</span>
                    <span class="result-stat-label">跳过班次</span>
                  </div>
                ` : ''}
                ${record.results.importedDrugs ? `
                  <div class="result-stat stat-new">
                    <span class="result-stat-value">${record.results.importedDrugs}</span>
                    <span class="result-stat-label">新增药品</span>
                  </div>
                ` : ''}
                ${record.results.overwrittenDrugs ? `
                  <div class="result-stat stat-overwrite">
                    <span class="result-stat-value">${record.results.overwrittenDrugs}</span>
                    <span class="result-stat-label">覆盖药品</span>
                  </div>
                ` : ''}
                ${record.results.importedAuditLogs ? `
                  <div class="result-stat stat-audit">
                    <span class="result-stat-value">${record.results.importedAuditLogs}</span>
                    <span class="result-stat-label">导入审计</span>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}

          ${record.conflictResolutions && record.conflictResolutions.length > 0 ? `
            <div class="record-detail-section">
              <h4 style="margin:0 0 8px 0; font-size:14px; color:#262626;">
                冲突决策记录 (${record.conflictResolutions.length} 项)
              </h4>
              <div class="conflict-resolutions-list">
                ${record.conflictResolutions.map(cr => `
                  <div class="conflict-resolution-item">
                    <span class="cr-type ${cr.type}">${cr.type === 'shift_name_conflict' ? '班次冲突' : cr.type === 'drug_content_conflict' ? '药品冲突' : '修正冲突'}</span>
                    <span class="cr-target">${cr.target || '-'}</span>
                    <span class="cr-strategy strategy-${cr.strategy}">${cr.strategy === 'skip' ? '保留本地' : cr.strategy === 'overwrite' ? '覆盖' : '合并'}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          ${draftInfoHtml}
          ${auditTrailHtml}
          ${undoWarningHtml}

          ${!record.status === 'failed' && record.errorMessage ? `
            <div class="record-detail-section error-section">
              <h4 style="margin:0 0 8px 0; font-size:14px; color:#ff4d4f;">错误信息</h4>
              <p style="font-size:13px; color:#ff4d4f;">${record.errorMessage}</p>
            </div>
          ` : ''}

          <div class="modal-actions">
            <button class="btn btn-default" onclick="App.closeRestoreRecordDetail()">关闭</button>
            ${record.status === 'success' && !record.undone && Auth.canUndoRestore() ? `
              <button class="btn btn-warning" onclick="App.handleUndoRestore(); App.closeRestoreRecordDetail();">
                撤回此恢复
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    renderRestoreRecordsView(document.getElementById('backup-subtab-content'));
  }

  function closeRestoreRecordDetail() {
    const modal = document.getElementById('restore-record-detail-modal');
    if (modal) modal.innerHTML = '';
    selectedRestoreRecordId = null;
    renderRestoreRecordsView(document.getElementById('backup-subtab-content'));
  }

  function filterRestoreRecordsUI(key, value) {
    if (key === 'undone') {
      if (value === '') {
        delete restoreRecordFilters.undone;
      } else {
        restoreRecordFilters.undone = value === 'true';
      }
    } else {
      restoreRecordFilters[key] = value;
    }
    renderRestoreRecordsView(document.getElementById('backup-subtab-content'));
  }

  function clearRestoreRecordFilters() {
    restoreRecordFilters = { keyword: '', operatorName: '', dataBlock: '', undone: '', startDate: '', endDate: '' };
    renderRestoreRecordsView(document.getElementById('backup-subtab-content'));
  }

  function renderBackupSettings(container) {
    const settings = Storage.getBackupSettings();
    const historyCount = Storage.getBackupHistory().length;

    container.innerHTML = `
      <div class="card">
        <h3>备份设置</h3>

        <div class="form-group">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="setting-autoclean"
                   ${settings.autoCleanupEnabled ? 'checked' : ''}
                   onchange="App.saveBackupSetting('autoCleanupEnabled', this.checked)">
            启用自动清理过期备份
          </label>
        </div>

        <div class="form-group">
          <label>保留天数</label>
          <input type="number" id="setting-retention"
                 value="${settings.retentionDays}" min="1" max="365"
                 onchange="App.saveBackupSetting('retentionDays', parseInt(this.value) || 30)"
                 style="width:120px;">
          <span style="font-size:12px; color:#8c8c8c; margin-left:8px;">天（超过此天数的备份将被自动清理）</span>
        </div>

        <div class="form-group">
          <label>最大备份数量</label>
          <input type="number" id="setting-maxbackups"
                 value="${settings.maxBackups}" min="1" max="200"
                 onchange="App.saveBackupSetting('maxBackups', parseInt(this.value) || 50)"
                 style="width:120px;">
          <span style="font-size:12px; color:#8c8c8c; margin-left:8px;">份（超出数量时最早的备份将被清理）</span>
        </div>

        <div style="margin-top:20px; padding:12px; background:#f6ffed; border-radius:4px;">
          <p style="font-size:13px; margin:0 0 8px 0;">
            <strong>当前状态：</strong>
            本地存储 <strong>${historyCount}</strong> 份备份
          </p>
          <button class="btn btn-warning btn-sm" onclick="App.runCleanupNow()">立即执行清理</button>
          <button class="btn btn-danger btn-sm" onclick="App.clearAllBackups()">清空所有备份</button>
        </div>

        <div class="alert alert-info" style="margin-top:16px; font-size:12px;">
          <strong>💡 说明：</strong><br>
          • 备份数据保存在浏览器本地存储 (localStorage) 中<br>
          • 清理浏览器数据会导致备份丢失，重要数据请导出为文件保存<br>
          • 所有恢复操作均有审计日志和回滚机制
        </div>
      </div>
    `;
  }

  function saveBackupSetting(key, value) {
    const settings = {};
    settings[key] = value;
    Storage.saveBackupSettings(settings);
  }

  function runCleanupNow() {
    if (!confirm('确认立即执行备份清理？将根据保留规则删除过期和超出数量的备份。')) {
      return;
    }
    const result = Storage.cleanupExpiredBackups();
    alert(`清理完成：删除了 ${result.cleaned} 份备份，剩余 ${result.remaining} 份`);
    renderBackupCenter(document.getElementById('tab-content'));
  }

  function clearAllBackups() {
    if (!confirm('确认清空所有本地备份？此操作不可恢复！')) {
      return;
    }
    if (!confirm('再次确认：所有本地备份将被永久删除，是否继续？')) {
      return;
    }
    Storage.saveBackupHistory([]);
    alert('已清空所有本地备份');
    renderBackupCenter(document.getElementById('tab-content'));
  }

  function formatDateSimple(date) {
    const d = new Date(date);
    const pad = n => n.toString().padStart(2, '0');
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  function loadSampleData() {
    if (confirm('加载演示样例将清空所有现有数据，是否继续？')) {
      Storage.loadSampleData();
      alert('演示样例加载完成！');
      renderLogin();
    }
  }

  function resetData() {
    if (confirm('确定要重置所有数据吗？此操作不可恢复！')) {
      Storage.resetAllData();
      Storage.initializeDemoData();
      alert('数据已重置');
      renderLogin();
    }
  }

  let currentPendingBackup = null;
  let currentPendingConflicts = null;

  function showBackupOptions() {
    const user = Auth.getCurrentUser();
    const isPharmacist = user && user.role === 'pharmacist';
    const lastSnapshot = Storage.getLastRestoreSnapshot();
    const records = ExportModule.getRestoreRecords();
    const canUndo = isPharmacist && lastSnapshot && records.length > 0 && !records[0].undone;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'backup-modal';
    modal.innerHTML = `
      <div class="modal">
        <h3>数据备份与恢复</h3>
        <div class="form-group">
          <p style="font-size:13px; color:#595959; margin-bottom:16px;">
            导出完整数据备份（JSON格式），包含班次、盘点、差异、修正审批和审计日志。<br>
            恢复数据时将先预演变更，确认后再写入，并支持整体撤回。
          </p>
        </div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <button class="btn btn-primary" onclick="App.handleExportBackup()" style="width:100%;">
            📤 导出数据备份
          </button>
          <button class="btn btn-success" onclick="App.showImportBackupDialog()" style="width:100%;">
            📥 导入数据备份
          </button>
          <button class="btn btn-default" onclick="App.showRestoreRecords()" style="width:100%;">
            📋 查看恢复历史 (${records.length})
          </button>
          <button class="btn ${canUndo ? 'btn-warning' : 'btn-default'}"
                  onclick="App.handleUndoRestore()"
                  style="width:100%;"
                  ${canUndo ? '' : 'disabled'}>
            ↩️ 撤回最近恢复${canUndo ? '' : '（暂无可撤回记录）'}
          </button>
          <button class="btn btn-default" onclick="document.getElementById('backup-modal').remove()" style="width:100%;">
            关闭
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function handleExportBackup() {
    const user = Auth.getCurrentUser();
    if (!user) {
      alert('请先登录后再导出备份');
      return;
    }
    const result = ExportModule.downloadBackup();
    if (result.success) {
      alert('备份已导出：' + result.filename);
      const modal = document.getElementById('backup-modal');
      if (modal) modal.remove();
      if (Auth.isLoggedIn()) {
        renderApp();
      } else {
        renderLogin();
      }
    }
  }

  function showImportBackupDialog() {
    const user = Auth.getCurrentUser();
    if (!user) {
      alert('请先登录后再导入备份');
      return;
    }
    if (user.role !== 'pharmacist') {
      alert('只有药师可以执行数据恢复操作');
      return;
    }

    const oldModal = document.getElementById('backup-modal');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'import-modal';
    modal.innerHTML = `
      <div class="modal">
        <h3>导入数据备份</h3>
        <div class="alert alert-warning" style="margin-bottom:16px;">
          <strong>警告：</strong>请选择从本系统导出的合法备份文件（.json）。<br>
          护士无法通过导入修改审计链路或提升权限。
        </div>
        <div class="form-group">
          <label>选择备份文件</label>
          <input type="file" id="backup-file-input" accept=".json,application/json">
        </div>
        <div id="import-conflict-area"></div>
        <div class="modal-actions">
          <button class="btn btn-default" onclick="document.getElementById('import-modal').remove()">取消</button>
          <button class="btn btn-primary" onclick="App.handleParseBackupFile()">解析并预览</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  let currentPendingPreview = null;

  function handleParseBackupFile() {
    const fileInput = document.getElementById('backup-file-input');
    if (!fileInput.files || fileInput.files.length === 0) {
      alert('请先选择备份文件');
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      const content = e.target.result;
      const parseResult = ExportModule.parseBackupFile(content);

      if (!parseResult.success) {
        const area = document.getElementById('import-conflict-area');
        area.innerHTML = `<div class="alert alert-error" style="margin-top:16px;"><strong>❌ 无效备份：</strong>${parseResult.message}</div>`;
        return;
      }

      currentPendingBackup = parseResult.backup;
      currentPendingConflicts = parseResult.conflicts;

      const defaultResolutions = [];
      parseResult.conflicts.shifts.forEach(c => defaultResolutions.push(ExportModule.resolveConflictStrategy(c, 'skip')));
      parseResult.conflicts.corrections.forEach(c => defaultResolutions.push(ExportModule.resolveConflictStrategy(c, 'skip')));
      parseResult.conflicts.drugs.forEach(c => defaultResolutions.push(ExportModule.resolveConflictStrategy(c, 'skip')));

      const previewResult = ExportModule.preRestorePreview(parseResult.backup, defaultResolutions);
      currentPendingPreview = previewResult.success ? previewResult : null;

      renderConflictResolution(parseResult, previewResult);
    };
    reader.readAsText(file, 'UTF-8');
  }

  function renderConflictResolution(parseResult, previewResult) {
    const area = document.getElementById('import-conflict-area');
    const bk = parseResult.backup;
    const conflicts = parseResult.conflicts;

    const totalShifts = (bk.data.currentShift ? 1 : 0) + bk.data.shiftHistory.length;
    const totalAudit = bk.data.auditLogs.length;

    let previewHtml = '';
    if (previewResult && previewResult.success) {
      const s = previewResult.summary;
      previewHtml = `
        <div style="margin-top:16px; padding:12px; background:#e6f7ff; border:1px solid #91d5ff; border-radius:4px;">
          <p style="font-size:13px; margin-bottom:8px;"><strong>📊 恢复预演（尚未写入本地数据）：</strong></p>
          <p style="font-size:12px; color:#1890ff; margin-bottom:8px;">${previewResult.summaryText}</p>
          <div style="display:flex; flex-wrap:wrap; gap:8px; font-size:12px;">
            <span style="background:#52c41a; color:#fff; padding:2px 8px; border-radius:10px;">新增班次 ${s.newShifts}</span>
            <span style="background:#ff4d4f; color:#fff; padding:2px 8px; border-radius:10px;">覆盖班次 ${s.overwrittenShifts}</span>
            <span style="background:#faad14; color:#fff; padding:2px 8px; border-radius:10px;">合并班次 ${s.mergedShifts}</span>
            <span style="background:#8c8c8c; color:#fff; padding:2px 8px; border-radius:10px;">跳过 ${s.skippedShifts}</span>
            <span style="background:#1890ff; color:#fff; padding:2px 8px; border-radius:10px;">影响盘点 ${s.affectedInventories}</span>
            <span style="background:#1890ff; color:#fff; padding:2px 8px; border-radius:10px;">影响差异 ${s.affectedDiscrepancies}</span>
            <span style="background:#52c41a; color:#fff; padding:2px 8px; border-radius:10px;">新增药品 ${s.newDrugs}</span>
            <span style="background:#ff4d4f; color:#fff; padding:2px 8px; border-radius:10px;">覆盖药品 ${s.overwrittenDrugs}</span>
            <span style="background:#722ed1; color:#fff; padding:2px 8px; border-radius:10px;">导入审计日志 ${s.importAuditLogs}</span>
          </div>
          ${renderPreviewDetails(previewResult.preview)}
        </div>
      `;
    }

    let conflictHtml = '';
    if (parseResult.hasConflicts) {
      conflictHtml = `
        <div class="alert alert-error" style="margin:16px 0;">
          <strong>检测到 ${parseResult.conflictCount} 项冲突，请选择处理策略（下方策略变化会实时重新计算预演）：</strong>
        </div>
      `;

      if (conflicts.shifts.length > 0) {
        conflictHtml += `<h4 style="margin:12px 0 8px; color:#ff4d4f;">班次名称冲突 (${conflicts.shifts.length})</h4>`;
        conflicts.shifts.forEach((c, idx) => {
          conflictHtml += `
            <div style="background:#fafafa; padding:10px; border-radius:4px; margin-bottom:8px; font-size:13px;">
              <p><strong>${c.importedName}</strong></p>
              <p style="color:#8c8c8c;">导入：${c.imported.createdAtFormatted} | 本地：${c.existing.createdAtFormatted}</p>
              <div style="display:flex; gap:8px; margin-top:8px;">
                <label style="font-size:12px;"><input type="radio" name="shift_conflict_${idx}" value="skip" checked onchange="App.refreshPreview()"> 跳过</label>
                <label style="font-size:12px;"><input type="radio" name="shift_conflict_${idx}" value="overwrite" onchange="App.refreshPreview()"> 覆盖</label>
                <label style="font-size:12px;"><input type="radio" name="shift_conflict_${idx}" value="merge" onchange="App.refreshPreview()"> 合并</label>
              </div>
            </div>
          `;
        });
      }

      if (conflicts.corrections.length > 0) {
        conflictHtml += `<h4 style="margin:12px 0 8px; color:#faad14;">重复修正记录 (${conflicts.corrections.length})</h4>`;
        conflicts.corrections.forEach((c, idx) => {
          conflictHtml += `
            <div style="background:#fafafa; padding:10px; border-radius:4px; margin-bottom:8px; font-size:13px;">
              <p><strong>${c.importedDiscrepancyDrug}</strong> ${c.correction.oldActualQuantity} → ${c.correction.newActualQuantity}</p>
              <p style="color:#8c8c8c;">申请人：${c.correction.requestedByName} | 时间：${c.correction.requestedAtFormatted}</p>
              <div style="display:flex; gap:8px; margin-top:8px;">
                <label style="font-size:12px;"><input type="radio" name="corr_conflict_${idx}" value="skip" checked onchange="App.refreshPreview()"> 跳过</label>
                <label style="font-size:12px;"><input type="radio" name="corr_conflict_${idx}" value="overwrite" onchange="App.refreshPreview()"> 覆盖</label>
                <label style="font-size:12px;"><input type="radio" name="corr_conflict_${idx}" value="merge" onchange="App.refreshPreview()"> 合并</label>
              </div>
            </div>
          `;
        });
      }

      if (conflicts.drugs.length > 0) {
        conflictHtml += `<h4 style="margin:12px 0 8px; color:#1890ff;">药品内容冲突 (${conflicts.drugs.length})</h4>`;
        conflicts.drugs.forEach((c, idx) => {
          conflictHtml += `
            <div style="background:#fafafa; padding:10px; border-radius:4px; margin-bottom:8px; font-size:13px;">
              <p><strong>${c.drugCode}</strong>: 本地「${c.existing.name}」 vs 备份「${c.imported.name}」</p>
              <p style="color:#8c8c8c;">规格/数量可能存在差异，请确认处理方式</p>
              <div style="display:flex; gap:8px; margin-top:8px;">
                <label style="font-size:12px;"><input type="radio" name="drug_conflict_${idx}" value="skip" checked onchange="App.refreshPreview()"> 跳过(保留本地)</label>
                <label style="font-size:12px;"><input type="radio" name="drug_conflict_${idx}" value="overwrite" onchange="App.refreshPreview()"> 覆盖</label>
                <label style="font-size:12px;"><input type="radio" name="drug_conflict_${idx}" value="merge" onchange="App.refreshPreview()"> 合并</label>
              </div>
            </div>
          `;
        });
      }
    } else {
      conflictHtml = `
        <div class="alert alert-success" style="margin:16px 0;">
          <strong>✓ 无冲突检测</strong>：备份数据与本地数据无冲突，可以直接导入。
        </div>
      `;
    }

    area.innerHTML = `
      <div style="margin-top:16px; padding:12px; background:#f6ffed; border:1px solid #b7eb8f; border-radius:4px;">
        <p style="font-size:13px; margin-bottom:4px;"><strong>备份摘要：</strong></p>
        <p style="font-size:12px; color:#595959;">
          版本：${bk.version} | 导出时间：${bk.exportedAtFormatted}<br>
          包含班次：${totalShifts} 个 | 审计日志：${totalAudit} 条<br>
          导出人：${bk.exportedBy ? bk.exportedBy.name + ' (' + bk.exportedBy.role + ')' : '未知'}
        </p>
      </div>
      ${previewHtml}
      ${conflictHtml}
      <div class="alert alert-warning" style="margin:16px 0; font-size:12px;">
        ⚠️ 点击「确认导入并恢复」前不会修改任何本地数据。恢复后可在「备份/恢复」中撤回本次操作。
      </div>
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn btn-default" onclick="document.getElementById('import-modal').remove()">取消</button>
        <button class="btn btn-success" onclick="App.handleApplyBackup()">确认导入并恢复</button>
      </div>
    `;
  }

  function renderPreviewDetails(preview) {
    let html = '<div style="margin-top:12px; padding-top:10px; border-top:1px dashed #91d5ff;">';
    html += '<p style="font-size:12px; color:#595959; margin-bottom:6px;"><strong>详细变更清单：</strong></p>';

    if (preview.shifts.new.length > 0) {
      html += `<p style="font-size:11px; color:#52c41a; margin:4px 0;">🆕 新增班次：${preview.shifts.new.map(s => s.name).join('、')}</p>`;
    }
    if (preview.shifts.overwrite.length > 0) {
      html += `<p style="font-size:11px; color:#ff4d4f; margin:4px 0;">🔴 覆盖班次：${preview.shifts.overwrite.map(s => s.name + '(覆盖本地:' + s.existingName + ')').join('、')}</p>`;
    }
    if (preview.shifts.merge.length > 0) {
      html += `<p style="font-size:11px; color:#faad14; margin:4px 0;">🟡 合并班次：${preview.shifts.merge.map(s => s.name).join('、')}</p>`;
    }
    if (preview.shifts.skip.length > 0) {
      html += `<p style="font-size:11px; color:#8c8c8c; margin:4px 0;">⚪ 跳过班次：${preview.shifts.skip.map(s => s.name + '(' + s.reason + ')').join('、')}</p>`;
    }

    if (preview.drugs.new.length > 0) {
      html += `<p style="font-size:11px; color:#52c41a; margin:4px 0;">🆕 新增药品：${preview.drugs.new.map(d => d.code + ' ' + d.name).join('、')}</p>`;
    }
    if (preview.drugs.overwrite.length > 0) {
      html += `<p style="font-size:11px; color:#ff4d4f; margin:4px 0;">🔴 覆盖药品：${preview.drugs.overwrite.map(d => d.code + '(本地:' + (d.existing?.name || '?') + ' → 备份:' + (d.imported?.name || '?') + ')').join('、')}</p>`;
    }
    if (preview.drugs.merge.length > 0) {
      html += `<p style="font-size:11px; color:#faad14; margin:4px 0;">🟡 合并药品(保留本地)：${preview.drugs.merge.map(d => d.code + ' ' + d.name).join('、')}</p>`;
    }
    if (preview.drugs.skip.length > 0) {
      html += `<p style="font-size:11px; color:#8c8c8c; margin:4px 0;">⚪ 跳过药品：${preview.drugs.skip.map(d => d.code + ' ' + d.name).join('、')}</p>`;
    }

    if (preview.corrections.overwrite > 0 || preview.corrections.merge > 0 || preview.corrections.skip > 0) {
      html += `<p style="font-size:11px; color:#722ed1; margin:4px 0;">✏️ 修正记录：覆盖${preview.corrections.overwrite}条 / 合并${preview.corrections.merge}条 / 跳过${preview.corrections.skip}条</p>`;
    }

    html += '</div>';
    return html;
  }

  function collectConflictResolutionsFromUI() {
    const conflictResolutions = [];
    if (currentPendingConflicts) {
      currentPendingConflicts.shifts.forEach((c, idx) => {
        const radios = document.getElementsByName('shift_conflict_' + idx);
        let strategy = 'skip';
        radios.forEach(r => { if (r.checked) strategy = r.value; });
        conflictResolutions.push(ExportModule.resolveConflictStrategy(c, strategy));
      });
      currentPendingConflicts.corrections.forEach((c, idx) => {
        const radios = document.getElementsByName('corr_conflict_' + idx);
        let strategy = 'skip';
        radios.forEach(r => { if (r.checked) strategy = r.value; });
        conflictResolutions.push(ExportModule.resolveConflictStrategy(c, strategy));
      });
      currentPendingConflicts.drugs.forEach((c, idx) => {
        const radios = document.getElementsByName('drug_conflict_' + idx);
        let strategy = 'skip';
        radios.forEach(r => { if (r.checked) strategy = r.value; });
        conflictResolutions.push(ExportModule.resolveConflictStrategy(c, strategy));
      });
    }
    return conflictResolutions;
  }

  function refreshPreview() {
    if (!currentPendingBackup) return;
    const conflictResolutions = collectConflictResolutionsFromUI();
    const previewResult = ExportModule.preRestorePreview(currentPendingBackup, conflictResolutions);
    currentPendingPreview = previewResult.success ? previewResult : null;
    if (currentPendingConflicts) {
      renderConflictResolution(
        { backup: currentPendingBackup, conflicts: currentPendingConflicts, hasConflicts: currentPendingConflicts.shifts.length + currentPendingConflicts.corrections.length + currentPendingConflicts.drugs.length > 0, conflictCount: currentPendingConflicts.shifts.length + currentPendingConflicts.corrections.length + currentPendingConflicts.drugs.length },
        previewResult
      );
    }
  }

  function handleApplyBackup() {
    if (!currentPendingBackup) {
      alert('请先解析备份文件');
      return;
    }

    const user = Auth.getCurrentUser();
    if (!user || !Auth.canPerformRestore()) {
      alert('只有药师可以执行数据恢复');
      return;
    }

    const conflictResolutions = collectConflictResolutionsFromUI();

    const previewNow = ExportModule.preRestorePreview(currentPendingBackup, conflictResolutions);
    const confirmText = '即将执行数据恢复：\n\n' + (previewNow.success ? previewNow.summaryText : '') + '\n\n确认继续？此操作将合并备份数据到当前系统（恢复后可撤回）。';

    if (!confirm(confirmText)) {
      return;
    }

    const result = ExportModule.applyBackup(currentPendingBackup, conflictResolutions);

    if (result.success) {
      let msg = result.summary + '\n\n';
      msg += '恢复记录ID：' + (result.restoreRecordId || '(未记录)') + '\n\n';
      result.results.messages.forEach(m => { msg += '• ' + m + '\n'; });
      alert(msg + '\n✅ 数据恢复完成。如发现问题可在「数据备份/恢复」中撤回本次操作。');
      document.getElementById('import-modal').remove();

      currentPendingBackup = null;
      currentPendingConflicts = null;
      currentPendingPreview = null;

      location.reload();
    } else {
      alert('恢复失败：' + result.message);
    }
  }

  function showRestoreRecords() {
    const records = ExportModule.getRestoreRecords();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'records-modal';
    modal.innerHTML = `
      <div class="modal" style="max-width:600px; max-height:80vh; overflow-y:auto;">
        <h3>恢复操作历史</h3>
        ${records.length === 0 ? `
          <div class="empty-state">暂无恢复操作记录</div>
        ` : `
          <table style="width:100%; font-size:12px;">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作人</th>
                <th>备份版本</th>
                <th>结果</th>
                <th>撤回</th>
              </tr>
            </thead>
            <tbody>
              ${records.map(r => `
                <tr>
                  <td style="white-space:nowrap;">${r.timestampFormatted}</td>
                  <td>${r.restoredBy ? r.restoredBy.name + '(' + r.restoredBy.role + ')' : '-'}</td>
                  <td>${r.backupVersion || '-'}</td>
                  <td>
                    ${r.results ? `班次${r.results.importedShifts + r.results.overwrittenShifts + r.results.mergedShifts}个` : '-'}
                    ${r.previewSummary ? `, 药品${r.previewSummary.newDrugs + r.previewSummary.overwrittenDrugs}种` : ''}
                  </td>
                  <td>
                    ${r.undone
                      ? `<span style="color:#8c8c8c;">已撤回 (${r.undoneAtFormatted || ''})</span>`
                      : `<span style="color:#52c41a;">已生效</span>`
                    }
                  </td>
                </tr>
                ${r.conflictResolutions && r.conflictResolutions.length > 0 ? `
                  <tr>
                    <td colspan="5" style="background:#fafafa; font-size:11px; padding:6px 12px; color:#595959;">
                      策略：${r.conflictResolutions.map(cr => `${cr.target}:${cr.strategy}`).join(' | ')}
                    </td>
                  </tr>
                ` : ''}
              `).join('')}
            </tbody>
          </table>
        `}
        <div class="modal-actions">
          <button class="btn btn-default" onclick="document.getElementById('records-modal').remove()">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function handleUndoRestore() {
    if (!Auth.canUndoRestore()) {
      alert('只有药师可以撤回恢复操作');
      return;
    }
    const snapshot = Storage.getLastRestoreSnapshot();
    if (!snapshot) {
      alert('没有可撤回的恢复操作');
      return;
    }
    if (!confirm('确认撤回最近一次恢复？系统将还原到恢复执行前的完整状态。')) {
      return;
    }
    const result = ExportModule.undoLastRestore();
    if (result.success) {
      alert('✅ ' + result.message + '\n即将刷新页面...');
      const bkModal = document.getElementById('backup-modal');
      if (bkModal) bkModal.remove();
      location.reload();
    } else {
      alert('撤回失败：' + result.message);
    }
  }

  return {
    init,
    handleLogin,
    handleLogout,
    switchTab,
    showOpenShiftModal,
    handleOpenShift,
    handleCloseShift,
    handleReceiveShift,
    filterInventory,
    updateInventoryItem,
    resolveDiscrepancy,
    showCorrectionModal,
    submitCorrection,
    reviewCorrection,
    exportCurrentShift,
    exportShiftById,
    loadSampleData,
    resetData,
    showBackupOptions,
    handleExportBackup,
    showImportBackupDialog,
    handleParseBackupFile,
    renderConflictResolution,
    handleApplyBackup,
    refreshPreview,
    showRestoreRecords,
    handleUndoRestore,
    switchBackupSubTab,
    filterBackups,
    clearBackupFilters,
    showCreateBackupModal,
    handleCreateBackup,
    viewBackupDetail,
    closeBackupDetail,
    toggleDataBlock,
    selectAllDataBlocks,
    previewBackupRestore,
    refreshBackupPreview,
    renderBackupConflictArea,
    collectBackupConflictResolutions,
    applyBackupRestore,
    showImportBackupModal,
    handleImportBackupFile,
    saveBackupSetting,
    runCleanupNow,
    clearAllBackups,
    switchRestoreConsoleTab,
    refreshRestoreConsole,
    setConflictStrategy,
    setGroupStrategy,
    setAllConflictStrategy,
    viewRestoreRecordDetail,
    closeRestoreRecordDetail,
    renderRestoreDraftsView,
    renderRestoreDraftCard,
    showCreateDraftModal,
    showCreateDraftFromBackup,
    handleCreateDraft,
    showEditDraftModal,
    handleUpdateDraft,
    handleDeleteDraft,
    handleSubmitDraft,
    filterRestoreDraftsUI,
    clearRestoreDraftFilters,
    filterRestoreRecordsUI,
    clearRestoreRecordFilters,
    applyReuseStrategies,
    dismissReusePrompt
  };
})();

document.addEventListener('DOMContentLoaded', function() {
  App.init();
});
