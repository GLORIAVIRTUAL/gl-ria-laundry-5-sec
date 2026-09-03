import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ProductIcon from "@/components/ui/ProductIcon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  Plus, 
  Trash2, 
  Send, 
  ImageIcon, 
  AlertCircle,
  Calculator
} from 'lucide-react';

export default function QuoteReviewModal({ isOpen, onClose, card, customer }) {
  const [quote, setQuote] = useState(null);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [addition, setAddition] = useState(0);
  const [customMessage, setCustomMessage] = useState("");

  useEffect(() => {
    if (isOpen && card?.linked_quote_id) {
      loadData();
    } else if (isOpen) {
        setLoading(false); // No linked quote
    }
  }, [isOpen, card]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [quoteData, productsData] = await Promise.all([
        base44.entities.Quote.get(card.linked_quote_id),
        base44.entities.Product.list('name')
      ]);
      setQuote(quoteData);
      setItems(quoteData.items || []);
      setProducts(productsData);
      setDiscount(quoteData.discount || 0);
      setAddition(quoteData.addition || 0);
    } catch (err) {
      console.error("Error loading quote data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    setItems([...items, { garment_type: '', qty: 1, unit_price: 0, notes: '' }]);
  };

  const handleRemoveItem = (index) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    const item = { ...newItems[index], [field]: value };

    // If changing product name, try to find price
    if (field === 'garment_type') {
        const product = products.find(p => p.name === value);
        if (product) {
            item.unit_price = product.price;
        }
    }

    newItems[index] = item;
    setItems(newItems);
  };

  const calculateTotal = () => {
    const subtotal = items.reduce((sum, item) => sum + ((item.qty ?? 1) * (item.unit_price || 0)), 0);
    return Math.max(0, subtotal - discount + addition);
  };

  const handleSendQuote = async () => {
    if (!quote) return;
    setSending(true);
    try {
      const total = calculateTotal();
      const updatedQuote = {
        ...quote,
        items,
        subtotal: items.reduce((sum, item) => sum + ((item.qty ?? 1) * (item.unit_price || 0)), 0),
        discount: parseFloat(discount) || 0,
        addition: parseFloat(addition) || 0,
        total,
        status: 'SENT',
        review_deadline_at: null // SLA met
      };

      // 1. Update Quote
      await base44.entities.Quote.update(quote.id, updatedQuote);

      // 2. Update CRM Card
      await base44.entities.CrmCard.update(card.id, {
        stage: 'Enviado ao cliente',
        priority: 'MEDIUM' // Lower priority now
      });

      // 3. Send Message via Z-API
      const itemsList = items.map(i => `• ${i.qty ?? 1}x ${i.garment_type}: R$ ${(i.unit_price || 0).toFixed(2)}`).join('\n');
      
      let breakdown = `Subtotal: R$ ${updatedQuote.subtotal.toFixed(2)}`;
      if (updatedQuote.discount > 0) breakdown += `\nDesconto: R$ ${updatedQuote.discount.toFixed(2)}`;
      if (updatedQuote.addition > 0) breakdown += `\nAcréscimo: R$ ${updatedQuote.addition.toFixed(2)}`;

      const message = `Olá ${customer.full_name}! Seu orçamento está pronto:

${itemsList}

${breakdown}
*Total: R$ ${total.toFixed(2)}*

${customMessage ? `${customMessage}\n\n` : ''}Para aprovar, responda "Aprovar".`;

      if (customer.phones?.[0]) {
          await base44.functions.invoke('zapi_sender', {
              phone: customer.phones[0],
              type: 'OPTION_LIST',
              message,
              optionList: {
                title: 'Aprovação do orçamento',
                buttonLabel: 'Abrir opções',
                options: [
                  { id: 'approve_quote', title: 'Aprovar', description: 'Seguir com o orçamento' },
                  { id: 'ask_human', title: 'Atendente', description: 'Falar com uma pessoa' }
                ]
              }
          });
      }

      onClose();
    } catch (err) {
      console.error("Error sending quote:", err);
      alert("Erro ao enviar orçamento.");
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a0b36] border border-white/10 text-white max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
             <Calculator className="w-5 h-5 text-[#FF6600]" />
             Revisão de Orçamento
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="animate-spin text-[#FF6600]" /></div>
        ) : !quote ? (
          <div className="p-8 text-center text-gray-400">
             <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
             <p>Nenhum orçamento vinculado a este card.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
             {/* Customer Info */}
             <div className="bg-white/5 p-3 rounded-lg flex justify-between items-center text-sm">
                <div>
                   <span className="text-gray-400">Cliente:</span> <span className="font-bold">{customer?.full_name}</span>
                </div>
                <div>
                   <span className="text-gray-400">Status Atual:</span> <span className="bg-[#FF6600]/20 text-[#FF6600] px-2 py-0.5 rounded text-xs ml-2">{quote.status}</span>
                </div>
             </div>

             {/* Items List */}
             <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex justify-between items-center mb-2">
                   <Label>Itens do Pedido</Label>
                   <Button size="sm" variant="ghost" onClick={handleAddItem} className="h-8 text-[#FF6600] hover:text-white hover:bg-[#FF6600]/20">
                      <Plus className="w-4 h-4 mr-1" /> Adicionar Item
                   </Button>
                </div>

                <div className="flex-1 overflow-y-auto bg-black/20 rounded-lg border border-white/10 p-3 pr-4 space-y-3">
                   {items.map((item, index) => (
                      <div key={index} className="flex gap-3 items-start bg-white/5 p-3 rounded-lg group border border-white/5 mt-2">
                         {item.image_url ? (
                             <a href={item.image_url} target="_blank" rel="noopener noreferrer" className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity" title="Ver imagem original">
                               <img src={item.image_url} alt="Item" className="w-16 h-16 rounded-md object-cover border border-white/10 shadow-sm" />
                             </a>
                         ) : (
                             <div className="w-16 h-16 shrink-0 rounded-md bg-white/10 flex items-center justify-center border border-white/5">
                                <ProductIcon name={item.garment_type} className="w-6 h-6 text-gray-500" />
                             </div>
                         )}
                         
                         <div className="flex-1 grid grid-cols-12 gap-2 mt-1">
                            <div className="col-span-5 relative">
                                <span className="absolute -top-4 left-0 text-[10px] text-gray-500">Peça</span>
                                <input 
                                   list="products"
                                   value={item.garment_type || ''}
                                   onChange={(e) => handleItemChange(index, 'garment_type', e.target.value)}
                                   placeholder="Peça"
                                   className="w-full bg-transparent border-b border-white/10 text-sm focus:outline-none focus:border-[#FF6600]"
                                />
                            </div>
                            <div className="col-span-2 relative">
                                <span className="absolute -top-4 left-0 w-full text-center text-[10px] text-gray-500">Qtd</span>
                                <input 
                                   type="number"
                                   value={item.qty ?? 1}
                                   onChange={(e) => handleItemChange(index, 'qty', parseInt(e.target.value) || 0)}
                                   className="w-full bg-transparent border-b border-white/10 text-sm text-center focus:outline-none focus:border-[#FF6600]"
                                />
                            </div>
                            <div className="col-span-3 relative">
                                <span className="absolute -top-4 right-0 text-[10px] text-gray-500">Preço</span>
                                <input 
                                   type="number"
                                   value={item.unit_price || 0}
                                   onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                   className="w-full bg-transparent border-b border-white/10 text-sm text-right focus:outline-none focus:border-[#FF6600]"
                                />
                            </div>
                            <div className="col-span-2 flex justify-end">
                                <button onClick={() => handleRemoveItem(index)} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            {item.notes && <div className="col-span-12 text-xs text-gray-500 italic mt-1">{item.notes}</div>}
                         </div>
                      </div>
                   ))}
                   <datalist id="products">
                      {products.map(p => <option key={p.id} value={p.name} />)}
                   </datalist>
                </div>
             </div>

             {/* Totals */}
             <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-400">Subtotal:</span>
                   <span>R$ {items.reduce((sum, item) => sum + ((item.qty ?? 1) * (item.unit_price || 0)), 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-400">Desconto:</span>
                   <div className="w-24">
                      <Input 
                         type="number"
                         value={discount}
                         onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                         className="h-7 text-right bg-white/5 border-white/10 text-sm"
                      />
                   </div>
                </div>
                <div className="flex justify-between items-center text-sm">
                   <span className="text-gray-400">Acréscimo:</span>
                   <div className="w-24">
                      <Input 
                         type="number"
                         value={addition}
                         onChange={(e) => setAddition(parseFloat(e.target.value) || 0)}
                         className="h-7 text-right bg-white/5 border-white/10 text-sm"
                      />
                   </div>
                </div>

                <div className="pt-2">
                    <Label className="text-xs text-gray-400">Mensagem adicional (opcional):</Label>
                    <Textarea 
                        value={customMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
                        placeholder="Ex: Conseguimos um desconto especial nas peças..."
                        className="bg-white/5 border-white/10 text-sm mt-1 min-h-[60px] resize-none"
                    />
                </div>

                <div className="flex justify-between items-center text-lg font-bold text-[#FF6600] pt-2 border-t border-white/10">
                   <span>Total Final:</span>
                   <span>R$ {calculateTotal().toFixed(2)}</span>
                </div>
             </div>
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={onClose} className="hover:bg-white/10 text-white">Cancelar</Button>
          <Button 
            onClick={handleSendQuote} 
            disabled={loading || sending || !quote}
            className="bg-[#4C12A1] hover:bg-[#5d1dbf] text-white"
          >
            {sending ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar Orçamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}