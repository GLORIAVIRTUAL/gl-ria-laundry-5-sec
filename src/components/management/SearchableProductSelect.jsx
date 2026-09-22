import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const currency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export default function SearchableProductSelect({ products, selectedProduct, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    return term ? products.filter((product) => normalize(`${product.name} ${product.sku || ''}`).includes(term)) : products;
  }, [products, query]);

  const choose = (id) => {
    onSelect(id);
    setQuery('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Selecionar item do catálogo" className="flex h-10 w-full items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 text-left text-sm text-white">
          <span className="truncate">{selectedProduct ? `${selectedProduct.name} · ${currency(selectedProduct.price)}` : 'Selecione a peça'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-white/50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[80] w-[var(--radix-popover-trigger-width)] border-white/10 bg-[#1a0b36] p-2 text-white">
        <div className="relative mb-2"><Search className="absolute left-3 top-2.5 h-4 w-4 text-white/40" /><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite o nome do item..." className="border-white/10 bg-black/20 pl-9 text-white" /></div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length ? filtered.map((product) => <button key={product.id} type="button" onClick={() => choose(product.id)} className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-white/10"><Check className={`mr-2 h-4 w-4 ${selectedProduct?.id === product.id ? 'opacity-100' : 'opacity-0'}`} /><span className="flex-1">{product.name} · {currency(product.price)}</span></button>) : <p className="px-3 py-6 text-center text-sm text-white/50">Nenhum item encontrado.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}