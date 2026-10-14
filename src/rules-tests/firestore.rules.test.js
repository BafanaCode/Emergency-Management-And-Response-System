/**
 * Firestore security-rules tests.
 *
 * These run against the Firebase Emulator Suite and are SKIPPED automatically when the
 * Firestore emulator is not running (so `npm test` stays green on machines without Java).
 *
 * Run them with (requires Java 11+ and the Firebase CLI via npx):
 *   npm run test:rules
 *
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

// Provide fetch for @firebase/rules-unit-testing under Jest's node environment
if (typeof global.fetch === 'undefined') {
  global.fetch = function (url, options = {}) {
    return new Promise((resolve, reject) => {
      const u = typeof url === 'string' ? new URL(url) : (url instanceof URL ? url : new URL(url.toString()));
      const headers = { ...(options.headers || {}) };
      const body = options.body;
      if (body && !headers['Content-Length'] && !headers['content-length']) {
        headers['Content-Length'] = Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body));
      }
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          method: options.method || 'GET',
          headers,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const bodyText = Buffer.concat(chunks).toString('utf8');
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              url: u.toString(),
              text: async () => bodyText,
              json: async () => JSON.parse(bodyText || '{}'),
            });
          });
        }
      );
      req.on('error', reject);
      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  };
}

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const describeIfEmulator = emulatorHost ? describe : describe.skip;

describeIfEmulator('Firestore security rules', () => {
  jest.setTimeout(30000);

  let testEnv;
  let fb;
  let assertSucceeds;
  let assertFails;

  beforeAll(async () => {
    const rut = require('@firebase/rules-unit-testing');
    fb = require('firebase/firestore');
    assertSucceeds = rut.assertSucceeds;
    assertFails = rut.assertFails;
    const [host, port] = emulatorHost.split(':');
    testEnv = await rut.initializeTestEnvironment({
      projectId: 'demo-alert24',
      firestore: {
        rules: fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8'),
        host,
        port: Number(port),
      },
    });
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  const dbAs = (uid) => testEnv.authenticatedContext(uid).firestore();
  const ref = (db, ...segments) => fb.doc(db, ...segments);

  const incidentFields = (overrides = {}) => ({
    reporterId: 'rep1',
    reporterName: 'Reporter One',
    type: 'Fire',
    severity: 'Critical',
    description: 'A large fire in the building on the corner',
    address: '1 Main Street',
    photoUrl: '',
    status: 'Reported',
    createdAt: fb.serverTimestamp(),
    updatedAt: fb.serverTimestamp(),
    ...overrides,
  });

  const user = (uid, role, extra = {}) => ({
    uid,
    name: uid,
    email: `${uid}@example.com`,
    phone: '000',
    role,
    ...extra,
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await fb.setDoc(ref(db, 'users', 'rep1'), user('rep1', 'reporter'));
      await fb.setDoc(ref(db, 'users', 'rep2'), user('rep2', 'reporter'));
      await fb.setDoc(ref(db, 'users', 'disp1'), user('disp1', 'dispatcher'));
      // resp1 is busy with incAssigned; resp2 and resp3 are free
      await fb.setDoc(ref(db, 'users', 'resp1'), user('resp1', 'responder', { isAvailable: false, activeIncidentId: 'incAssigned' }));
      await fb.setDoc(ref(db, 'users', 'resp2'), user('resp2', 'responder', { isAvailable: true, activeIncidentId: '' }));
      await fb.setDoc(ref(db, 'users', 'resp3'), user('resp3', 'responder', { isAvailable: true, activeIncidentId: '' }));
      await fb.setDoc(ref(db, 'users', 'resp4'), user('resp4', 'responder', { isAvailable: true, activeIncidentId: '' }));

      // inc1: freshly Reported by rep1 (assignable)
      await fb.setDoc(ref(db, 'incidents', 'inc1'), incidentFields());
      await fb.setDoc(ref(db, 'statusLogs', 'inc1_reported'), {
        incidentId: 'inc1', status: 'Reported', updatedBy: 'rep1', notes: 'Incident reported', timestamp: fb.serverTimestamp(),
      });
      // inc3: Reported by rep2 (not visible to rep1)
      await fb.setDoc(ref(db, 'incidents', 'inc3'), incidentFields({ reporterId: 'rep2' }));
      // incAssigned: assigned to resp1 (rep1 is reporter)
      await fb.setDoc(ref(db, 'incidents', 'incAssigned'), incidentFields({ status: 'Assigned', responderId: 'resp1', responderName: 'resp1' }));
      // incOnScene: On Scene, owned by resp2 (used for resolution tests)
      await fb.setDoc(ref(db, 'incidents', 'incOnScene'), incidentFields({ status: 'On Scene', responderId: 'resp2', responderName: 'resp2' }));
      await fb.setDoc(ref(db, 'users', 'resp2'), user('resp2', 'responder', { isAvailable: false, activeIncidentId: 'incOnScene' }));
      // existing notification for rep1
      await fb.setDoc(ref(db, 'notifications', 'n1'), {
        userId: 'rep1', incidentId: 'inc1', message: 'hello', isRead: false, createdAt: fb.serverTimestamp(),
      });
    });
  });

  // ───────────── helpers that mirror the real UI batches ─────────────
  function reportBatch(db, uid, id, incidentOverrides = {}, logOverrides = {}, includeLog = true) {
    const batch = fb.writeBatch(db);
    batch.set(ref(db, 'incidents', id), incidentFields({ reporterId: uid, ...incidentOverrides }));
    if (includeLog) {
      batch.set(ref(db, 'statusLogs', `${id}_reported`), {
        incidentId: id, status: 'Reported', updatedBy: uid, notes: 'Incident reported', timestamp: fb.serverTimestamp(), ...logOverrides,
      });
    }
    return batch;
  }

  function assignBatch(db, incidentId, responderUid, reporterUid = 'rep1') {
    const batch = fb.writeBatch(db);
    batch.update(ref(db, 'incidents', incidentId), {
      status: 'Assigned', responderId: responderUid, responderName: responderUid, updatedAt: fb.serverTimestamp(),
    });
    batch.update(ref(db, 'users', responderUid), { isAvailable: false, activeIncidentId: incidentId });
    batch.set(fb.doc(fb.collection(db, 'statusLogs')), {
      incidentId, status: 'Assigned', updatedBy: 'disp1', notes: `Assigned to ${responderUid}`, timestamp: fb.serverTimestamp(),
    });
    batch.set(fb.doc(fb.collection(db, 'notifications')), {
      userId: responderUid, incidentId, message: 'New emergency assigned: Fire at 1 Main Street', isRead: false, createdAt: fb.serverTimestamp(),
    });
    batch.set(fb.doc(fb.collection(db, 'notifications')), {
      userId: reporterUid, incidentId, message: 'A responder has been assigned to your emergency', isRead: false, createdAt: fb.serverTimestamp(),
    });
    return batch;
  }

  function progressBatch(db, uid, incidentId, newStatus, { withResolvedAt } = {}) {
    const batch = fb.writeBatch(db);
    const update = { status: newStatus, updatedAt: fb.serverTimestamp() };
    if (newStatus === 'Resolved' && withResolvedAt !== false) update.resolvedAt = fb.serverTimestamp();
    batch.update(ref(db, 'incidents', incidentId), update);
    batch.set(fb.doc(fb.collection(db, 'statusLogs')), {
      incidentId, status: newStatus, updatedBy: uid, notes: '', timestamp: fb.serverTimestamp(),
    });
    return batch;
  }

  // ───────────── 1. Role escalation ─────────────
  describe('role integrity', () => {
    test('a Reporter cannot change their own role', async () => {
      const db = dbAs('rep1');
      await assertFails(fb.updateDoc(ref(db, 'users', 'rep1'), { role: 'dispatcher' }));
      await assertFails(fb.setDoc(ref(db, 'users', 'rep1'), user('rep1', 'dispatcher')));
    });

    test('a Responder cannot change their own role or protected fields', async () => {
      const db = dbAs('resp3');
      await assertFails(fb.updateDoc(ref(db, 'users', 'resp3'), { role: 'dispatcher' }));
      await assertFails(fb.updateDoc(ref(db, 'users', 'resp3'), { activeIncidentId: 'inc1' }));
    });

    test('a new account can only self-register as reporter', async () => {
      const db = dbAs('newbie');
      const base = { uid: 'newbie', name: 'N', email: 'n@example.com', phone: '1', createdAt: fb.serverTimestamp() };
      await assertFails(fb.setDoc(ref(db, 'users', 'newbie'), { ...base, role: 'dispatcher' }));
      await assertFails(fb.setDoc(ref(db, 'users', 'newbie'), { ...base, role: 'responder' }));
      await assertSucceeds(fb.setDoc(ref(db, 'users', 'newbie'), { ...base, role: 'reporter' }));
    });

    test('permitted profile fields can still be edited', async () => {
      await assertSucceeds(fb.updateDoc(ref(dbAs('rep1'), 'users', 'rep1'), { name: 'New Name', phone: '123', themePreference: 'light' }));
      await assertSucceeds(fb.updateDoc(ref(dbAs('resp3'), 'users', 'resp3'), { name: 'R3', speciality: 'Paramedic' }));
    });

    test('contact details are not readable by other users, but are by dispatchers', async () => {
      await assertFails(fb.getDoc(ref(dbAs('rep1'), 'users', 'rep2')));
      await assertFails(fb.getDoc(ref(dbAs('resp2'), 'users', 'rep1')));
      await assertSucceeds(fb.getDoc(ref(dbAs('rep1'), 'users', 'rep1')));
      await assertSucceeds(fb.getDoc(ref(dbAs('disp1'), 'users', 'rep1')));
    });
  });

  // ───────────── 2. Reporter access to incidents ─────────────
  describe('reporter data isolation', () => {
    test('a Reporter cannot read or modify another reporter\'s incident', async () => {
      const db = dbAs('rep1');
      await assertFails(fb.getDoc(ref(db, 'incidents', 'inc3')));
      await assertFails(fb.updateDoc(ref(db, 'incidents', 'inc3'), { status: 'Resolved' }));
      await assertFails(fb.deleteDoc(ref(db, 'incidents', 'inc3')));
    });

    test('a Reporter cannot modify even their own incident (status/assignment fields)', async () => {
      const db = dbAs('rep1');
      await assertFails(fb.updateDoc(ref(db, 'incidents', 'inc1'), { status: 'Resolved', updatedAt: fb.serverTimestamp() }));
      await assertFails(fb.updateDoc(ref(db, 'incidents', 'inc1'), { responderId: 'resp2' }));
    });

    test('a Reporter can list only their own incidents', async () => {
      const db = dbAs('rep1');
      await assertSucceeds(fb.getDocs(fb.query(fb.collection(db, 'incidents'), fb.where('reporterId', '==', 'rep1'))));
      await assertFails(fb.getDocs(fb.collection(db, 'incidents')));
    });

    test('a Reporter can read status history of their incident but not of another\'s', async () => {
      const db = dbAs('rep1');
      await assertSucceeds(fb.getDocs(fb.query(fb.collection(db, 'statusLogs'), fb.where('incidentId', '==', 'inc1'))));
      await assertFails(fb.getDocs(fb.query(fb.collection(db, 'statusLogs'), fb.where('incidentId', '==', 'inc3'))));
    });
  });

  // ───────────── 3. Responder permissions ─────────────
  describe('responder permissions', () => {
    test('cannot change protected assignment fields', async () => {
      const db = dbAs('resp1');
      await assertFails(fb.updateDoc(ref(db, 'incidents', 'incAssigned'), { responderId: 'resp2', updatedAt: fb.serverTimestamp() }));
      await assertFails(fb.updateDoc(ref(db, 'incidents', 'incAssigned'), { reporterId: 'resp1', updatedAt: fb.serverTimestamp() }));
      await assertFails(fb.updateDoc(ref(db, 'incidents', 'incAssigned'), { severity: 'Minor', updatedAt: fb.serverTimestamp() }));
    });

    test('cannot skip lifecycle steps or move backwards', async () => {
      await assertFails(progressBatch(dbAs('resp1'), 'resp1', 'incAssigned', 'On Scene').commit());
      await assertFails(progressBatch(dbAs('resp1'), 'resp1', 'incAssigned', 'Resolved').commit());
      await assertFails(progressBatch(dbAs('resp2'), 'resp2', 'incOnScene', 'Assigned').commit());
    });

    test('can perform the valid next step on their own assignment', async () => {
      await assertSucceeds(progressBatch(dbAs('resp1'), 'resp1', 'incAssigned', 'En Route').commit());
    });

    test('cannot act on an incident assigned to someone else', async () => {
      await assertFails(progressBatch(dbAs('resp3'), 'resp3', 'incAssigned', 'En Route').commit());
    });

    test('cannot dispatch (assign) incidents', async () => {
      await assertFails(assignBatch(dbAs('resp3'), 'inc1', 'resp3').commit());
    });

    test('cannot mark themselves available while an assignment is active', async () => {
      await assertFails(fb.updateDoc(ref(dbAs('resp1'), 'users', 'resp1'), { isAvailable: true }));
      await assertFails(fb.updateDoc(ref(dbAs('resp1'), 'users', 'resp1'), { isAvailable: true, activeIncidentId: '' }));
    });

    test('can resolve: resolvedAt recorded and responder released atomically', async () => {
      const db = dbAs('resp2');
      const batch = progressBatch(db, 'resp2', 'incOnScene', 'Resolved');
      batch.update(ref(db, 'users', 'resp2'), { isAvailable: true, activeIncidentId: '' });
      batch.set(fb.doc(fb.collection(db, 'notifications')), {
        userId: 'rep1', incidentId: 'incOnScene', message: 'Your emergency report has been resolved', isRead: false, createdAt: fb.serverTimestamp(),
      });
      await assertSucceeds(batch.commit());
    });

    test('resolution without a resolvedAt timestamp is rejected', async () => {
      await assertFails(progressBatch(dbAs('resp2'), 'resp2', 'incOnScene', 'Resolved', { withResolvedAt: false }).commit());
    });

    test('cannot release themselves without resolving', async () => {
      await assertFails(fb.updateDoc(ref(dbAs('resp2'), 'users', 'resp2'), { isAvailable: true, activeIncidentId: '' }));
    });
  });

  // ───────────── 4. Forgery of history and notifications ─────────────
  describe('audit trail and notification integrity', () => {
    test('arbitrary users cannot forge status-history entries', async () => {
      const forged = (uid, status = 'Resolved') => ({
        incidentId: 'inc1', status, updatedBy: uid, notes: 'forged', timestamp: fb.serverTimestamp(),
      });
      await assertFails(fb.addDoc(fb.collection(dbAs('rep1'), 'statusLogs'), forged('rep1')));
      await assertFails(fb.addDoc(fb.collection(dbAs('rep2'), 'statusLogs'), forged('rep2')));
      await assertFails(fb.addDoc(fb.collection(dbAs('resp3'), 'statusLogs'), forged('resp3')));
      // even a dispatcher cannot add a log that doesn't match a real incident change
      await assertFails(fb.addDoc(fb.collection(dbAs('disp1'), 'statusLogs'), forged('disp1')));
      // impersonating another user is rejected
      await assertFails(fb.addDoc(fb.collection(dbAs('rep1'), 'statusLogs'), forged('disp1')));
    });

    test('status history is immutable (no update or delete)', async () => {
      await assertFails(fb.updateDoc(ref(dbAs('rep1'), 'statusLogs', 'inc1_reported'), { notes: 'edited' }));
      await assertFails(fb.deleteDoc(ref(dbAs('rep1'), 'statusLogs', 'inc1_reported')));
      await assertFails(fb.deleteDoc(ref(dbAs('disp1'), 'statusLogs', 'inc1_reported')));
    });

    test('users cannot spoof notifications to other users', async () => {
      const spoof = { userId: 'resp1', incidentId: 'inc1', message: 'You are fired', isRead: false, createdAt: fb.serverTimestamp() };
      await assertFails(fb.addDoc(fb.collection(dbAs('rep1'), 'notifications'), spoof));
      await assertFails(fb.addDoc(fb.collection(dbAs('resp3'), 'notifications'), spoof));
      await assertFails(fb.addDoc(fb.collection(dbAs('disp1'), 'notifications'), spoof));
    });

    test('recipients can mark only their own notifications read, and nothing else', async () => {
      await assertSucceeds(fb.updateDoc(ref(dbAs('rep1'), 'notifications', 'n1'), { isRead: true }));
      await assertFails(fb.updateDoc(ref(dbAs('rep2'), 'notifications', 'n1'), { isRead: true }));
      await assertFails(fb.updateDoc(ref(dbAs('rep1'), 'notifications', 'n1'), { message: 'edited' }));
      await assertFails(fb.getDoc(ref(dbAs('rep2'), 'notifications', 'n1')));
    });

    test('unknown collections remain denied', async () => {
      await assertFails(fb.setDoc(ref(dbAs('disp1'), 'secrets', 'x'), { a: 1 }));
      await assertFails(fb.getDoc(ref(dbAs('disp1'), 'secrets', 'x')));
    });

    test('reporters can notify the dispatcher channel when creating an emergency', async () => {
      const db = dbAs('rep1');
      const batch = reportBatch(db, 'rep1', 'notifInc');
      batch.set(ref(db, 'notifications', 'notifInc_reported_dispatchers'), {
        userId: 'dispatchers',
        incidentId: 'notifInc',
        type: 'incident_reported',
        message: 'New Fire incident reported (Critical)',
        isRead: false,
        createdAt: fb.serverTimestamp(),
      });
      await assertSucceeds(batch.commit());

      // Dispatcher can read it, but another reporter cannot
      await assertSucceeds(fb.getDoc(ref(dbAs('disp1'), 'notifications', 'notifInc_reported_dispatchers')));
      await assertFails(fb.getDoc(ref(dbAs('rep2'), 'notifications', 'notifInc_reported_dispatchers')));
    });

    test('responders notify reporter and dispatchers upon En Route and On Scene', async () => {
      const db = dbAs('resp1');
      const batch = progressBatch(db, 'resp1', 'incAssigned', 'En Route');
      batch.set(ref(db, 'notifications', 'incAssigned_enroute_reporter'), {
        userId: 'rep1',
        incidentId: 'incAssigned',
        type: 'status_update',
        message: 'Your responder is en route',
        isRead: false,
        createdAt: fb.serverTimestamp(),
      });
      batch.set(ref(db, 'notifications', 'incAssigned_enroute_dispatchers'), {
        userId: 'dispatchers',
        incidentId: 'incAssigned',
        type: 'status_update',
        message: 'Fire: responder is en route',
        isRead: false,
        createdAt: fb.serverTimestamp(),
      });
      await assertSucceeds(batch.commit());
    });

    test('dispatchers can mark shared notifications read via notificationReads', async () => {
      // Seed a shared notification as admin
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await fb.setDoc(ref(ctx.firestore(), 'notifications', 'disp_notif_1'), {
          userId: 'dispatchers',
          incidentId: 'inc1',
          type: 'incident_reported',
          message: 'New Fire incident reported (Critical)',
          isRead: false,
          createdAt: fb.serverTimestamp(),
        });
      });

      // Dispatcher disp1 marks it read
      await assertSucceeds(
        fb.setDoc(ref(dbAs('disp1'), 'notificationReads', 'disp1_disp_notif_1'), {
          userId: 'disp1',
          notificationId: 'disp_notif_1',
          readAt: fb.serverTimestamp(),
        })
      );

      // Cannot forge read receipt for another dispatcher
      await assertFails(
        fb.setDoc(ref(dbAs('disp1'), 'notificationReads', 'disp2_disp_notif_1'), {
          userId: 'disp2',
          notificationId: 'disp_notif_1',
          readAt: fb.serverTimestamp(),
        })
      );

      // Reporter cannot read or create notificationReads
      await assertFails(
        fb.getDoc(ref(dbAs('rep1'), 'notificationReads', 'disp1_disp_notif_1'))
      );
      await assertFails(
        fb.setDoc(ref(dbAs('rep1'), 'notificationReads', 'rep1_disp_notif_1'), {
          userId: 'rep1',
          notificationId: 'disp_notif_1',
          readAt: fb.serverTimestamp(),
        })
      );
    });
  });

  // ───────────── 5. Incident creation ─────────────
  describe('incident creation', () => {
    test('a valid incident is created together with its initial Reported history entry', async () => {
      await assertSucceeds(reportBatch(dbAs('rep1'), 'rep1', 'newInc').commit());
      let snap;
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        snap = await fb.getDoc(ref(ctx.firestore(), 'statusLogs', 'newInc_reported'));
      });
      expect(snap.exists()).toBe(true);
      expect(snap.data().status).toBe('Reported');
    });

    test('an incident without its initial history entry is rejected', async () => {
      await assertFails(reportBatch(dbAs('rep1'), 'rep1', 'newInc', {}, {}, false).commit());
    });

    test('an incident cannot be created pre-assigned, for someone else, or with bad data', async () => {
      await assertFails(reportBatch(dbAs('rep1'), 'rep1', 'x1', { status: 'Assigned' }).commit());
      await assertFails(reportBatch(dbAs('rep1'), 'rep2', 'x2').commit());
      await assertFails(reportBatch(dbAs('rep1'), 'rep1', 'x3', { severity: 'Apocalyptic' }).commit());
      await assertFails(reportBatch(dbAs('rep1'), 'rep1', 'x4', { description: 'too short' }).commit());
      await assertFails(reportBatch(dbAs('rep1'), 'rep1', 'x5', { responderId: 'resp2' }).commit());
      await assertFails(reportBatch(dbAs('rep1'), 'rep1', 'x6', { photoUrl: 'x'.repeat(500001) }).commit());
    });

    test('dispatchers and responders cannot create incidents', async () => {
      await assertFails(reportBatch(dbAs('disp1'), 'disp1', 'x7').commit());
      await assertFails(reportBatch(dbAs('resp3'), 'resp3', 'x8').commit());
    });

    test('an existing incident cannot be overwritten through the create path', async () => {
      await assertFails(reportBatch(dbAs('rep1'), 'rep1', 'inc1').commit());
    });

    test('optional GPS coordinates are accepted when a valid in-range pair', async () => {
      await assertSucceeds(reportBatch(dbAs('rep1'), 'rep1', 'geo1', { latitude: -26.2041, longitude: 28.0473 }).commit());
    });

    test('invalid, partial or out-of-range coordinates are rejected', async () => {
      await assertFails(reportBatch(dbAs('rep1'), 'rep1', 'geo2', { latitude: -26.2 }).commit());
      await assertFails(reportBatch(dbAs('rep1'), 'rep1', 'geo3', { latitude: 91, longitude: 10 }).commit());
      await assertFails(reportBatch(dbAs('rep1'), 'rep1', 'geo4', { latitude: 10, longitude: -181 }).commit());
      await assertFails(reportBatch(dbAs('rep1'), 'rep1', 'geo5', { latitude: '10', longitude: '20' }).commit());
    });

    test('coordinates cannot be edited after creation by reporter, dispatcher or responder', async () => {
      await assertSucceeds(reportBatch(dbAs('rep1'), 'rep1', 'geo6', { latitude: 1, longitude: 2 }).commit());
      await assertFails(fb.updateDoc(ref(dbAs('rep1'), 'incidents', 'geo6'), { latitude: 5 }));
      await assertFails(fb.updateDoc(ref(dbAs('disp1'), 'incidents', 'geo6'), { latitude: 5, updatedAt: fb.serverTimestamp() }));
      await assertFails(fb.updateDoc(ref(dbAs('resp1'), 'incidents', 'incAssigned'), { latitude: 5, updatedAt: fb.serverTimestamp() }));
    });
  });

  // ───────────── 6 & 7. Lifecycle and concurrent assignment ─────────────
  describe('assignment and lifecycle integrity', () => {
    test('a Dispatcher can assign an available responder to a Reported incident', async () => {
      await assertSucceeds(assignBatch(dbAs('disp1'), 'inc1', 'resp3').commit());
    });

    test('invalid status transitions are rejected for the dispatcher', async () => {
      const db = dbAs('disp1');
      await assertFails(fb.updateDoc(ref(db, 'incidents', 'inc1'), { status: 'Resolved', updatedAt: fb.serverTimestamp() }));
      await assertFails(fb.updateDoc(ref(db, 'incidents', 'inc1'), { status: 'On Scene', updatedAt: fb.serverTimestamp() }));
    });

    test('a repeated or conflicting assignment fails safely', async () => {
      await assertSucceeds(assignBatch(dbAs('disp1'), 'inc1', 'resp3').commit());
      // second dispatcher action, based on stale data, targets another FREE responder:
      // must still fail because the incident is no longer 'Reported'
      await assertFails(assignBatch(dbAs('disp1'), 'inc1', 'resp4').commit());
      // exact duplicate also fails (incident no longer Reported, responder no longer free)
      await assertFails(assignBatch(dbAs('disp1'), 'inc1', 'resp3').commit());
    });

    test('a busy responder cannot receive a second incident', async () => {
      await assertFails(assignBatch(dbAs('disp1'), 'inc3', 'resp1', 'rep2').commit());
    });

    test('a dispatcher cannot mark a responder with an active assignment as available', async () => {
      await assertFails(fb.updateDoc(ref(dbAs('disp1'), 'users', 'resp1'), { isAvailable: true }));
    });

    test('a dispatcher cannot change a user\'s role', async () => {
      await assertFails(fb.updateDoc(ref(dbAs('disp1'), 'users', 'resp3'), { role: 'dispatcher' }));
      await assertFails(fb.updateDoc(ref(dbAs('disp1'), 'users', 'rep1'), { isAvailable: true }));
    });

    test('incidents cannot be deleted by anyone', async () => {
      await assertFails(fb.deleteDoc(ref(dbAs('disp1'), 'incidents', 'inc1')));
      await assertFails(fb.deleteDoc(ref(dbAs('rep1'), 'incidents', 'inc1')));
    });
  });
});
