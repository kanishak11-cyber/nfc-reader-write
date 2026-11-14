import { Platform } from 'react-native';

import { SupportedTags } from '@/components/SupportedTags';
import { Caption, Screen, SectionLabel } from '@/components/ui';

export default function SupportedScreen() {
  return (
    <Screen title="Supported tags">
      <SectionLabel>{Platform.OS === 'ios' ? 'What this iPhone can do' : 'What this phone can do'}</SectionLabel>
      <SupportedTags />
      <Caption>No phone can format a blank FeliCa tag, or a card locked by its issuer’s keys.</Caption>
    </Screen>
  );
}
