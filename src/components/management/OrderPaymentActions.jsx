import { useState } from 'react';
import { Copy, CreditCard, Loader2, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

export default function OrderPaymentActions({ orderId }) {
  const [busy, setBusy] = useState('');
  const [charge, setCharge] = useState(null);

  const generate = async (billingType) => {
    setBusy(billingType);
    try {
      const response = await base44.functions.invoke('generate_payment_link', {
        order_id: orderId,
        billing_type: billingType,
      });
      setCharge({ ...response.data, billing_type: billingType });
      toast.success(billingType === 'pix' ? 'Pix gerado.' : 'Link de cartão gerado.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Não foi possível gerar a cobrança.');
    } finally {
      setBusy('');
    }
  };

  const copy = (value) => {
    navigator.clipboard.writeText(value);
    toast.success('Copiado.');
  };

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
      <p className="text-sm font-semibold">Gerar cobrança do ticket</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => generate('pix')} disabled={!!busy} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
          {busy === 'pix' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}Pix
        </Button>
        <Button size="sm" onClick={() => generate('credit_card')} disabled={!!busy} className="bg-violet-500 hover:bg-violet-400">
          {busy === 'credit_card' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}Link de cartão
        </Button>
      </div>

      {charge && (
        <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
          {charge.pix_copy_paste_key && (
            <div className="flex items-center gap-2">
              <span className="flex-1 break-all text-emerald-100/80">{charge.pix_copy_paste_key}</span>
              <Button size="sm" variant="ghost" onClick={() => copy(charge.pix_copy_paste_key)}><Copy className="h-4 w-4" /></Button>
            </div>
          )}
          {charge.pix_qr_code && <img src={`data:image/png;base64,${charge.pix_qr_code}`} alt="QR Code Pix" className="h-40 w-40 rounded-lg bg-white p-2" />}
          {charge.url && (
            <div className="flex items-center gap-2">
              <a href={charge.url} target="_blank" rel="noopener noreferrer" className="flex-1 break-all text-cyan-300 underline">{charge.url}</a>
              <Button size="sm" variant="ghost" onClick={() => copy(charge.url)}><Copy className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}