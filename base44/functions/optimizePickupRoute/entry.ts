import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

function formatDistance(totalMeters) {
  return `${(totalMeters / 1000).toFixed(1)} km`;
}

function secondsFromDuration(value) {
  if (!value) return 0;
  return Number(String(value).replace('s', '')) || 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { origin_address, stops } = await req.json();

    if (!origin_address || !Array.isArray(stops)) {
      return Response.json({ error: 'origin_address e stops são obrigatórios' }, { status: 400 });
    }

    if (stops.length === 0) {
      return Response.json({
        ordered_stops: [],
        total_distance_text: '0 km',
        total_duration_text: '0 min'
      });
    }

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'GOOGLE_MAPS_API_KEY não configurada' }, { status: 500 });
    }

    const validStops = stops.filter((stop) => typeof stop.address === 'string' && stop.address.trim().length > 0);
    if (validStops.length === 0) {
      return Response.json({ error: 'Nenhuma parada possui endereço cadastrado.' }, { status: 400 });
    }

    // Routes API (nova). A API legada de Directions não está habilitada no projeto Google.
    const body = {
      origin: { address: origin_address },
      destination: { address: origin_address },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      languageCode: 'pt-BR',
      regionCode: 'BR',
      units: 'METRIC',
      ...(validStops.length > 1
        ? {
            optimizeWaypointOrder: true,
            intermediates: validStops.map((stop) => ({ address: stop.address }))
          }
        : { intermediates: [{ address: validStops[0].address }] })
    };

    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex,routes.legs.distanceMeters,routes.legs.duration'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok || !data.routes?.[0]) {
      return Response.json({
        error: data.error?.message || 'Não foi possível calcular a rota no Google Maps.'
      }, { status: 500 });
    }

    const route = data.routes[0];
    const order = route.optimizedIntermediateWaypointIndex || validStops.map((_, index) => index);
    const orderedStops = order.map((index) => validStops[index]).filter(Boolean);
    // A última perna é o retorno à loja; considera só as pernas até a última parada.
    const oneWayLegs = (route.legs || []).slice(0, orderedStops.length);

    const enrichedStops = orderedStops.map((stop, index) => {
      const leg = oneWayLegs[index];
      return {
        ...stop,
        order: index + 1,
        leg_distance_text: leg?.distanceMeters ? formatDistance(leg.distanceMeters) : null,
        leg_duration_text: leg?.duration ? formatDuration(secondsFromDuration(leg.duration)) : null
      };
    });

    const totalDistanceMeters = oneWayLegs.reduce((sum, leg) => sum + (leg.distanceMeters || 0), 0);
    const totalDurationSeconds = oneWayLegs.reduce((sum, leg) => sum + secondsFromDuration(leg.duration), 0);

    return Response.json({
      ordered_stops: enrichedStops,
      total_distance_text: formatDistance(totalDistanceMeters),
      total_duration_text: formatDuration(totalDurationSeconds)
    });
  } catch (error) {
    console.error('Error in optimizePickupRoute:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});