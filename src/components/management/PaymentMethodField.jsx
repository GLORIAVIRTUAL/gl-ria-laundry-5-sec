import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PAYMENT_METHODS } from '@/lib/paymentMethods';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PaymentMethodField({ document, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const value = document?.metadata?.payment_method || '';
  const raw = document?.metadata?.payment_method_raw;

  const save = async (next) => {
    setSaving(true);
    try {
      const metadata = { ...(document.metadata || {}), payment_method: next };
      await base44.entities.PurchaseDocument.update(document.id, { metadata });
      onUpdated?.({ ...document, metadata });
      toast.success('Forma de pagamento atualizada.');
    } catch (error) {
      toast.error(error.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-wide text-white/35">Forma de pagamento</p>
      <Select value={value} onValueChange={save} disabled={saving}>
        <SelectTrigger className="mt-2 border-white/15 bg-white/5 text-white">
          <SelectValue placeholder="Selecionar forma de pagamento" />
        </SelectTrigger>
        <SelectContent className="border-white/10 bg-[#1d1033] text-white">
          {PAYMENT_METHODS.map((method) => (
            <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving && <p className="mt-2 flex items-center gap-2 text-xs text-white/40"><Loader2 className="h-3 w-3 animate-spin" />Salvando…</p>}
      {raw && <p className="mt-2 text-xs text-white/40">Trecho da nota: {raw}</p>}
    </div>
  );
}