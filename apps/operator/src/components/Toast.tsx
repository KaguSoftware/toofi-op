import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Kind = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
}

const Ctx = createContext<((message: string, kind?: Kind) => void) | null>(null);
let nextId = 1;

/** Provides toast() and renders the aria-live region. Errors are announced assertively. */
export function ToastProvider({ children, durationMs = 5000 }: { children: ReactNode; durationMs?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback(
    (message: string, kind: Kind = 'info') => {
      const id = nextId++;
      setItems((xs) => [...xs, { id, kind, message }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), durationMs);
    },
    [durationMs],
  );
  const value = useMemo(() => toast, [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="rop-toasts" role="status" aria-live="polite">
        {items
          .filter((i) => i.kind !== 'error')
          .map((i) => (
            <p key={i.id} className={`rop-toast rop-toast--${i.kind}`}>
              {i.message}
            </p>
          ))}
      </div>
      <div className="rop-toasts rop-toasts--errors" role="alert">
        {items
          .filter((i) => i.kind === 'error')
          .map((i) => (
            <p key={i.id} className="rop-toast rop-toast--error">
              {i.message}
            </p>
          ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): (message: string, kind?: Kind) => void {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast needs <ToastProvider>');
  return v;
}
