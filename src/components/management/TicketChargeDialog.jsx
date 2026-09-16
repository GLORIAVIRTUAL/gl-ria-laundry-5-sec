import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import OrderPaymentActions from '@/components/management/OrderPaymentActions';

export default function TicketChargeDialog({ order, open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#1a0b36] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle>Cobrança do ticket #{order?.ticket_number || order?.id?.slice(-6)}</DialogTitle>
          <DialogDescription className="text-gray-400">
            Gere o Pix ou o link de cartão (Asaas) para R$ {Number(order?.total_amount || 0).toFixed(2)}.
          </DialogDescription>
        </DialogHeader>
        {order?.id && <OrderPaymentActions orderId={order.id} />}
      </DialogContent>
    </Dialog>
  );
}