import { useState } from 'react';
import { Banknote, CalendarClock, Check, CircleDollarSign, Landmark, Loader2, ReceiptText, ScanLine, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const date = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';

export default function FinancialOperationsPanel({ payables = [], receivables = [], financialDocuments = [], cashSessions = [], bankTransactions = [], selectedUnitId, onNewBill, onCash, onRefresh }) {
  const [busyId, setBusyId] = useState(null);
  const scope = (record) => selectedUnitId === 'all' || record.unit_id === selectedUnitId;
  const scopedPayables = payables.filter(scope);
  const scopedReceivables = receivables.filter(scope);
  const scopedDocs = financialDocuments.filter(scope);
  const scopedCash = cashSessions.filter(scope);
  const scopedBank = bankTransactions.filter(scope);
  const now = new Date();
  const openPayables = scopedPayables.filter((item) => !['paid', 'cancelled'].includes(item.status));
  const overdue = openPayables.filter((item) => item.due_date && new Date(item.due_date) < now);
  const payableTotal = openPayables.reduce((sum, item) => sum + Number(item.open_amount || 0), 0);
  const receivableTotal = scopedReceivables.filter((item) => !['paid', 'cancelled', 'written_off'].includes(item.status)).reduce((sum, item) => sum + Number(item.open_amount || 0), 0);
  const unmatchedBank = scopedBank.filter((item) => ['unmatched', 'suggested'].includes(item.status));
  const openCash = scopedCash.filter((item) => ['open', 'counting', 'pending_approval'].includes(item.status));

  const approvePayable = async (payable) => {
    setBusyId(payable.id);
    try {
      await base44.functions.invoke('manage_accounts_payable', { action: 'approve', accounts_payable_id: payable.id });
      toast.success('Conta aprovada. Ela continua pendente até o pagamento ser registrado.');
      onRefresh?.();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.error === 'segregation_of_duties_required' ? 'Outro responsável deve aprovar esta conta.' : 'Não foi possível aprovar a conta.');
    } finally {
      setBusyId(null);
    }
  };

  const registerPayment = async (payable) => {
    if (!window.confirm(`Registrar o pagamento de ${money(payable.open_amount)} para “${payable.description}”?`)) return;
    setBusyId(payable.id);
    try {
      await base44.functions.invoke('manage_accounts_payable', {
        action: 'pay',
        accounts_payable_id: payable.id,
        amount: payable.open_amount,
        payment_method: payable.payment_method || 'bank_transfer',
        idempotency_key: crypto.randomUUID(),
        notes: 'Pagamento registrado manualmente na central financeira.',
      });
      toast.success('Pagamento registrado e refletido no financeiro.');
      onRefresh?.();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.error === 'payable_not_approved' ? 'A conta precisa ser aprovada primeiro.' : 'Não foi possível registrar o pagamento.');
    } finally {
      setBusyId(null);
    }
  };

  const stats = [
    { label: 'Contas a pagar', value: money(payableTotal), hint: `${openPayables.length} em aberto`, icon: WalletCards, tone: 'text-orange-300' },
    { label: 'Contas a receber', value: money(receivableTotal), hint: `${scopedReceivables.length} títulos`, icon: CircleDollarSign, tone: 'text-emerald-300' },
    { label: 'Vencidas', value: overdue.length, hint: 'Exigem prioridade', icon: CalendarClock, tone: 'text-red-300' },
    { label: 'Conciliações', value: unmatchedBank.length, hint: 'Transações pendentes', icon: Landmark, tone: 'text-sky-300' },
  ];

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="text-xl font-semibold text-white">Financeiro operacional</h2><p className="text-sm text-white/45">Documentos, vencimentos, aprovações, liquidação, caixa e conciliação.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onCash} className="border-white/10 bg-white/5"><Banknote className="mr-2 h-4 w-4" />Operar caixa</Button><Button onClick={onNewBill} className="bg-gradient-to-r from-sky-500 to-violet-500"><ScanLine className="mr-2 h-4 w-4" />Ler conta</Button></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, hint, icon: Icon, tone }) => <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><div className="flex items-center justify-between"><p className="text-sm text-white/45">{label}</p><Icon className={`h-5 w-5 ${tone}`} /></div><p className="mt-3 text-2xl font-bold text-white">{value}</p><p className="mt-1 text-xs text-white/35">{hint}</p></div>)}</div>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
          <div className="border-b border-white/10 p-5"><h3 className="font-semibold text-white">Contas a pagar</h3><p className="text-sm text-white/40">Aprovação e pagamento são eventos separados.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-black/15 text-xs uppercase tracking-wide text-white/35"><tr><th className="px-5 py-3">Descrição</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3 text-right">Em aberto</th><th className="px-4 py-3">Situação</th><th className="px-5 py-3 text-right">Ação</th></tr></thead><tbody className="divide-y divide-white/5">{openPayables.slice(0, 20).map((payable) => { const isOverdue = payable.due_date && new Date(payable.due_date) < now; return <tr key={payable.id} className="hover:bg-white/[0.03]"><td className="px-5 py-4"><p className="font-medium text-white">{payable.description}</p><p className="mt-1 text-xs text-white/35">{payable.supplier_name || payable.category}</p></td><td className={`px-4 py-4 ${isOverdue ? 'text-red-300' : 'text-white/60'}`}>{date(payable.due_date)}</td><td className="px-4 py-4 text-right font-semibold text-white">{money(payable.open_amount)}</td><td className="px-4 py-4"><Badge variant="outline" className={payable.approval_status === 'approved' ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-200'}>{payable.approval_status === 'approved' ? 'Aprovada' : 'Aguardando aprovação'}</Badge></td><td className="px-5 py-4 text-right">{payable.approval_status === 'approved' ? <Button size="sm" onClick={() => registerPayment(payable)} disabled={busyId === payable.id} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">{busyId === payable.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Registrar pagamento'}</Button> : <Button size="sm" variant="outline" onClick={() => approvePayable(payable)} disabled={busyId === payable.id} className="border-white/10 bg-white/5">{busyId === payable.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="mr-2 h-3.5 w-3.5" />Aprovar</>}</Button>}</td></tr>; })}</tbody></table>
          </div>
          {openPayables.length === 0 && <div className="py-12 text-center text-sm text-white/35">Nenhuma conta em aberto.</div>}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-violet-300" /><h3 className="font-semibold text-white">Documentos recentes</h3></div><div className="mt-4 space-y-3">{scopedDocs.slice(0, 6).map((document) => <div key={document.id} className="rounded-2xl border border-white/10 bg-black/15 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-white">{document.issuer_name || document.document_type?.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-white/35">{date(document.due_date)}</p></div><Badge variant="outline" className={document.anomaly_status === 'warning' || document.anomaly_status === 'critical' ? 'border-amber-500/30 text-amber-200' : 'border-white/10 text-white/45'}>{document.status}</Badge></div><p className="mt-2 text-right font-semibold text-sky-300">{money(document.amount)}</p></div>)}{scopedDocs.length === 0 && <p className="py-8 text-center text-sm text-white/35">Nenhum documento processado.</p>}</div></div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center gap-2"><Banknote className="h-5 w-5 text-emerald-300" /><h3 className="font-semibold text-white">Caixas em operação</h3></div><p className="mt-3 text-3xl font-bold text-white">{openCash.length}</p><p className="text-sm text-white/40">Abertos ou aguardando conferência.</p></div>
        </div>
      </div>
    </section>
  );
}
