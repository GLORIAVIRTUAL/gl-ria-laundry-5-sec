import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  CheckCircle2, 
  MessageSquare, 
  Clock, 
  Truck,
  Banknote,
  Send,
  Megaphone,
  Shirt
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import ModulesSection from '@/components/landing/ModulesSection';
import MarketingSection from '@/components/landing/MarketingSection';
import PricingSection from '@/components/landing/PricingSection';

export default function Landing() {
  const heroImage = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6998e8554cc6b3863e37588a/e4f3985a0_Gemini_Generated_Image_8g4iwv8g4iwv8g4i-Edited.png";
  const logoImage = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6998e8554cc6b3863e37588a/deb6f92a5_Untitleddesign51.png";

  const benefits = [
    { icon: MessageSquare, title: "Atendimento 24/7 com IA", desc: "Sua IA responde no WhatsApp a qualquer hora, entende texto, áudio e foto, monta o orçamento sozinha e ainda passa pela revisão da sua equipe antes de enviar ao cliente." },
    { icon: Truck, title: "Coletas & Rotas Inteligentes", desc: "Agende coletas de forma automática ou manual e deixe o sistema montar a melhor rota de entrega do dia por endereço, com coletas prioritárias, recorrentes e encaixes." },
    { icon: Banknote, title: "Gestão & Financeiro", desc: "Controle toda a operação em um só painel: lançe entradas e saídas, acompanhe o fluxo de caixa, gere tickets de serviço e veja o lucro real de cada unidade." },
    { icon: Megaphone, title: "Marketing com IA", desc: "Crie designs e vídeos com a sua marca, publique posts nas redes e suba campanhas no Meta e no Google Ads com estratégia gerada por IA — sem precisar de agência." }
  ];

  const steps = [
    { number: "01", title: "Atende", desc: "IA responde no WhatsApp, gera orçamento e agenda a coleta." },
    { number: "02", title: "Organiza", desc: "Monta rotas, programa coletas recorrentes, prioritárias e encaixes." },
    { number: "03", title: "Gerencia", desc: "Controla financeiro, tickets e dispara campanhas de relacionamento." },
    { number: "04", title: "Divulga", desc: "Cria e publica posts e sobe tráfego pago no Meta e Google Ads." }
  ];

  const faqs = [
    { q: "É só atendimento?", a: "Não. Além do atendimento com IA, faz coletas e rotas, financeiro, disparos e todo o marketing da unidade." },
    { q: "Como funcionam as coletas?", a: "Agendamento automático e manual, com a melhor rota do dia por endereço, além de coletas prioritárias, recorrentes e encaixes." },
    { q: "Faz a gestão financeira?", a: "Sim. Controla entradas e saídas, gera tickets de serviço e dá a visão de lucro por unidade." },
    { q: "O que são os disparos?", a: "Mensagens automáticas ou manuais para aniversário, recuperação de clientes, promoções e pesquisa de satisfação — com relatório de retorno." },
    { q: "Preciso de agência de marketing?", a: "Não. O sistema cria designs, vídeos, agenda posts e sobe campanhas no Meta e no Google Ads sem gestor de tráfego." }
  ];

  return (
    <div className="min-h-screen bg-[#1a0b36] text-white font-sans selection:bg-[#FF6600] selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#1a0b36]/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logoImage} alt="Chat 5àsec" className="h-20 w-auto object-contain" />
          </div>
          <nav className="hidden md:flex gap-8 text-sm font-medium text-gray-300">
            <a href="#beneficios" className="hover:text-white transition-colors">Benefícios</a>
            <a href="#modulos" className="hover:text-white transition-colors">Módulos</a>
            <a href="#marketing" className="hover:text-white transition-colors">Marketing</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
            <a href="#preco" className="hover:text-white transition-colors">Preços</a>
          </nav>
          <div className="flex gap-4">
             <Link to="/admin">
                <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-white/10">ADM</Button>
             </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden bg-[#1a0b36] text-white">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-[#4C12A1]/20 blur-[120px] rounded-l-full pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <motion.span 
              animate={{ scale: [1, 1.02, 1], opacity: [1, 0.95, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="inline-block px-5 py-2.5 rounded-full border-2 border-[#FF6600] bg-gradient-to-r from-[#FF6600]/20 to-orange-500/10 shadow-lg shadow-[#FF6600]/40 backdrop-blur-sm"
            >
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF6600] via-orange-400 to-[#FF6600] uppercase tracking-widest text-sm font-black">
                O melhor sistema para lavanderias do mundo
              </span>
            </motion.span>
            <h1 className="text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white">Sistema completo criado para a rede 5àsec</span>: <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF6600] to-orange-400">atendimento, coletas, financeiro e marketing</span>.
            </h1>
            <p className="text-xl text-gray-300 leading-relaxed max-w-lg">
              Muito mais que um sistema de gestão. IA que atende 24/7 no WhatsApp, coletas com a melhor rota do dia por endereço, controle financeiro completo, disparos automáticos de relacionamento e marketing integrado — designs, vídeos, posts e campanhas pagas no Meta e Google Ads — sem agência.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/register-unit">
                <Button size="lg" className="bg-[#FF6600] hover:bg-[#e55c00] text-white px-8 h-12 text-lg w-full sm:w-auto">
                  Quero ver uma demonstração
                </Button>
              </Link>
              <a href="https://wa.me/5587988020504" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="bg-transparent border-white/20 hover:bg-white/10 text-white h-12 w-full">
                  Falar com especialista
                </Button>
              </a>
            </div>
            <p className="text-lg text-white font-medium tracking-wide flex items-center gap-2 mt-4">
              <CheckCircle2 className="w-5 h-5 text-[#FF6600]" />
              Sua equipe focada na experiência presencial.
            </p>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 group"
          >
             <img 
               src={heroImage} 
               alt="Atendimento 5àsec" 
               className="w-full h-auto object-cover transform group-hover:scale-105 transition-transform duration-700"
             />
             <div className="absolute inset-0 bg-gradient-to-t from-[#1a0b36] via-transparent to-transparent opacity-60 hidden md:block" />
             <div className="relative md:absolute md:bottom-6 md:left-6 md:right-6 bg-[#1a0b36] md:bg-transparent p-6 md:p-0">
                <div className="bg-white/5 md:bg-white/10 backdrop-blur-md border border-white/10 md:border-white/20 p-4 rounded-xl">
                   <p className="text-white font-medium text-center md:text-left">"Menos espera. Mais conversão. Mais controle."</p>
                </div>
             </div>
          </motion.div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="beneficios" className="py-24 bg-[#1a0b36] relative">
        <div className="absolute inset-0 bg-gradient-to-b from-[#1a0b36] to-black/20 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white">Tudo o que sua unidade precisa, em um só lugar</h2>
            <p className="text-gray-400 mt-4">Do atendimento ao marketing, com automação de ponta a ponta.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((item, idx) => (
              <div key={idx} className="bg-white/5 p-8 rounded-2xl shadow-lg border border-white/10 hover:border-[#FF6600]/30 transition-colors">
                <div className="w-12 h-12 bg-[#FF6600]/10 rounded-xl flex items-center justify-center mb-6">
                  <item.icon className="w-6 h-6 text-[#FF6600]" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">{item.title}</h3>
                <p className="text-gray-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules Section */}
      <ModulesSection />

      {/* Marketing Section (maior novidade) */}
      <MarketingSection />

      {/* AI Highlight Section */}
      <section className="py-24 bg-[#1a0b36] relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="space-y-10"
          >
              <h2 className="text-4xl md:text-5xl font-extrabold text-white">
                  Inteligência no atendimento <span className="text-[#FF6600]">24/7</span>
              </h2>
              <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/10 max-w-5xl mx-auto">
                  <img 
                      src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6998e8554cc6b3863e37588a/1fb85c0b9_Gemini_Generated_Image_yh3uk0yh3uk0yh3u-Edited.png" 
                      alt="Inteligência no atendimento" 
                      className="w-full h-auto object-cover"
                  />
              </div>
          </motion.div>
        </div>
      </section>

      {/* How it Works */}
      <section id="como-funciona" className="py-24 bg-[#1a0b36]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col lg:flex-row gap-16 items-center">
            <div className="lg:w-1/2 space-y-8">
              <h2 className="text-4xl font-bold text-white">Como funciona</h2>
              <p className="text-lg text-gray-400">Simples, integrado e eficiente. Um fluxo pensado para lavanderias.</p>
              
              <div className="space-y-6">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex gap-6 group">
                    <div className="w-12 h-12 shrink-0 rounded-full border-2 border-[#FF6600]/20 flex items-center justify-center font-bold text-[#FF6600] group-hover:bg-[#FF6600] group-hover:text-white transition-colors">
                      {step.number}
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-white mb-1">{step.title}</h4>
                      <p className="text-gray-400">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:w-1/2 bg-white/5 p-8 rounded-3xl border border-white/10">
                {/* Mock Chat Interface */}
                <div className="bg-[#1a0b36] rounded-2xl shadow-2xl overflow-hidden border border-white/10 max-w-md mx-auto">
                    <div className="bg-black/30 p-4 flex items-center gap-3 text-white border-b border-white/5">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><Shirt className="w-4 h-4" /></div>
                        <div>
                            <div className="font-medium text-sm">Chat 5àsec</div>
                            <div className="text-xs text-green-400">Online 24/7</div>
                        </div>
                    </div>
                    <div className="p-4 space-y-4 text-sm bg-[#1a0b36] h-80 relative">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none" />
                        <div className="bg-white/10 p-3 rounded-tr-xl rounded-br-xl rounded-bl-xl shadow-sm text-gray-200 max-w-[85%] relative z-10">
                            Olá! Sou o assistente virtual da 5àsec. Como posso ajudar hoje?
                        </div>
                        <div className="bg-[#FF6600] text-white p-3 rounded-tl-xl rounded-bl-xl rounded-br-xl shadow-sm ml-auto max-w-[85%] relative z-10">
                            Gostaria de um orçamento para 2 camisas.
                        </div>
                        <div className="bg-white/10 p-3 rounded-tr-xl rounded-br-xl rounded-bl-xl shadow-sm text-gray-200 max-w-[85%] relative z-10">
                            Claro! Por favor, envie uma foto das peças para eu analisar o tecido e passar o valor correto.
                        </div>
                    </div>
                </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <PricingSection />

      {/* FAQ */}
      <section id="faq" className="py-24 bg-[#1a0b36] relative">
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-[#1a0b36] pointer-events-none" />
        <div className="max-w-3xl mx-auto px-6 relative z-10">
            <h2 className="text-3xl font-bold text-white mb-12 text-center">Perguntas Frequentes</h2>
            <div className="space-y-4">
                {faqs.map((faq, i) => (
                    <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-6 hover:bg-white/10 transition-colors">
                        <h3 className="font-bold text-lg text-white mb-2">{faq.q}</h3>
                        <p className="text-gray-400">{faq.a}</p>
                    </div>
                ))}
            </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1a0b36] border-t border-white/10 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
                <img src={logoImage} alt="Chat 5àsec" className="h-12 w-auto grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all object-contain" />
            </div>
            <p className="text-sm text-gray-500">© 2026 Chat 5àsec SaaS. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}