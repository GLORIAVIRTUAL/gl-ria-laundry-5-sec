import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import DocumentItemsTable from '@/components/management/DocumentItemsTable';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export default function ReviewDetailsModal({ review, open, onOpenChange }) {
  const [items, setItems] = useState([]);
  const [document, setDocument] = useState(null);

  useEffect(() => {
    if (!open || review?.entity_type !== 'purchase_document' || !review?.entity_id) {
      setItems([]);
      setDocument(null);
      return;
    }
    base44.entities.PurchaseDocument.get(review.entity_id).then(setDocument);
    base44.entities.PurchaseItem.filter({ purchase_document_id: review.entity_id }).then(setItems);
  }, [open, review?.entity_id, review?.entity_type]);

  const header = review?.proposed_data?.header || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-white/10 bg-[#170c2b] text-white">
        <DialogHeader>
          <DialogTitle>{review?.summary || 'Revisão pendente'}</DialogTitle>
          <DialogDescription className="text-white/50">Confira os dados extraídos e trate a pendência no módulo correspondente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-wrap gap-2">
            {(review?.reason_codes || []).map((reason) => (
              <Badge key={reason} variant="outline" className="border-amber-400/30 text-amber-200">{reason.replaceAll('_', ' ')}</Badge>
            ))}
          </div>

          {document && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-wide text-white/35">Fornecedor</p><p className="mt-1 font-medium">{document.supplier_name || 'Não identificado'}</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-wide text-white/35">Valor</p><p className="mt-1 font-medium text-orange-300">{money(document.total)}</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-wide text-white/35">Documento</p><p className="mt-1 font-medium">{document.document_number || document.document_type || 'Pendente'}</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-wide text-white/35">Forma de pagamento</p><p className="mt-1 font-medium">{document.metadata?.payment_method || 'Não informada'}</p></div>
            </div>
          )}

          {items.length > 0 && <DocumentItemsTable items={items} />}

          {!document && Object.keys(header).length > 0 && (
            <pre className="max-h-64 overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/60">{JSON.stringify(header, null, 2)}</pre>
          )}

          {!document && Object.keys(header).length === 0 && (
            <p className="text-sm text-white/50">Sem dados estruturados anexados a esta pendência.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}