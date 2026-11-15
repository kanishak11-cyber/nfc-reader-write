import { useState } from 'react';

import { ScanCancelled } from './nfc';

export interface Outcome {
  tone: 'success' | 'danger';
  title: string;
  message?: string;
}

/**
 * Runs one scan-based action at a time and turns its result into a banner. A cancelled
 * scan is silent. `log` receives the result, or the error message, for history.
 */
export function useScanAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const run = async <T,>(
    name: string,
    task: () => Promise<T>,
    options: { success: (result: T) => Outcome; failTitle: string; log?: (result: T | null, error: string | null) => void },
  ): Promise<T | null> => {
    setOutcome(null);
    setBusy(name);
    try {
      const result = await task();
      setOutcome(options.success(result));
      options.log?.(result, null);
      return result;
    } catch (e) {
      if (e instanceof ScanCancelled) return null;
      const message = e instanceof Error ? e.message : String(e);
      setOutcome({ tone: 'danger', title: options.failTitle, message });
      options.log?.(null, message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  return { busy, outcome, setOutcome, run };
}
