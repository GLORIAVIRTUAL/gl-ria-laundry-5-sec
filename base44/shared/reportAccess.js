import { effectivePermissions } from './accessGovernance.js';

const REPORT_PERMISSIONS = ['reports.view', 'reports.view_all', 'reports.export', 'reports.finance', 'reports.stock'];

/**
 * Autoriza a geração de relatórios em PDF por permissão (não por papel fixo),
 * usando a mesma regra que libera a página de Relatórios no app.
 * Retorna uma Response 401/403 quando o acesso deve ser negado, ou null quando liberado.
 */
export async function authorizeReportAccess(base44, user) {
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let policies = [];
  try {
    policies = await base44.asServiceRole.entities.AccessPolicy.filter({ status: 'active' }, '-version', 200);
  } catch {
    policies = [];
  }

  const permissions = effectivePermissions(user, policies);
  const allowed = permissions.includes('*') || REPORT_PERMISSIONS.some((permission) => permissions.includes(permission));
  if (allowed) return null;

  return Response.json({ error: 'Seu perfil não tem permissão para gerar relatórios.', code: 'PERMISSION_DENIED' }, { status: 403 });
}