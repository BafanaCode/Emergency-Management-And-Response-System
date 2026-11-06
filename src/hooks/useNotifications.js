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

const getLocalReadsKey = (uid) => `alert24_notif_reads_${uid}`;

const loadLocalReadIds = (uid) => {
  if (!uid || typeof window === 'undefined' || !window.localStorage) return new Set();
  try {
    const raw = window.localStorage.getItem(getLocalReadsKey(uid));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
};

const saveLocalReadIds = (uid, setOfIds) => {
  if (!uid || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(getLocalReadsKey(uid), JSON.stringify([...setOfIds]));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
};

/**
 * Real-time in-app notification centre state for one signed-in user.
 *
 * - Personal notifications: `notifications` where userId == uid (all roles).
 * - Dispatchers additionally follow the shared 'dispatchers' channel, with per-user
 *   read state in `notificationReads` (plus local fallback persistence when rules
 *   restrict `notificationReads` or shared document updates).
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
  const [remoteReadIds, setRemoteReadIds] = useState(() => new Set());
  const [localReadIds, setLocalReadIds] = useState(() => loadLocalReadIds(uid));
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
    setRemoteReadIds(new Set());
    setLocalReadIds(loadLocalReadIds(uid));
    setError('');
    setActionError('');
    setFromCache(false);
    setLoaded({ own: false, channel: !isDispatcher, reads: !isDispatcher });
    inflight.current = new Set();
    if (!uid) return undefined;

    const unsubs = [];
    const onErr = (key) => (err) => {
      // If `notificationReads` is not yet deployed in remote Firestore rules, fall back
      // gracefully to `notifications.isRead` and per-user local read state.
      if (key === 'reads' && err?.code === 'permission-denied') {
        setLoaded((l) => ({ ...l, reads: true }));
        return;
      }
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
            setRemoteReadIds(new Set(snap.docs.map((d) => d.data().notificationId)));
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
    own.forEach((n) =>
      byId.set(n.notificationId, {
        ...n,
        isRead: Boolean(n.isRead) || localReadIds.has(n.notificationId),
      })
    );
    channel.forEach((n) =>
      byId.set(n.notificationId, {
        ...n,
        isRead:
          Boolean(n.isRead) ||
          remoteReadIds.has(n.notificationId) ||
          localReadIds.has(n.notificationId),
      })
    );
    return sortNewestFirst([...byId.values()]);
  }, [own, channel, remoteReadIds, localReadIds]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);
  const loading = !(loaded.own && loaded.channel && loaded.reads);

  const recordLocalReadIds = useCallback(
    (ids) => {
      if (!uid || !ids || ids.length === 0) return;
      setLocalReadIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        saveLocalReadIds(uid, next);
        return next;
      });
    },
    [uid]
  );

  const markRead = useCallback(
    async (n) => {
      if (!uid || !n || n.isRead || inflight.current.has(n.notificationId)) return;
      inflight.current.add(n.notificationId);
      setActionError('');

      if (n.isChannel) {
        // Optimistically mark as read for this dispatcher and persist locally
        recordLocalReadIds([n.notificationId]);
      }

      try {
        if (n.isChannel) {
          try {
            await setDoc(doc(db, 'notificationReads', `${uid}_${n.notificationId}`), {
              userId: uid,
              notificationId: n.notificationId,
              readAt: serverTimestamp(),
            });
          } catch (readReceiptErr) {
            // Fallback: try updating `isRead: true` on the notification doc itself
            try {
              await updateDoc(doc(db, 'notifications', n.notificationId), { isRead: true });
            } catch (fallbackErr) {
              // If remote rules reject both writes with permission-denied, keep the local read state
              if (
                readReceiptErr?.code !== 'permission-denied' &&
                fallbackErr?.code !== 'permission-denied'
              ) {
                throw fallbackErr;
              }
            }
          }
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
    [uid, recordLocalReadIds]
  );

  const markAllRead = useCallback(async () => {
    if (!uid) return;
    const unread = notifications.filter(
      (n) => !n.isRead && !inflight.current.has(n.notificationId)
    );
    if (unread.length === 0) return;
    unread.forEach((n) => inflight.current.add(n.notificationId));
    setActionError('');

    const channelUnread = unread.filter((n) => n.isChannel);
    const ownUnread = unread.filter((n) => !n.isChannel);

    if (channelUnread.length > 0) {
      recordLocalReadIds(channelUnread.map((n) => n.notificationId));
    }

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
    } catch (batchErr) {
      // If the combined batch failed (e.g. `notificationReads` permission-denied on remote),
      // still commit any personal notifications and try fallback updates on channel notifications.
      try {
        if (ownUnread.length > 0) {
          for (let i = 0; i < ownUnread.length; i += MAX_BATCH) {
            const ownBatch = writeBatch(db);
            ownUnread.slice(i, i + MAX_BATCH).forEach((n) => {
              ownBatch.update(doc(db, 'notifications', n.notificationId), { isRead: true });
            });
            // eslint-disable-next-line no-await-in-loop
            await ownBatch.commit();
          }
        }
        if (channelUnread.length > 0) {
          for (let i = 0; i < channelUnread.length; i += MAX_BATCH) {
            const chanBatch = writeBatch(db);
            channelUnread.slice(i, i + MAX_BATCH).forEach((n) => {
              chanBatch.update(doc(db, 'notifications', n.notificationId), { isRead: true });
            });
            // eslint-disable-next-line no-await-in-loop
            await chanBatch.commit();
          }
        }
      } catch (fallbackErr) {
        if (
          ownUnread.length > 0 ||
          (batchErr?.code !== 'permission-denied' && fallbackErr?.code !== 'permission-denied')
        ) {
          console.error('Could not mark notifications as read:', fallbackErr?.code || fallbackErr?.message);
          setActionError('Could not mark all notifications as read. Please try again.');
        }
      }
    } finally {
      unread.forEach((n) => inflight.current.delete(n.notificationId));
    }
  }, [uid, notifications, recordLocalReadIds]);

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
