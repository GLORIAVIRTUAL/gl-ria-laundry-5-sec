import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Boxes, Camera, ClipboardCheck, FileText, Gauge, MapPin, PackageCheck, PackagePlus, Plus, Printer, ReceiptText, ShieldCheck, Shirt, Sparkles, TriangleAlert } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import IntelligentQuoteModal from './IntelligentQuoteModal';
import DocumentIntakeModal from './DocumentIntakeModal';
import ProductionBoard from './ProductionBoard';
import QualityInspectionModal from './QualityInspectionModal';
import InventoryPanel from './InventoryPanel';
import FinancialOperationsPanel from './FinancialOperationsPanel';
import ReviewQueue from './ReviewQueue';
import CashSessionModal from './CashSessionModal';
import ExceptionsPanel from './ExceptionsPanel';
import IntegrationReadiness from './IntegrationReadiness';
import GarmentLocationPanel from './GarmentLocationPanel';
import GarmentLabelPrintDialog from './GarmentLabelPrintDialog';
import GarmentDeliveryDialog from './GarmentDeliveryDialog';

function ActionCard({ icon: Icon, title, description, accent, onClick, badge }) {
  return (
    <button type="button" onClick={onClick} className="group rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-left transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.055]">
      <div className="flex items-start justify-between gap-3"><div className={`rounded-2xl bg-gradient-to-br p-2.5 text-white shadow-lg ${accent}`}><Icon className="h-5 w-5" /></div>{badge != null && <Badge variant="outline" className="border-white/10 text-white/55">{badge}</Badge>}</div>
      <h3 className="mt-4 font-semibold text-white">{title}</h3><p className="mt-1 text-sm leading-relaxed text-white/42">{description}</p>
    </button>
  );
}

export default function ManagementCommandCenter({ selectedUnitId, defaultUnitId, customers = [], onManualEntry, onManualQuote }) {
  const queryClient = useQueryClient();
  const [smartQuoteOpen, setSmartQuoteOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [inspectionGarment, setInspectionGarment] = useState(null);
  const [workspaceTab, setWorkspaceTab] = useState('operations');
  const [labelGarments, setLabelGarments] = useState([]);
  const [deliveryGarments, setDeliveryGarments] = useState([]);
  const unitId = selectedUnitId === 'all' ? defaultUnitId : selectedUnitId;

  const queryOptions = { staleTime: 60_000, retry: 1 };
  const { data: garments = [] } = useQuery({ queryKey: ['command-garments'], queryFn: () => base44.entities.GarmentItem.filter({}, '-created_date', 3000), ...queryOptions });
  const { data: reviews = [] } = useQuery({ queryKey: ['command-reviews'], queryFn: () => base44.entities.HumanReview.filter({}, '-created_date', 1000), ...queryOptions });
  const { data: stockItems = [] } = useQuery({ queryKey: ['command-stock'], queryFn: () => base44.entities.StockItem.filter({ active: true }, 'name', 2000), ...queryOptions });
  const { data: purchaseDocuments = [] } = useQuery({ queryKey: ['command-purchases'], queryFn: () => base44.entities.PurchaseDocument.filter({}, '-created_date', 1000), ...queryOptions });
  const { data: suppliers = [] } = useQuery({ queryKey: ['command-suppliers'], queryFn: () => base44.entities.Supplier.filter({ active: true }, 'corporate_name', 1000), ...queryOptions });
  const { data: payables = [] } = useQuery({ queryKey: ['command-payables'], queryFn: () => base44.entities.AccountsPayable.filter({}, 'due_date', 2000), ...queryOptions });
  const { data: receivables = [] } = useQuery({ queryKey: ['command-receivables'], queryFn: () => base44.entities.AccountsReceivable.filter({}, 'due_date', 2000), ...queryOptions });
  const { data: financialDocuments = [] } = useQuery({ queryKey: ['command-financial-documents'], queryFn: () => base44.entities.FinancialDocument.filter({}, '-created_date', 1000), ...queryOptions });
  const { data: cashSessions = [] } = useQuery({ queryKey: ['command-cash-sessions'], queryFn: () => base44.entities.CashSession.filter({}, '-opened_at', 500), ...queryOptions });
  const { data: bankTransactions = [] } = useQuery({ queryKey: ['command-bank-transactions'], queryFn: () => base44.entities.BankTransaction.filter({}, '-transaction_date', 2000), ...queryOptions });
  const { data: thirdPartyJobs = [] } = useQuery({ queryKey: ['command-third-party-jobs'], queryFn: () => base44.entities.ThirdPartyJob.filter({}, '-created_date', 1000), ...queryOptions });
  const { data: thirdPartyPartners = [] } = useQuery({ queryKey: ['command-third-party-partners'], queryFn: () => base44.entities.ThirdPartyPartner.filter({ active: true }, 'trade_name', 500), ...queryOptions });
  const { data: reworkCases = [] } = useQuery({ queryKey: ['command-rework-cases'], queryFn: () => base44.entities.ReworkCase.filter({}, '-opened_at', 1000), ...queryOptions });
  const { data: locations = [] } = useQuery({ queryKey: ['command-locations'], queryFn: () => base44.entities.Location.filter({ active: true }, 'code', 2000), ...queryOptions });
  const { data: orders = [] } = useQuery({ queryKey: ['command-orders'], queryFn: () => base44.entities.Order.filter({}, '-created_date', 3000), ...queryOptions });

  const scoped = (records) => records.filter((record) => selectedUnitId === 'all' || record.unit_id === selectedUnitId);
  const summary = useMemo(() => {
    const scopedGarments = scoped(garments);
    const activeGarments = scopedGarments.filter((item) => !['delivered', 'cancelled'].includes(item.status));
    const overdue = activeGarments.filter((item) => item.due_at && new Date(item.due_at) < new Date()).length;
    const pendingReviews = scoped(reviews).filter((item) => ['pending', 'in_progress'].includes(item.status)).length;
    const lowStock = scoped(stockItems).filter((item) => Number(item.current_quantity || 0) <= Number(item.minimum_quantity || 0)).length;
    const pendingPayables = scoped(payables).filter((item) => !['paid', 'cancelled'].includes(item.status)).length;
    return { activeGarments: activeGarments.length, overdue, pendingReviews, lowStock, pendingPayables };
  }, [garments, reviews, stockItems, payables, selectedUnitId]);

  const refreshAll = () => {
    ['command-garments', 'command-reviews', 'command-stock', 'command-purchases', 'command-suppliers', 'command-payables', 'command-receivables', 'command-financial-documents', 'command-cash-sessions', 'command-bank-transactions', 'command-third-party-jobs', 'command-third-party-partners', 'command-rework-cases', 'command-locations', 'command-orders', 'mgmt-orders', 'mgmt-payments', 'mgmt-finance', 'mgmt-audit'].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  };

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#261044] via-[#1c0c34] to-[#10243a] p-6 shadow-2xl shadow-violet-950/20 md:p-8">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" /><div className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-2xl"><div className="flex items-center gap-2 text-sm font-medium text-violet-200"><Sparkles className="h-4 w-4" />Operação assistida por inteligência</div><h2 className="mt-2 text-2xl font-bold text-white md:text-3xl">Centro de comando da lavanderia</h2><p className="mt-2 text-sm leading-relaxed text-white/48 md:text-base">Registre peças por foto, leia notas e contas, acompanhe cada roupa e trate somente as exceções que exigem decisão humana.</p></div>
          <div className="flex flex-wrap gap-2"><Button onClick={() => setSmartQuoteOpen(true)} className="bg-gradient-to-r from-violet-500 to-fuchsia-500"><Camera className="mr-2 h-4 w-4" />Orçamento por fotos</Button><Button variant="outline" onClick={onManualQuote} className="border-white/15 bg-white/5"><Plus className="mr-2 h-4 w-4" />Orçamento manual</Button></div>
        </div>
        <div className="relative mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Peças em operação', summary.activeGarments, Shirt, 'text-sky-300'], ['Atrasos', summary.overdue, TriangleAlert, 'text-red-300'], ['Revisões', summary.pendingReviews, ClipboardCheck, 'text-violet-300'], ['Estoque baixo', summary.lowStock, Boxes, 'text-amber-300'], ['Contas abertas', summary.pendingPayables, Banknote, 'text-emerald-300'],
          ].map(([label, value, Icon, tone]) => <div key={label} className="rounded-2xl border border-white/10 bg-black/15 p-4 backdrop-blur"><div className="flex items-center justify-between"><span className="text-xs text-white/40">{label}</span><Icon className={`h-4 w-4 ${tone}`} /></div><p className="mt-2 text-2xl font-bold text-white">{value}</p></div>)}
        </div>
      </div>

      <IntegrationReadiness />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ActionCard icon={Camera} title="Fotos das peças" description="Identificar, relacionar ao catálogo e calcular o orçamento." accent="from-violet-500 to-fuchsia-600" onClick={() => setSmartQuoteOpen(true)} />
        <ActionCard icon={PackagePlus} title="Nota de compra" description="Extrair fornecedor, itens, preços e quantidades." accent="from-orange-500 to-amber-500" onClick={() => setPurchaseOpen(true)} />
        <ActionCard icon={ReceiptText} title="Conta ou fatura" description="Ler vencimento, consumo, valor e código de pagamento." accent="from-sky-500 to-blue-600" onClick={() => setBillOpen(true)} />
        <ActionCard icon={Banknote} title="Caixa" description="Abrir, movimentar, conferir e fechar por operador." accent="from-emerald-500 to-teal-600" onClick={() => setCashOpen(true)} />
        <ActionCard icon={FileText} title="Lançamento manual" description="Manter o formulário financeiro já conhecido." accent="from-slate-500 to-slate-700" onClick={onManualEntry} />
        <ActionCard icon={MapPin} title="Localizar peça" description="Buscar por ticket, cliente, características ou leitura da etiqueta." accent="from-cyan-500 to-blue-600" onClick={() => { setWorkspaceTab('custody'); document.getElementById('management-workspace')?.scrollIntoView({ behavior: 'smooth' }); }} />
        <ActionCard icon={PackageCheck} title="Entrega parcial" description="Selecionar somente as peças prontas e emitir comprovante." accent="from-emerald-500 to-teal-600" onClick={() => { setWorkspaceTab('custody'); document.getElementById('management-workspace')?.scrollIntoView({ behavior: 'smooth' }); }} />
        <ActionCard icon={Printer} title="Etiquetas" description="Impressão térmica por peça com QR e reimpressão auditada." accent="from-orange-500 to-rose-500" onClick={() => { setWorkspaceTab('custody'); document.getElementById('management-workspace')?.scrollIntoView({ behavior: 'smooth' }); }} />
        <ActionCard icon={ShieldCheck} title="Revisões" description="Centralizar baixa confiança e decisões sensíveis." accent="from-indigo-500 to-violet-600" badge={summary.pendingReviews} onClick={() => { setWorkspaceTab('reviews'); document.getElementById('management-workspace')?.scrollIntoView({ behavior: 'smooth' }); }} />
      </div>

      <Tabs id="management-workspace" value={workspaceTab} onValueChange={setWorkspaceTab} className="space-y-5 scroll-mt-6">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl bg-white/5 p-1.5">
          <TabsTrigger value="operations" className="gap-2 whitespace-nowrap data-[state=active]:bg-violet-500 data-[state=active]:text-white"><Gauge className="h-4 w-4" />Operação</TabsTrigger>
          <TabsTrigger value="custody" className="gap-2 whitespace-nowrap data-[state=active]:bg-violet-500 data-[state=active]:text-white"><MapPin className="h-4 w-4" />Etiquetas e entrega</TabsTrigger>
          <TabsTrigger value="inventory" className="gap-2 whitespace-nowrap data-[state=active]:bg-violet-500 data-[state=active]:text-white"><Boxes className="h-4 w-4" />Insumos</TabsTrigger>
          <TabsTrigger value="financial" className="gap-2 whitespace-nowrap data-[state=active]:bg-violet-500 data-[state=active]:text-white"><Banknote className="h-4 w-4" />Contas e caixa</TabsTrigger>
          <TabsTrigger value="reviews" className="gap-2 whitespace-nowrap data-[state=active]:bg-violet-500 data-[state=active]:text-white"><ClipboardCheck className="h-4 w-4" />Revisões {summary.pendingReviews > 0 && <Badge className="ml-1 bg-orange-500 text-white">{summary.pendingReviews}</Badge>}</TabsTrigger>
        </TabsList>
        <TabsContent value="operations" className="space-y-6"><ProductionBoard garments={garments} customers={customers} selectedUnitId={selectedUnitId} defaultUnitId={defaultUnitId} onRefresh={refreshAll} onInspect={setInspectionGarment} /><ExceptionsPanel jobs={thirdPartyJobs} partners={thirdPartyPartners} reworkCases={reworkCases} garments={garments} unitId={unitId} onRefresh={refreshAll} /></TabsContent>
        <TabsContent value="custody"><GarmentLocationPanel garments={garments} locations={locations} customers={customers} selectedUnitId={selectedUnitId} defaultUnitId={defaultUnitId} onRefresh={refreshAll} onPrintLabels={setLabelGarments} onDeliver={setDeliveryGarments} /></TabsContent>
        <TabsContent value="inventory"><InventoryPanel stockItems={stockItems} purchaseDocuments={purchaseDocuments} suppliers={suppliers} selectedUnitId={selectedUnitId} onNewPurchase={() => setPurchaseOpen(true)} /></TabsContent>
        <TabsContent value="financial"><FinancialOperationsPanel payables={payables} receivables={receivables} financialDocuments={financialDocuments} cashSessions={cashSessions} bankTransactions={bankTransactions} selectedUnitId={selectedUnitId} onNewBill={() => setBillOpen(true)} onCash={() => setCashOpen(true)} onRefresh={refreshAll} /></TabsContent>
        <TabsContent value="reviews"><ReviewQueue reviews={reviews} selectedUnitId={selectedUnitId} onRefresh={refreshAll} /></TabsContent>
      </Tabs>

      <IntelligentQuoteModal open={smartQuoteOpen} onOpenChange={setSmartQuoteOpen} customers={customers} defaultUnitId={unitId} onCreated={refreshAll} />
      <DocumentIntakeModal open={purchaseOpen} onOpenChange={setPurchaseOpen} mode="purchase" unitId={unitId} onProcessed={refreshAll} />
      <DocumentIntakeModal open={billOpen} onOpenChange={setBillOpen} mode="financial" unitId={unitId} onProcessed={refreshAll} />
      <CashSessionModal open={cashOpen} onOpenChange={setCashOpen} unitId={unitId} sessions={cashSessions} onProcessed={refreshAll} />
      <QualityInspectionModal garment={inspectionGarment} open={!!inspectionGarment} onOpenChange={(value) => !value && setInspectionGarment(null)} onCompleted={refreshAll} />
      <GarmentLabelPrintDialog open={labelGarments.length > 0} onOpenChange={(value) => !value && setLabelGarments([])} garments={labelGarments} onPrinted={refreshAll} />
      <GarmentDeliveryDialog open={deliveryGarments.length > 0} onOpenChange={(value) => !value && setDeliveryGarments([])} garments={deliveryGarments} orders={orders} customers={customers} onCompleted={() => { setDeliveryGarments([]); refreshAll(); }} />
    </section>
  );
}
