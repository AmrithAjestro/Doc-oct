import React, { useRef } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';

/** Click-or-drop single file input with a visible file name. Validation is done by the caller. */
export default function FilePicker({ file, onChange, accept, hint, error }) {
  const input = useRef(null);
  const onDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onChange(f);
  };
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-4 transition-colors hover:border-brand-400 hover:bg-accent-soft ${
          error ? 'border-rose-400' : 'border-line-strong'
        }`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-subtle">
          {file ? <FileText className="h-5 w-5 text-brand-600 dark:text-brand-400" /> : <UploadCloud className="h-5 w-5 text-ink-3" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold text-ink">{file ? file.name : 'Click to choose or drop a file here'}</div>
          <div className="text-[11px] text-ink-3">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : hint}</div>
        </div>
        {file && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
              if (input.current) input.current.value = '';
            }}
            className="rounded-lg p-1 text-ink-3 hover:bg-subtle hover:text-rose-600"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => onChange(e.target.files?.[0] || null)} />
      {error && <span className="mt-1 block text-[11px] font-semibold text-rose-500">{error}</span>}
    </div>
  );
}
