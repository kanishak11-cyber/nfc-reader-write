import { router } from 'expo-router';
import { View } from 'react-native';

import { Notice, OptionRow, Screen, SectionLabel, Spacer } from '@/components/ui';
import { space } from '@/lib/theme';

export default function ProtectScreen() {
  return (
    <Screen title="Protect">
      <SectionLabel>How do you want to protect it?</SectionLabel>
      <View style={{ gap: space.md }}>
        <OptionRow
          icon="lock"
          title="Tag password"
          subtitle="Writing needs a password. NTAG21x and Ultralight."
          onPress={() => router.push('/protect/password')}
        />
        <OptionRow icon="nfc" title="Secure card" subtitle="Lock an NTAG 424 DNA card with your own key" onPress={() => router.push('/protect/card')} />
        <OptionRow
          icon="close"
          title="Remove password"
          subtitle="Make a tag you protected writable again"
          onPress={() => router.push({ pathname: '/protect/password', params: { mode: 'remove' } })}
        />
      </View>
      <Spacer />
      <Notice
        tone="warning"
        title="A lost password is permanent"
        message="Nobody, including this app, can unlock the tag without it. It’s never saved on this phone."
      />
    </Screen>
  );
}
