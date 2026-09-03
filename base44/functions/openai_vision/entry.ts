import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { bytesToBase64, geminiVisionJson } from '../../shared/geminiChat.js';
import { getAiSettings } from '../../shared/aiSettings.js';

// Classificação das fotos de peças enviadas pelo cliente (usa o Gemini com visão).
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { image_url, quote_id } = await req.json();

        const products = await base44.asServiceRole.entities.Product.filter({ active: true });
        const catalogContext = products.map(p => `- ${p.name}: R$ ${p.price}`).join("\n");

        if (!Deno.env.get("GEMINI_API_KEY")) {
            console.warn("GEMINI_API_KEY não configurada.");
            return Response.json({
                mock: true,
                garment_type: "camisa_social",
                confidence: 0.95,
                notes: "Mock response: Gemini key missing"
            });
        }

        const imageResponse = await fetch(image_url);
        if (!imageResponse.ok) {
            return Response.json({ error: `Não foi possível baixar a imagem (${imageResponse.status})` }, { status: 400 });
        }
        const mimeType = imageResponse.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
        const base64Image = bytesToBase64(new Uint8Array(await imageResponse.arrayBuffer()));

        const result = await geminiVisionJson({
            base64Image,
            mimeType,
            model: (await getAiSettings(base44)).model,
            userText: "Classifique esta peça e dê o preço do catálogo se houver.",
            systemText: `Identifique a peça de roupa na imagem e associe ao item mais provável do nosso catálogo de preços.

CATÁLOGO DE SERVIÇOS E PREÇOS:
${catalogContext}

INSTRUÇÕES:
1. Analise a imagem.
2. Tente encontrar a correspondência EXATA ou MAIS PRÓXIMA no catálogo acima.
3. Responda APENAS um JSON com os campos:
   - garment_type (string): O nome do item do catálogo identificado (ou nome genérico se não houver match).
   - catalog_match (boolean): true se encontrou no catálogo, false se não.
   - estimated_price (number): O preço do item no catálogo (ou null se não achou).
   - confidence (number 0-1): Nível de confiança.
   - notes (string): Detalhes visuais (cor, estampa, tipo de tecido).
   - suggested_service (array of strings): Serviços sugeridos.
   - is_receipt (boolean): true se a imagem for CLARAMENTE um comprovante de pagamento (Pix, transferência bancária, cartão, nota fiscal, etc), false caso contrário.

Se não for possível identificar, retorne garment_type: 'desconhecido' e confidence: 0.`
        });

        if (quote_id) {
            // Mantido para compatibilidade: o orchestrator consome o resultado retornado.
        }

        return Response.json(result);

    } catch (error) {
        console.error("Error in openai_vision (Gemini):", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});