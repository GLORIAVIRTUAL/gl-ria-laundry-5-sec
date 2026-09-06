import React from 'react';

export default function PieceServiceOptions({ piece, updatePiece, ironing, specialServices, fmt }) {
  const ironingAvailable = ironing?.active !== false;
  const selectedSpecials = piece.special_service_ids || [];
  const toggleSpecial = (id) => updatePiece({
    special_service_ids: selectedSpecials.includes(id)
      ? selectedSpecials.filter((serviceId) => serviceId !== id)
      : [...selectedSpecials, id],
  });

  return (
    <div className="space-y-3">
      <div>
        <p className="lq-attr-label">Serviço principal</p>
        <div className="lq-chips">
          <button type="button" onClick={() => updatePiece({ service_type: 'cleaning' })} className={`lq-chip ${piece.service_type !== 'ironing' ? 'active' : ''}`}>
            Lavagem
          </button>
          {ironingAvailable && (
            <button type="button" onClick={() => updatePiece({ service_type: 'ironing' })} className={`lq-chip ${piece.service_type === 'ironing' ? 'active' : ''}`}>
              Passadoria · {Number(ironing?.percent ?? 70)}%
            </button>
          )}
        </div>
      </div>
      {specialServices.length > 0 && (
        <div>
          <p className="lq-attr-label">Serviços especiais (opcional)</p>
          <div className="lq-chips">
            {specialServices.map((service) => (
              <button key={service.id} type="button" onClick={() => toggleSpecial(service.id)} className={`lq-chip ${selectedSpecials.includes(service.id) ? 'active' : ''}`}>
                {service.name} · {fmt(service.base_price)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}