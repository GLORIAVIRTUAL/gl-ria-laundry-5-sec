import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { ShieldAlert } from 'lucide-react';

const TYPE_LABEL = {
  payment: { label: 'Venda', cls: 'bg-[#25D366]/20 text-[#25D366] border-[#25D366]/30' },
  finance_entry: { label: 'Lançamento', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  order: { label: 'Ticket', cls: 'bg-[#FF6600]/20 text-[#FF6600] border-[#FF6600]/30' }
};

const fmtDateTime = (d) => (d ? format(new Date(d), 'dd/MM/yyyy HH:mm') : '—');

export default function AuditLogTable({ logs }) {
  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <ShieldAlert className="h-5 w-5 text-red-400" /> Log de Auditoria
        </CardTitle>
        <CardDescription className="text-gray-300">Registro de exclusões de vendas, lançamentos e tickets (somente ADM)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-gray-400">Data / Hora</TableHead>
                <TableHead className="text-gray-400">Tipo</TableHead>
                <TableHead className="text-gray-400">Item</TableHead>
                <TableHead className="text-gray-400">Valor</TableHead>
                <TableHead className="text-gray-400">Motivo</TableHead>
                <TableHead className="text-gray-400">Usuário</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow className="border-white/10">
                  <TableCell colSpan={6} className="py-8 text-center text-gray-500">Nenhuma exclusão registrada</TableCell>
                </TableRow>
              ) : (
                logs.map((l) => {
                  const t = TYPE_LABEL[l.entity_type] || { label: l.entity_type, cls: 'bg-white/10 text-gray-300' };
                  return (
                    <TableRow key={l.id} className="border-white/10">
                      <TableCell className="text-gray-400 whitespace-nowrap">{fmtDateTime(l.created_date)}</TableCell>
                      <TableCell><Badge className={`border ${t.cls}`}>{t.label}</Badge></TableCell>
                      <TableCell className="text-gray-200">
                        {l.item_label || '—'}
                        {l.customer_name ? <span className="block text-xs text-gray-500">{l.customer_name}</span> : null}
                      </TableCell>
                      <TableCell className="text-gray-300 whitespace-nowrap">
                        {l.amount != null ? `R$ ${Number(l.amount).toFixed(2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-gray-300 max-w-[260px]">{l.reason}</TableCell>
                      <TableCell className="text-gray-400 whitespace-nowrap">
                        {l.user_name || l.user_email || '—'}
                        {l.user_email && l.user_name ? <span className="block text-xs text-gray-500">{l.user_email}</span> : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}