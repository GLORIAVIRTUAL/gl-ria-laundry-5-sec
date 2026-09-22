import { processChatPayment } from './chatPaymentFlow.js';

// Caminho único para cobrança, usado pela escolha direta e pelas ferramentas da IA.
export async function handlePaymentChargeToolCall({ toolCall, base44, customer, conversation, currentState }) {
    if (toolCall.function.name !== 'generate_payment_charge') return null;
    const args = JSON.parse(toolCall.function.arguments || '{}');
    const reply = await processChatPayment({ base44, customer, conversation, currentState, billingType: args.billing_type === 'credit_card' ? 'credit_card' : 'pix' });
    return { content: JSON.stringify({ message: reply.message }), customer_message: reply.message };
}