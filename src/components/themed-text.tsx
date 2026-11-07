import { StyleSheet, Text, type TextProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type ThemedTextProps = TextProps & { type?: 'default' | 'title' };

export function ThemedText({ style, type = 'default', ...rest }: ThemedTextProps) {
  const theme = useTheme();
  return <Text style={[{ color: theme.text }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: { fontSize: 16, lineHeight: 24, fontWeight: 500 },
  title: { fontSize: 48, lineHeight: 52, fontWeight: 600 },
});
