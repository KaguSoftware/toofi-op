-- 0140 guest QR menu: the two enums, in their own migration before first use
-- (CLAUDE.md rule 13). See .scratch/qr-menu/spec.md, "Database (step 1)".

create type waiter_call_reason as enum ('order', 'bill', 'water', 'help');
create type guest_order_status as enum ('pending', 'accepted', 'declined');
