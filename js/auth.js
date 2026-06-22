const Auth = (function() {

  function login(username, password) {
    const users = Storage.getUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) {
      return { success: false, message: '用户名或密码错误' };
    }

    const safeUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      roleName: user.roleName
    };

    Storage.setCurrentUser(safeUser);
    Storage.addAuditLog('用户登录', `用户 ${user.name} (${user.roleName}) 登录系统`, safeUser);

    return { success: true, user: safeUser };
  }

  function logout() {
    const user = Storage.getCurrentUser();
    if (user) {
      Storage.addAuditLog('用户登出', `用户 ${user.name} 登出系统`, user);
    }
    Storage.clearCurrentUser();
  }

  function getCurrentUser() {
    return Storage.getCurrentUser();
  }

  function isLoggedIn() {
    return Storage.getCurrentUser() !== null;
  }

  function isPharmacist() {
    const user = getCurrentUser();
    return !!(user && user.role === 'pharmacist');
  }

  function isNurse() {
    const user = getCurrentUser();
    return !!(user && user.role === 'nurse');
  }

  function requirePharmacist() {
    if (!isPharmacist()) {
      return { allowed: false, message: '该操作需要药师权限' };
    }
    return { allowed: true };
  }

  function canEditInventory() {
    const user = getCurrentUser();
    return !!(user && (user.role === 'pharmacist' || user.role === 'nurse'));
  }

  function canResolveDiscrepancy() {
    return isPharmacist();
  }

  function canCloseShift() {
    return isPharmacist();
  }

  function canApproveCorrection() {
    return isPharmacist();
  }

  function canUndoRestore() {
    return isPharmacist();
  }

  function canPerformRestore() {
    return isPharmacist();
  }

  function canPerformPartialRestore() {
    return isPharmacist();
  }

  function canViewRestoreRecords() {
    const user = getCurrentUser();
    return !!(user && (user.role === 'pharmacist' || user.role === 'nurse'));
  }

  function canManageBackups() {
    return isPharmacist();
  }

  return {
    login,
    logout,
    getCurrentUser,
    isLoggedIn,
    isPharmacist,
    isNurse,
    requirePharmacist,
    canEditInventory,
    canResolveDiscrepancy,
    canCloseShift,
    canApproveCorrection,
    canUndoRestore,
    canPerformRestore,
    canPerformPartialRestore,
    canViewRestoreRecords,
    canManageBackups
  };
})();
