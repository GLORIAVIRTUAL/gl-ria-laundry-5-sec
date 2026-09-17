import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export default function PurchaseItemLinkRow({ item, stockItems, onLinked, onStockCreated }) {
  const [saving, setSaving] = useState(false);

  const link = async (stockItemId) => {
    setSaving(true);
    try {
      const updated = await base44.entities.PurchaseItem.update(item.id, { stock_item_id: stockItemId, match_status: 'matched' });
      onLinked(updated);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível vincular o produto.');
    } finally {
      setSaving(false);
    }
  };

  const createStockItem = async () => {
    setSaving(true);
    try {
      const created = await base44.entities.StockItem.create({
        unit_id: item.unit_id,
        name: item.description_original,
        sku: item.supplier_code || `NF-${item.id.slice(0, 8)}`,
        base_unit: 'unit',
        purchase_unit: item.purchase_unit || 'unit',
        purchase_to_base_factor: Number(item.conversion_factor || 1),
        category: 'Insumos',
      });
      onStockCreated(created);
      const updated = await base44.entities.PurchaseItem.update(item.id, { stock_item_id: created.id, match_status: 'matched' });
      onLinked(updated);
      toast.success('Item de estoque criado e vinculado.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível criar o item de estoque.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/5 py-3 last:border-0">
      <div className="min-w-[45%] flex-1">
        <p className="text-sm text-white">{item.description_original}</p>
        <p className="text-xs text-white/40">{Number(item.invoiced_quantity || 0)} × {money(item.unit_price)}</p>
      </div>
      <Select value={item.stock_item_id || ''} onValueChange={link} disabled={saving}>
        <SelectTrigger className="w-56 border-white/10 bg-white/5 text-sm"><SelectValue placeholder="Vincular ao estoque" /></SelectTrigger>
        <SelectContent className="border-white/10 bg-[#1f1136] text-white">
          {stockItems.map((stock) => <SelectItem key={stock.id} value={stock.id}>{stock.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" onClick={createStockItem} disabled={saving} className="border-white/15 bg-white/5">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        <span className="ml-1">Novo</span>
      </Button>
    </div>
  );
}