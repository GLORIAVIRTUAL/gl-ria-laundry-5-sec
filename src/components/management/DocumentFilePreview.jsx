import { FileText } from 'lucide-react';

export default function DocumentFilePreview({ asset }) {
  if (!asset?.storage_key) return null;
  const isImage = (asset.mime_type || '').startsWith('image/');

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-wide text-white/35">Imagem da nota</p>
      {isImage ? (
        <a href={asset.storage_key} target="_blank" rel="noopener noreferrer" className="mt-3 block">
          <img src={asset.storage_key} alt="Nota enviada" className="max-h-80 w-full rounded-xl border border-white/10 bg-black/40 object-contain" />
        </a>
      ) : (
        <a href={asset.storage_key} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-orange-300 hover:bg-white/10">
          <FileText className="h-4 w-4" />
          {asset.original_filename || 'Abrir arquivo enviado'}
        </a>
      )}
    </div>
  );
}