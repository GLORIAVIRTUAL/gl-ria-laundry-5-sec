import {
  Calendar,
  Star,
  UserX,
  Clock,
  Gift,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Wallet,
  Banknote,
  Package,
  Factory,
  Receipt
} from 'lucide-react';

export const customerDispatchTypes = {
  consent_request: { icon: ShieldCheck, label: 'Solicitação de consentimento', color: 'text-emerald-500 bg-emerald-500/10' },
  birthday: { icon: Calendar, label: 'Aniversariante', color: 'text-pink-500 bg-pink-500/10' },
  satisfaction_survey: { icon: Star, label: 'Pesquisa de Satisfação', color: 'text-yellow-500 bg-yellow-500/10' },
  inactive_customer: { icon: UserX, label: 'Cliente Ausente', color: 'text-orange-500 bg-orange-500/10' },
  order_reminder: { icon: Clock, label: 'Lembrete de Pedido', color: 'text-blue-500 bg-blue-500/10' },
  promotional: { icon: Gift, label: 'Promocional', color: 'text-purple-500 bg-purple-500/10' },
  follow_up: { icon: MessageCircle, label: 'Follow-up', color: 'text-green-500 bg-green-500/10' }
};

export const managementDispatchTypes = {
  daily_sales_summary: { icon: TrendingUp, label: 'Vendas do dia', color: 'text-emerald-400 bg-emerald-400/10' },
  operational_alerts: { icon: AlertTriangle, label: 'Alertas operacionais', color: 'text-red-400 bg-red-400/10' },
  cash_closing: { icon: Wallet, label: 'Fechamento de caixa', color: 'text-cyan-400 bg-cyan-400/10' },
  pending_payments: { icon: Banknote, label: 'Cobranças em aberto', color: 'text-amber-400 bg-amber-400/10' },
  low_stock: { icon: Package, label: 'Estoque baixo', color: 'text-orange-400 bg-orange-400/10' },
  production_backlog: { icon: Factory, label: 'Produção atrasada', color: 'text-violet-400 bg-violet-400/10' },
  overdue_payables: { icon: Receipt, label: 'Contas a pagar vencidas', color: 'text-rose-400 bg-rose-400/10' }
};

export const allDispatchTypes = { ...customerDispatchTypes, ...managementDispatchTypes };

export const isManagementDispatch = (type) => Object.keys(managementDispatchTypes).includes(type);