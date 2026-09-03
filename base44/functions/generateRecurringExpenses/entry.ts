import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Lança automaticamente as despesas recorrentes do mês (no dia programado) e as avulsas vencidas.
// Idempotente: usa last_generated_month (YYYY-MM) na recorrente para não duplicar.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Permite execução por automação (sem usuário) ou por admin autenticado
    let isScheduled = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch {
      isScheduled = true; // chamada pela automação sem contexto de usuário
    }

    const now = new Date();
    // Ajuste para fuso de São Paulo (UTC-3) para definir o dia/mês corretos
    const sp = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const year = sp.getUTCFullYear();
    const month = sp.getUTCMonth() + 1; // 1-12
    const today = sp.getUTCDate();
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const daysInMonth = new Date(year, month, 0).getDate();

    const allExpenses = await base44.asServiceRole.entities.RecurringExpense.list('-created_date', 1000);
    const created = [];

    for (const exp of allExpenses) {
      if (exp.active === false) continue;

      if (exp.kind === 'recurring') {
        // Dispara quando hoje >= dia programado (ou último dia do mês se o dia não existir) e ainda não lançou neste mês
        const targetDay = Math.min(exp.day_of_month || 1, daysInMonth);
        if (today >= targetDay && exp.last_generated_month !== monthKey) {
          const entryDate = `${monthKey}-${String(targetDay).padStart(2, '0')}`;
          await base44.asServiceRole.entities.FinanceEntry.create({
            type: 'expense',
            category: exp.category,
            description: exp.description,
            amount: exp.amount,
            payment_method: exp.payment_method || 'boleto',
            entry_date: entryDate,
            unit_id: exp.unit_id,
            status: 'paid',
            notes: exp.notes ? `${exp.notes} (recorrente)` : 'Despesa recorrente'
          });
          await base44.asServiceRole.entities.RecurringExpense.update(exp.id, { last_generated_month: monthKey });
          created.push({ id: exp.id, description: exp.description, date: entryDate });
        }
      } else if (exp.kind === 'one_time') {
        // Avulsa: lança quando a data programada chega e ainda não foi lançada
        if (exp.due_date && exp.due_date <= `${monthKey}-${String(today).padStart(2, '0')}` && !exp.last_generated_month) {
          await base44.asServiceRole.entities.FinanceEntry.create({
            type: 'expense',
            category: exp.category,
            description: exp.description,
            amount: exp.amount,
            payment_method: exp.payment_method || 'boleto',
            entry_date: exp.due_date,
            unit_id: exp.unit_id,
            status: 'paid',
            notes: exp.notes || 'Despesa avulsa'
          });
          await base44.asServiceRole.entities.RecurringExpense.update(exp.id, { last_generated_month: monthKey });
          created.push({ id: exp.id, description: exp.description, date: exp.due_date });
        }
      }
    }

    return Response.json({ ok: true, scheduled: isScheduled, monthKey, created_count: created.length, created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});