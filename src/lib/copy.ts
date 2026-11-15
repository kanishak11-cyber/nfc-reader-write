import { Platform } from 'react-native';

/** Every scan state names the physical action: NFC fails when the phone moves. */
export const HOLD_HINT =
  Platform.OS === 'ios'
    ? 'Hold the top of your iPhone against the tag and keep it still.'
    : 'Hold the tag against the back of your phone and keep it still.';
