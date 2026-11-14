import { router } from 'expo-router';
import { View } from 'react-native';

import { Caption, OptionRow, Screen, SectionLabel } from '@/components/ui';
import { space } from '@/lib/theme';

export default function ProtectScreen() {
  return (
    <Screen title="Protect">
      <SectionLabel>What do you want to protect?</SectionLabel>
      <View style={{ gap: space.md }}>
        <OptionRow
          icon="lock"
          title="Tag password"
          subtitle="NTAG and MIFARE Ultralight EV1 tags"
          onPress={() => router.push('/protect/password')}
        />
        <OptionRow icon="lock" title="Secure card" subtitle="NTAG 424 DNA cards, with an AES key" onPress={() => router.push('/protect/card')} />
      </View>
      <Caption>
        A protected tag can still be read by anyone unless you block reading, but only you can change it. Passwords and passphrases are never
        saved on this phone.
      </Caption>
    </Screen>
  );
}
