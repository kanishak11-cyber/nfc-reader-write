import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getAvailability, type NfcAvailability } from './nfc';

/** NFC availability, re-checked whenever the app returns to the foreground (e.g. after enabling NFC in Settings). */
export function useNfcAvailability(): { availability: NfcAvailability; refresh: () => void } {
  const [availability, setAvailability] = useState<NfcAvailability>('checking');

  const refresh = useCallback(() => {
    getAvailability().then(setAvailability);
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { availability, refresh };
}
