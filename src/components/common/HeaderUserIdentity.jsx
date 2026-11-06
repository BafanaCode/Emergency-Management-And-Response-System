import React from 'react';
import './HeaderUserIdentity.css';

/**
 * Shared Top Header User Identity & Sign-Out Control
 * Used across Reporter, Dispatcher, and Responder dashboards.
 */
const HeaderUserIdentity = ({
  name,
  email,
  roleLabel,
  onProfileClick,
  onLogout,
  logoutLabel = 'Sign Out',
  logoutClassName = '',
  leadingSlot = null,
}) => {
  const displayName = (name && name.trim()) || roleLabel || 'User';
  const initials = (name || email || roleLabel || 'U')
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const InteractiveTag = typeof onProfileClick === 'function' ? 'button' : 'div';

  return (
    <div className="a24-user-area">
      {leadingSlot && <div className="a24-user-area__leading">{leadingSlot}</div>}

      <InteractiveTag
        {...(typeof onProfileClick === 'function'
          ? {
              type: 'button',
              onClick: onProfileClick,
              title: 'View account profile',
            }
          : {})}
        className={`a24-user-chip ${typeof onProfileClick === 'function' ? 'a24-user-chip--interactive' : ''}`}
      >
        <span className="a24-user-chip__avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="a24-user-chip__meta">
          <span className="a24-user-chip__primary-row">
            <span className="a24-user-chip__name">{displayName}</span>
            {roleLabel && (
              <span className="a24-user-chip__role">{roleLabel}</span>
            )}
          </span>
          {email && (
            <span className="a24-user-chip__email" title={email}>
              {email}
            </span>
          )}
        </span>
      </InteractiveTag>

      <span className="a24-user-area__divider" aria-hidden="true" />

      <button
        type="button"
        className={`a24-user-area__logout ${logoutClassName}`.trim()}
        onClick={onLogout}
      >
        {logoutLabel}
      </button>
    </div>
  );
};

export default HeaderUserIdentity;

