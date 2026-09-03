import { useEffect, useMemo, useState } from 'react';
import { Camera, Check, ChevronLeft, ChevronRight, FileImage, Loader2, Plus, ShieldCheck, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { uploadSecureFile } from '@/lib/secureFiles';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

const EMPTY_ATTRIBUTES = { color: '', brand: '', pattern: '', size: '', material: '' };

function currency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function confidenceTone(confidence) {
  if (confidence >= 0.92) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (confidence >= 0.75) return 'bg-amber-500/15 text-amber-200 border-amber-500/30';
  return 'bg-red-500/15 text-red-200 border-red-500/30';
}

function PreviewCard({ entry, onRemove }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <img src={entry.preview} alt="Peça aguardando análise" className="h-40 w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent px-3 pb-3 pt-10">
        <span className="truncate text-xs text-white/80">{entry.file.name}</span>
        <button type="button" onClick={onRemove} className="rounded-full bg-black/50 p-1.5 text-white hover:bg-red-500" aria-label="Remover foto">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ReviewCard({ item, index, products, onChange }) {
  const selectedProduct = products.find((product) => product.id === item.product_id);
  const confidence = Number(item.confidence || 0);
  const needsAttention = item.recognition_status !== 'confirmed';

  const updateProduct = (productId) => {
    const product = products.find((candidate) => candidate.id === productId);
    onChange({
      ...item,
      product_id: product?.id || null,
      garment_type: product?.name || 'Peça não identificada',
      unit_price: Number(product?.price || 0),
      subtotal: Number(product?.price || 0) * Number(item.qty || 1),
      total_amount: Number(product?.price || 0) * Number(item.qty || 1),
      recognition_status: product ? 'confirmed' : 'suggested',
    });
  };

  const updateField = (field, value) => {
    const next = { ...item, [field]: value };
    if (field === 'qty' || field === 'unit_price') {
      next.subtotal = Number(next.qty || 1) * Number(next.unit_price || 0);
      next.total_amount = next.subtotal - Number(next.discount_amount || 0) + Number(next.additional_amount || 0);
    }
    onChange(next);
  };

  const updateAttribute = (field, value) => {
    onChange({ ...item, attributes: { ...EMPTY_ATTRIBUTES, ...(item.attributes || {}), [field]: value } });
  };

  return (
    <article className={`rounded-2xl border p-4 ${needsAttention ? 'border-amber-400/40 bg-amber-400/5' : 'border-white/10 bg-white/[0.04]'}`}>
      <div className="grid gap-4 lg:grid-cols-[150px_1fr]">
        <div>
          {item.image_url ? (
            <img src={item.image_url} alt={`Peça ${index + 1}`} className="h-40 w-full rounded-xl object-cover" />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-xl bg-white/5"><FileImage className="h-8 w-8 text-white/30" /></div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline" className={confidenceTone(confidence)}>{Math.round(confidence * 100)}% confiança</Badge>
            {needsAttention ? <Badge variant="outline" className="border-amber-400/30 text-amber-200">revisar</Badge> : <Badge variant="outline" className="border-emerald-500/30 text-emerald-300"><Check className="mr-1 h-3 w-3" />confirmado</Badge>}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_110px_140px]">
            <div className="space-y-1.5">
              <Label>Item do catálogo</Label>
              <Select value={item.product_id || ''} onValueChange={updateProduct}>
                <SelectTrigger className="border-white/10 bg-black/20"><SelectValue placeholder="Selecione a peça" /></SelectTrigger>
                <SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · {currency(product.price)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input type="number" min="1" max="99" value={item.qty || 1} onChange={(event) => updateField('qty', Math.max(1, Number(event.target.value || 1)))} className="border-white/10 bg-black/20" />
            </div>
            <div className="space-y-1.5">
              <Label>Preço unitário</Label>
              <Input type="number" min="0" step="0.01" value={item.unit_price ?? selectedProduct?.price ?? 0} onChange={(event) => updateField('unit_price', Math.max(0, Number(event.target.value || 0)))} className="border-white/10 bg-black/20" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['color', 'Cor'], ['brand', 'Marca'], ['pattern', 'Estampa'], ['size', 'Tamanho'], ['material', 'Material'],
            ].map(([field, label]) => (
              <div key={field} className="space-y-1.5">
                <Label>{label}</Label>
                <Input value={item.attributes?.[field] || ''} onChange={(event) => updateAttribute(field, event.target.value)} className="border-white/10 bg-black/20" />
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Avarias e riscos</Label>
              <Input value={(item.damages || []).join(', ')} onChange={(event) => onChange({ ...item, damages: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} placeholder="Mancha, rasgo, botão quebrado…" className="border-white/10 bg-black/20" />
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Input value={item.notes || ''} onChange={(event) => updateField('notes', event.target.value)} className="border-white/10 bg-black/20" />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function IntelligentQuoteModal({ open, onOpenChange, customers = [], defaultUnitId, onCreated }) {
  const [step, setStep] = useState(1);
  const [customerId, setCustomerId] = useState('');
  const [files, setFiles] = useState([]);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [createdQuote, setCreatedQuote] = useState(null);
  const [createdOrder, setCreatedOrder] = useState(null);

  useEffect(() => {
    if (!open) return;
    base44.entities.Product.filter({ active: true }, 'name', 500)
      .then(setProducts)
      .catch(() => toast.error('Não foi possível carregar o catálogo.'));
  }, [open]);

  useEffect(() => () => files.forEach((entry) => URL.revokeObjectURL(entry.preview)), [files]);

  const total = useMemo(() => items.reduce((sum, item) => sum + Number(item.total_amount ?? Number(item.qty || 1) * Number(item.unit_price || 0)), 0), [items]);
  const unresolved = items.filter((item) => !item.product_id || item.recognition_status !== 'confirmed');
  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  const reset = () => {
    files.forEach((entry) => URL.revokeObjectURL(entry.preview));
    setStep(1);
    setCustomerId('');
    setFiles([]);
    setItems([]);
    setCreatedQuote(null);
    setCreatedOrder(null);
    setBusy(false);
  };

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen && !busy) reset();
    onOpenChange(nextOpen);
  };

  const addFiles = (event) => {
    const selected = [...(event.target.files || [])].slice(0, Math.max(0, 12 - files.length));
    const next = selected.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
    setFiles((current) => [...current, ...next].slice(0, 12));
    event.target.value = '';
  };

  const removeFile = (id) => {
    setFiles((current) => {
      const removed = current.find((entry) => entry.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((entry) => entry.id !== id);
    });
  };

  const analyze = async () => {
    if (!customerId) return toast.error('Selecione o cliente.');
    if (!defaultUnitId) return toast.error('Selecione uma unidade.');
    if (files.length === 0) return toast.error('Adicione ao menos uma foto.');

    setBusy(true);
    try {
      const uploaded = [];
      for (const entry of files) {
        const result = await uploadSecureFile({
          file: entry.file,
          documentType: 'garment_photo',
          unitId: defaultUnitId,
          customerId,
          metadata: { source: 'management_vision_quote' },
        });
        uploaded.push(result.asset.id);
      }

      const response = await base44.functions.invoke('analyze_garment_images', {
        document_asset_ids: uploaded,
        customer_id: customerId,
      });
      const analyzedItems = response.data?.items || [];
      setItems(analyzedItems);
      setStep(2);
      if (analyzedItems.some((item) => item.recognition_status !== 'confirmed')) {
        toast.info('Alguns itens precisam da sua confirmação.');
      } else {
        toast.success('Fotos analisadas com sucesso.');
      }
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Não foi possível analisar as fotos.');
    } finally {
      setBusy(false);
    }
  };

  const confirmItem = (index) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, recognition_status: item.product_id ? 'confirmed' : 'suggested' } : item));
  };

  const saveQuote = async () => {
    if (unresolved.length > 0) return toast.error('Confirme todos os itens antes de finalizar.');
    setBusy(true);
    try {
      const now = new Date();
      const quote = await base44.entities.Quote.create({
        customer_id: customerId,
        unit_id: defaultUnitId,
        status: 'APPROVED',
        origin: 'management_vision',
        items,
        subtotal: total,
        discount: 0,
        addition: 0,
        total,
        catalog_version: products[0]?.catalog_version || '1',
        valid_until: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        reviewed_at: now.toISOString(),
      });
      setCreatedQuote(quote);
      setStep(3);
      onCreated?.({ quote });
      toast.success('Orçamento salvo sem gerar cobrança.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível salvar o orçamento.');
    } finally {
      setBusy(false);
    }
  };

  const createOrder = async () => {
    if (!createdQuote) return;
    setBusy(true);
    try {
      const response = await base44.functions.invoke('approve_quote', { quote_id: createdQuote.id });
      setCreatedOrder(response.data?.order);
      onCreated?.({ quote: createdQuote, order: response.data?.order });
      toast.success('Ticket e peças criados com rastreabilidade.');
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.error === 'human_review_required' ? 'Ainda existem itens pendentes de revisão.' : 'Não foi possível criar o ticket.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-6xl overflow-hidden border-white/10 bg-[#170c2b] p-0 text-white">
        <DialogHeader className="border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 p-2.5 shadow-lg shadow-violet-900/30"><Sparkles className="h-5 w-5" /></div>
            <div>
              <DialogTitle className="text-xl">Orçamento inteligente por imagens</DialogTitle>
              <DialogDescription className="text-white/50">A IA prepara o rascunho; o funcionário confirma antes de criar qualquer pedido ou cobrança.</DialogDescription>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {['Capturar', 'Revisar', 'Finalizar'].map((label, index) => (
              <div key={label} className={`rounded-full px-3 py-1.5 text-center text-xs font-medium ${step >= index + 1 ? 'bg-violet-500 text-white' : 'bg-white/5 text-white/35'}`}>{index + 1}. {label}</div>
            ))}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(94vh-170px)]">
          <div className="p-6">
            {step === 1 && (
              <div className="space-y-6">
                <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                  <div className="rounded-3xl border border-dashed border-violet-400/40 bg-violet-500/5 p-8 text-center">
                    <Camera className="mx-auto h-10 w-10 text-violet-300" />
                    <h3 className="mt-3 text-lg font-semibold">Fotografe frente, verso, etiqueta e avarias</h3>
                    <p className="mx-auto mt-2 max-w-xl text-sm text-white/50">Use boa iluminação e evite peças sobrepostas. São aceitas até 12 imagens JPG, PNG ou WEBP.</p>
                    <Label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold hover:bg-violet-400">
                      <Plus className="h-4 w-4" /> Adicionar fotos
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" onChange={addFiles} className="sr-only" />
                    </Label>
                  </div>
                  <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="space-y-2">
                      <Label>Cliente</Label>
                      <Select value={customerId} onValueChange={setCustomerId}>
                        <SelectTrigger className="border-white/10 bg-black/20"><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                        <SelectContent>{customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.full_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100/80">
                      <div className="flex items-center gap-2 font-semibold text-emerald-300"><ShieldCheck className="h-4 w-4" /> Fluxo supervisionado</div>
                      <p className="mt-2">O preço vem do catálogo cadastrado. Imagens de baixa confiança entram em revisão.</p>
                    </div>
                    <Button onClick={analyze} disabled={busy || !customerId || files.length === 0} className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500">
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Analisar {files.length || ''} foto{files.length === 1 ? '' : 's'}
                    </Button>
                  </div>
                </div>
                {files.length > 0 && <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">{files.map((entry) => <PreviewCard key={entry.id} entry={entry} onRemove={() => removeFile(entry.id)} />)}</div>}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><h3 className="font-semibold">Revise somente o que precisa de atenção</h3><p className="text-sm text-white/50">{unresolved.length} de {items.length} item(ns) ainda precisam de confirmação.</p></div>
                  <div className="min-w-52"><Progress value={items.length ? ((items.length - unresolved.length) / items.length) * 100 : 0} className="h-2" /><p className="mt-1 text-right text-xs text-white/40">Total: {currency(total)}</p></div>
                </div>
                {items.map((item, index) => (
                  <div key={item.line_id || index} className="space-y-2">
                    <ReviewCard item={item} index={index} products={products} onChange={(next) => setItems((current) => current.map((candidate, itemIndex) => itemIndex === index ? next : candidate))} />
                    {item.product_id && item.recognition_status !== 'confirmed' && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => confirmItem(index)}><Check className="mr-2 h-4 w-4" />Confirmar item</Button></div>}
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                  <Button variant="ghost" onClick={() => setStep(1)} disabled={busy}><ChevronLeft className="mr-2 h-4 w-4" />Voltar às fotos</Button>
                  <Button onClick={saveQuote} disabled={busy || unresolved.length > 0} className="bg-violet-500 hover:bg-violet-400">Salvar orçamento <ChevronRight className="ml-2 h-4 w-4" /></Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="mx-auto max-w-2xl space-y-6 py-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300"><Check className="h-8 w-8" /></div>
                <div><h3 className="text-2xl font-bold">Orçamento criado</h3><p className="mt-2 text-white/50">{selectedCustomer?.full_name} · {items.length} item(ns) · {currency(total)}</p></div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-left">
                  <div className="flex gap-3"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /><div><p className="font-semibold">Nenhuma cobrança foi registrada.</p><p className="mt-1 text-sm text-white/50">Crie o ticket somente quando o cliente aprovar o orçamento. O pagamento continuará sendo uma etapa separada.</p></div></div>
                </div>
                {createdOrder ? (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-emerald-200">Ticket <strong>{createdOrder.ticket_number}</strong> criado com peças individualizadas.</div>
                ) : (
                  <Button onClick={createOrder} disabled={busy} className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 hover:from-emerald-400 hover:to-cyan-400">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Cliente aprovou: criar ticket</Button>
                )}
                <div><Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>Fechar</Button></div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
