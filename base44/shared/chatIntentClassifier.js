// Interpretação da resposta do cliente em uma etapa do atendimento.
// A IA NÃO executa nada: apenas devolve, em JSON, qual das opções da etapa o cliente escolheu.
import { geminiChat } from './geminiChat.js';

/**
 * @param {{ stageQuestion: string, options: Record<string,string>, text: string, model?: string }} params
 * @returns {Promise<string>} chave da opção, 'question' (pergunta/assunto livre) ou 'unclear'
 */
export async function classifyStageReply({ stageQuestion, options, text, model }) {
  const spec = {
    tarefa: 'Classifique a resposta do cliente à pergunta feita pela atendente de uma lavanderia.',
    pergunta_feita: stageQuestion,
    opcoes: { ...options, question: 'o cliente fez uma pergunta ou mudou de assunto', unclear: 'não dá para saber com segurança' },
    regras: [
      'Responda SOMENTE com JSON no formato {"choice": "<chave>"}.',
      'Use exatamente uma das chaves de "opcoes".',
      'Na dúvida, use "unclear". Nunca invente uma escolha que o cliente não fez.'
    ]
  };
  try {
    const res = await geminiChat({
      model,
      temperature: 0,
      thinkingBudget: 0,
      responseJson: true,
      messages: [
        { role: 'system', content: JSON.stringify(spec) },
        { role: 'user', content: String(text || '').slice(0, 500) }
      ]
    });
    const raw = res.choices[0].message.content || '{}';
    const choice = JSON.parse(raw.replace(/```json|```/g, '').trim()).choice;
    return choice in spec.opcoes ? choice : 'unclear';
  } catch (error) {
    console.warn('classifyStageReply falhou:', error?.message);
    return 'unclear';
  }
}