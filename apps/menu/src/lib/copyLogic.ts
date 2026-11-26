/**
 * Every line the guest screen shows, resolved on the SERVER for one language and handed to
 * the client component as plain data. The phone then never downloads the staff catalogs.
 * Templates keep their {placeholders}; the client fills them with `fill`.
 */
import { makeT, type Locale } from '@rop/i18n';
import { GUEST_CODES, guestErrorMessageKey } from './guestErrorLogic';

export function guestCopy(locale: Locale) {
  const tr = makeT(locale);
  return {
    lang: { switch: tr('guest.lang.switch'), short: tr('guest.lang.short') },
    table: { word: tr('guest.table.word'), label: tr('guest.table.label') },
    menu: {
      categories: tr('guest.menu.categories'),
      loading: tr('guest.menu.loading'),
      empty: tr('guest.menu.empty'),
      failed: tr('guest.menu.failed'),
      retry: tr('guest.menu.retry'),
    },
    bar: {
      callWaiter: tr('guest.bar.callWaiter'),
      yourOrder: tr('guest.bar.yourOrder'),
      orderEmpty: tr('guest.bar.orderEmpty'),
      callAgain: tr('guest.bar.callAgain'),
    },
    item: { add: tr('guest.item.add'), remove: tr('guest.item.remove') },
    notice: { scanAgain: tr('guest.notice.scanAgain'), closed: tr('guest.notice.closed') },
    strip: { callWaiting: tr('guest.strip.callWaiting'), callAnswered: tr('guest.strip.callAnswered') },
    call: {
      title: tr('guest.call.title'),
      reason: {
        order: tr('guest.call.reason.order'),
        bill: tr('guest.call.reason.bill'),
        water: tr('guest.call.reason.water'),
        help: tr('guest.call.reason.help'),
      },
      hint: tr('guest.call.hint'),
      sending: tr('guest.call.sending'),
    },
    sheet: {
      close: tr('guest.sheet.close'),
      scan: { title: tr('guest.sheet.scan.title'), body: tr('guest.sheet.scan.body') },
      expired: { title: tr('guest.sheet.expired.title'), body: tr('guest.sheet.expired.body') },
      closed: { title: tr('guest.sheet.closed.title'), body: tr('guest.sheet.closed.body') },
      off: { title: tr('guest.sheet.off.title'), body: tr('guest.sheet.off.body') },
      tooSoon: { title: tr('guest.sheet.tooSoon.title'), body: tr('guest.sheet.tooSoon.body') },
    },
    offline: tr('guest.offline'),
    errors: {
      generic: tr('guest.errors.generic'),
      /** Only the codes the guest site maps; anything else reads as `generic`. */
      byCode: Object.fromEntries(GUEST_CODES.map((code) => [code, tr(guestErrorMessageKey(code))])),
    },
  };
}

export type GuestCopy = ReturnType<typeof guestCopy>;

/** The line for a refused call or order. */
export function errorText(copy: GuestCopy, code: string | null | undefined): string {
  return (code ? copy.errors.byCode[code] : undefined) ?? copy.errors.generic;
}

export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
