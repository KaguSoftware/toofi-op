import { getBridge, isDesktop } from './bridge';

/** Print a receipt: the desktop printer when present, else the browser print dialog. */
export async function printReceipt(html: string): Promise<{ ok: boolean; error?: string }> {
  if (isDesktop()) {
    const r = await getBridge().print({ kind: 'receipt', html });
    if ('error' in r && r.error) return { ok: false, error: r.error };
    return { ok: 'ok' in r ? r.ok : false };
  }
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'absolute';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1000);
      resolve({ ok: true });
    };
    document.body.appendChild(frame);
    frame.srcdoc = html;
  });
}
