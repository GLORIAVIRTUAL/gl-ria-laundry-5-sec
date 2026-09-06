import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, MessageSquare, Clock, Truck, Shirt, Send, Sparkles,
  Droplets, ShieldCheck, Sparkle, Brush, Loader2, Phone
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import QuoteWidget from '@/components/landing/QuoteWidget';
import { base44 } from '@/api/base44Client';

const HERO_IMG = "https://media.base44.com/images/public/6a99e42ee48200f5d8ddd176/ef3e95305_image.png";
const STORE_IMG = "https://media.base44.com/images/public/6a99e42ee48200f5d8ddd176/0819c7ea4_padrao.jpg";
const INTERIOR_IMG = "https://media.base44.com/images/public/6a99e42ee48200f5d8ddd176/8a97fb82d_images7.jpg";
const LOGO_IMG = "https://media.base44.com/images/public/6a99e42ee48200f5d8ddd176/250769bd5_ChatGPTImage3desetde202619_33_19.png";
const UNIT_WHATSAPP = "5587988020504";

const services = [
  { icon: Sparkle, title: "Revitalizar", desc: "Retira roupas do ciclo de uso e devolve o aspecto de novo." },
  { icon: ShieldCheck, title: "Impermeabilizar", desc: "Protege contra líquidos e sujeira do dia a dia." },
  { icon: Shirt, title: "Engomar", desc: "Prolonga a vida da peça com acabamento profissional." },
  { icon: Droplets, title: "Bactericida", desc: "Elimina ácaros e bactérias para mais higiene." },
  { icon: Brush, title: "Branquear", desc: "Tira manchas e devolve o branco das roupas claras." },
];

export default function Landing() {
  const [form, setForm] = useState({ name: '', phone: '', garment: '', qty: '', notes: '' });
  const [honeypot, setHoneypot] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submitManual = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Informe seu nome.');
    if (!form.phone.trim()) return setError('Informe seu telefone com DDD.');
    setLoading(true);
    try {
      const details = [
        form.garment && form.qty ? `${form.qty}x ${form.garment}` : form.garment || '',
        form.notes ? `Obs: ${form.notes}` : '',
      ].filter(Boolean).join(' — ');
      const message = `Olá! Sou ${form.name.trim()} e gostaria de um orçamento.${details ? ` ${details}` : ''}`;
      const res = await base44.functions.invoke('landing_widget_start', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        message,
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

  const waMessage = encodeURIComponent("Olá! Vim pelo site da Unidade Teste e gostaria de um orçamento de roupas.");

  return (
    <div className="min-h-screen bg-[#1a0b36] text-white font-sans selection:bg-[#FF6600] selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#1a0b36]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={LOGO_IMG} alt="5àsec Unidade Teste" className="h-16 w-auto object-contain" />
            <div className="hidden md:block">
              <p className="text-white font-bold text-sm leading-tight">Unidade Teste</p>
              <p className="text-white/50 text-xs">TEXTILE EXPERT</p>
            </div>
          </div>
          <nav className="hidden md:flex gap-8 text-sm font-medium text-gray-300">
            <a href="#servicos" className="hover:text-white transition-colors">Serviços</a>
            <a href="#orcamento" className="hover:text-white transition-colors">Orçamento</a>
            <a href="#unidade" className="hover:text-white transition-colors">A Unidade</a>
          </nav>
          <div className="flex gap-3">
            <a href={`https://wa.me/${UNIT_WHATSAPP}?text=${waMessage}`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="bg-[#25D366] hover:bg-[#1faa50] text-white">WhatsApp</Button>
            </a>
            <Link to="/admin"><Button variant="ghost" size="sm" className="text-gray-300 hover:text-white hover:bg-white/10">ADM</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <img src={HERO_IMG} alt="Atendimento 5àsec" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#1a0b36]/95 via-[#1a0b36]/80 to-[#1a0b36]/40" />
        <div className="relative max-w-7xl mx-auto px-6 py-24 lg:py-36 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="space-y-6">
            <span className="inline-block px-4 py-2 rounded-full border border-[#FF6600]/40 bg-[#FF6600]/10 text-[#FF6600] uppercase tracking-widest text-xs font-bold">
              Unidade Teste · 5àsec
            </span>
            <h1 className="text-4xl lg:text-6xl font-extrabold leading-tight">
              Orçamento de roupas <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF6600] to-orange-400">em segundos</span>.
            </h1>
            <p className="text-xl text-gray-200 leading-relaxed max-w-lg">
              Menos espera. Mais conversão. Mais controle. Peça seu orçamento pelo chat com a Glória, pelo WhatsApp ou preenchendo o formulário — a gente cuida do resto.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="#orcamento">
                <Button size="lg" className="bg-[#FF6600] hover:bg-[#e55c00] text-white px-8 h-12 text-lg w-full sm:w-auto">
                  Fazer orçamento
                </Button>
              </a>
              <a href={`https://wa.me/${UNIT_WHATSAPP}?text=${waMessage}`} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="bg-transparent border-white/20 hover:bg-white/10 text-white h-12 w-full">
                  <MessageSquare className="w-5 h-5 mr-2" /> Falar no WhatsApp
                </Button>
              </a>
            </div>
            <div className="flex flex-wrap gap-6 pt-2">
              <span className="flex items-center gap-2 text-sm text-white/80"><Clock className="w-4 h-4 text-[#FF6600]" /> Pronto em 24h</span>
              <span className="flex items-center gap-2 text-sm text-white/80"><Truck className="w-4 h-4 text-[#FF6600]" /> Coleta e entrega</span>
              <span className="flex items-center gap-2 text-sm text-white/80"><Sparkles className="w-4 h-4 text-[#FF6600]" /> IA 24/7</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Services */}
      <section id="servicos" className="py-24 bg-[#1a0b36] relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold">Serviços exclusivos 5àsec</h2>
            <p className="text-gray-400 mt-3">Muito mais que lavanderia. Tratamento têxtil profissional.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {services.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="bg-white/5 p-6 rounded-2xl border border-white/10 hover:border-[#FF6600]/40 transition-colors text-center"
              >
                <div className="w-14 h-14 mx-auto bg-[#FF6600]/10 rounded-2xl flex items-center justify-center mb-4">
                  <s.icon className="w-7 h-7 text-[#FF6600]" />
                </div>
                <h3 className="font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Quote section - 3 options */}
      <section id="orcamento" className="py-24 bg-gradient-to-b from-[#1a0b36] to-[#120a24] relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold">Escolha como orçar</h2>
            <p className="text-gray-400 mt-3">Três caminhos para o mesmo resultado: suas roupas prontas.</p>
          </div>
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Manual */}
            <div className="bg-white/5 rounded-2xl border border-white/10 p-6 flex flex-col">
              <div className="w-12 h-12 bg-[#4C12A1]/30 rounded-xl flex items-center justify-center mb-4">
                <Shirt className="w-6 h-6 text-[#FF6600]" />
              </div>
              <h3 className="font-bold text-xl mb-1">Orçamento Manual</h3>
              <p className="text-gray-400 text-sm mb-5">Preencha as peças e a gente te chama com o valor.</p>
              {done ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mb-3" />
                  <p className="text-white font-medium">Recebido! A Glória já vai montar seu orçamento e falar com você.</p>
                </div>
              ) : (
                <form onSubmit={submitManual} className="space-y-3 flex-1">
                  <input value={honeypot} onChange={(e) => setHoneypot(e.target.value)} type="text" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder-white/30 focus:border-[#FF6600] focus:outline-none" />
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Telefone / WhatsApp" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder-white/30 focus:border-[#FF6600] focus:outline-none" />
                  <div className="flex gap-2">
                    <input value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="Qtd" className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder-white/30 focus:border-[#FF6600] focus:outline-none" />
                    <input value={form.garment} onChange={(e) => setForm({ ...form, garment: e.target.value })} placeholder="Peça (ex: camisa)" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder-white/30 focus:border-[#FF6600] focus:outline-none" />
                  </div>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Observações (opcional)" rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm placeholder-white/30 focus:border-[#FF6600] focus:outline-none resize-none" />
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <button type="submit" disabled={loading} className="w-full bg-[#FF6600] hover:bg-[#e55c00] text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {loading ? 'Enviando...' : 'Pedir orçamento'}
                  </button>
                </form>
              )}
            </div>

            {/* WhatsApp */}
            <div className="bg-white/5 rounded-2xl border border-white/10 p-6 flex flex-col">
              <div className="w-12 h-12 bg-[#25D366]/20 rounded-xl flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-[#25D366]" />
              </div>
              <h3 className="font-bold text-xl mb-1">Pelo WhatsApp</h3>
              <p className="text-gray-400 text-sm mb-5">Fale direto com a unidade e receba o orçamento no seu zap.</p>
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-6">
                <p className="text-white/70 text-sm">Toque abaixo e a conversa já começa com a mensagem pronta.</p>
                <a href={`https://wa.me/${UNIT_WHATSAPP}?text=${waMessage}`} target="_blank" rel="noopener noreferrer" className="w-full">
                  <Button className="w-full bg-[#25D366] hover:bg-[#1faa50] text-white h-11">
                    <Phone className="w-4 h-4 mr-2" /> Abrir WhatsApp
                  </Button>
                </a>
              </div>
            </div>

            {/* Widget */}
            <div className="bg-gradient-to-br from-[#4C12A1]/30 to-[#FF6600]/10 rounded-2xl border border-[#FF6600]/30 p-6 flex flex-col">
              <div className="w-12 h-12 bg-[#FF6600]/20 rounded-xl flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-[#FF6600]" />
              </div>
              <h3 className="font-bold text-xl mb-1">Widget com a Glória</h3>
              <p className="text-gray-400 text-sm mb-5">Converse agora com a IA da 5àsec direto aqui no site.</p>
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-6">
                <p className="text-white/70 text-sm">Toque no balão no canto inferior para iniciar. A Glória monta seu orçamento na hora.</p>
                <div className="flex items-center gap-2 text-[#FF6600] text-sm font-medium">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /> Glória online agora
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Unit showcase */}
      <section id="unidade" className="py-24 bg-[#1a0b36]">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="rounded-2xl overflow-hidden border border-white/10">
            <img src={STORE_IMG} alt="Fachada Unidade Teste 5àsec" className="w-full h-auto object-cover" />
          </motion.div>
          <div className="space-y-6">
            <h2 className="text-3xl lg:text-4xl font-bold">Traga suas roupas para a líder mundial em lavanderias</h2>
            <p className="text-gray-300 text-lg leading-relaxed">
              A Unidade Teste 5àsec oferece lavanderia, tratamento têxtil e delivery com a tecnologia da Glória — atendimento inteligente 24/7, coleta programada e controle total da peça do início ao fim.
            </p>
            <div className="rounded-2xl overflow-hidden border border-white/10">
              <img src={INTERIOR_IMG} alt="Interior Unidade Teste 5àsec" className="w-full h-auto object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-[#4C12A1] to-[#6a1cb3]">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
          <h2 className="text-3xl lg:text-4xl font-extrabold">Pronto para suas roupas ficarem como novas?</h2>
          <p className="text-white/80 text-lg">Peça seu orçamento agora. A Glória responde em segundos.</p>
          <a href="#orcamento">
            <Button size="lg" className="bg-[#FF6600] hover:bg-[#e55c00] text-white px-10 h-14 text-lg">
              Fazer orçamento
            </Button>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#120a24] border-t border-white/10 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <img src={LOGO_IMG} alt="5àsec Unidade Teste" className="h-12 w-auto object-contain opacity-80" />
          <p className="text-sm text-gray-500">© 2026 5àsec Unidade Teste · TEXTILE EXPERT</p>
        </div>
      </footer>

      {/* Floating widget */}
      <QuoteWidget unitId={null} />
    </div>
  );
}