import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
export const colors = {
  bg: '#F5F4ED',
  paper: '#FFFFFF',
  ink: '#203C32',
  muted: '#69766F',
  green: '#2D6248',
  lime: '#E5EFCB',
  line: '#DEE3D9',
  amber: '#91632B',
  red: '#A03930',
};
export const s = StyleSheet.create({
  page: { padding: 22, gap: 20, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -1.2,
  },
  heading: {
    fontSize: 21,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  muted: { fontSize: 13, lineHeight: 20, color: colors.muted },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.paper,
    padding: 20,
    borderRadius: 22,
    gap: 12,
    borderColor: colors.line,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 15,
    backgroundColor: '#FFF',
  },
  divider: { height: 1, backgroundColor: colors.line },
  link: { fontSize: 14, fontWeight: '600', color: colors.green },
});
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: 18,
          paddingVertical: 15,
          minHeight: 48,
          borderRadius: 16,
          backgroundColor: secondary ? colors.lime : colors.green,
          alignItems: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: secondary ? colors.ink : '#FFF',
          fontSize: 15,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={{
        backgroundColor: selected ? colors.green : '#ECEEE5',
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 20,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: selected ? 'white' : colors.muted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6, flexGrow: 1 }}>
      <Text style={s.muted}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#98A299"
        style={s.input}
        {...props}
      />
    </View>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return (
    <View
      accessibilityRole="alert"
      style={{ padding: 14, backgroundColor: '#F9E8DE', borderRadius: 14 }}
    >
      <Text style={{ color: colors.red, lineHeight: 20 }}>{message}</Text>
    </View>
  );
}
export function Loading() {
  return (
    <View style={{ padding: 40 }}>
      <ActivityIndicator color={colors.green} />
    </View>
  );
}
export function ReceiptMark() {
  return (
    <View
      accessibilityElementsHidden
      style={{
        width: 76,
        height: 102,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: colors.green,
        padding: 13,
        gap: 10,
        marginVertical: 14,
        backgroundColor: colors.bg,
      }}
    >
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            height: 3,
            width: i === 4 ? '60%' : '100%',
            backgroundColor: colors.green,
            borderRadius: 2,
          }}
        />
      ))}
    </View>
  );
}
export function PlantMark() {
  return (
    <View accessibilityElementsHidden style={{ width: 50, height: 52 }}>
      <View
        style={{
          position: 'absolute',
          left: 23,
          top: 16,
          width: 3,
          height: 36,
          backgroundColor: '#A5BC79',
          transform: [{ rotate: '15deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 3,
          top: 10,
          width: 24,
          height: 32,
          borderTopLeftRadius: 24,
          borderBottomRightRadius: 24,
          backgroundColor: '#A5BC79',
          transform: [{ rotate: '-24deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 25,
          top: 0,
          width: 22,
          height: 30,
          borderTopRightRadius: 24,
          borderBottomLeftRadius: 24,
          backgroundColor: '#DCEBAE',
          transform: [{ rotate: '18deg' }],
        }}
      />
    </View>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending: 'In queue',
    processing: 'Reading receipt',
    processed: 'Ready',
    needs_review: 'Check total',
    failed: 'Try again',
  };
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '600',
        color: ['failed', 'needs_review'].includes(status)
          ? colors.amber
          : colors.green,
        backgroundColor: ['failed', 'needs_review'].includes(status)
          ? '#F7EDDB'
          : colors.lime,
        paddingVertical: 5,
        paddingHorizontal: 9,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {labels[status] ?? status}
    </Text>
  );
}
