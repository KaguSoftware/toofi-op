import { errorMessageKey, makeT, type Locale } from '@rop/i18n';
import { isTransportFailure } from '@rop/core';

/** Any thrown value to a message in the given locale. */
export function errorMessage(err: unknown, locale: Locale): string {
  return makeT(locale)(errorMessageKey(err, { isTransport: isTransportFailure }));
}
