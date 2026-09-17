import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import DocumentItemsTable from '@/components/management/DocumentItemsTable';
import DocumentFilePreview from '@/components/management/DocumentFilePreview';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatTaxId = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return value || 'Não informado';
};

const formatDateTime = (value) => {
  if (!value) return 'Não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const hasTime = /T\d{2}:\d{2}/.test(String(value));
  return date.toLocaleString('pt-BR', hasTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function ReviewDetailsModal({ review, open, onOpenChange }) {
  const [items, setItems] = useState([]);
  const [document, setDocument] = useState(null);
  const [asset, setAsset] = useState(null);

  useEffect(() => {
    if (!open || review?.entity_type !== 'purchase_document' || !review?.entity_id) {
      setItems([]);
      setDocument(null);
      setAsset(null);
      return;
    }
    setAsset(null);
    base44.entities.PurchaseDocument.get(review.entity_id).then(async (doc) => {
      setDocument(doc);
      if (doc?.document_asset_id) {
        setAsset(await base44.entities.DocumentAsset.get(doc.document_asset_id));
      }
    });
    base44.entities.PurchaseItem.filter({ purchase_document_id: review.entity_id }).then(setItems);
  }, [open, review?.entity_id, review?.entity_type]);

  const header = review?.proposed_data?.header || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-white/10 bg-[#170c2b] text-white">
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
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-wide text-white/35">CNPJ / CPF do fornecedor</p><p className="mt-1 font-medium">{formatTaxId(document.supplier_tax_id)}</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-wide text-white/35">Documento</p><p className="mt-1 font-medium">{document.document_number || document.document_type || 'Pendente'}</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-wide text-white/35">Data e hora da compra</p><p className="mt-1 font-medium">{formatDateTime(document.issue_date || document.entry_date)}</p></div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-wide text-white/35">Forma de pagamento</p><p className="mt-1 font-medium">{document.metadata?.payment_method || 'Não informada'}</p></div>
            </div>
          )}

          {items.length > 0 && <DocumentItemsTable items={items} />}

          <DocumentFilePreview asset={asset} />

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