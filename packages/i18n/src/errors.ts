/**
 * The one catalogue of backend error codes, and the one way an error becomes words.
 *
 *   ERROR_CODE_KEYS  every code a person can meet, with its English and Arabic line.
 *                    The SQL codes (`raise exception 'CODE'`; PostgREST hands CODE back
 *                    as the error's message), plus the few codes a function returns as
 *                    data instead of raising (PIN_INVALID, PIN_LOCKED). The catalogs
 *                    expose each line at `errors.codes.<CODE>`.
 *   SQLSTATE_KEYS    native Postgres errors that arrive as `error.code` with an English
 *                    message: unique and check violations, malformed input, a deadlock.
 *   errorMessageKey  the resolver every screen delegates to.
 *
 * The matching rule, in order:
 *   1. exact: the error's `code`, then its `message`, trimmed, is a known code;
 *   2. embedded: a whole upper-snake word of the message is a known code (the longest
 *      wins), for wrappers that put text around a code;
 *   3. SQLSTATE: the error's `sqlState`, then its `code`, is in SQLSTATE_KEYS;
 *   4. fallback: `errors.network` when `isTransport` says so, else `errors.generic`.
 *
 * `pnpm --filter @rop/db check:error-codes` requires every code a migration raises to
 * be a key of ERROR_CODE_KEYS. Phase 1 agents APPEND under their own section header
 * below; never reorder or restructure this object.
 */
import type { MessageKey } from './t';

/** One code's text, in both languages. Arabic must be real Arabic, not the English. */
export interface ErrorText {
  en: string;
  ar: string;
}

export const ERROR_CODE_KEYS = {
  // --- foundation (Phase 0) ---
  FORBIDDEN: {
    en: 'You do not have permission to do this.',
    ar: 'ليس لديك صلاحية للقيام بهذا.',
  },
  APPEND_ONLY: {
    en: 'This record cannot be changed or deleted. Record a correction instead.',
    ar: 'لا يمكن تعديل هذا السجل أو حذفه. سجّل تصحيحًا بدلًا من ذلك.',
  },
  IDEMPOTENCY_KEY_REQUIRED: {
    en: 'This request is missing its request key. Update the app and try again.',
    ar: 'هذا الطلب ينقصه مفتاح الطلب. حدّث التطبيق وحاول مرة أخرى.',
  },
  IDEMPOTENCY_CONFLICT: {
    en: 'This request was already used for something else. Try again.',
    ar: 'هذا الطلب استُخدم مسبقًا لعملية أخرى. حاول مرة أخرى.',
  },
  PIN_INVALID: {
    en: 'Wrong PIN.',
    ar: 'رمز PIN غير صحيح.',
  },
  PIN_LOCKED: {
    en: 'Too many wrong PINs. Wait five minutes and try again.',
    ar: 'محاولات خاطئة كثيرة. انتظر خمس دقائق ثم حاول مرة أخرى.',
  },
  PIN_GRANT_REQUIRED: {
    en: 'A manager PIN is needed for this. Enter it and try again.',
    ar: 'هذه العملية تحتاج رمز PIN المدير. أدخله وحاول مرة أخرى.',
  },
  PIN_FORMAT: {
    en: 'A PIN is 6 to 12 digits.',
    ar: 'رمز PIN يتكون من 6 إلى 12 رقمًا.',
  },
  PIN_WEAK: {
    en: 'That PIN is too easy to guess. Avoid repeated digits and runs like 123456.',
    ar: 'رمز PIN هذا سهل التخمين. تجنّب الأرقام المكررة والتسلسلات مثل 123456.',
  },
  PIN_ACTION_REQUIRED: {
    en: 'This PIN request does not say what it is for. Update the app and try again.',
    ar: 'طلب رمز PIN هذا لا يحدد الغرض منه. حدّث التطبيق وحاول مرة أخرى.',
  },
  PIN_NOT_SET: {
    en: 'You have no PIN yet. Set one first.',
    ar: 'ليس لديك رمز PIN بعد. عيّن رمزًا أولًا.',
  },

  // --- backend-money ---
  DAY_NOT_OPEN: {
    en: 'The business day is not open. Ask a manager to open it.',
    ar: 'يوم العمل غير مفتوح. اطلب من المدير فتحه.',
  },
  DAY_ALREADY_OPEN: {
    en: 'The business day is already open.',
    ar: 'يوم العمل مفتوح بالفعل.',
  },
  DAY_ALREADY_CLOSED: {
    en: 'Today’s business day was already opened and closed.',
    ar: 'تم فتح يوم العمل لهذا اليوم وإغلاقه مسبقًا.',
  },
  OPEN_TABS_EXIST: {
    en: 'Some tabs are still open. Settle or cancel them before closing the day.',
    ar: 'لا تزال هناك فواتير مفتوحة. سدّدها أو ألغها قبل إغلاق اليوم.',
  },
  TABLE_NOT_FOUND: {
    en: 'That table does not exist or is not in use.',
    ar: 'هذه الطاولة غير موجودة أو غير مستخدمة.',
  },
  TABLE_OCCUPIED: {
    en: 'That table already has an open tab.',
    ar: 'هذه الطاولة لديها فاتورة مفتوحة بالفعل.',
  },
  INVALID_COVERS: {
    en: 'Enter the number of guests (at least 1).',
    ar: 'أدخل عدد الضيوف (1 على الأقل).',
  },
  TAB_NOT_FOUND: {
    en: 'That tab was not found.',
    ar: 'لم يتم العثور على هذه الفاتورة.',
  },
  TAB_NOT_OPEN: {
    en: 'This tab is no longer open.',
    ar: 'هذه الفاتورة لم تعد مفتوحة.',
  },
  NOT_YOUR_TAB: {
    en: 'This tab belongs to another waiter.',
    ar: 'هذه الفاتورة تخص نادلًا آخر.',
  },
  ITEMS_REQUIRED: {
    en: 'Add at least one item before sending.',
    ar: 'أضف صنفًا واحدًا على الأقل قبل الإرسال.',
  },
  ITEM_NOT_AVAILABLE: {
    en: 'An item is no longer available. Refresh the menu and try again.',
    ar: 'أحد الأصناف لم يعد متوفرًا. حدّث القائمة وحاول مرة أخرى.',
  },
  INVALID_QTY: {
    en: 'Quantity must be a whole number from 1 to 999.',
    ar: 'يجب أن تكون الكمية عددًا صحيحًا من 1 إلى 999.',
  },
  MODIFIER_NOT_ALLOWED: {
    en: 'An option is not available for this item. Refresh the menu and try again.',
    ar: 'أحد الخيارات غير متاح لهذا الصنف. حدّث القائمة وحاول مرة أخرى.',
  },
  MODIFIER_SELECTION_INVALID: {
    en: 'Choose the required options for this item.',
    ar: 'اختر الخيارات المطلوبة لهذا الصنف.',
  },
  INVALID_PRICE: {
    en: 'These options make the price negative. Check the menu setup.',
    ar: 'هذه الخيارات تجعل السعر سالبًا. راجع إعداد القائمة.',
  },
  MERGE_SELF: {
    en: 'A tab cannot be merged into itself.',
    ar: 'لا يمكن دمج الفاتورة مع نفسها.',
  },
  MERGE_SOURCE_HAS_PAYMENTS: {
    en: 'This tab already has payments, so it cannot be merged. Merge the other tab into it instead.',
    ar: 'هذه الفاتورة عليها دفعات، لذا لا يمكن دمجها. ادمج الفاتورة الأخرى فيها بدلًا من ذلك.',
  },
  TAB_HAS_PAYMENTS: {
    en: 'This tab has payments, so it cannot be cancelled.',
    ar: 'هذه الفاتورة عليها دفعات، لذا لا يمكن إلغاؤها.',
  },
  REASON_REQUIRED: {
    en: 'Enter a reason.',
    ar: 'أدخل السبب.',
  },
  LINE_NOT_FOUND: {
    en: 'That line was not found.',
    ar: 'لم يتم العثور على هذا السطر.',
  },
  LINE_ALREADY_VOIDED: {
    en: 'This line is already voided.',
    ar: 'هذا السطر ملغى بالفعل.',
  },
  PAID_EXCEEDS_TOTAL: {
    en: 'This would bring the bill below what was already paid. Refund first.',
    ar: 'هذا سيجعل الفاتورة أقل مما دُفع بالفعل. قم بالاسترداد أولًا.',
  },
  INVALID_DISCOUNT: {
    en: 'Enter a valid discount (a percent up to 100, or an amount above 0).',
    ar: 'أدخل خصمًا صحيحًا (نسبة حتى 100 أو مبلغًا أكبر من 0).',
  },
  NOTHING_TO_DISCOUNT: {
    en: 'There is nothing left on this tab to discount.',
    ar: 'لم يتبقَّ شيء في هذه الفاتورة لخصمه.',
  },
  INVALID_AMOUNT: {
    en: 'Enter a valid amount.',
    ar: 'أدخل مبلغًا صحيحًا.',
  },
  OVERPAYMENT: {
    en: 'The amount is more than what is due.',
    ar: 'المبلغ أكبر من المستحق.',
  },
  TENDERED_TOO_LOW: {
    en: 'The cash handed over is less than the amount.',
    ar: 'النقد المستلم أقل من المبلغ.',
  },
  INVALID_SPLIT: {
    en: 'Choose how to split: 1 to 100 shares, or at least one line.',
    ar: 'اختر طريقة التقسيم: من 1 إلى 100 حصة، أو سطرًا واحدًا على الأقل.',
  },
  LINE_NOT_ON_TAB: {
    en: 'A chosen line is not on this tab or is voided.',
    ar: 'أحد الأسطر المختارة ليس في هذه الفاتورة أو أنه ملغى.',
  },
  PAYMENT_NOT_FOUND: {
    en: 'That payment was not found.',
    ar: 'لم يتم العثور على هذه الدفعة.',
  },
  TAB_NOT_SETTLED: {
    en: 'Only a settled tab can be refunded.',
    ar: 'لا يمكن الاسترداد إلا من فاتورة مسدّدة.',
  },
  OVER_REFUND: {
    en: 'The refund is more than what is left of this payment.',
    ar: 'مبلغ الاسترداد أكبر من المتبقي من هذه الدفعة.',
  },
  DEVICE_REQUIRED: {
    en: 'This till has no device id. Restart the app and try again.',
    ar: 'هذا الصندوق ليس له معرّف جهاز. أعد تشغيل التطبيق وحاول مرة أخرى.',
  },
  SHIFT_ALREADY_OPEN: {
    en: 'A till shift is already open on this device or for you.',
    ar: 'هناك وردية صندوق مفتوحة بالفعل على هذا الجهاز أو باسمك.',
  },
  NO_OPEN_SHIFT: {
    en: 'You have no open till shift.',
    ar: 'ليس لديك وردية صندوق مفتوحة.',
  },
  SHIFT_NOT_OPEN: {
    en: 'That till shift is not open.',
    ar: 'وردية الصندوق هذه غير مفتوحة.',
  },

  // --- backend-stock-analytics ---
  UNIT_LOCKED: {
    en: 'This ingredient already has stock history, so its unit cannot change. Create a new ingredient instead.',
    ar: 'لهذا المكوّن سجل مخزون، لذا لا يمكن تغيير وحدته. أنشئ مكوّنًا جديدًا بدلًا من ذلك.',
  },
  INGREDIENT_NOT_FOUND: {
    en: 'This ingredient no longer exists. Refresh and try again.',
    ar: 'هذا المكوّن لم يعد موجودًا. حدّث الصفحة وحاول مرة أخرى.',
  },
  SUPPLIER_NOT_FOUND: {
    en: 'This supplier no longer exists. Refresh and try again.',
    ar: 'هذا المورّد لم يعد موجودًا. حدّث الصفحة وحاول مرة أخرى.',
  },
  RECIPE_ITEM_NOT_FOUND: {
    en: 'This menu item no longer exists. Refresh and try again.',
    ar: 'هذا الصنف لم يعد موجودًا في القائمة. حدّث الصفحة وحاول مرة أخرى.',
  },
  STOCK_QTY_INVALID: {
    en: 'Enter a quantity above zero.',
    ar: 'أدخل كمية أكبر من صفر.',
  },
  STOCK_COST_INVALID: {
    en: 'The cost cannot be negative.',
    ar: 'لا يمكن أن تكون التكلفة سالبة.',
  },
  STOCK_LINES_INVALID: {
    en: 'Add at least one line before saving.',
    ar: 'أضف سطرًا واحدًا على الأقل قبل الحفظ.',
  },
  WASTE_REASON_REQUIRED: {
    en: 'Say why this stock was wasted.',
    ar: 'اذكر سبب هدر هذا المخزون.',
  },
  COUNT_ALREADY_OPEN: {
    en: 'A stock count is already in progress. Finish it before starting another.',
    ar: 'يوجد جرد مخزون قيد التنفيذ. أنهِه قبل بدء جرد آخر.',
  },
  COUNT_NOT_FOUND: {
    en: 'This stock count no longer exists. Refresh and try again.',
    ar: 'جرد المخزون هذا لم يعد موجودًا. حدّث الصفحة وحاول مرة أخرى.',
  },
  COUNT_NOT_OPEN: {
    en: 'This stock count is already finished.',
    ar: 'جرد المخزون هذا منتهٍ بالفعل.',
  },
  INVALID_RANGE: {
    en: 'Pick a valid date range of at most one year.',
    ar: 'اختر نطاق تواريخ صحيحًا لا يتجاوز سنة واحدة.',
  },
  INVALID_ARGUMENT: {
    en: 'This request has an invalid value. Update the app and try again.',
    ar: 'هذا الطلب يحتوي قيمة غير صالحة. حدّث التطبيق وحاول مرة أخرى.',
  },

  // --- backend-catalog-seed ---
  NAME_REQUIRED: {
    en: 'Enter a name in both English and Arabic.',
    ar: 'أدخل الاسم بالإنجليزية والعربية.',
  },
  PRICE_INVALID: {
    en: 'The price must be a whole number, zero or more.',
    ar: 'يجب أن يكون السعر عددًا صحيحًا، صفرًا أو أكثر.',
  },
  SEATS_INVALID: {
    en: 'A table needs at least one seat.',
    ar: 'تحتاج الطاولة إلى مقعد واحد على الأقل.',
  },
  GRID_INVALID: {
    en: 'The table position must be zero or more.',
    ar: 'يجب أن يكون موضع الطاولة صفرًا أو أكثر.',
  },
  TAX_RATE_INVALID: {
    en: 'The tax rate must be between 0 and 10000 basis points.',
    ar: 'يجب أن تكون نسبة الضريبة بين 0 و10000 نقطة أساس.',
  },
  MODIFIER_RANGE_INVALID: {
    en: 'The minimum must be zero or more, the maximum at least one, and the minimum cannot exceed the maximum.',
    ar: 'يجب أن يكون الحد الأدنى صفرًا أو أكثر، والأقصى واحدًا على الأقل، ولا يتجاوز الأدنى الأقصى.',
  },
  SETTINGS_INVALID: {
    en: 'These settings are not valid. The service charge is 0 to 10000 basis points.',
    ar: 'هذه الإعدادات غير صالحة. رسوم الخدمة من 0 إلى 10000 نقطة أساس.',
  },
  ACTIVE_FLAG_REQUIRED: {
    en: 'Say whether it should be active or not.',
    ar: 'حدد ما إذا كان يجب أن يكون نشطًا أم لا.',
  },
  ROLE_REQUIRED: {
    en: 'Choose a role.',
    ar: 'اختر دورًا.',
  },
  AREA_NOT_FOUND: {
    en: 'That floor area does not exist.',
    ar: 'منطقة الصالة هذه غير موجودة.',
  },
  CATEGORY_NOT_FOUND: {
    en: 'That menu category does not exist.',
    ar: 'فئة القائمة هذه غير موجودة.',
  },
  ITEM_NOT_FOUND: {
    en: 'That menu item does not exist.',
    ar: 'صنف القائمة هذا غير موجود.',
  },
  TAX_GROUP_NOT_FOUND: {
    en: 'That tax group does not exist.',
    ar: 'مجموعة الضريبة هذه غير موجودة.',
  },
  MODIFIER_GROUP_NOT_FOUND: {
    en: 'That modifier group does not exist.',
    ar: 'مجموعة الإضافات هذه غير موجودة.',
  },
  MODIFIER_NOT_FOUND: {
    en: 'That modifier does not exist.',
    ar: 'هذه الإضافة غير موجودة.',
  },
  STAFF_NOT_FOUND: {
    en: 'That staff member does not exist.',
    ar: 'هذا الموظف غير موجود.',
  },
  TABLE_LABEL_TAKEN: {
    en: 'Another table already has that label.',
    ar: 'طاولة أخرى تحمل هذا الاسم بالفعل.',
  },
  TABLE_HAS_OPEN_TAB: {
    en: 'This table has an open tab. Settle or move it first.',
    ar: 'هذه الطاولة عليها حساب مفتوح. سدّده أو انقله أولًا.',
  },
  REORDER_KIND_INVALID: {
    en: 'Unknown list to reorder.',
    ar: 'قائمة غير معروفة لإعادة ترتيبها.',
  },
  REORDER_IDS_INVALID: {
    en: 'The list to reorder has a missing or repeated entry.',
    ar: 'قائمة الترتيب فيها عنصر مفقود أو مكرر.',
  },
  CANNOT_DEACTIVATE_SELF: {
    en: 'You cannot deactivate your own account.',
    ar: 'لا يمكنك تعطيل حسابك بنفسك.',
  },
  CANNOT_CHANGE_OWN_ROLE: {
    en: 'You cannot change your own role.',
    ar: 'لا يمكنك تغيير دورك بنفسك.',
  },
  EMAIL_TAKEN: {
    en: 'A login with that email already exists.',
    ar: 'يوجد حساب بهذا البريد الإلكتروني بالفعل.',
  },
  PASSWORD_TOO_SHORT: {
    en: 'The password must be at least 8 characters.',
    ar: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.',
  },
  // --- staff-admin edge function responses ---
  INVALID_EMAIL: {
    en: 'Enter a valid email address.',
    ar: 'أدخل عنوان بريد إلكتروني صالحًا.',
  },
  AUTH_REQUIRED: {
    en: 'Your session has ended. Sign in again.',
    ar: 'انتهت جلستك. سجّل الدخول مرة أخرى.',
  },
  BAD_REQUEST: {
    en: 'That request was not valid. Check the form and try again.',
    ar: 'الطلب غير صالح. راجع النموذج وحاول مرة أخرى.',
  },
  INTERNAL: {
    en: 'The server could not finish that. Try again.',
    ar: 'تعذّر على الخادم إكمال العملية. حاول مرة أخرى.',
  },

  // --- backend-fixes (review fixes) ---
  MERGE_SOURCE_HAS_DISCOUNTS: {
    en: 'This tab has a discount, so it cannot be merged into another tab.',
    ar: 'على هذه الفاتورة خصم، لذا لا يمكن دمجها في فاتورة أخرى.',
  },
  COUNT_NOT_FINALIZED: {
    en: 'This stock count is still open. Finish it to see the results.',
    ar: 'جرد المخزون هذا ما زال مفتوحًا. أنهِه لرؤية النتائج.',
  },

  // --- guest QR menu (0140+); guest-facing lines are read by a diner ---
  TABLE_LINK_INVALID: {
    en: 'This table code does not work. Please ask a member of staff.',
    ar: 'رمز هذه الطاولة لا يعمل. يُرجى سؤال أحد العاملين.',
  },
  SESSION_EXPIRED: {
    en: 'Your session has ended. Scan the code on your table again.',
    ar: 'انتهت جلستك. امسح الرمز الموجود على طاولتك مرة أخرى.',
  },
  TOO_MANY_REQUESTS: {
    en: 'Too many attempts. Wait a minute and try again.',
    ar: 'محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.',
  },
  GUEST_CALLS_OFF: {
    en: 'Calling a waiter from your phone is not available right now.',
    ar: 'طلب النادل من الهاتف غير متاح الآن.',
  },
  GUEST_ORDERS_OFF: {
    en: 'Ordering from your phone is not available right now. A waiter will take your order.',
    ar: 'الطلب من الهاتف غير متاح الآن. سيأخذ النادل طلبك.',
  },
  CALL_TOO_SOON: {
    en: 'A waiter was called a moment ago. You can call again shortly.',
    ar: 'طُلب النادل قبل لحظات. يمكنك الطلب مرة أخرى بعد قليل.',
  },
  WAITER_CALL_NOT_FOUND: {
    en: 'That waiter call no longer exists.',
    ar: 'طلب النادل هذا لم يعد موجودًا.',
  },
  TOO_MANY_ITEMS: {
    en: 'An order can have at most 40 lines. Send the rest as a second order.',
    ar: 'يمكن أن يضم الطلب 40 سطرًا على الأكثر. أرسل الباقي في طلب ثانٍ.',
  },
  TOO_MANY_PENDING_ORDERS: {
    en: 'Your table already has orders waiting for a waiter. Please wait for them first.',
    ar: 'لطاولتك طلبات تنتظر النادل. يُرجى انتظارها أولًا.',
  },
  GUEST_ORDER_NOT_FOUND: {
    en: 'That guest order no longer exists.',
    ar: 'طلب الضيف هذا لم يعد موجودًا.',
  },
  GUEST_ORDER_NOT_PENDING: {
    en: 'This guest order has already been answered.',
    ar: 'تمّ الرد على طلب الضيف هذا مسبقًا.',
  },
  GUEST_ORDER_EXPIRED: {
    en: 'This guest order is from a business day that has closed. Decline it.',
    ar: 'طلب الضيف هذا من يوم عمل أُغلق. ارفضه.',
  },
  COVERS_REQUIRED: {
    en: 'The table is free. Enter the number of guests to open a tab.',
    ar: 'الطاولة فارغة. أدخل عدد الضيوف لفتح فاتورة.',
  },
} as const satisfies Record<string, ErrorText>;

export type ErrorCode = keyof typeof ERROR_CODE_KEYS;

/** The catalog key a code's line lives at. */
export type ErrorCodeMessageKey = `errors.codes.${ErrorCode}`;

/**
 * Native Postgres errors: PostgREST puts the SQLSTATE in `error.code` and an English
 * sentence in `error.message`, so no business code matches.
 */
export const SQLSTATE_KEYS = {
  '23505': 'errors.duplicate', // unique_violation
  '23514': 'errors.invalidValue', // check_violation
  '23502': 'errors.invalidValue', // not_null_violation
  '22P02': 'errors.invalidInput', // invalid_text_representation
  '42501': 'errors.forbidden', // insufficient_privilege
  '40P01': 'errors.busy', // deadlock_detected
  '57014': 'errors.busy', // query_canceled (statement_timeout)
  '40001': 'errors.busy', // serialization_failure
  '55P03': 'errors.busy', // lock_not_available
} as const satisfies Record<string, MessageKey>;

/** A screen's own words for some codes, consulted before the catalogue. */
export type ErrorOverrides = Readonly<Partial<Record<ErrorCode, MessageKey>>>;

export interface ErrorKeyOptions {
  overrides?: ErrorOverrides;
  /** True when the failure never reached the server: it reads as `errors.network`. */
  isTransport?: (err: unknown) => boolean;
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** True when `value` is a code of the catalogue. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && has(ERROR_CODE_KEYS, value);
}

/** A whole upper-snake word: TAB_NOT_OPEN, FORBIDDEN (never part of a longer word). */
const CODE_WORD = /\b[A-Z][A-Z0-9_]*[A-Z0-9]\b/g;

interface ErrorFields {
  code: string | null;
  message: string | null;
  sqlState: string | null;
}

/** What any thrown value carries: a string, or an object with code / message / sqlState. */
function fieldsOf(err: unknown): ErrorFields {
  if (typeof err === 'string') return { code: null, message: err.trim(), sqlState: null };
  if (!err || typeof err !== 'object') return { code: null, message: null, sqlState: null };
  const o = err as { code?: unknown; message?: unknown; sqlState?: unknown };
  return {
    code: typeof o.code === 'string' ? o.code.trim() : null,
    message: typeof o.message === 'string' ? o.message.trim() : null,
    sqlState: typeof o.sqlState === 'string' ? o.sqlState.trim() : null,
  };
}

/**
 * The catalogue code an error names, or null: rule steps 1 and 2 (exact `code`, exact
 * `message`, then the longest code word inside the message).
 */
export function errorCode(err: unknown): ErrorCode | null {
  const { code, message } = fieldsOf(err);
  if (isErrorCode(code)) return code;
  if (isErrorCode(message)) return message;
  let best: ErrorCode | null = null;
  for (const word of message?.match(CODE_WORD) ?? []) {
    if (isErrorCode(word) && (best === null || word.length > best.length)) best = word;
  }
  return best;
}

/** The line of a native Postgres error (rule step 3), or null. */
export function sqlStateMessageKey(err: unknown): MessageKey | null {
  const { code, sqlState } = fieldsOf(err);
  for (const state of [sqlState, code]) {
    if (state && has(SQLSTATE_KEYS, state)) return SQLSTATE_KEYS[state as keyof typeof SQLSTATE_KEYS];
  }
  return null;
}

/** The catalog key of a code's line. */
export function errorCodeMessageKey(code: ErrorCode): ErrorCodeMessageKey {
  return `errors.codes.${code}`;
}

/** Any thrown value (RPC refusal, Postgres error, network failure) to its catalog key. */
export function errorMessageKey(err: unknown, opts: ErrorKeyOptions = {}): MessageKey {
  const code = errorCode(err);
  if (code !== null) return opts.overrides?.[code] ?? errorCodeMessageKey(code);
  const native = sqlStateMessageKey(err);
  if (native !== null) return native;
  return opts.isTransport?.(err) ? 'errors.network' : 'errors.generic';
}

/** The catalogue's lines in one language, keyed by code (what the catalogs embed). */
export function errorLines(locale: 'en' | 'ar'): Record<ErrorCode, string> {
  const out = {} as Record<ErrorCode, string>;
  for (const code of Object.keys(ERROR_CODE_KEYS) as ErrorCode[]) {
    out[code] = ERROR_CODE_KEYS[code][locale];
  }
  return out;
}
