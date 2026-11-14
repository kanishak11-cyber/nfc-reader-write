import { router } from 'expo-router';
import { View } from 'react-native';

import { OptionRow, Screen, SectionLabel } from '@/components/ui';
import { space } from '@/lib/theme';
import { WRITE_KINDS } from '@/lib/writeKinds';

export default function WritePickScreen() {
  return (
    <Screen title="Write Tag">
      <SectionLabel>What do you want to write?</SectionLabel>
      <View style={{ gap: space.md }}>
        {WRITE_KINDS.map((option) => (
          <OptionRow
            key={option.kind}
            icon={option.icon}
            title={option.title}
            subtitle={option.subtitle}
            onPress={() => router.push({ pathname: '/write/[kind]', params: { kind: option.kind } })}
          />
        ))}
      </View>
    </Screen>
  );
}
