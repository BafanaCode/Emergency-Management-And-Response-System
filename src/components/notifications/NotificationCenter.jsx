import React, { useState } from 'react';
import {
  getNotificationType,
  TYPE_LABELS,
  NOTIFICATION_TYPES,
} from '../../utils/notifications';
import './NotificationCenter.css';

const TYPE_CLASS = {
  [NOTIFICATION_TYPES.REPORTED]: 'reported',
  [NOTIFICATION_TYPES.ASSIGNED]: 'assigned',
  [NOTIFICATION_TYPES.STATUS]: 'status',
  [NOTIFICATION_TYPES.RESOLVED]: 'resolved',
  general: 'general',
};

/**
 * In-app notification centre (no SMS / email involved).
 *
 * `onOpen(notification)` should mark the item read and navigate to the incident when the
 * user is allowed to see it. It may return `false` (or a promise of false) when the
 * incident is not available, in which case an explanatory message is shown.
 */
const NotificationCenter = ({
  notifications = [],
  unreadCount = 0,
  loading = false,
  error = '',
  actionError = '',
  online = true,
  fromCache = false,
  onMarkRead,
  onMarkAllRead,
  onOpen,
  formatDate = () => '',
  emptyHint = 'You will be notified here when something changes.',
}) => {
  const [notice, setNotice] = useState('');
  const [busyAll, setBusyAll] = useState(false);

  const open = async (n) => {
    setNotice('');
    if (!onOpen) {
      if (onMarkRead) onMarkRead(n);
      return;
    }
    const result = await onOpen(n);
    if (result === false) {
      setNotice('That incident is no longer available to you, so it cannot be opened.');
    }
  };

  const markAll = async () => {
    if (busyAll || !onMarkAllRead) return;
    setBusyAll(true);
    try {
      await onMarkAllRead();
    } finally {
      setBusyAll(false);
    }
  };

  return (
    <section className="a24-notif" aria-label="Notification centre">
      <div className="a24-notif-bar">
        <span className="a24-notif-count" aria-live="polite">
          {loading
            ? 'Loading…'
            : unreadCount > 0
            ? `${unreadCount} unread`
            : 'All caught up'}
        </span>
        {onMarkAllRead && (
          <button
            type="button"
            className="a24-notif-markall"
            onClick={markAll}
            disabled={busyAll || unreadCount === 0}
            aria-busy={busyAll}
          >
            Mark all as read
          </button>
        )}
      </div>

      {!online && (
        <div className="a24-notif-banner warn" role="status">
          You are offline. Showing saved notifications — new ones will appear when you reconnect.
        </div>
      )}
      {online && fromCache && !loading && (
        <div className="a24-notif-banner info" role="status">
          Reconnecting to live updates…
        </div>
      )}
      {error && (
        <div className="a24-notif-banner error" role="alert">
          {error}
        </div>
      )}
      {actionError && (
        <div className="a24-notif-banner error" role="alert">
          {actionError}
        </div>
      )}
      {notice && (
        <div className="a24-notif-banner warn" role="status">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="a24-notif-state" role="status">
          <span className="a24-notif-spinner" aria-hidden="true" /> Loading notifications…
        </div>
      ) : notifications.length === 0 && !error ? (
        <div className="a24-notif-state empty">
          <strong>No notifications yet</strong>
          <span>{emptyHint}</span>
        </div>
      ) : (
        <ul className="a24-notif-list">
          {notifications.map((n) => {
            const type = getNotificationType(n);
            return (
              <li
                key={n.notificationId}
                className={`a24-notif-item ${n.isRead ? 'read' : 'unread'}`}
              >
                <button
                  type="button"
                  className="a24-notif-main"
                  onClick={() => open(n)}
                  aria-label={`${n.isRead ? 'Read' : 'Unread'} ${TYPE_LABELS[type]} notification: ${n.message}. Open incident`}
                >
                  <span className={`a24-notif-dot ${n.isRead ? 'read' : 'unread'}`} aria-hidden="true" />
                  <span className="a24-notif-body">
                    <span className="a24-notif-top">
                      <span className={`a24-notif-type ${TYPE_CLASS[type]}`}>{TYPE_LABELS[type]}</span>
                      <span className="a24-notif-state-label">{n.isRead ? 'Read' : 'Unread'}</span>
                    </span>
                    <span className="a24-notif-msg">{n.message}</span>
                    <span className="a24-notif-time">{formatDate(n.createdAt) || 'Just now'}</span>
                  </span>
                </button>
                {!n.isRead && onMarkRead && (
                  <button
                    type="button"
                    className="a24-notif-read-btn"
                    onClick={() => onMarkRead(n)}
                    aria-label={`Mark notification as read: ${n.message}`}
                  >
                    Mark read
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default NotificationCenter;
