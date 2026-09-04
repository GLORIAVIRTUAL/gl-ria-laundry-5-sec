import { useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, FileCheck2, Landmark, Loader2, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export default function FiscalReadinessPanel({ profiles = [], documents = [], orders = [], statements = [], selectedUnitId, defaultUnitId, onRefresh }) {
  const unitId = selectedUnitId === 'all' ? defaultUnitId : selectedUnitId;
  const profile = profiles.find((item) => item.unit_id === unitId) || null;
  const scopedDocuments = documents.filter((item) => selectedUnitId === 'all' || item.unit_id === selectedUnitId);
  const eligibleOrders = orders.filter((order) => order.unit_id === unitId && order.status !== 'cancelled' && (order.fiscal_document_ids || []).length === 0 && Number(order.total_amount || 0) > 0);
  const eligibleStatements = statements.filter((statement) => statement.unit_id === unitId && ['review', 'issued', 'partially_paid', 'paid'].includes(statement.status) && !statement.fiscal_document_id);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState('');
  const [form, setForm] = useState({
    legal_name: profile?.legal_name || '', trade_name: profile?.trade_name || '', tax_id: profile?.tax_id || '',
    municipal_registration: profile?.municipal_registration || '', service_code: profile?.service_code || '',
    service_description: profile?.service_description || 'Serviços de lavanderia', municipal_tax_code: profile?.municipal_tax_code || '',
    iss_rate: profile?.iss_rate ?? '', rps_series: profile?.rps_series || '1', next_rps_number: profile?.next_rps_number || 1,
  });
  useEffect(() => {
    if (!profile) return;
    setForm({
      legal_name: profile.legal_name || '', trade_name: profile.trade_name || '', tax_id: profile.tax_id || '',
      municipal_registration: profile.municipal_registration || '', service_code: profile.service_code || '',
      service_description: profile.service_description || 'Serviços de lavanderia', municipal_tax_code: profile.municipal_tax_code || '',
      iss_rate: profile.iss_rate ?? '', rps_series: profile.rps_series || '1', next_rps_number: profile.next_rps_number || 1,
    });
  }, [profile?.id]);
  const readiness = useMemo(() => {
    const missing = [];
    if (!form.legal_name.trim()) missing.push('Razão social');
    if (![11, 14].includes(form.tax_id.replace(/\D/g, '').length)) missing.push('CPF/CNPJ');
    if (!form.municipal_registration.trim()) missing.push('Inscrição municipal');
    if (!form.service_code.trim()) missing.push('Código do serviço');
    if (!form.service_description.trim()) missing.push('Descrição do serviço');
    if (!form.rps_series.trim()) missing.push('Série do RPS');
    return { missing, ready: missing.length === 0 };
  }, [form]);

  const execute = async (payload, success) => {
    setBusy(true);
    try {
      const response = await base44.functions.invoke('manage_fiscal_document', payload);
      toast.success(success);
      onRefresh?.();
      return response.data;
    } catch (error) {
      console.error(error);
      const code = error.response?.data?.error;
      const messages = {
        fiscal_profile_incomplete: 'Complete o perfil fiscal antes de preparar o RPS.',
        fiscal_recipient_incomplete: 'Complete os dados fiscais e o e-mail do tomador.',
        fiscal_transmission_not_implemented: 'A transmissão permanece desativada até a homologação futura.',
      };
      toast.error(messages[code] || 'Não foi possível concluir a operação fiscal.');
      throw error;
    } finally { setBusy(false); }
  };

  const saveProfile = () => execute({
    action: 'save_profile', unit_id: unitId, fiscal_profile_id: profile?.id,
    provider: 'national_nfse', municipality_code: '4314902', municipality_name: 'Porto Alegre',
    ...form, iss_rate: Number(form.iss_rate || 0), next_rps_number: Number(form.next_rps_number || 1),
  }, 'Perfil fiscal salvo com transmissão desativada.');

  const prepare = async () => {
    if (!source) return toast.error('Selecione um pedido ou faturamento.');
    const [type, id] = source.split(':');
    await execute({
      action: 'prepare', unit_id: unitId, fiscal_profile_id: profile?.id,
      order_ids: type === 'order' ? [id] : [], billing_statement_id: type === 'statement' ? id : undefined,
      competence_date: new Date().toISOString().slice(0, 10), idempotency_key: crypto.randomUUID(),
    }, 'RPS preparado localmente para validação.');
    setSource('');
  };

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 to-violet-500/5 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><div className="rounded-2xl bg-sky-500/15 p-2.5 text-sky-300"><Landmark className="h-5 w-5" /></div><div><h2 className="font-semibold text-white">Estrutura fiscal — Emissor Nacional</h2><p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/45">Porto Alegre passou a usar o Emissor Nacional. Nesta etapa o sistema prepara e valida o RPS, mas não transmite dados nem acessa certificado.</p></div></div><Badge variant="outline" className="border-amber-500/30 text-amber-200"><Ban className="mr-1 h-3 w-3" />Transmissão desativada</Badge></div></div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center justify-between"><div><h3 className="font-semibold text-white">Perfil fiscal da unidade</h3><p className="text-sm text-white/40">Nenhum segredo é armazenado neste cadastro.</p></div>{profile && <Badge variant="outline" className={profile.status === 'ready_for_homologation' ? 'border-emerald-500/30 text-emerald-300' : 'border-white/10 text-white/50'}>{profile.status}</Badge>}</div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Razão social"><Input value={form.legal_name} onChange={(event) => setForm((current) => ({ ...current, legal_name: event.target.value }))} className="border-white/10 bg-black/20" /></Field><Field label="Nome fantasia"><Input value={form.trade_name} onChange={(event) => setForm((current) => ({ ...current, trade_name: event.target.value }))} className="border-white/10 bg-black/20" /></Field><Field label="CNPJ/CPF"><Input value={form.tax_id} onChange={(event) => setForm((current) => ({ ...current, tax_id: event.target.value }))} className="border-white/10 bg-black/20" /></Field><Field label="Inscrição municipal"><Input value={form.municipal_registration} onChange={(event) => setForm((current) => ({ ...current, municipal_registration: event.target.value }))} className="border-white/10 bg-black/20" /></Field><Field label="Código do serviço"><Input value={form.service_code} onChange={(event) => setForm((current) => ({ ...current, service_code: event.target.value }))} className="border-white/10 bg-black/20" /></Field><Field label="Código de tributação"><Input value={form.municipal_tax_code} onChange={(event) => setForm((current) => ({ ...current, municipal_tax_code: event.target.value }))} className="border-white/10 bg-black/20" /></Field><Field label="Alíquota ISS (%)"><Input type="number" min="0" step="0.01" value={form.iss_rate} onChange={(event) => setForm((current) => ({ ...current, iss_rate: event.target.value }))} className="border-white/10 bg-black/20" /></Field><Field label="Série e próximo RPS"><div className="grid grid-cols-2 gap-2"><Input value={form.rps_series} onChange={(event) => setForm((current) => ({ ...current, rps_series: event.target.value }))} className="border-white/10 bg-black/20" /><Input type="number" min="1" value={form.next_rps_number} onChange={(event) => setForm((current) => ({ ...current, next_rps_number: event.target.value }))} className="border-white/10 bg-black/20" /></div></Field><div className="space-y-2 sm:col-span-2"><Label>Descrição do serviço</Label><Input value={form.service_description} onChange={(event) => setForm((current) => ({ ...current, service_description: event.target.value }))} className="border-white/10 bg-black/20" /></div></div>{!readiness.ready && <p className="mt-3 text-xs text-amber-200">Faltam: {readiness.missing.join(', ')}.</p>}<Button onClick={saveProfile} disabled={busy || !unitId} className="mt-4 w-full bg-sky-500 hover:bg-sky-400">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar perfil sem ativar transmissão</Button></div>

        <div className="space-y-5"><div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-violet-300" /><h3 className="font-semibold text-white">Preparar RPS</h3></div><p className="mt-1 text-sm text-white/40">Gera o documento interno e reserva a numeração. Nada será enviado.</p><div className="mt-4 space-y-3"><select value={source} onChange={(event) => setSource(event.target.value)} className="h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm text-white"><option value="">Selecione a origem</option><optgroup label="Pedidos">{eligibleOrders.slice(0, 300).map((order) => <option key={order.id} value={`order:${order.id}`}>{order.ticket_number || order.id} · {money(order.total_amount)}</option>)}</optgroup><optgroup label="Faturamentos">{eligibleStatements.slice(0, 100).map((statement) => <option key={statement.id} value={`statement:${statement.id}`}>{statement.statement_number} · {money(statement.total_amount)}</option>)}</optgroup></select><Button onClick={prepare} disabled={busy || !profile || !source} className="w-full bg-violet-500 hover:bg-violet-400"><ShieldCheck className="mr-2 h-4 w-4" />Preparar e validar localmente</Button></div></div><div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h3 className="font-semibold text-white">Documentos preparados</h3><div className="mt-4 space-y-3">{scopedDocuments.slice(0, 12).map((document) => <div key={document.id} className="rounded-2xl border border-white/10 bg-black/15 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-white">RPS {document.rps_series}-{document.rps_number}</p><p className="text-xs text-white/35">{document.recipient?.legal_name || document.recipient?.name}</p></div><Badge variant="outline" className={document.status === 'ready' ? 'border-emerald-500/30 text-emerald-300' : 'border-white/10 text-white/50'}>{document.status}</Badge></div><div className="mt-3 flex items-center justify-between"><span className="font-semibold text-white">{money(document.total_amount)}</span>{document.status === 'draft' && <Button size="sm" variant="outline" disabled={busy} onClick={() => execute({ action: 'validate', fiscal_document_id: document.id }, 'Estrutura do RPS validada.')} className="border-white/10 bg-white/5"><CheckCircle2 className="mr-2 h-3.5 w-3.5" />Validar</Button>}</div></div>)}{scopedDocuments.length === 0 && <p className="py-6 text-center text-sm text-white/35">Nenhum documento fiscal preparado.</p>}</div></div></div>
      </div>
    </section>
  );
}

function Field({ label, children }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
