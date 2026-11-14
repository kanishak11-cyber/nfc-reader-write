import { StyleSheet, Text, View } from 'react-native';

import { Badge, Card } from '@/components/ui';
import { tagSupport, type SupportLevel } from '@/lib/support';
import { space, type, useTheme } from '@/lib/theme';

import type { IconName } from './Icon';

const LEVEL: Record<SupportLevel, { label: string; tone: 'success' | 'warning' | 'danger'; icon: IconName }> = {
  full: { label: 'Supported', tone: 'success', icon: 'check' },
  partial: { label: 'Partly', tone: 'warning', icon: 'alert' },
  none: { label: 'Not on this phone', tone: 'danger', icon: 'close' },
};

/** Tag families and what this phone can do with each, with the alternative when it can't. */
export function SupportedTags() {
  const t = useTheme();
  const rows = tagSupport();
  return (
    <Card style={{ paddingVertical: space.sm, gap: 0 }}>
      {rows.map((row, i) => {
        const level = LEVEL[row.level];
        return (
          <View
            key={row.name}
            style={[styles.row, i < rows.length - 1 && { borderBottomColor: t.line, borderBottomWidth: 1 }]}
            accessible
            accessibilityLabel={`${row.name}: ${level.label}. ${row.detail}`}
          >
            <View style={styles.header}>
              <Text style={[type.bodyStrong, { color: t.ink, flexShrink: 1 }]}>{row.name}</Text>
              <Badge tone={level.tone} icon={level.icon}>
                {level.label}
              </Badge>
            </View>
            <Text style={[type.caption, { color: t.inkMuted }]}>{row.detail}</Text>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.md, gap: space.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
});
