import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import PurchaseItemLinkRow from '@/components/management/PurchaseItemLinkRow';

export default function PurchaseApprovalPanel({ document, items, onItemsChange, onApproved }) {
  const [stockItems, setStockItems] = useState([]);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (!document?.unit_id) return;
    base44.entities.StockItem.filter({ unit_id: document.unit_id, active: true }, 'name', 300).then(setStockItems);
  }, [document?.unit_id]);

  const pendingLinks = items.filter((item) => !item.stock_item_id).length;
  const alreadyPosted = ['received_complete', 'received_partial'].includes(document?.status);

  const approve = async () => {
    setApproving(true);
    try {
      const { data } = await base44.functions.invoke('approve_purchase_document', { purchase_document_id: document.id });
      if (data?.error) throw new Error(data.error);
      toast.success('Nota aprovada: estoque atualizado e conta a pagar criada.');
      onApproved?.();
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível aprovar a nota. Verifique os vínculos de estoque.');
    } finally {
      setApproving(false);
    }
  };

  if (alreadyPosted) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">
        <CheckCircle2 className="h-4 w-4" />Nota já lançada no estoque e nas despesas.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wide text-white/40">Vincular produtos ao estoque</p>
      <div className="mt-2">
        {items.map((item) => (
          <PurchaseItemLinkRow
            key={item.id}
            item={item}
            stockItems={stockItems}
            onLinked={(updated) => onItemsChange(items.map((current) => (current.id === updated.id ? updated : current)))}
            onStockCreated={(created) => setStockItems((prev) => [...prev, created])}
          />
        ))}
      </div>
      <Button onClick={approve} disabled={approving || pendingLinks > 0} className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400">
        {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
        {pendingLinks > 0 ? `Vincule ${pendingLinks} produto(s) para aprovar` : 'Aprovar nota · lançar estoque e despesa'}
      </Button>
    </div>
  );
}