const App = (function() {
  let currentTab = 'dashboard';
  let inventoryFilter = 'all';

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
    handleUndoRestore
  };
})();

document.addEventListener('DOMContentLoaded', function() {
  App.init();
});
