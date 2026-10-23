import GroceriesScreen from '@/features/groceries/GroceriesScreen';
import { useAuth } from '@/providers/AuthProvider';

export default function GroceriesTab() {
  const { user } = useAuth();
  // Remount the entire feature on an account change, including preview/navigation state.
  if (!user) return null;
  return <GroceriesScreen key={user.id} userId={user.id} />;
}
