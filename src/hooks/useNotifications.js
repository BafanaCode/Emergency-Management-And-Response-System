import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { DISPATCHER_CHANNEL, sortNewestFirst } from '../utils/notifications';

const MAX_BATCH = 400;

const friendlyError = (err) =>
  err && err.code === 'permission-denied'
    ? 'You do not have permission to load notifications.'
    : 'Notifications could not be loaded. Check your connection and try again.';

/**
 * Real-time in-app notification centre state for one signed-in user.
 *
 * - Personal notifications: `notifications` where userId == uid (all roles).
 * - Dispatchers additionally follow the shared 'dispatchers' channel, with per-user
 *   read state in `notificationReads`.
 * - All listeners are removed when the user signs out or the component unmounts.
 * - Items are keyed by document ID, so snapshot re-delivery cannot duplicate them.
 *
 * @param {{uid:string}|null} user
 * @param {'reporter'|'dispatcher'|'responder'|undefined} role
 */
export default function useNotifications(user, role) {
  const uid = user?.uid || null;
  const isDispatcher = role === 'dispatcher';

  const [own, setOwn] = useState([]);
  const [channel, setChannel] = useState([]);
  const [readIds, setReadIds] = useState(() => new Set());
  const [loaded, setLoaded] = useState({ own: false, channel: false, reads: false });
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );
  const inflight = useRef(new Set());

  // ── connectivity ──
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // ── listeners ──
  useEffect(() => {
    setOwn([]);
    setChannel([]);
    setReadIds(new Set());
    setError('');
    setActionError('');
    setFromCache(false);
    setLoaded({ own: false, channel: !isDispatcher, reads: !isDispatcher });
    inflight.current = new Set();
    if (!uid) return undefined;

    const unsubs = [];
    const onErr = (key) => (err) => {
      // Ignore the permission errors Firestore emits while a sign-out is in flight
      console.error(`Notifications listener (${key}) failed:`, err?.code || err?.message);
      setError(friendlyError(err));
      setLoaded((l) => ({ ...l, [key]: true }));
    };
    const meta = { includeMetadataChanges: true };

    unsubs.push(
      onSnapshot(
        query(collection(db, 'notifications'), where('userId', '==', uid)),
        meta,
        (snap) => {
          setOwn(snap.docs.map((d) => ({ notificationId: d.id, ...d.data() })));
          setFromCache(snap.metadata.fromCache);
          setError('');
          setLoaded((l) => ({ ...l, own: true }));
        },
        onErr('own')
      )
    );

    if (isDispatcher) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'notifications'), where('userId', '==', DISPATCHER_CHANNEL)),
          meta,
          (snap) => {
            setChannel(
              snap.docs.map((d) => ({ notificationId: d.id, isChannel: true, ...d.data() }))
            );
            setLoaded((l) => ({ ...l, channel: true }));
          },
          onErr('channel')
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'notificationReads'), where('userId', '==', uid)),
          meta,
          (snap) => {
            setReadIds(new Set(snap.docs.map((d) => d.data().notificationId)));
            setLoaded((l) => ({ ...l, reads: true }));
          },
          onErr('reads')
        )
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [uid, isDispatcher]);

  const notifications = useMemo(() => {
    const byId = new Map();
    own.forEach((n) => byId.set(n.notificationId, n));
    channel.forEach((n) =>
      byId.set(n.notificationId, { ...n, isRead: readIds.has(n.notificationId) })
    );
    return sortNewestFirst([...byId.values()]);
  }, [own, channel, readIds]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);
  const loading = !(loaded.own && loaded.channel && loaded.reads);

  const markRead = useCallback(
    async (n) => {
      if (!uid || !n || n.isRead || inflight.current.has(n.notificationId)) return;
      inflight.current.add(n.notificationId);
      setActionError('');
      try {
        if (n.isChannel) {
          await setDoc(doc(db, 'notificationReads', `${uid}_${n.notificationId}`), {
            userId: uid,
            notificationId: n.notificationId,
            readAt: serverTimestamp(),
          });
        } else {
          await updateDoc(doc(db, 'notifications', n.notificationId), { isRead: true });
        }
      } catch (err) {
        console.error('Could not mark notification as read:', err?.code || err?.message);
        setActionError('Could not mark that notification as read. Please try again.');
      } finally {
        inflight.current.delete(n.notificationId);
      }
    },
    [uid]
  );

  const markAllRead = useCallback(async () => {
    if (!uid) return;
    const unread = notifications.filter(
      (n) => !n.isRead && !inflight.current.has(n.notificationId)
    );
    if (unread.length === 0) return;
    unread.forEach((n) => inflight.current.add(n.notificationId));
    setActionError('');
    try {
      for (let i = 0; i < unread.length; i += MAX_BATCH) {
        const batch = writeBatch(db);
        unread.slice(i, i + MAX_BATCH).forEach((n) => {
          if (n.isChannel) {
            batch.set(doc(db, 'notificationReads', `${uid}_${n.notificationId}`), {
              userId: uid,
              notificationId: n.notificationId,
              readAt: serverTimestamp(),
            });
          } else {
            batch.update(doc(db, 'notifications', n.notificationId), { isRead: true });
          }
        });
        // eslint-disable-next-line no-await-in-loop
        await batch.commit();
      }
    } catch (err) {
      console.error('Could not mark notifications as read:', err?.code || err?.message);
      setActionError('Could not mark all notifications as read. Please try again.');
    } finally {
      unread.forEach((n) => inflight.current.delete(n.notificationId));
    }
  }, [uid, notifications]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    actionError,
    online,
    fromCache,
    markRead,
    markAllRead,
  };
}
