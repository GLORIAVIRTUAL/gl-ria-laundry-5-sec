import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { MessageSquare, Clock, Truck, Shirt, Sparkle, ShieldCheck, Droplets, Brush, Phone } from 'lucide-react';
import { Button } from "@/components/ui/button";
import LandingQuoteForm from '@/components/landing/LandingQuoteForm';

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

      {/* Hero — apenas a imagem original */}
      <section className="relative">
        <img src={HERO_IMG} alt="5àsec Unidade Teste" className="w-full h-auto object-cover" />
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

      {/* Quote section */}
      <section id="orcamento" className="py-24 bg-gradient-to-b from-[#1a0b36] to-[#120a24] relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold">Peça seu orçamento</h2>
            <p className="text-gray-400 mt-3">Escolha como prefere fazer. A gente cuida do resto.</p>
          </div>
          <div className="grid lg:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Manual form — multi-piece with characteristics */}
            <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-[#FF6600]/15 rounded-xl flex items-center justify-center">
                  <Shirt className="w-5 h-5 text-[#FF6600]" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Orçamento detalhado</h3>
                  <p className="text-gray-400 text-xs">Adicione suas peças com cor, tecido, avarias e observações.</p>
                </div>
              </div>
              <LandingQuoteForm unitId={null} />
            </div>

            {/* WhatsApp */}
            <div className="bg-white/5 rounded-2xl border border-white/10 p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-[#25D366]/20 rounded-xl flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-[#25D366]" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Pelo WhatsApp</h3>
                  <p className="text-gray-400 text-xs">Fale direto com a unidade e receba o orçamento no seu zap.</p>
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 py-10">
                <p className="text-white/70 text-sm max-w-xs">Toque abaixo e a conversa já começa com a mensagem pronta. Informe as peças e receba o valor.</p>
                <a href={`https://wa.me/${UNIT_WHATSAPP}?text=${waMessage}`} target="_blank" rel="noopener noreferrer" className="w-full">
                  <Button className="w-full bg-[#25D366] hover:bg-[#1faa50] text-white h-12 text-base">
                    <Phone className="w-5 h-5 mr-2" /> Abrir WhatsApp
                  </Button>
                </a>
                <div className="flex flex-wrap gap-4 justify-center text-xs text-white/50">
                  <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-[#FF6600]" /> Pronto em 24h</span>
                  <span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-[#FF6600]" /> Coleta e entrega</span>
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
              A Unidade Teste 5àsec oferece lavanderia, tratamento têxtil e delivery com coleta programada e controle total da peça do início ao fim.
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
          <p className="text-white/80 text-lg">Peça seu orçamento agora mesmo.</p>
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
    </div>
  );
}