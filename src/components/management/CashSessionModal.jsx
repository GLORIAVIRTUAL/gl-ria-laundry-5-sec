import { useMemo, useState } from 'react';
import { Banknote, Check, Loader2, MinusCircle, PlusCircle, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export default function CashSessionModal({ open, onOpenChange, unitId, sessions = [], onProcessed }) {
  const [busy, setBusy] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('0');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [countedAmount, setCountedAmount] = useState('');
  const [differenceReason, setDifferenceReason] = useState('');
  const activeSession = useMemo(() => sessions.find((session) => session.unit_id === unitId && ['open', 'counting', 'pending_approval'].includes(session.status)) || null, [sessions, unitId]);

  const run = async (payload, successMessage) => {
    setBusy(true);
    try {
      const response = await base44.functions.invoke('manage_cash_session', payload);
      toast.success(successMessage);
      onProcessed?.(response.data);
      setMovementAmount('');
      setMovementReason('');
      return response.data;
    } catch (error) {
      console.error(error);
      const code = error.response?.data?.error;
      toast.error(code === 'difference_reason_required' ? 'Informe o motivo da diferença de caixa.' : code === 'manager_approval_required' ? 'Esta movimentação exige aprovação gerencial.' : 'Não foi possível operar o caixa.');
    } finally {
      setBusy(false);
    }
  };

  const addMovement = (movementType) => {
    if (!activeSession || Number(movementAmount) <= 0) return toast.error('Informe um valor válido.');
    if (!movementReason.trim()) return toast.error('Informe o motivo.');
    run({
      action: 'movement',
      cash_session_id: activeSession.id,
      movement_type: movementType,
      amount: Number(movementAmount),
      payment_method: 'cash',
      reason: movementReason,
    }, movementType === 'supply' ? 'Suprimento registrado.' : 'Sangria registrada.');
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}>
      <DialogContent className="max-w-xl border-white/10 bg-[#170c2b] text-white">
        <DialogHeader><div className="flex items-center gap-3"><div className="rounded-2xl bg-emerald-500/15 p-2.5 text-emerald-300"><Banknote className="h-5 w-5" /></div><div><DialogTitle>Caixa da unidade</DialogTitle><DialogDescription className="text-white/50">Abertura e fechamento são vinculados ao operador autenticado.</DialogDescription></div></div></DialogHeader>

        {!activeSession ? (
          <div className="space-y-4 py-3"><div className="space-y-2"><Label>Fundo de abertura</Label><Input type="number" min="0" step="0.01" value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} className="border-white/10 bg-white/5" /></div><Button disabled={busy || !unitId} onClick={() => run({ action: 'open', unit_id: unitId, opening_amount: Number(openingAmount || 0) }, 'Caixa aberto com sucesso.')} className="w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}Abrir caixa</Button></div>
        ) : (
          <div className="space-y-5 py-3">
            <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs uppercase tracking-wide text-white/35">Esperado</p><p className="mt-1 text-xl font-bold text-white">{money(activeSession.expected_cash_amount)}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs uppercase tracking-wide text-white/35">Situação</p><Badge variant="outline" className="mt-2 border-emerald-500/30 text-emerald-300">{activeSession.status}</Badge></div></div>
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><h3 className="font-semibold">Movimento manual</h3><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Valor</Label><Input type="number" min="0" step="0.01" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} className="border-white/10 bg-black/20" /></div><div className="space-y-2"><Label>Motivo</Label><Input value={movementReason} onChange={(event) => setMovementReason(event.target.value)} className="border-white/10 bg-black/20" /></div></div><div className="grid grid-cols-2 gap-3"><Button variant="outline" disabled={busy} onClick={() => addMovement('supply')} className="border-emerald-500/20 text-emerald-200"><PlusCircle className="mr-2 h-4 w-4" />Suprimento</Button><Button variant="outline" disabled={busy} onClick={() => addMovement('withdrawal')} className="border-red-500/20 text-red-200"><MinusCircle className="mr-2 h-4 w-4" />Sangria</Button></div></div>
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center gap-2"><Scale className="h-4 w-4 text-violet-300" /><h3 className="font-semibold">Fechamento</h3></div><div className="space-y-2"><Label>Valor contado</Label><Input type="number" min="0" step="0.01" value={countedAmount} onChange={(event) => setCountedAmount(event.target.value)} className="border-white/10 bg-black/20" /></div>{countedAmount !== '' && Math.abs(Number(countedAmount) - Number(activeSession.expected_cash_amount || 0)) >= 0.01 && <div className="space-y-2"><Label>Motivo da diferença</Label><Input value={differenceReason} onChange={(event) => setDifferenceReason(event.target.value)} className="border-amber-500/30 bg-amber-500/5" /></div>}<Button disabled={busy || countedAmount === ''} onClick={() => run({ action: 'close', cash_session_id: activeSession.id, counted_cash_amount: Number(countedAmount), difference_reason: differenceReason }, 'Fechamento registrado.')} className="w-full bg-violet-500 hover:bg-violet-400">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Conferir e fechar</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
