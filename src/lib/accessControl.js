export const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: ['*'],
  manager: [
    'management.view',
    'quotes.manage',
    'orders.manage',
    'production.manage',
    'production.operate',
    'production.machines',
    'production.costs',
    'production.override_capacity',
    'inventory.manage',
    'inventory.override_negative',
    'operations.alerts',
    'operations.alerts.resolve',
    'finance.view',
    'finance.approve',
    'payments.manage',
    'billing.manage',
    'billing.close',
    'billing.issue',
    'quotes.reopen',
    'quotes.discount_override',
    'cash.manage',
    'cash.approve',
    'cash.reopen',
    'fiscal.manage',
    'fiscal.configure',
    'fiscal.cancel',
    'quality.manage',
    'third_party.manage',
    'documents.review',
    'audit.view',
  ],
  attendant: ['management.view', 'customers.manage', 'quotes.manage', 'orders.view', 'documents.upload'],
  cashier: ['management.view', 'orders.view', 'payments.manage', 'billing.close', 'cash.manage', 'fiscal.manage'],
  production: ['management.view', 'orders.view', 'production.manage', 'production.operate', 'production.machines', 'operations.alerts', 'quality.create'],
  driver: ['pickups.manage', 'orders.view', 'delivery.manage'],
  inventory: ['management.view', 'inventory.manage', 'operations.alerts', 'suppliers.view', 'documents.upload', 'documents.review'],
  finance: ['management.view', 'finance.view', 'finance.approve', 'payments.manage', 'billing.manage', 'billing.close', 'billing.issue', 'cash.view', 'fiscal.manage', 'documents.review'],
  auditor: ['management.view', 'finance.view', 'cash.view', 'audit.view', 'documents.view'],
};

export function hasPermission(user, permission) {
  if (!user) return false;
  const explicitPermissions = Array.isArray(user.permissions) ? user.permissions : [];
  const rolePermissions = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.attendant;
  return rolePermissions.includes('*') || rolePermissions.includes(permission) || explicitPermissions.includes(permission);
}

export function getAllowedUnitIds(user) {
  if (!user) return [];
  if (['super_admin', 'admin'].includes(user.role) || hasPermission(user, 'units.view_all')) return ['*'];
  return [...new Set([
    user.primary_unit_id,
    ...(Array.isArray(user.allowed_unit_ids) ? user.allowed_unit_ids : []),
  ].filter(Boolean))];
}

export function canAccessUnit(user, unitId) {
  if (!unitId) return true;
  const allowed = getAllowedUnitIds(user);
  return allowed.includes('*') || allowed.includes(unitId);
}

export function assertPermission(user, permission) {
  if (!hasPermission(user, permission)) {
    throw Object.assign(new Error('Você não possui permissão para executar esta ação.'), { code: 'FORBIDDEN' });
  }
}
