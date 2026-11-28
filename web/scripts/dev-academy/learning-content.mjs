// v6 learning library: per level ten units with a placeholder explanation video (no Mux asset), online-only
// attached assignments, varied staff states, and per-student access grants and video progress.
// v7 covers a full term: every topic has a lesson and a practice unit (17 per level), published about every six days.
// Watch progress is synthetic activity in the normal progress tables; nobody played a video.
import { COURSES } from "./assessments.mjs";
import { foundations } from "./bank/foundations.mjs";
import { cairoToUtcMs } from "./time.mjs";

const DAY = 86_400_000;
const ACCESS_DAYS = 14;
const EXTRA = ["Mini project", "Exam revision", "Challenge problems"];
// Unit index -> staff state: 0-5 published, 6 published with newer draft edits, then review, draft, archived.
const STATE = ["published", "published", "published", "published", "published", "published", "published_edited", "review", "draft", "archived"];
// v7: the newest unit is a draft, the one before it is in review, one early practice unit was archived and one edited.
const termState = (index, count) => (index === count - 1 ? "draft" : index === count - 2 ? "review" : index === 5 ? "archived" : index === 8 ? "published_edited" : "published");
const round2 = (n) => Math.round(n * 100) / 100;
const iso = (ms) => new Date(ms).toISOString();

export function populateLearningContent(scenario, rand) {
  const term = scenario.config.recipeVersion === "edra-dev-v7";
  const startMs = Date.parse(scenario.config.academicYear.startsAt);
  const refMs = cairoToUtcMs(scenario.config.referenceDate, "00:00");
  const instructors = scenario.staff.filter((s) => s.role === "instructor" && !s.placeholder);
  const placements = new Map(scenario.placements.map((p) => [p.studentId, p]));
  const units = [], assets = [], grants = [], progress = [];

  for (const levelKey of [...new Set(scenario.groups.map((g) => g.levelKey))]) {
    const topics = [...Object.entries(foundations.units), ...Object.entries(COURSES[levelKey].units)].map(([id, title]) => ({ id, title }));
    // The lesson keeps the topic title, so assignments attach to it exactly as in v6.
    const titles = term ? topics.flatMap((t) => [t, { id: `${t.id}-practice`, title: `${t.title}: practice` }]) : topics;
    EXTRA.forEach((title, i) => titles.push({ id: `extra-${i}`, title }));
    const stateOf = (index) => (term ? termState(index, titles.length) : STATE[index]);
    const attach = new Map();
    for (const a of scenario.assignments.filter((x) => x.audience === "level" && x.levelKey === levelKey)) {
      const index = titles.findIndex((t) => t.title === a.unit);
      if (index >= 0 && stateOf(index) !== "draft" && !attach.has(index)) attach.set(index, a);
    }
    titles.forEach(({ title }, index) => {
      const key = `unit:${levelKey}:${index + 1}`;
      const state = stateOf(index);
      const publishedAt = startMs + (term ? 5 + index * 6 : 7 + index * 8) * DAY;
      const asset = { id: rand.uuid(`${key}:video`), key: `${key}:video`, name: `${title} video`, durationSeconds: 420 + Math.floor(rand.unit(`${key}:duration`) * 1080) };
      assets.push({ ...asset, unitKey: key });
      const items = [{ id: rand.uuid(`${key}:explanation`), kind: "explanation", title: `${title} explained`, assetId: asset.id }];
      const assignment = attach.get(index);
      if (assignment) items.push({ id: rand.uuid(`${key}:assignment`), kind: "assessment", title: assignment.title, assessmentKind: "assignment", assessmentId: assignment.id });
      const unit = {
        id: rand.uuid(key), key, levelKey, title, description: `${title} for ${COURSES[levelKey].course}.`, state, accessDays: ACCESS_DAYS,
        createdById: instructors[index % instructors.length].id, createdAt: iso(publishedAt - 6 * DAY), publishedAt: state === "draft" || state === "review" ? null : iso(publishedAt),
        items, assetId: asset.id, durationSeconds: asset.durationSeconds, assignmentId: assignment?.id ?? null,
      };
      units.push(unit);
      if (state !== "published" && state !== "published_edited") return;
      // Units with an attached assignment serve online-only students, whose history holds that assignment.
      const eligible = scenario.students.filter((s) => {
        const p = placements.get(s.id);
        return p.levelKey === levelKey && (!assignment || p.mode === "online-only") && Date.parse(p.enrolledAt) < refMs - 3 * DAY;
      });
      for (const student of eligible) {
        const k = `${student.key}:${key}`;
        const engage = rand.unit(`engage:${student.key}`);
        if (rand.unit(`${k}:access`) > 0.3 + 0.6 * engage) continue; // locked
        const from = Math.max(publishedAt, Date.parse(placements.get(student.id).enrolledAt));
        const draw = rand.unit(`${k}:state`);
        const kind = draw < 0.3 ? "expired" : draw < 0.7 ? "active" : draw < 0.82 ? "extended" : draw < 0.9 ? "revoked" : "late";
        const length = ACCESS_DAYS * DAY;
        // Latest start that still yields the state at the reference date.
        const latest = { expired: refMs - length - DAY, active: refMs - DAY, extended: refMs - length - 2 * DAY, revoked: refMs - 2 * DAY, late: refMs - length - DAY }[kind];
        if (latest <= from) continue;
        const startsAt = from + Math.floor(rand.unit(`${k}:start`) * (latest - from) / 3600_000) * 3600_000;
        const first = { id: rand.uuid(`${k}:grant1`), key: `grant:${k}:1`, studentId: student.id, unitId: unit.id, kind: "staff", startsAt: iso(startsAt), expiresAt: iso(startsAt + length), revokedAt: null };
        grants.push(first);
        if (kind === "extended") grants.push({ id: rand.uuid(`${k}:grant2`), key: `grant:${k}:2`, studentId: student.id, unitId: unit.id, kind: "staff_extension", startsAt: first.expiresAt, expiresAt: iso(startsAt + length + 7 * DAY), revokedAt: null });
        if (kind === "revoked") grants.at(-1).revokedAt = iso(startsAt + 3 * DAY);
        // Activity follows engagement: some never open the video, others stop part way.
        const last = grants.at(-1);
        const end = Math.min(Date.parse(last.revokedAt ?? last.expiresAt), refMs - 3600_000);
        const roll = rand.unit(`${k}:watch`) - 0.35 * (engage - 0.5);
        const share = roll < 0.12 ? 0 : roll < 0.4 ? 0.1 + 0.55 * rand.unit(`${k}:share`) : roll < 0.5 ? 0.82 + 0.07 * rand.unit(`${k}:share`)
          : roll < 0.9 ? 0.9 + 0.1 * rand.unit(`${k}:share`) : 0.05 + 0.2 * rand.unit(`${k}:share`);
        if (share === 0) continue;
        const d = asset.durationSeconds, covered = round2(d * Math.min(share, 0.999));
        // One gap for finished lessons (skipped intro); partial viewers watch a single prefix.
        const gap = share >= 0.9 ? round2(Math.min(d * 0.04, d - covered)) : 0;
        const ranges = gap > 0 ? [[round2(gap), round2(covered + gap)]] : [[0, covered]];
        if (ranges[0][1] > d) ranges[0][1] = d;
        progress.push({ studentId: student.id, unitId: unit.id, assetId: asset.id, ranges, positionSeconds: ranges[0][1],
          updatedAt: iso(Math.max(startsAt, startsAt + Math.floor(rand.unit(`${k}:when`) * (end - startsAt) / 3600_000) * 3600_000)) });
      }
    });
  }
  scenario.library = { units, assets, grants, progress };
}
