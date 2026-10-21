// edra-dev-v2 student model: each student has an independent ability, attendance habit, submission habit and
// trajectory, plus stable individual variation. Pure and keyed like the rest of the builder.

// Mid-year ability range in percent per tier; volatility is the student's week-to-week spread.
const TIERS = {
  top: { range: [92, 97], volatility: 2.5 },
  strong: { range: [78, 87], volatility: 4 },
  middle: { range: [63, 75], volatility: 6 },
  struggling: { range: [44, 57], volatility: 7 },
};
const ATTENDANCE = { reliable: 0.94, usual: 0.83, patchy: 0.64 }; // chance of attending (present or late)
const SUBMISSION = { diligent: 0.97, usual: 0.87, careless: 0.64 }; // chance of handing in an assignment

// One template per student, shuffled per seed, so every seed covers each combination below.
// Habits deliberately cross tiers: top students with patchy attendance, diligent attendees who struggle.
const TEMPLATES = [
  ["top", "reliable", "diligent", "steady"],
  ["top", "patchy", "diligent", "steady"],
  ["top", "usual", "usual", "steady"],
  ["top", "reliable", "diligent", "temporary-dip"],
  ["strong", "reliable", "usual", "steady"],
  ["strong", "patchy", "careless", "steady"],
  ["strong", "usual", "diligent", "improving"],
  ["strong", "reliable", "diligent", "temporary-dip"],
  ["strong", "usual", "usual", "steady"],
  ["middle", "reliable", "diligent", "steady"],
  ["middle", "usual", "usual", "improving"],
  ["middle", "patchy", "usual", "temporary-dip"],
  ["middle", "usual", "careless", "steady"],
  ["middle", "reliable", "usual", "improving"],
  ["middle", "patchy", "careless", "steady"],
  ["struggling", "reliable", "diligent", "improving"],
  ["struggling", "reliable", "diligent", "steady"],
  ["struggling", "patchy", "careless", "steady"],
  ["struggling", "usual", "usual", "improving"],
  ["struggling", "usual", "careless", "temporary-dip"],
];
export const TRAJECTORIES = ["steady", "improving", "temporary-dip"];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(n * 10) / 10;
const halfMarks = (n) => Math.round(n * 2) / 2; // teachers mark in half points

export function profileModel(rand, weeks) {
  const signed = (key) => rand.unit(key) * 2 - 1;
  const profiles = new Map();

  // Two dip weeks in the middle of the history, then a half-recovered week.
  const dipWeight = (key, w) => {
    const start = clamp(Math.floor(weeks * (0.3 + 0.3 * rand.unit(`dip:${key}`))), 0, Math.max(0, weeks - 3));
    if (w === start || w === start + 1) return 1;
    return w === start + 2 ? 0.5 : 0;
  };

  const trajectoryOffset = (key, p, w) => {
    if (p.trajectory === "improving") return (14 + 8 * rand.unit(`gain:${key}`)) * (weeks > 1 ? w / (weeks - 1) - 0.5 : 0);
    if (p.trajectory === "temporary-dip") return -(12 + 8 * rand.unit(`dip-depth:${key}`)) * dipWeight(key, w);
    return 0;
  };

  // Week form is a moving average of keyed draws, so consecutive weeks resemble each other.
  const form = (key, w) => 0.6 * signed(`form:${key}:w${w}`) + 0.4 * signed(`form:${key}:w${w - 1}`);

  return {
    traits(studentKeys) {
      const order = [...studentKeys].sort((a, b) => rand.unit(`profile:${a}`) - rand.unit(`profile:${b}`));
      order.forEach((key, i) => {
        const [tier, attendance, submission, trajectory] = TEMPLATES[i];
        const [lo, hi] = TIERS[tier].range;
        profiles.set(key, {
          tier,
          ability: round1(lo + (hi - lo) * rand.unit(`ability:${key}`)),
          attendance,
          submission,
          trajectory,
          attendRate: ATTENDANCE[attendance] + 0.03 * signed(`attend:${key}`),
          lateShare: 0.03 + 0.09 * rand.unit(`lateness:${key}`),
          submitRate: SUBMISSION[submission] + 0.02 * signed(`submit:${key}`),
        });
      });
      return new Map(studentKeys.map((key) => {
        const { tier, ability, attendance, submission, trajectory } = profiles.get(key);
        return [key, { pattern: trajectory, profile: { tier, ability, attendance, submission } }];
      }));
    },

    attendanceWeights(student, w) {
      const p = profiles.get(student.key);
      const attend = clamp(p.attendRate - (p.trajectory === "temporary-dip" ? 0.2 * dipWeight(student.key, w) : 0), 0, 1);
      const late = attend * p.lateShare;
      const excused = Math.min(0.04, (1 - attend) / 3);
      return [["present", attend - late], ["late", late], ["excused", excused], ["absent", 1 - attend - excused]];
    },

    submitChance(student, w) {
      const p = profiles.get(student.key);
      return p.submitRate - (p.trajectory === "temporary-dip" ? 0.15 * dipWeight(student.key, w) : 0);
    },

    // Exams sit in the group's session, so a student sits the exam exactly when they attended it.
    satExam: (status) => status === "present" || status === "late",

    scoreParts(key, parts, student, w) {
      const p = profiles.get(student.key);
      const { volatility } = TIERS[p.tier];
      const pct = p.ability + trajectoryOffset(student.key, p, w) + volatility * (form(student.key, w) + 0.5 * signed(`${key}:noise`));
      const components = parts.map((part) => {
        const partPct = clamp(pct + 0.4 * volatility * signed(`${key}:${part.key}:noise`), 0, 100);
        return { partId: part.id, score: clamp(halfMarks((part.maxScore * partPct) / 100), 0, part.maxScore) };
      });
      return { components, total: components.reduce((sum, c) => sum + c.score, 0) };
    },
  };
}
