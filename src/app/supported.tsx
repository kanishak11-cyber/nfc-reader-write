import { Platform, Text } from 'react-native';

import { SupportedTags } from '@/components/SupportedTags';
import { Button, Caption, goBack, Screen, Spacer } from '@/components/ui';
import { type, useTheme } from '@/lib/theme';

export default function SupportedScreen() {
  const t = useTheme();
  return (
    <Screen title="Supported tags" footer={<Button label="Back" variant="secondary" onPress={goBack} />}>
      <Text style={[type.body, { color: t.inkMuted }]}>
        {Platform.OS === 'ios' ? 'What this iPhone can do with each kind of chip.' : 'What this phone can do with each kind of chip.'}
      </Text>
      <SupportedTags />
      <Caption>No phone can format a blank FeliCa tag, or a card locked by its issuer’s keys.</Caption>
      <Spacer />
    </Screen>
  );
}
