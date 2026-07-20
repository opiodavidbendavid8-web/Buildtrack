const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
// Auth onCreate triggers only exist in the v1 API; v2 identity only has blocking triggers.
const functionsV1 = require("firebase-functions/v1");

admin.initializeApp();

const db = admin.firestore();
const VALID_ROLES = new Set(["foreman", "engineer", "superior", "client"]);
const VALID_SITES = new Set(["all", "ndeeba", "kyengera", "kabuusu", "mpigi"]);

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  return request.auth.uid;
}

async function getProfile(uid) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function requireSuperior(request) {
  const uid = requireAuth(request);
  const profile = await getProfile(uid);
  if (!profile || profile.status === "disabled" || profile.role !== "superior") {
    throw new HttpsError("permission-denied", "Only a superior can perform this action.");
  }
  return profile;
}

function asString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function assertRole(role) {
  if (!VALID_ROLES.has(role)) {
    throw new HttpsError("invalid-argument", "Invalid role.");
  }
}

function assertSite(site) {
  if (!VALID_SITES.has(site)) {
    throw new HttpsError("invalid-argument", "Invalid site.");
  }
}

exports.createDefaultProfile = functionsV1.auth.user().onCreate(async (user) => {
  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();
  if (snap.exists) return;

  await ref.set({
    name: user.displayName || user.email || "New User",
    email: user.email || "",
    role: "client",
    site: "all",
    status: "pending",
    createdAt: new Date().toISOString(),
    source: "auth-trigger"
  });
});

exports.createManagedUser = onCall(async (request) => {
  await requireSuperior(request);

  const name = asString(request.data.name);
  const email = asString(request.data.email).toLowerCase();
  const password = asString(request.data.password);
  const role = asString(request.data.role, "foreman");
  const site = asString(request.data.site, "all");

  if (!name || !email || password.length < 6) {
    throw new HttpsError("invalid-argument", "Name, email, and a 6+ character password are required.");
  }
  assertRole(role);
  assertSite(site);

  const user = await admin.auth().createUser({
    email,
    password,
    displayName: name,
    emailVerified: false,
    disabled: false
  });

  await db.collection("users").doc(user.uid).set({
    name,
    email,
    role,
    site,
    status: "active",
    createdAt: new Date().toISOString(),
    source: "superior"
  });

  return { uid: user.uid };
});

exports.updateUserProfile = onCall(async (request) => {
  await requireSuperior(request);

  const uid = asString(request.data.uid);
  const role = asString(request.data.role);
  const site = asString(request.data.site, "all");
  const status = asString(request.data.status, "active");
  const name = asString(request.data.name);

  if (!uid) throw new HttpsError("invalid-argument", "User UID is required.");
  assertRole(role);
  assertSite(site);
  if (!["active", "pending", "disabled"].includes(status)) {
    throw new HttpsError("invalid-argument", "Invalid status.");
  }

  const update = {
    role,
    site,
    status,
    updatedAt: new Date().toISOString()
  };
  if (name) update.name = name;

  await db.collection("users").doc(uid).set(update, { merge: true });
  await admin.auth().updateUser(uid, { disabled: status === "disabled" });
  return { ok: true };
});

exports.buildWeeklyReportData = onCall(async (request) => {
  const uid = requireAuth(request);
  const profile = await getProfile(uid);
  if (!profile || profile.status === "disabled") {
    throw new HttpsError("permission-denied", "Profile not active.");
  }

  const siteId = asString(request.data.siteId, profile.site || "all");
  const from = asString(request.data.from);
  const to = asString(request.data.to);
  if (!siteId || siteId === "all") throw new HttpsError("invalid-argument", "Choose one site.");
  if (profile.role === "foreman" && profile.site !== "all" && profile.site !== siteId) {
    throw new HttpsError("permission-denied", "You cannot report on this site.");
  }

  const siteSnap = await db.collection("sites").doc(siteId).get();
  if (!siteSnap.exists) throw new HttpsError("not-found", "Site not found.");
  const site = siteSnap.data();
  const logs = (site.logs || []).filter((log) => {
    if (!log.date) return false;
    return (!from || log.date >= from) && (!to || log.date <= to);
  });
  const works = site.works || [];

  return {
    siteId,
    project: site.project || {},
    period: { from, to },
    completed: works.filter((w) => w.status === "done" || w.pct === 100),
    ongoing: works.filter((w) => w.status === "inprogress" || (w.pct > 0 && w.pct < 100 && w.status !== "done")),
    nextTasks: suggestNextTasks(works, logs),
    risks: logs.flatMap((log) => log.problems ? [{ date: log.date, text: log.problems }] : []),
    observations: logs.flatMap((log) => log.instructions ? [{ date: log.date, text: log.instructions }] : []),
    equipment: site.equipment || [],
    logs
  };
});

function suggestNextTasks(works, logs) {
  const tasks = [];
  works
    .filter((w) => w.status === "inprogress" || (w.pct > 0 && w.pct < 100 && w.status !== "done"))
    .sort((a, b) => (b.pct || 0) - (a.pct || 0))
    .slice(0, 6)
    .forEach((w) => tasks.push({
      description: `Continue ${w.name}`,
      status: `In progress at ${w.pct || 0}%`
    }));

  works
    .filter((w) => (!w.status || w.status === "notstarted") && (!w.pct || w.pct === 0))
    .slice(0, 4)
    .forEach((w) => tasks.push({
      description: `Prepare to start ${w.name}`,
      status: "To be completed"
    }));

  const latestPlan = logs.find((log) => log.tomorrow);
  if (latestPlan) {
    tasks.unshift({ description: latestPlan.tomorrow, status: "Supervisor plan" });
  }

  return tasks;
}
