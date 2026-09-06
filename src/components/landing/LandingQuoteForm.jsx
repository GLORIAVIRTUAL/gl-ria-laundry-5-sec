import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Trash2, Shirt, Loader2, Send, CheckCircle2, ChevronDown, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const SUGGESTIONS = {
  color: ['Branco', 'Preto', 'Azul', 'Vermelho', 'Verde', 'Bege', 'Cinza', 'Rosa'],
  material: ['Algodão', 'Poliéster', 'Lã', 'Seda', 'Linho', 'Couro', 'Viscose', 'Sintético'],
  pattern: ['Liso', 'Listrado', 'Xadrez', 'Floral', 'Estampado', 'Poá'],
  size: ['PP', 'P', 'M', 'G', 'GG', 'XG', 'Único'],
};
const DAMAGES = ['Mancha', 'Rasgo', 'Furo', 'Desgaste', 'Desbotado', 'Costura solta', 'Botão ausente', 'Zíper danificado'];

export default function LandingQuoteForm({ unitId }) {
  const [products, setProducts] = useState([]);
  const [pieces, setPieces] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);

  useEffect(() => {
    base44.entities.Product.list()
      .then(setProducts)
      .catch(() => setProducts([]));
  }, []);

  const addPiece = (product) => {
    const id = `p${Date.now()}`;
    setPieces((prev) => [...prev, {
      line_id: id,
      product_id: product.id,
      garment_type: product.name,
      unit_price: product.base_price || 0,
      quantity: 1,
      attributes: { color: '', brand: '', material: '', pattern: '', size: '' },
      damages: [],
      notes: '',
    }]);
    setExpandedId(id);
    setShowProductPicker(false);
  };

  const updatePiece = (id, patch) => {
    setPieces((prev) => prev.map((p) => p.line_id === id ? { ...p, ...patch } : p));
  };
  const updateAttr = (id, field, value) => {
    setPieces((prev) => prev.map((p) => p.line_id === id ? { ...p, attributes: { ...p.attributes, [field]: value } } : p));
  };
  const toggleDamage = (id, d) => {
    setPieces((prev) => prev.map((p) => {
      if (p.line_id !== id) return p;
      const has = (p.damages || []).includes(d);
      return { ...p, damages: has ? p.damages.filter((x) => x !== d) : [...(p.damages || []), d] };
    }));
  };
  const removePiece = (id) => setPieces((prev) => prev.filter((p) => p.line_id !== id));
  const changeQty = (id, delta) => {
    setPieces((prev) => prev.map((p) => p.line_id === id ? { ...p, quantity: Math.max(1, (p.quantity || 1) + delta) } : p));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Informe seu nome.');
    if (!form.phone.trim()) return setError('Informe seu telefone com DDD.');
    if (pieces.length === 0) return setError('Adicione ao menos uma peça.');
    setLoading(true);
    try {
      const lines = pieces.map((p, i) => {
        const attrs = [p.attributes?.color, p.attributes?.material, p.attributes?.pattern, p.attributes?.size, p.attributes?.brand].filter(Boolean).join(', ');
        const dmg = (p.damages || []).length ? ` | avarias: ${p.damages.join(', ')}` : '';
        const obs = p.notes ? ` | obs: ${p.notes}` : '';
        return `${p.quantity}x ${p.garment_type}${attrs ? ` (${attrs})` : ''}${dmg}${obs}`;
      });
      const message = `Olá! Sou ${form.name.trim()} e gostaria de um orçamento:\n${lines.join('\n')}`;
      const res = await base44.functions.invoke('landing_widget_start', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        message,
        unit_id: unitId || null,
        honeypot,
      });
      const data = res?.data || res;
      if (data?.error) return setError(data.error);
      setDone(true);
    } catch (err) {
      setError('Não foi possível enviar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10">
        <CheckCircle2 className="w-14 h-14 text-green-400 mb-4" />
        <p className="text-white font-semibold text-lg">Orçamento recebido!</p>
        <p className="text-white/60 text-sm mt-2 max-w-xs">Recebemos suas peças. Em breve entraremos em contato com o valor.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <input value={honeypot} onChange={(e) => setHoneypot(e.target.value)} type="text" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      {/* Customer */}
      <div className="grid grid-cols-2 gap-3">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder-white/30 focus:border-[#FF6600] focus:outline-none" />
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Telefone / WhatsApp" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder-white/30 focus:border-[#FF6600] focus:outline-none" />
      </div>

      {/* Pieces list */}
      <div className="space-y-2">
        <AnimatePresence>
          {pieces.map((p, i) => {
            const open = expandedId === p.line_id;
            return (
              <motion.div key={p.line_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="flex items-center gap-2 p-3">
                  <button type="button" onClick={() => setExpandedId(open ? null : p.line_id)} className="flex items-center gap-2 flex-1 text-left">
                    <Shirt className="w-4 h-4 text-[#FF6600] shrink-0" />
                    <span className="text-sm font-medium text-white truncate">{i + 1}. {p.garment_type}</span>
                    <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  <div className="flex items-center gap-1 bg-black/20 rounded-lg px-1">
                    <button type="button" onClick={() => changeQty(p.line_id, -1)} className="p-1 hover:bg-white/10 rounded"><Minus className="w-3 h-3" /></button>
                    <span className="text-xs font-semibold w-5 text-center">{p.quantity}</span>
                    <button type="button" onClick={() => changeQty(p.line_id, 1)} className="p-1 hover:bg-white/10 rounded"><Plus className="w-3 h-3" /></button>
                  </div>
                  <button type="button" onClick={() => removePiece(p.line_id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <AnimatePresence>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-white/10 p-3 space-y-3 bg-black/20">
                      <div className="grid grid-cols-2 gap-2">
                        <AttrField label="Cor" value={p.attributes?.color} options={SUGGESTIONS.color} onChange={(v) => updateAttr(p.line_id, 'color', v)} />
                        <AttrField label="Tecido" value={p.attributes?.material} options={SUGGESTIONS.material} onChange={(v) => updateAttr(p.line_id, 'material', v)} />
                        <AttrField label="Estampa" value={p.attributes?.pattern} options={SUGGESTIONS.pattern} onChange={(v) => updateAttr(p.line_id, 'pattern', v)} />
                        <AttrField label="Tamanho" value={p.attributes?.size} options={SUGGESTIONS.size} onChange={(v) => updateAttr(p.line_id, 'size', v)} />
                      </div>
                      <input value={p.attributes?.brand || ''} onChange={(e) => updateAttr(p.line_id, 'brand', e.target.value)} placeholder="Marca (opcional)" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs placeholder-white/30 focus:border-[#FF6600] focus:outline-none" />
                      <div>
                        <p className="text-xs text-white/50 mb-1.5">Avarias observadas</p>
                        <div className="flex flex-wrap gap-1.5">
                          {DAMAGES.map((d) => {
                            const sel = (p.damages || []).includes(d);
                            return <button key={d} type="button" onClick={() => toggleDamage(p.line_id, d)} className={`rounded-full border px-2.5 py-1 text-xs transition ${sel ? 'border-red-400/60 bg-red-500/20 text-red-100' : 'border-white/10 bg-white/5 text-white/50 hover:border-white/25'}`}>{d}</button>;
                          })}
                        </div>
                      </div>
                      <textarea value={p.notes || ''} onChange={(e) => updatePiece(p.line_id, { notes: e.target.value })} placeholder="Observações da peça (local da mancha, estado...)" rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs placeholder-white/30 focus:border-[#FF6600] focus:outline-none resize-none" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Add piece */}
      {showProductPicker ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 max-h-48 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {products.map((prod) => (
              <button key={prod.id} type="button" onClick={() => addPiece(prod)} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5 text-left hover:border-[#FF6600]/40 transition">
                <Shirt className="w-4 h-4 text-[#FF6600] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{prod.name}</p>
                  {prod.base_price ? <p className="text-[10px] text-white/40">R$ {Number(prod.base_price).toFixed(2)}</p> : null}
                </div>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setShowProductPicker(false)} className="mt-2 w-full text-xs text-white/50 hover:text-white py-1">Cancelar</button>
        </div>
      ) : (
        <button type="button" onClick={() => setShowProductPicker(true)} className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 hover:border-[#FF6600]/50 hover:bg-white/5 py-3 text-sm text-white/70 transition">
          <Plus className="w-4 h-4" /> Adicionar peça
        </button>
      )}

      {error && <p className="text-red-400 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</p>}

      <button type="submit" disabled={loading || pieces.length === 0} className="w-full bg-[#FF6600] hover:bg-[#e55c00] text-white font-semibold py-3 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {loading ? 'Enviando...' : `Pedir orçamento (${pieces.length} ${pieces.length === 1 ? 'peça' : 'peças'})`}
      </button>
    </form>
  );
}

function AttrField({ label, value, options, onChange }) {
  return (
    <div>
      <p className="text-xs text-white/50 mb-1">{label}</p>
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={`Ex: ${options[0]}`} className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs placeholder-white/30 focus:border-[#FF6600] focus:outline-none" />
      <div className="flex flex-wrap gap-1 mt-1">
        {options.slice(0, 5).map((o) => (
          <button key={o} type="button" onClick={() => onChange(value === o ? '' : o)} className={`rounded-full border px-2 py-0.5 text-[10px] transition ${value === o ? 'border-[#FF6600] bg-[#FF6600]/20 text-orange-100' : 'border-white/10 text-white/50 hover:border-white/25'}`}>{o}</button>
        ))}
      </div>
    </div>
  );
}