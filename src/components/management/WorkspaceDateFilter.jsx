import { CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addDays, firstDayOfMonth, localDay } from '@/lib/dateRangeFilter';

const presets = [
  { label: 'Hoje', build: () => ({ start: localDay(), end: localDay() }) },
  { label: '7 dias', build: () => ({ start: addDays(-6), end: localDay() }) },
  { label: 'Este mês', build: () => ({ start: firstDayOfMonth(), end: localDay() }) },
  { label: '90 dias', build: () => ({ start: addDays(-89), end: localDay() }) },
  { label: 'Tudo', build: () => ({ start: '', end: '' }) },
];

export default function WorkspaceDateFilter({ range, onChange }) {
  const isActive = (preset) => {
    const value = preset.build();
    return value.start === range.start && value.end === range.end;
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mr-1 flex items-center gap-2 self-center text-xs font-medium uppercase tracking-wide text-white/40">
        <CalendarRange className="h-4 w-4 text-violet-300" /> Período das abas
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-white/40">De</Label>
        <Input type="date" value={range.start} onChange={(event) => onChange({ ...range, start: event.target.value })} className="h-9 w-[150px] border-white/10 bg-black/25 text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-white/40">Até</Label>
        <Input type="date" value={range.end} onChange={(event) => onChange({ ...range, end: event.target.value })} className="h-9 w-[150px] border-white/10 bg-black/25 text-xs" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            size="sm"
            variant="outline"
            onClick={() => onChange(preset.build())}
            className={`h-9 border-white/10 text-xs ${isActive(preset) ? 'bg-violet-500 text-white hover:bg-violet-500' : 'bg-white/5 text-white/70'}`}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}