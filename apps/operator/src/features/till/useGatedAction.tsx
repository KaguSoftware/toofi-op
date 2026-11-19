import { useState, type ReactNode } from 'react';
import { needsManagerPin, type Capability, type StaffRole } from '@rop/core';
import { PinReasonModal } from '../../components';

/**
 * Runs an action now when the role may do it directly (using the reason typed in the form),
 * or after a manager PIN (the modal asks the reason too) when the role needs one.
 * The server still checks the role and consumes the grant.
 */
export function useGatedAction(role: StaffRole | null, capability: Capability, action: string, reasonRequired = true, entityId?: string) {
  const needsPin = needsManagerPin(role, capability);
  const [pending, setPending] = useState<{ run: (reason: string) => void; value?: number } | null>(null);

  const request = (ownReason: string, run: (reason: string) => void, value?: number) => {
    if (needsPin) setPending({ run, value });
    else run(ownReason);
  };

  const element: ReactNode = (
    <PinReasonModal
      open={pending !== null}
      action={action}
      reasonRequired={reasonRequired}
      entityId={entityId}
      value={pending?.value}
      onGranted={({ reason }) => {
        const run = pending?.run;
        setPending(null);
        run?.(reason);
      }}
      onClose={() => setPending(null)}
    />
  );

  return { needsPin, request, element };
}
