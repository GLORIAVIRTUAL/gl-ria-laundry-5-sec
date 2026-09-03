import { AlertTriangle, Boxes, PackagePlus, ReceiptText, Truck, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

function Stat({ icon: Icon, label, value, hint, tone = 'violet' }) {
  const tones = {
    violet: 'from-violet-500/20 to-fuchsia-500/5 text-violet-300',
    amber: 'from-amber-500/20 to-orange-500/5 text-amber-300',
    emerald: 'from-emerald-500/20 to-teal-500/5 text-emerald-300',
    sky: 'from-sky-500/20 to-cyan-500/5 text-sky-300',
  };
  return <div className={`rounded-3xl border border-white/10 bg-gradient-to-br p-5 ${tones[tone]}`}><div className="flex items-center justify-between"><p className="text-sm text-white/50">{label}</p><Icon className="h-5 w-5" /></div><p className="mt-3 text-2xl font-bold text-white">{value}</p><p className="mt-1 text-xs text-white/35">{hint}</p></div>;
}

export default function InventoryPanel({ stockItems = [], purchaseDocuments = [], suppliers = [], selectedUnitId, onNewPurchase }) {
  const scopedStock = stockItems.filter((item) => selectedUnitId === 'all' || item.unit_id === selectedUnitId);
  const scopedDocuments = purchaseDocuments.filter((item) => selectedUnitId === 'all' || item.unit_id === selectedUnitId);
  const lowStock = scopedStock.filter((item) => Number(item.current_quantity || 0) <= Number(item.minimum_quantity || 0));
  const inventoryValue = scopedStock.reduce((sum, item) => sum + Number(item.current_quantity || 0) * Number(item.average_cost || 0), 0);
  const pendingDocs = scopedDocuments.filter((item) => ['received', 'extracting', 'human_review'].includes(item.status));

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl font-semibold text-white">Insumos e compras</h2><p className="text-sm text-white/45">Entrada por nota, custo médio, estoque mínimo, lotes e fornecedores.</p></div>
        <Button onClick={onNewPurchase} className="bg-gradient-to-r from-orange-500 to-fuchsia-500"><PackagePlus className="mr-2 h-4 w-4" />Ler nota de compra</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Boxes} label="Itens ativos" value={scopedStock.length} hint="Catálogo por unidade" />
        <Stat icon={AlertTriangle} label="Abaixo do mínimo" value={lowStock.length} hint="Reposição recomendada" tone="amber" />
        <Stat icon={WalletCards} label="Valor em estoque" value={money(inventoryValue)} hint="Quantidade × custo médio" tone="emerald" />
        <Stat icon={ReceiptText} label="Documentos pendentes" value={pendingDocs.length} hint="Extração ou revisão" tone="sky" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
          <div className="border-b border-white/10 p-5"><h3 className="font-semibold text-white">Posição de estoque</h3><p className="text-sm text-white/40">Saldo atual, mínimo e custo por insumo.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-black/15 text-xs uppercase tracking-wide text-white/35"><tr><th className="px-5 py-3">Insumo</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3 text-right">Mínimo</th><th className="px-4 py-3 text-right">Custo médio</th><th className="px-5 py-3">Situação</th></tr></thead>
              <tbody className="divide-y divide-white/5">{scopedStock.map((item) => { const isLow = Number(item.current_quantity || 0) <= Number(item.minimum_quantity || 0); return <tr key={item.id} className="hover:bg-white/[0.03]"><td className="px-5 py-4 font-medium text-white">{item.name}</td><td className="px-4 py-4 text-white/45">{item.sku}</td><td className="px-4 py-4 text-right text-white/75">{Number(item.current_quantity || 0).toLocaleString('pt-BR')} {item.base_unit}</td><td className="px-4 py-4 text-right text-white/45">{Number(item.minimum_quantity || 0).toLocaleString('pt-BR')}</td><td className="px-4 py-4 text-right text-white/75">{money(item.average_cost)}</td><td className="px-5 py-4"><Badge variant="outline" className={isLow ? 'border-amber-500/30 text-amber-200' : 'border-emerald-500/30 text-emerald-300'}>{isLow ? 'Repor' : 'Normal'}</Badge></td></tr>; })}</tbody>
            </table>
          </div>
          {scopedStock.length === 0 && <div className="py-12 text-center text-sm text-white/35">Nenhum insumo cadastrado nesta unidade.</div>}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-orange-300" /><h3 className="font-semibold text-white">Últimas compras</h3></div><div className="mt-4 space-y-3">{scopedDocuments.slice(0, 6).map((document) => <div key={document.id} className="rounded-2xl border border-white/10 bg-black/15 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-white">{document.supplier_name || 'Fornecedor a revisar'}</p><p className="mt-1 text-xs text-white/35">{document.document_number || document.id.slice(0, 8)} · {document.issue_date ? new Date(document.issue_date).toLocaleDateString('pt-BR') : 'data pendente'}</p></div><Badge variant="outline" className="border-white/10 text-white/50">{document.status}</Badge></div><p className="mt-2 text-right font-semibold text-orange-300">{money(document.total)}</p></div>)}{scopedDocuments.length === 0 && <p className="py-8 text-center text-sm text-white/35">Nenhuma nota processada.</p>}</div></div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center gap-2"><Truck className="h-5 w-5 text-sky-300" /><h3 className="font-semibold text-white">Fornecedores</h3></div><p className="mt-3 text-3xl font-bold text-white">{suppliers.length}</p><p className="text-sm text-white/40">Parceiros cadastrados e avaliáveis.</p></div>
        </div>
      </div>
    </section>
  );
}
