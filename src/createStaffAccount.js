/**
 * DEPRECATED — client-side staff creation is intentionally disabled.
 *
 * Previously this created a Firebase Auth account in the browser and then wrote a
 * `users/{uid}` document containing a privileged role (dispatcher/responder). That
 * design cannot be made secure: any client could do the same and grant itself a
 * privileged role. firestore.rules now only allows users to self-create as
 * 'reporter' and never allows a client to change `role`.
 *
 * Privileged accounts must be provisioned by trusted code that uses the Firebase
 * Admin SDK (which bypasses security rules). Use:
 *
 *   node scripts/create-staff-account.js --help
 *
 * This function is kept (it had no call sites) so any stale import fails loudly with
 * guidance instead of silently attempting an insecure operation.
 */
export async function createStaffAccount() {
  throw new Error(
    "createStaffAccount is disabled for security. Provision staff accounts with scripts/create-staff-account.js (Firebase Admin SDK)."
  );
}
