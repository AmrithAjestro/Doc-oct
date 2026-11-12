import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, X } from 'lucide-react';

// Same toast as the Selsolve console: top-right on desktop, full width at the top on phones.
let listener = null;
let seq = 0;

const push = (type, msg) => listener?.({ id: ++seq, type, msg });

export const toast = {
  success: (msg) => push('success', msg),
  error: (msg) => push('error', msg)
};

export function ToastHost() {
  const [item, setItem] = useState(null);

  useEffect(() => {
    listener = setItem;
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!item) return undefined;
    const t = setTimeout(() => setItem(null), item.type === 'error' ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [item]);

  return createPortal(
    <AnimatePresence>
      {item && (
        <motion.div
          key={item.id}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.97 }}
          className="surface-raised fixed left-4 right-4 top-4 z-[300] flex items-start gap-3 rounded-2xl px-4 py-3 shadow-2xl sm:left-auto sm:right-6 sm:top-6 sm:max-w-sm"
        >
          {item.type === 'error' ? (
            <XCircle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-rose-500" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-emerald-500" />
          )}
          <span className="flex-1 text-[13px] font-semibold leading-snug text-ink">{item.msg}</span>
          <button type="button" onClick={() => setItem(null)} className="text-ink-3 hover:text-ink" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
