import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, OptionRow, Screen, SectionLabel } from '@/components/ui';
import type { WriteKind } from '@/lib/ndef';
import { space } from '@/lib/theme';
import { WRITE_KINDS } from '@/lib/writeKinds';

export default function WritePickScreen() {
  const [kind, setKind] = useState<WriteKind>(WRITE_KINDS[0].kind);

  return (
    <Screen
      title="Write Tag"
      footer={<Button label="Continue" iconEnd="chevron" onPress={() => router.push({ pathname: '/write/[kind]', params: { kind } })} />}
    >
      <SectionLabel>What do you want to write?</SectionLabel>
      <View style={{ gap: space.md }}>
        {WRITE_KINDS.map((option) => (
          <OptionRow
            key={option.kind}
            icon={option.icon}
            title={option.title}
            subtitle={option.subtitle}
            selected={option.kind === kind}
            onPress={() => setKind(option.kind)}
          />
        ))}
      </View>
    </Screen>
  );
}
