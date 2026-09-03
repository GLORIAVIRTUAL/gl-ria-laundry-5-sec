import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { base44 } from '@/api/base44Client';
import { Loader2, Search, Plus, Minus, ShoppingCart, User, CreditCard, CheckCircle2, ArrowRight, ArrowLeft, Shirt, DollarSign } from 'lucide-react';
import ProductIcon from '@/components/ui/ProductIcon';
import TimeField from '@/components/management/TimeField';
import { toast } from 'sonner';

export default function AdvancedQuoteModal({ isOpen, onClose, pipeline, stage, unitId, onSuccess, skipLinkStep = false }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form Data
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const [allCustomers, setAllCustomers] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cart, setCart] = useState([]); // Array of { product, qty }
  const [priority, setPriority] = useState('MEDIUM');
  const [paymentMethod, setPaymentMethod] = useState('cash'); // cash, pix, machine
  const [machineType, setMachineType] = useState('debit'); // debit, credit (quando machine)
  const [installments, setInstallments] = useState(1); // parcelas quando crédito
  const [cardBrandId, setCardBrandId] = useState(''); // bandeira selecionada na maquininha
  const [cardFees, setCardFees] = useState([]);
  const [times, setTimes] = useState({ wash_time: '', dry_time: '', dry_clean_time: '', iron_time: '' });

  useEffect(() => {
    if (isOpen) {
      fetchProducts();
      setStep(1);
      setCart([]);
      setPaymentReceived(false);
      setCreatedOrder(null);
      setCustomerPhone('');
      setCustomerName('');
      setCustomerId(null);
      setPriority('MEDIUM');
      setPaymentMethod('cash');
      setMachineType('debit');
      setInstallments(1);
      setCardBrandId('');
      setTimes({ wash_time: '', dry_time: '', dry_clean_time: '', iron_time: '' });
      base44.entities.CardFee.filter({ active: true }, '-created_date', 200)
        .then(setCardFees).catch(() => setCardFees([]));
    }
  }, [isOpen]);

  // Initial Data Injection
  useEffect(() => {
    // Check for props first (if I added them) or window global
    const initData = window.initialQuoteData;
    if (isOpen && initData) {
        if (initData.phone) {
            setCustomerPhone(initData.phone);
            // Don't auto search if we have ID, just set it
        }
        if (initData.name) {
            setCustomerName(initData.name);
        }
        if (initData.id) {
            setCustomerId(initData.id);
        }
        // If we have phone but no ID, search
        if (initData.phone && !initData.id) {
             handlePhoneSearch(initData.phone);
        }
        
        window.initialQuoteData = null;
    }
  }, [isOpen]);

  const fetchProducts = async () => {
    try {
      const items = await base44.entities.Product.list(); // Fetch all products
      setProducts(items);
      const cats = [...new Set(items.map(p => p.category || 'Outros'))];
      setCategories(cats);
    } catch (err) {
      console.error("Error fetching products", err);
    }
  };

  // Load ALL customers once for autocomplete (paginated to fetch every record)
  useEffect(() => {
    if (isOpen && allCustomers.length === 0) {
      (async () => {
        try {
          const all = [];
          const pageSize = 500;
          let skip = 0;
          while (true) {
            const batch = await base44.entities.Customer.list('-created_date', pageSize, skip);
            if (!batch || batch.length === 0) break;
            all.push(...batch);
            if (batch.length < pageSize) break;
            skip += pageSize;
          }
          setAllCustomers(all);
        } catch (e) {
          console.error('Error loading customers', e);
        }
      })();
    }
  }, [isOpen]);

  const selectCustomer = (cust) => {
    setCustomerId(cust.id);
    setCustomerName(cust.full_name || '');
    setCustomerPhone((cust.phones && cust.phones[0]) || '');
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handlePhoneSearch = async (phone) => {
    setCustomerPhone(phone);
    setCustomerId(null);
    const clean = phone.replace(/\D/g, '');
    if (clean.length >= 3) {
      const matches = allCustomers.filter((c) =>
        (c.phones || []).some((p) => (p || '').replace(/\D/g, '').includes(clean))
      ).slice(0, 6);
      setSuggestions(matches);
      setShowSuggestions(matches.length > 0);
      const exact = allCustomers.find((c) => (c.phones || []).some((p) => (p || '').replace(/\D/g, '') === clean));
      if (exact) {
        setCustomerName(exact.full_name);
        setCustomerId(exact.id);
      }
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  const handleNameSearch = (name) => {
    setCustomerName(name);
    setCustomerId(null);
    if (name.length >= 2) {
      const matches = allCustomers.filter((c) =>
        (c.full_name || '').toLowerCase().includes(name.toLowerCase())
      ).slice(0, 6);
      setSuggestions(matches);
      setShowSuggestions(matches.length > 0);
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateQty = (productId, delta) => {
    setCart(prev => {
        return prev.map(item => {
            if (item.product.id === productId) {
                const newQty = Math.max(0, item.qty + delta);
                return { ...item, qty: newQty };
            }
            return item;
        }).filter(item => item.qty > 0);
    });
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.product.price * item.qty), 0);

  const handleSubmit = async () => {
    if (loading) return;
    if (!unitId) {
      toast.error("Selecione uma unidade antes de gerar o orçamento.");
      return;
    }
    if (cart.length === 0) {
      toast.error("Adicione ao menos um item ao orçamento.");
      return;
    }

    setLoading(true);
    try {
      let finalCustomerId = customerId;
      const cleanPhone = customerPhone.replace(/\D/g, '');

      if (!finalCustomerId && cleanPhone) {
        const existing = await base44.entities.Customer.filter({ phones: cleanPhone });
        if (existing?.length > 0) {
          finalCustomerId = existing[0].id;
        } else {
          const newCustomer = await base44.entities.Customer.create({
            full_name: customerName || `Cliente ${cleanPhone}`,
            phones: [cleanPhone],
            status: 'active',
            unit_id: unitId
          });
          finalCustomerId = newCustomer.id;
          toast.success('Novo cliente cadastrado automaticamente!');
        }
      }

      if (!finalCustomerId) throw new Error('customer_required');

      const quoteItems = cart.map((item) => ({
        line_id: crypto.randomUUID(),
        product_id: item.product.id,
        garment_type: item.product.name,
        qty: item.qty,
        unit_price: Number(item.product.price || 0),
        subtotal: Number(item.product.price || 0) * item.qty,
        total_amount: Number(item.product.price || 0) * item.qty,
        confidence: 1,
        recognition_status: 'manual',
        image_ids: [],
        document_asset_ids: [],
        attributes: {},
        damages: [],
        risk_tags: [],
        services: [],
        notes: item.product.description || ''
      }));

      const quote = await base44.entities.Quote.create({
        customer_id: finalCustomerId,
        unit_id: unitId,
        status: 'APPROVED',
        origin: 'management_manual',
        items: quoteItems,
        subtotal: cartTotal,
        total: cartTotal,
        discount: 0,
        addition: 0,
        catalog_version: products[0]?.catalog_version || '1',
        reviewed_at: new Date().toISOString()
      });

      const approval = await base44.functions.invoke('approve_quote', { quote_id: quote.id });
      const order = approval.data?.order;
      if (!order) throw new Error('order_creation_failed');

      const timingPatch = {
        wash_time: times.wash_time === '' ? undefined : Number(times.wash_time),
        dry_time: times.dry_time === '' ? undefined : Number(times.dry_time),
        dry_clean_time: times.dry_clean_time === '' ? undefined : Number(times.dry_clean_time),
        iron_time: times.iron_time === '' ? undefined : Number(times.iron_time)
      };
      await base44.entities.Order.update(order.id, timingPatch);

      let finalOrder = order;
      let paymentRequiresReconciliation = false;
      if (paymentReceived) {
        let finalMethod = paymentMethod;
        let paymentNote = '';
        let cardBrand;
        let feePercent;
        const selectedBrand = cardFees.find((fee) => fee.id === cardBrandId);

        if (paymentMethod === 'machine') {
          finalMethod = machineType;
          cardBrand = selectedBrand?.brand;
          feePercent = machineType === 'credit' ? selectedBrand?.credit_fees?.[installments] : selectedBrand?.debit_fee;
          paymentNote = machineType === 'credit' ? `Maquininha - Crédito ${installments}x` : 'Maquininha - Débito';
          if (cardBrand) paymentNote += ` (${cardBrand})`;
        } else {
          paymentNote = paymentMethod === 'pix' ? 'Pix informado no balcão' : 'Dinheiro recebido no balcão';
        }

        const paymentResponse = await base44.functions.invoke('record_counter_payment', {
          order_id: order.id,
          payment_method: finalMethod,
          confirmed_received: true,
          terminal_confirmed: paymentMethod === 'machine',
          installments: paymentMethod === 'machine' && machineType === 'credit' ? installments : undefined,
          card_brand: cardBrand,
          fee_percent: feePercent != null ? Number(feePercent) : undefined,
          idempotency_key: crypto.randomUUID(),
          notes: paymentNote
        });
        finalOrder = paymentResponse.data?.order || order;
        paymentRequiresReconciliation = paymentResponse.data?.requires_reconciliation === true;
      }

      setCreatedOrder(finalOrder);
      setStep(4);
      toast.success(!paymentReceived ? 'Ticket criado sem registrar pagamento.' : paymentRequiresReconciliation ? 'Ticket criado. O pagamento aguarda conciliação.' : 'Ticket criado e pagamento registrado.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível concluir o orçamento. Nenhuma cobrança automática foi realizada.');
    } finally {
      setLoading(false);
    }
  };



  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a0b36] border border-white/10 text-white max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
        <div className="p-6 border-b border-white/10 bg-white/5 flex justify-between items-center">
            <div>
                <DialogTitle className="text-xl">Novo Orçamento Inteligente</DialogTitle>
                <DialogDescription className="text-gray-400">
                    {step === 1 && "Identifique o cliente"}
                    {step === 2 && "Selecione os itens"}
                    {step === 3 && "Revisão e Pagamento"}
                </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${step >= 1 ? 'bg-[#FF6600]' : 'bg-gray-600'}`} />
                <div className={`w-10 h-0.5 ${step >= 2 ? 'bg-[#FF6600]' : 'bg-gray-600'}`} />
                <div className={`w-3 h-3 rounded-full ${step >= 2 ? 'bg-[#FF6600]' : 'bg-gray-600'}`} />
                <div className={`w-10 h-0.5 ${step >= 3 ? 'bg-[#FF6600]' : 'bg-gray-600'}`} />
                <div className={`w-3 h-3 rounded-full ${step >= 3 ? 'bg-[#FF6600]' : 'bg-gray-600'}`} />
            </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
            {/* STEP 1: CLIENTE */}
            {step === 1 && (
                <div className="p-8 max-w-md mx-auto space-y-6 mt-10">
                    <div className="space-y-2 relative">
                        <Label>WhatsApp do Cliente</Label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                            <Input 
                                value={customerPhone}
                                onChange={(e) => handlePhoneSearch(e.target.value)}
                                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                placeholder="Ex: 5511999999999"
                                className="pl-10 bg-white/5 border-white/10 h-12"
                                autoFocus
                            />
                        </div>
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute z-50 left-0 right-0 top-16 bg-[#23123f] border border-white/10 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                {suggestions.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => selectCustomer(c)}
                                        className="w-full text-left px-4 py-2.5 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0"
                                    >
                                        <div className="font-medium text-white">{c.full_name || 'Sem nome'}</div>
                                        <div className="text-xs text-gray-400">{(c.phones && c.phones[0]) || 'Sem telefone'}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                        {customerId && (
                            <p className="text-xs text-[#25D366] flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Cliente cadastrado encontrado
                            </p>
                        )}
                    </div>
                    
                    <div className="space-y-2" style={{ marginTop: showSuggestions && suggestions.length > 0 ? '15rem' : undefined }}>
                        <Label>Nome do Cliente</Label>
                        <Input 
                            value={customerName}
                            onChange={(e) => handleNameSearch(e.target.value)}
                            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                            placeholder="Nome completo"
                            className="bg-white/5 border-white/10 h-12"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Prioridade</Label>
                        <Select value={priority} onValueChange={setPriority}>
                            <SelectTrigger className="bg-white/5 border-white/10 h-12">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="LOW">Baixa</SelectItem>
                                <SelectItem value="MEDIUM">Média</SelectItem>
                                <SelectItem value="HIGH">Alta</SelectItem>
                                <SelectItem value="CRITICAL">Urgente</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            {/* STEP 2: ITENS */}
            {step === 2 && (
                <div className="flex h-full">
                    {/* Catalog */}
                    <div className="flex-1 p-6 border-r border-white/10 overflow-hidden flex flex-col">
                        <div className="mb-2 relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                            <Input 
                                placeholder="Buscar serviços..." 
                                className="pl-10 bg-white/5 border-white/10" 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        
                        {searchTerm ? (
                            <div className="flex-1 overflow-y-auto mt-2 pr-2 custom-scrollbar">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-20">
                                    {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(product => (
                                        <div 
                                            key={product.id} 
                                            onClick={() => addToCart(product)}
                                            className="bg-white/5 border border-white/10 rounded-xl p-4 cursor-pointer hover:border-[#FF6600] transition-all group relative overflow-hidden"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-[#FF6600] transition-colors">
                                                    <ProductIcon product={product} className="w-6 h-6" />
                                                </div>
                                                <span className="font-bold text-[#FF6600]">R$ {product.price}</span>
                                            </div>
                                            <h3 className="font-medium text-white truncate">{product.name}</h3>
                                            <p className="text-xs text-gray-500 line-clamp-2 mt-1">{product.description}</p>
                                            
                                            <div className="absolute inset-0 bg-[#FF6600]/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <Plus className="w-8 h-8 text-[#FF6600]" />
                                            </div>
                                        </div>
                                    ))}
                                    {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                                        <div className="col-span-full text-center text-gray-500 py-10">
                                            Nenhum item encontrado para "{searchTerm}"
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <Tabs defaultValue={categories[0]} className="flex-1 flex flex-col overflow-hidden">
                                <div className="w-full pb-4 flex-shrink-0">
                                    <TabsList className="bg-transparent h-auto p-0 gap-2 flex-wrap justify-start">
                                        {categories.map(cat => (
                                            <TabsTrigger 
                                                key={cat} 
                                                value={cat}
                                                className="data-[state=active]:bg-[#FF6600] data-[state=active]:text-white bg-white/5 border border-white/10 px-4 py-2 rounded-full"
                                            >
                                                {cat}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                </div>
                                
                                <div className="flex-1 overflow-y-auto mt-2 pr-2 custom-scrollbar">
                                    {categories.map(cat => (
                                        <TabsContent key={cat} value={cat} className="mt-0 outline-none">
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-20">
                                                {products.filter(p => p.category === cat).map(product => (
                                                    <div 
                                                        key={product.id} 
                                                        onClick={() => addToCart(product)}
                                                        className="bg-white/5 border border-white/10 rounded-xl p-4 cursor-pointer hover:border-[#FF6600] transition-all group relative overflow-hidden"
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-[#FF6600] transition-colors">
                                                                <ProductIcon product={product} className="w-6 h-6" />
                                                            </div>
                                                            <span className="font-bold text-[#FF6600]">R$ {product.price}</span>
                                                        </div>
                                                        <h3 className="font-medium text-white truncate">{product.name}</h3>
                                                        <p className="text-xs text-gray-500 line-clamp-2 mt-1">{product.description}</p>
                                                        
                                                        <div className="absolute inset-0 bg-[#FF6600]/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <Plus className="w-8 h-8 text-[#FF6600]" />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </TabsContent>
                                    ))}
                                </div>
                            </Tabs>
                        )}
                    </div>

                    {/* Cart Sidebar */}
                    <div className="w-80 bg-black/20 flex flex-col">
                        <div className="p-4 border-b border-white/10 bg-white/5">
                            <h3 className="font-bold flex items-center gap-2">
                                <ShoppingCart className="w-4 h-4 text-[#FF6600]" />
                                Carrinho ({cart.reduce((a, b) => a + b.qty, 0)})
                            </h3>
                        </div>
                        
                        <ScrollArea className="flex-1 p-4">
                            {cart.length === 0 ? (
                                <div className="text-center text-gray-500 mt-10">
                                    <Shirt className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                    Nenhum item selecionado
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {cart.map((item) => (
                                        <div key={item.product.id} className="bg-white/5 rounded-lg p-3 flex items-center gap-3">
                                            <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center text-gray-400">
                                                <ProductIcon product={item.product} className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium truncate">{item.product.name}</div>
                                                <div className="text-xs text-gray-400">R$ {item.product.price} un</div>
                                            </div>
                                            <div className="flex items-center gap-2 bg-black/20 rounded-md p-1">
                                                <button onClick={(e) => { e.stopPropagation(); updateQty(item.product.id, -1); }} className="p-1 hover:text-red-400"><Minus className="w-3 h-3" /></button>
                                                <span className="text-xs w-4 text-center">{item.qty}</span>
                                                <button onClick={(e) => { e.stopPropagation(); updateQty(item.product.id, 1); }} className="p-1 hover:text-green-400"><Plus className="w-3 h-3" /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>

                        <div className="p-4 border-t border-white/10 bg-white/5 space-y-4">
                            <div className="flex justify-between items-end">
                                <span className="text-gray-400">Total Estimado</span>
                                <span className="text-2xl font-bold text-[#FF6600]">R$ {cartTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 3: REVISÃO E PAGAMENTO */}
            {step === 3 && (
                <div className="flex flex-col h-full items-center p-8 space-y-8 overflow-y-auto custom-scrollbar">
                    <div className="bg-green-500/10 p-4 rounded-full">
                        <CheckCircle2 className="w-16 h-16 text-green-500" />
                    </div>
                    
                    <div className="text-center space-y-2">
                        <h2 className="text-2xl font-bold">Tudo pronto para criar!</h2>
                        <p className="text-gray-400">O orçamento será gerado e o card criado no CRM.</p>
                    </div>

                    <div className="bg-white/5 rounded-2xl p-6 w-full max-w-lg border border-white/10">
                        <div className="flex justify-between py-2 border-b border-white/10">
                            <span className="text-gray-400">Cliente</span>
                            <span className="font-medium">{customerName || 'Novo Cliente'}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-white/10">
                            <span className="text-gray-400">Itens</span>
                            <span className="font-medium">{cart.reduce((a, b) => a + b.qty, 0)} peças</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-white/10">
                            <span className="text-gray-400">Total</span>
                            <span className="font-bold text-[#FF6600]">R$ {cartTotal.toFixed(2)}</span>
                        </div>
                        
                        <div className="mt-6 space-y-2">
                            <Label>Forma de pagamento, se já recebida</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { id: 'cash', label: 'Dinheiro', icon: DollarSign },
                                    { id: 'pix', label: 'Pix', icon: DollarSign },
                                    { id: 'machine', label: 'Maquininha', icon: CreditCard }
                                ].map(method => (
                                    <button
                                        key={method.id}
                                        onClick={() => setPaymentMethod(method.id)}
                                        className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${
                                            paymentMethod === method.id 
                                            ? 'bg-[#FF6600]/20 border-[#FF6600] text-white' 
                                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                        }`}
                                    >
                                        <method.icon className="w-5 h-5 mb-1" />
                                        <span className="text-xs">{method.label}</span>
                                    </button>
                                ))}
                            </div>

                            {paymentMethod === 'machine' && (
                                <div className="mt-3 space-y-3 bg-black/20 rounded-lg p-4 border border-white/10">
                                    <div className="space-y-2">
                                        <Label className="text-sm">Tipo de Cartão</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'debit', label: 'Débito' },
                                                { id: 'credit', label: 'Crédito' }
                                            ].map(t => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => { setMachineType(t.id); setCardBrandId(''); }}
                                                    className={`p-2.5 rounded-lg border text-sm transition-all ${
                                                        machineType === t.id
                                                        ? 'bg-[#FF6600]/20 border-[#FF6600] text-white'
                                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                                    }`}
                                                >
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm">Bandeira do Cartão</Label>
                                        {(() => {
                                            const opts = cardFees.filter((f) => f.card_type === machineType);
                                            if (opts.length === 0) {
                                                return <p className="text-xs text-gray-500">Nenhuma bandeira de {machineType === 'debit' ? 'débito' : 'crédito'} cadastrada. Cadastre em Configurações → Taxas de Cartões.</p>;
                                            }
                                            return (
                                                <Select value={cardBrandId} onValueChange={setCardBrandId}>
                                                    <SelectTrigger className="bg-white/5 border-white/10 h-11">
                                                        <SelectValue placeholder="Selecione a bandeira" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {opts.map((f) => (
                                                            <SelectItem key={f.id} value={f.id}>{f.brand}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            );
                                        })()}
                                    </div>

                                    {machineType === 'credit' && (
                                        <div className="space-y-2">
                                            <Label className="text-sm">Parcelas</Label>
                                            <Select value={String(installments)} onValueChange={(v) => setInstallments(Number(v))}>
                                                <SelectTrigger className="bg-white/5 border-white/10 h-11">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                                                        <SelectItem key={n} value={String(n)}>
                                                            {n}x de R$ {(cartTotal / n).toFixed(2)}{n === 1 ? ' (à vista)' : ''}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => setPaymentReceived((value) => !value)}
                            className={`mt-5 flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${paymentReceived ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}
                        >
                            <CheckCircle2 className={`h-5 w-5 ${paymentReceived ? 'text-emerald-400' : 'text-gray-500'}`} />
                            <div>
                                <div className="font-medium">Pagamento já foi recebido e conferido</div>
                                <div className="text-xs text-gray-400">Desmarcado por padrão. O orçamento nunca confirma pagamento automaticamente.</div>
                            </div>
                        </button>

                        <div className="mt-6 space-y-4 border-t border-white/10 pt-4">
                            <Label className="text-[#FF6600]">Tempos de Processo (opcional)</Label>
                            <TimeField label="Lavagem" value={times.wash_time} onChange={(v) => setTimes({ ...times, wash_time: v })} />
                            <TimeField label="Secagem" value={times.dry_time} onChange={(v) => setTimes({ ...times, dry_time: v })} />
                            <TimeField label="Lavagem a Seco" value={times.dry_clean_time} onChange={(v) => setTimes({ ...times, dry_clean_time: v })} />
                            <TimeField label="Passar" value={times.iron_time} onChange={(v) => setTimes({ ...times, iron_time: v })} />
                        </div>
                    </div>
                </div>
            )}
            
            {/* STEP 4: SUCESSO E LINK */}
            {step === 4 && (
                <div className="flex flex-col h-full items-center justify-center p-8 space-y-8">
                    <div className="bg-green-500/10 p-4 rounded-full">
                        <CheckCircle2 className="w-16 h-16 text-green-500" />
                    </div>
                    <div className="text-center space-y-2">
                        <h2 className="text-2xl font-bold">Ticket criado com rastreabilidade</h2>
                        <p className="text-gray-400">O orçamento foi convertido em peças individuais sem cobrança automática.</p>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-6 w-full max-w-lg border border-white/10 text-center">
                        <p className="text-sm text-gray-400">Número do ticket</p>
                        <p className="mt-2 text-2xl font-bold text-[#FF6600]">{createdOrder?.ticket_number || createdOrder?.id?.slice(0, 8) || 'Criado'}</p>
                        <p className="mt-4 text-sm text-gray-400">
                            {paymentReceived ? 'Pagamento registrado após confirmação explícita do funcionário.' : 'Pagamento pendente. Gere um link ou receba no caixa quando necessário.'}
                        </p>
                    </div>
                </div>
            )}
        </div>

        <div className="p-4 border-t border-white/10 bg-white/5 flex justify-between items-center">
            {step > 1 && step < 4 ? (
                <Button variant="ghost" onClick={() => setStep(step - 1)} className="gap-2">
                    <ArrowLeft className="w-4 h-4" /> Voltar
                </Button>
            ) : step === 4 ? (
                 <div /> // Spacer
            ) : (
                <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            )}

            {step < 3 && (
                <Button 
                    onClick={() => setStep(step + 1)} 
                    className="bg-[#FF6600] hover:bg-[#ff7b24] gap-2"
                    disabled={step === 1 && !customerPhone}
                >
                    Próximo <ArrowRight className="w-4 h-4" />
                </Button>
            )}
            
            {step === 3 && (
                <Button onClick={handleSubmit} disabled={loading} className="bg-green-600 hover:bg-green-700 gap-2 px-8">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Confirmar e Criar Ticket
                </Button>
            )}
            
            {step === 4 && (
                <Button onClick={() => { onSuccess(); onClose(); }} className="bg-[#FF6600] hover:bg-[#ff7b24] gap-2 px-8">
                    Concluir
                </Button>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}