import { useEffect, useState } from 'react';
import { StyleSheet, Switch, TextInput, TouchableOpacity, Platform } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/providers/NotificationProvider';
import { useJourney } from '@/hooks/useJourney';
import {
  DEFAULT_WALK_REMINDERS, prepareWalkReminderNotifications, readWalkReminders,
  updateWalkReminders, validateReminderSettings, WalkReminderSettings as Settings,
} from '@/lib/walkReminders';

function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function parseTime(value: string): number {
  if (!/^\d{2}:\d{2}$/.test(value) || Number(value.slice(3)) > 59) {
    throw new Error('Enter a time as HH:MM, for example 07:30 or 16:30.');
  }
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

export function WalkReminderSettings() {
  const { user } = useAuth();
  const { permission, requestPermission, openSystemSettings } = useNotifications();
  const { reminderError, loading: journeyLoading } = useJourney();
  const [settings, setSettings] = useState<Settings>(DEFAULT_WALK_REMINDERS);
  const [morning, setMorning] = useState('07:00');
  const [evening, setEvening] = useState('16:00');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = Colors[useColorScheme() ?? 'light'];

  useEffect(() => {
    let alive = true;
    if (!user) return;
    setIsLoading(true);
    readWalkReminders(user.id).then((saved) => {
      if (!alive) return;
      setSettings(saved);
      setMorning(formatTime(saved.morning));
      setEvening(formatTime(saved.evening));
    }).catch(() => {
      if (alive) setError('Could not load reminder settings. Reopen this screen to retry.');
    }).finally(() => { if (alive) setIsLoading(false); });
    return () => { alive = false; };
  }, [user?.id]);

  const save = async (isEnabled: boolean, isToggle = false) => {
    if (!user || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const next = isToggle && !isEnabled
        ? { isEnabled, morning: settings.morning, evening: settings.evening }
        : { isEnabled, morning: parseTime(morning), evening: parseTime(evening) };
      validateReminderSettings(next);
      if (isEnabled && permission !== 'granted') {
        await prepareWalkReminderNotifications();
        if (await requestPermission() !== 'granted') {
          setError('Allow notifications in system settings to receive walk reminders.');
          return;
        }
      }
      await updateWalkReminders(user.id, next);
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save reminders. Please retry.');
      // A scheduling failure can happen after settings were saved; show the actual preference.
      await readWalkReminders(user.id).then(setSettings).catch(() => {});
    } finally { setIsBusy(false); }
  };

  if (Platform.OS === 'web') return null;
  const disabled = isLoading || isBusy || journeyLoading;
  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <View style={styles.row}>
        <Text style={styles.title}>Walk reminders</Text>
        <Switch accessibilityLabel="Walk reminders" value={settings.isEnabled} disabled={disabled}
          onValueChange={(enabled) => { void save(enabled, true); }} />
      </View>
      <Text style={styles.help}>A morning and evening nudge to log your walk. No location or motion tracking.</Text>
      <View style={styles.row}>
        <Text>Morning · 7–10 a.m.</Text>
        <TextInput accessibilityLabel="Morning reminder time" value={morning} onChangeText={setMorning}
          placeholder="07:00" maxLength={5} editable={!disabled} keyboardType="numbers-and-punctuation"
          style={[styles.input, { color: c.text, borderColor: c.border }]} />
      </View>
      <View style={styles.row}>
        <Text>Evening · 4–7 p.m.</Text>
        <TextInput accessibilityLabel="Evening reminder time" value={evening} onChangeText={setEvening}
          placeholder="16:00" maxLength={5} editable={!disabled} keyboardType="numbers-and-punctuation"
          style={[styles.input, { color: c.text, borderColor: c.border }]} />
      </View>
      <Text style={styles.help}>Use 24-hour time (HH:MM). Times are local to this device.</Text>
      <TouchableOpacity accessibilityRole="button" disabled={disabled} style={[styles.button, disabled && styles.disabled]}
        onPress={() => { void save(settings.isEnabled); }}>
        <Text style={styles.buttonText}>{isBusy ? 'Saving…' : 'Save reminder times'}</Text>
      </TouchableOpacity>
      {permission === 'denied' && (
        <TouchableOpacity accessibilityRole="button" onPress={openSystemSettings}>
          <Text style={styles.link}>Notifications are off · Open Settings</Text>
        </TouchableOpacity>
      )}
      {(error || reminderError) && <Text accessibilityRole="alert" style={styles.error}>{error || reminderError}</Text>}
      <Text style={styles.footnote}>Only on this device, separate from pack activity pings. Reminders are scheduled 4 weeks ahead and renewed when you open the app. Reopen after changing time zones.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, borderRadius: 16, marginBottom: 32, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'transparent', gap: 12 },
  title: { fontSize: 16, fontWeight: '600' },
  help: { fontSize: 14, color: '#777', lineHeight: 20 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, width: 80, fontSize: 17, textAlign: 'center' },
  button: { backgroundColor: '#4285F4', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.5 },
  link: { color: '#4285F4', paddingVertical: 8 },
  error: { color: '#EA4335', fontSize: 14 },
  footnote: { fontSize: 12, color: '#777', lineHeight: 18 },
});
