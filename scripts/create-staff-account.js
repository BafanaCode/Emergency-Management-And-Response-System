#!/usr/bin/env node
/**
 * Trusted provisioning of privileged (dispatcher / responder) Alert24 accounts.
 *
 * Runs OUTSIDE the browser with the Firebase Admin SDK, which bypasses Firestore
 * security rules. Never bundle or expose service-account credentials to the client.
 *
 * Setup (one-off, not a project dependency):
 *   npm install --no-save firebase-admin
 *   set GOOGLE_APPLICATION_CREDENTIALS=path\to\service-account.json   (keep this file OUT of git)
 *
 * Usage:
 *   node scripts/create-staff-account.js --role dispatcher --name "Jane Doe" \
 *        --email jane@example.com --phone "+27 00 000 0000" --password "<initial password>"
 *   node scripts/create-staff-account.js --role responder --speciality "Paramedic" ...
 */
/* eslint-disable no-console */
const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

if (args.includes('--help') || args.length === 0) {
  console.log('Usage: node scripts/create-staff-account.js --role <dispatcher|responder> --name <name> --email <email> --phone <phone> --password <password> [--speciality <text>]');
  process.exit(0);
}

const role = arg('role');
const name = arg('name');
const email = arg('email');
const phone = arg('phone');
const password = arg('password');
const speciality = arg('speciality');

if (!['dispatcher', 'responder'].includes(role)) {
  console.error('--role must be "dispatcher" or "responder"');
  process.exit(1);
}
if (!name || !email || !password || password.length < 6) {
  console.error('--name, --email and a --password of at least 6 characters are required');
  process.exit(1);
}

(async () => {
  const admin = require('firebase-admin');
  admin.initializeApp(); // uses GOOGLE_APPLICATION_CREDENTIALS
  const authUser = await admin.auth().createUser({ email, password, displayName: name });

  const data = {
    uid: authUser.uid,
    name,
    email,
    phone,
    role,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (role === 'responder') {
    data.speciality = speciality;
    data.isAvailable = true;
    data.activeIncidentId = '';
  }
  await admin.firestore().collection('users').doc(authUser.uid).set(data);
  console.log(`Created ${role} account ${authUser.uid}`);
})().catch((err) => {
  console.error('Failed to create staff account:', err.message);
  process.exit(1);
});
