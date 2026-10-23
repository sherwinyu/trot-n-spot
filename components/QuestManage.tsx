import { StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';
import { useManageQuest } from '@/hooks/useManageQuest';
import { confirm, notify } from '@/lib/notify';
import { canReassignQuest } from '@/lib/questPermissions';
import { Quest } from '@/types/database';

// Creator controls on the quest detail screen: edit the hint (and, while
// the hunt is still on, who it's for) or delete the quest. Render only
// when `canManageQuest` says so.
export function QuestManage({
  quest,
  onUpdated,
  onDeleted,
}: {
  quest: Quest;
  onUpdated: (quest: Quest) => void;
  onDeleted: () => void;
}) {
  const c = Colors[useColorScheme() ?? 'light'];
  const { user, packs } = useAuth();
  const { updateQuest, deleteQuest, loading, error } = useManageQuest();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(quest.description ?? '');
  const [assigneeId, setAssigneeId] = useState<string | null>(quest.assignee_id);

  const packmates =
    packs.find((p) => p.id === quest.pack_id)?.members.filter((m) => m.user_id !== user?.id) ?? [];
  const reassignable = canReassignQuest(quest, user?.id);

  const startEditing = () => {
    setDescription(quest.description ?? '');
    setAssigneeId(quest.assignee_id);
    setEditing(true);
  };

  const handleSave = async () => {
    const trimmed = description.trim();
    const updated = await updateQuest(quest, {
      description: trimmed.length > 0 ? trimmed : null,
      assigneeId: reassignable ? assigneeId : quest.assignee_id,
    });
    if (updated) {
      setEditing(false);
      onUpdated(updated);
    }
  };

  const handleDelete = () => {
    confirm(
      'Delete this quest?',
      quest.status === 'completed'
        ? 'This removes the quest and its find from your pack history.'
        : 'Your packmates will no longer see it. This cannot be undone.',
      async () => {
        const ok = await deleteQuest(quest);
        if (ok) {
          notify('Quest deleted', undefined, onDeleted);
        }
      },
      'Delete'
    );
  };

  if (!editing) {
    return (
      <View style={styles.container} testID="quest-manage">
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={startEditing}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleDelete}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#d93025" />
            ) : (
              <Text style={styles.dangerText}>Delete</Text>
            )}
          </TouchableOpacity>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container} testID="quest-manage">
      <Text style={styles.sectionLabel}>Edit quest</Text>
      <TextInput
        style={[
          styles.descriptionInput,
          { backgroundColor: c.inputBackground, color: c.inputText, borderColor: c.border },
        ]}
        value={description}
        onChangeText={setDescription}
        placeholder="Add a hint or description (optional)"
        placeholderTextColor={c.placeholder}
        multiline
        maxLength={200}
        accessibilityLabel="Quest description"
      />

      {reassignable && (
        <>
          <Text style={styles.pickerLabel}>For</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, assigneeId === null && styles.chipSelected]}
              onPress={() => setAssigneeId(null)}
            >
              <Text style={[styles.chipText, assigneeId === null && styles.chipTextSelected]}>
                Whole pack
              </Text>
            </TouchableOpacity>
            {packmates.map((m) => (
              <TouchableOpacity
                key={m.user_id}
                style={[styles.chip, assigneeId === m.user_id && styles.chipSelected]}
                onPress={() => setAssigneeId(m.user_id)}
              >
                <Text style={[styles.chipText, assigneeId === m.user_id && styles.chipTextSelected]}>
                  {m.profile?.display_name ?? '?'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <View style={styles.row}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setEditing(false)}
          disabled={loading}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleSave}
          disabled={loading}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    backgroundColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'transparent',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  descriptionInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 60,
    marginBottom: 16,
  },
  pickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  chipSelected: {
    backgroundColor: '#4285F4',
    borderColor: '#4285F4',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#fff',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 2,
    backgroundColor: '#4285F4',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d93025',
    alignItems: 'center',
  },
  dangerText: {
    color: '#d93025',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: 'red',
    textAlign: 'center',
    marginTop: 12,
  },
});
