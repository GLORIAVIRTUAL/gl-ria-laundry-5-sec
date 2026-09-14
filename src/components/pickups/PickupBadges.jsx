import React from 'react';
import { Badge } from "@/components/ui/badge";

export default function PickupBadges({ pickup }) {
  const paid = pickup?.metadata?.payment_confirmed === true;
  const free = !Number(pickup?.fee);

  return (
    <>
      {paid && (
        <Badge variant="outline" className="text-[10px] py-0 h-5 bg-green-500/20 text-green-300 border-green-500/40">
          PAGO (PIX)
        </Badge>
      )}
      {free && (
        <Badge variant="outline" className="text-[10px] py-0 h-5 bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
          GRÁTIS
        </Badge>
      )}
    </>
  );
}