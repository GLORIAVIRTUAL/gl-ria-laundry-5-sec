import { ScrollArea } from '@/components/ui/scroll-area';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export default function DocumentItemsTable({ items = [] }) {
  if (!items.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-white/35">Produtos comprados</p>
        <span className="text-xs text-white/40">{items.length} item(ns)</span>
      </div>
      <ScrollArea className="max-h-56">
        <div className="divide-y divide-white/5">
          {items.map((item, index) => (
            <div key={item.id || index} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{item.description_original || `Item ${index + 1}`}</p>
                <p className="mt-0.5 text-xs text-white/45">
                  {Number(item.invoiced_quantity || 0)} {item.purchase_unit || 'un'} × {money(item.unit_price)}
                  {item.supplier_code ? ` · cód. ${item.supplier_code}` : ''}
                </p>
              </div>
              <p className="whitespace-nowrap text-sm font-semibold text-orange-300">{money(item.total)}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}