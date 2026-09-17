import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

export default function EditableDocumentField({ document, field, label, display, type = 'text', parse, toInput, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    const raw = document?.[field] ?? '';
    setValue(toInput ? toInput(raw) : raw);
  }, [editing, document, field, toInput]);

  const save = async () => {
    setSaving(true);
    try {
      const parsed = parse ? parse(value) : (value === '' ? null : value);
      await base44.entities.PurchaseDocument.update(document.id, { [field]: parsed });
      onUpdated?.({ ...document, [field]: parsed });
      setEditing(false);
      toast.success(`${label} atualizado.`);
    } catch (error) {
      toast.error(error.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-white/35">{label}</p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-white/40 transition hover:text-orange-300" title={`Corrigir ${label}`}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <Input
            type={type}
            value={value ?? ''}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') save(); if (event.key === 'Escape') setEditing(false); }}
            className="h-9 border-white/15 bg-white/5 text-white"
          />
          <Button size="icon" className="h-9 w-9 shrink-0 bg-orange-500 hover:bg-orange-600" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-white/50" onClick={() => setEditing(false)} disabled={saving}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <p className="mt-1 font-medium">{display}</p>
      )}
    </div>
  );
}