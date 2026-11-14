import { StyleSheet, Text, View } from 'react-native';

import { Badge, Card, IconTile } from '@/components/ui';
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
            style={[styles.row, i > 0 && { borderTopColor: t.line, borderTopWidth: 1 }]}
            accessible
            accessibilityLabel={`${row.name}: ${level.label}. ${row.detail}`}
          >
            <IconTile icon="nfc" size="sm" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.bodyStrong, { color: t.ink, fontSize: 16, lineHeight: 22 }]}>{row.name}</Text>
              <Text style={[type.caption, { color: t.inkMuted }]}>{row.detail}</Text>
              <View style={{ marginTop: space.xs }}>
                <Badge tone={level.tone} icon={level.icon}>
                  {level.label}
                </Badge>
              </View>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.md },
});
