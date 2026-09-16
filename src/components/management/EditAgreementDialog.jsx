import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function EditAgreementDialog({ agreement, customers = [], onOpenChange, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!agreement) return setForm(null);
    setForm({
      code: agreement.code || '',
      name: agreement.name || '',
      bill_to_customer_id: agreement.bill_to_customer_id || '',
      agreement_type: agreement.agreement_type || 'corporate',
      credit_limit: String(agreement.credit_limit ?? ''),
      payment_term_days: String(agreement.payment_term_days ?? '30'),
      billing_cycle: agreement.billing_cycle || 'monthly',
    });
  }, [agreement]);

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) return toast.error('Informe código e nome.');
    setBusy(true);
    try {
      await base44.functions.invoke('manage_billing_agreement', {
        action: 'update',
        billing_agreement_id: agreement.id,
        ...form,
        credit_limit: Number(form.credit_limit || 0),
        payment_term_days: Number(form.payment_term_days || 0),
      });
      toast.success('Convênio atualizado.');
      onSaved?.();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.error === 'agreement_code_already_exists' ? 'Já existe um convênio com este código.' : 'Não foi possível salvar o convênio.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!agreement} onOpenChange={(value) => !busy && !value && onOpenChange(null)}>
      <DialogContent className="max-w-2xl border-white/10 bg-[#170c2b] text-white">
        <DialogHeader>
          <DialogTitle>Editar convênio</DialogTitle>
          <DialogDescription className="text-white/50">Altere os dados comerciais deste convênio.</DialogDescription>
        </DialogHeader>
        {form && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Código</Label><Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} className="border-white/10 bg-black/20" /></div>
              <div className="space-y-2"><Label>Nome</Label><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="border-white/10 bg-black/20" /></div>
              <div className="space-y-2"><Label>Responsável financeiro</Label>
                <select value={form.bill_to_customer_id} onChange={(event) => setForm((current) => ({ ...current, bill_to_customer_id: event.target.value }))} className="h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white">
                  <option value="">Selecione</option>
                  {customers.filter((customer) => customer.unit_id === agreement.unit_id).slice(0, 1000).map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}</option>)}
                </select>
              </div>
              <div className="space-y-2"><Label>Tipo</Label>
                <select value={form.agreement_type} onChange={(event) => setForm((current) => ({ ...current, agreement_type: event.target.value }))} className="h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white">
                  <option value="corporate">Empresa</option><option value="condominium">Condomínio</option><option value="hotel">Hotel</option><option value="healthcare">Saúde</option><option value="employee">Funcionários</option><option value="partner">Parceiro</option><option value="other">Outro</option>
                </select>
              </div>
              <div className="space-y-2"><Label>Limite de crédito</Label><Input type="number" min="0" step="0.01" value={form.credit_limit} onChange={(event) => setForm((current) => ({ ...current, credit_limit: event.target.value }))} className="border-white/10 bg-black/20" /></div>
              <div className="space-y-2"><Label>Prazo em dias</Label><Input type="number" min="0" value={form.payment_term_days} onChange={(event) => setForm((current) => ({ ...current, payment_term_days: event.target.value }))} className="border-white/10 bg-black/20" /></div>
              <div className="space-y-2"><Label>Ciclo de faturamento</Label>
                <select value={form.billing_cycle} onChange={(event) => setForm((current) => ({ ...current, billing_cycle: event.target.value }))} className="h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white">
                  <option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option><option value="per_order">Por pedido</option>
                </select>
              </div>
            </div>
            <Button onClick={submit} disabled={busy} className="bg-violet-500 hover:bg-violet-400">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar alterações</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}