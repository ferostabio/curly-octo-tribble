import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function ThemedView({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return <View style={[{ backgroundColor: theme.background }, style]} {...rest} />;
}
