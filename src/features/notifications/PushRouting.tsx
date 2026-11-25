import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { refreshReminders, routeFromNotification } from './push';

// Nurse area only (native): re-registers the token at launch and opens
// Medicación when a reminder is tapped, also from a cold start.
const handled = new Set<string>(); // one navigation per tap, even if the layout remounts

export function PushRouting() {
  const router = useRouter();
  const last = Notifications.useLastNotificationResponse();

  useEffect(() => {
    refreshReminders();
  }, []);

  useEffect(() => {
    if (!last) return;
    const id = last.notification.request.identifier;
    const url = routeFromNotification(last.notification.request.content.data);
    if (!url || handled.has(id)) return;
    handled.add(id);
    router.push(url);
  }, [last, router]);

  return null;
}
