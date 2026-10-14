import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import NotificationCenter from './NotificationCenter';
import { NOTIFICATION_TYPES } from '../../utils/notifications';

describe('NotificationCenter component', () => {
  const mockNotifications = [
    {
      notificationId: 'notif-1',
      userId: 'user-1',
      incidentId: 'inc-1',
      type: NOTIFICATION_TYPES.REPORTED,
      message: 'New Fire incident reported (Critical)',
      isRead: false,
      createdAt: { toDate: () => new Date('2026-10-14T10:00:00Z') },
    },
    {
      notificationId: 'notif-2',
      userId: 'user-1',
      incidentId: 'inc-2',
      type: NOTIFICATION_TYPES.STATUS,
      message: 'Your responder is en route',
      isRead: true,
      createdAt: { toDate: () => new Date('2026-10-14T09:30:00Z') },
    },
  ];

  test('renders notifications list with unread and read items', () => {
    render(
      <NotificationCenter
        notifications={mockNotifications}
        unreadCount={1}
        loading={false}
        formatDate={(ts) => (ts ? 'Formatted Time' : '')}
      />
    );

    expect(screen.getByText('1 unread')).toBeInTheDocument();
    expect(screen.getByText('New Fire incident reported (Critical)')).toBeInTheDocument();
    expect(screen.getByText('Your responder is en route')).toBeInTheDocument();
    expect(screen.getByText('New report')).toBeInTheDocument();
    expect(screen.getByText('Status update')).toBeInTheDocument();
  });

  test('handles Mark Read on unread items', () => {
    const handleMarkRead = jest.fn();
    render(
      <NotificationCenter
        notifications={mockNotifications}
        unreadCount={1}
        loading={false}
        onMarkRead={handleMarkRead}
      />
    );

    const markReadBtn = screen.getByRole('button', { name: /Mark notification as read/i });
    fireEvent.click(markReadBtn);
    expect(handleMarkRead).toHaveBeenCalledWith(mockNotifications[0]);
  });

  test('handles Mark All As Read', async () => {
    const handleMarkAllRead = jest.fn().mockResolvedValue();
    render(
      <NotificationCenter
        notifications={mockNotifications}
        unreadCount={1}
        loading={false}
        onMarkAllRead={handleMarkAllRead}
      />
    );

    const markAllBtn = screen.getByRole('button', { name: /Mark all as read/i });
    await act(async () => {
      fireEvent.click(markAllBtn);
    });
    expect(handleMarkAllRead).toHaveBeenCalled();
  });

  test('calls onOpen when notification item is clicked', async () => {
    const handleOpen = jest.fn().mockResolvedValue(true);
    render(
      <NotificationCenter
        notifications={mockNotifications}
        unreadCount={1}
        loading={false}
        onOpen={handleOpen}
      />
    );

    const itemBtn = screen.getByRole('button', { name: /New report notification/i });
    fireEvent.click(itemBtn);
    expect(handleOpen).toHaveBeenCalledWith(mockNotifications[0]);
  });

  test('displays loading, empty and offline states correctly', () => {
    const { rerender } = render(<NotificationCenter loading={true} />);
    expect(screen.getByText(/Loading notifications…/i)).toBeInTheDocument();

    rerender(<NotificationCenter loading={false} notifications={[]} emptyHint="Custom empty hint" />);
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    expect(screen.getByText('Custom empty hint')).toBeInTheDocument();

    rerender(<NotificationCenter loading={false} online={false} notifications={[]} />);
    expect(screen.getByText(/You are offline/i)).toBeInTheDocument();
  });
});
