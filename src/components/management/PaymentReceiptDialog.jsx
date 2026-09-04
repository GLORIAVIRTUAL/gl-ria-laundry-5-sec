import { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, Landmark, Loader2, Plus, RotateCcw, Trash2, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const methods = [
  { value: 'cash', label: 'Dinheiro', icon: Banknote, tone: 'text-emerald-300' },
  { value: 'pix', label: 'Pix', icon: Landmark, tone: 'text-cyan-300' },
  { value: 'credit', label: 'Crédito', icon: CreditCard, tone: 'text-violet-300' },
  { value: 'debit', label: 'Débito', icon: CreditCard, tone: 'text-sky-300' },
  { value: 'bank_transfer', label: 'Transferência', icon: Landmark, tone: 'text-blue-300' },
  { value: 'boleto', label: 'Boleto', icon: WalletCards, tone: 'text-amber-300' },
  { value: 'customer_balance', label: 'Crédito do cliente', icon: WalletCards, tone: 'text-fuchsia-300' },
  { value: 'courtesy', label: 'Cortesia', icon: CheckCircle2, tone: 'text-pink-300' },
];

/** @param {string} method @param {string | number} [amount] */
const newTender = (method, amount = '') => ({
  id: crypto.randomUUID(),
  method,
  amount: amount === '' ? '' : String(round(amount)),
  confirmed: method === 'cash' || method === 'customer_balance',
  installments: 1,
  external_reference: '',
  reason: '',
});

export default function PaymentReceiptDialog({ open, onOpenChange, order, receivable, customer, cashSessions = [], onProcessed }) {
  const [tenders, setTenders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const amountDue = useMemo(() => {
    if (receivable) return Math.max(0, Number(receivable.open_amount || 0));
    if (order) return Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0));
    return 0;
  }, [order, receivable]);
  const unitId = receivable?.unit_id || order?.unit_id || customer?.unit_id;
  const customerId = receivable?.customer_id || order?.customer_id || customer?.id;
  const activeCashSession = cashSessions.find((session) => session.unit_id === unitId && session.status === 'open');

  useEffect(() => {
    if (open) {
      setTenders([newTender('cash', amountDue)]);
      setNotes('');
    }
  }, [open, amountDue]);

  const tenderedTotal = round(tenders.reduce((sum, tender) => sum + Number(tender.amount || 0), 0));
  const changeAmount = Math.max(0, round(tenderedTotal - amountDue));
  const pendingTotal = round(tenders.filter((tender) => !tender.confirmed && !['cash', 'customer_balance'].includes(tender.method)).reduce((sum, tender) => sum + Number(tender.amount || 0), 0));
  const immediateApplied = Math.max(0, round(Math.min(amountDue, tenderedTotal - pendingTotal)));
  const remainingAfterConfirmed = Math.max(0, round(amountDue - immediateApplied));

  const updateTender = (id, patch) => setTenders((current) => current.map((tender) => tender.id === id ? { ...tender, ...patch } : tender));
  const removeTender = (id) => setTenders((current) => current.filter((tender) => tender.id !== id));
  const addTender = () => {
    const remaining = Math.max(0, round(amountDue - tenderedTotal));
    setTenders((current) => [...current, newTender('pix', remaining || '')]);
  };

  const submit = async () => {
    if (!order && !receivable) return toast.error('Selecione um pedido ou uma conta a receber.');
    if (!customerId || !unitId) return toast.error('Cliente e unidade são obrigatórios.');
    if (!tenders.length || tenders.some((tender) => Number(tender.amount || 0) <= 0)) return toast.error('Informe um valor válido para cada meio.');
    if (changeAmount > 0 && !tenders.some((tender) => tender.method === 'cash')) return toast.error('Troco somente pode ser calculado quando houver dinheiro.');
    if (tenders.some((tender) => tender.method === 'cash') && !activeCashSession) return toast.error('Abra o caixa da unidade antes de receber em dinheiro.');
    if (tenders.some((tender) => tender.method === 'customer_balance') && Number(customer?.credit_balance || 0) + 0.001 < tenders.filter((tender) => tender.method === 'customer_balance').reduce((sum, tender) => sum + Number(tender.amount || 0), 0)) {
      return toast.error('O crédito disponível do cliente é insuficiente.');
    }
    if (tenders.some((tender) => tender.method === 'courtesy' && tender.reason.trim().length < 8)) return toast.error('Informe o motivo da cortesia.');

    setBusy(true);
    try {
      const response = await base44.functions.invoke('manage_payment_receipt', {
        action: 'receive',
        unit_id: unitId,
        customer_id: customerId,
        order_ids: order ? [order.id] : [],
        accounts_receivable_ids: receivable ? [receivable.id] : [],
        cash_session_id: activeCashSession?.id,
        idempotency_key: crypto.randomUUID(),
        notes,
        tenders: tenders.map((tender) => ({
          method: tender.method,
          amount: Number(tender.amount),
          confirmed_received: tender.method === 'cash' ? tender.confirmed : undefined,
          terminal_confirmed: ['credit', 'debit'].includes(tender.method) ? tender.confirmed : undefined,
          reconciled: ['pix', 'bank_transfer', 'boleto'].includes(tender.method) ? tender.confirmed : undefined,
          installments: tender.method === 'credit' ? Number(tender.installments || 1) : undefined,
          external_reference: tender.external_reference || undefined,
          reason: tender.reason || undefined,
        })),
      });
      const receipt = response.data?.payment_receipt;
      toast.success(receipt?.pending_amount > 0 ? 'Recebimento registrado; há meios aguardando confirmação.' : 'Recebimento concluído com sucesso.');
      onProcessed?.(response.data);
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      const code = error.response?.data?.error;
      const messages = {
        insufficient_customer_balance: 'Crédito do cliente insuficiente.',
        cash_session_required: 'Abra o caixa antes de receber em dinheiro.',
        cash_session_not_open: 'O caixa selecionado não está aberto.',
        non_cash_overpayment_not_allowed: 'Meios eletrônicos não podem exceder o saldo devido.',
        change_requires_cash: 'Troco somente é permitido em dinheiro.',
        order_and_receivable_cannot_be_paid_together: 'Não selecione o pedido e seu título ao mesmo tempo.',
      };
      toast.error(messages[code] || 'Não foi possível registrar o recebimento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto border-white/10 bg-[#170c2b] text-white">
        <DialogHeader>
          <div className="flex items-center gap-3"><div className="rounded-2xl bg-emerald-500/15 p-2.5 text-emerald-300"><WalletCards className="h-5 w-5" /></div><div><DialogTitle>Receber pagamento</DialogTitle><DialogDescription className="text-white/50">Combine meios, receba parcialmente e mantenha cada aplicação auditável.</DialogDescription></div></div>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4">
          <Summary label="Saldo devido" value={money(amountDue)} tone="text-white" />
          <Summary label="Apresentado" value={money(tenderedTotal)} tone="text-sky-300" />
          <Summary label="Aplicação imediata" value={money(immediateApplied)} tone="text-emerald-300" />
          <Summary label={changeAmount > 0 ? 'Troco' : 'Restará em aberto'} value={money(changeAmount > 0 ? changeAmount : remainingAfterConfirmed)} tone={changeAmount > 0 ? 'text-amber-300' : 'text-violet-300'} />
        </div>

        <div className="space-y-3">
          {tenders.map((tender, index) => {
            const method = methods.find((item) => item.value === tender.method) || methods[0];
            const Icon = method.icon;
            const requiresExternalConfirmation = ['pix', 'credit', 'debit', 'bank_transfer', 'boleto'].includes(tender.method);
            return (
              <div key={tender.id} className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
                <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${method.tone}`} /><span className="text-sm font-semibold">Meio {index + 1}</span></div>{tenders.length > 1 && <Button size="icon" variant="ghost" onClick={() => removeTender(tender.id)} className="text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></Button>}</div>
                <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr]">
                  <div className="space-y-2"><Label>Forma</Label><select value={tender.method} onChange={(event) => updateTender(tender.id, { method: event.target.value, confirmed: ['cash', 'customer_balance'].includes(event.target.value) })} className="h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white">{methods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                  <div className="space-y-2"><Label>Valor</Label><Input type="number" min="0.01" step="0.01" value={tender.amount} onChange={(event) => updateTender(tender.id, { amount: event.target.value })} className="border-white/10 bg-black/20" /></div>
                  {tender.method === 'credit' ? <div className="space-y-2"><Label>Parcelas</Label><Input type="number" min="1" max="24" value={tender.installments} onChange={(event) => updateTender(tender.id, { installments: event.target.value })} className="border-white/10 bg-black/20" /></div> : <div className="space-y-2"><Label>Referência</Label><Input value={tender.external_reference} onChange={(event) => updateTender(tender.id, { external_reference: event.target.value })} placeholder="NSU, E2E ou documento" className="border-white/10 bg-black/20" /></div>}
                </div>
                {tender.method === 'customer_balance' && <p className="mt-3 text-xs text-fuchsia-200">Disponível: {money(customer?.credit_balance || 0)}</p>}
                {tender.method === 'courtesy' && <div className="mt-3 space-y-2"><Label>Motivo obrigatório</Label><Input value={tender.reason} onChange={(event) => updateTender(tender.id, { reason: event.target.value })} className="border-pink-500/20 bg-pink-500/5" /></div>}
                {requiresExternalConfirmation && <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-black/15 p-3 text-sm text-white/70"><input type="checkbox" checked={tender.confirmed} onChange={(event) => updateTender(tender.id, { confirmed: event.target.checked })} className="h-4 w-4 accent-emerald-500" /><span>Confirmado no terminal, banco ou conciliação</span>{!tender.confirmed && <Badge variant="outline" className="ml-auto border-amber-500/30 text-amber-200">Pendente</Badge>}</label>}
              </div>
            );
          })}
          <Button variant="outline" onClick={addTender} className="w-full border-dashed border-white/15 bg-white/[0.02] text-white/70"><Plus className="mr-2 h-4 w-4" />Adicionar outro meio</Button>
        </div>

        <div className="space-y-2"><Label>Observações</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Informação opcional para o recibo" className="border-white/10 bg-black/20" /></div>
        <div className="flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => { setTenders([newTender('cash', amountDue)]); setNotes(''); }} disabled={busy}><RotateCcw className="mr-2 h-4 w-4" />Recomeçar</Button><Button onClick={submit} disabled={busy || amountDue <= 0} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Registrar recebimento</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ label, value, tone }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-xs uppercase tracking-wide text-white/35">{label}</p><p className={`mt-2 text-lg font-bold ${tone}`}>{value}</p></div>;
}
