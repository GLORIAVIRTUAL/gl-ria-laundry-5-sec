import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

export default function FinancialApprovalButton({ financialDocumentId, onApproved }) {
  const [approving, setApproving] = useState(false);

  const approve = async () => {
    setApproving(true);
    try {
      const { data } = await base44.functions.invoke('approve_financial_document', { financial_document_id: financialDocumentId });
      if (data?.error) throw new Error(data.error);
      toast.success('Conta aprovada e lançada nas despesas (contas a pagar).');
      onApproved?.();
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível lançar a conta. Confira valor e vencimento.');
    } finally {
      setApproving(false);
    }
  };

  return (
    <Button onClick={approve} disabled={approving} className="w-full bg-emerald-500 hover:bg-emerald-400">
      {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
      Aprovar conta · lançar nas despesas
    </Button>
  );
}