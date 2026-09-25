import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the auth audit.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function maskEmail(email) {
  if (!email) return null;
  const [name, domain] = email.split("@");
  return `${name?.slice(0, 2) ?? ""}***@${domain ?? "unknown"}`;
}

const users = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 1000) break;
}

const needsMigration = users.flatMap((user) => {
  const reasons = [];
  if (!user.phone) reasons.push("missing_phone");
  else if (!user.phone_confirmed_at) reasons.push("unconfirmed_phone");

  const providers = user.app_metadata?.providers ?? [];
  if (providers.some((provider) => provider !== "phone")) reasons.push("email_or_oauth_identity");
  if (reasons.length === 0) return [];

  return [{
    id: user.id,
    email: maskEmail(user.email),
    hasPhone: Boolean(user.phone),
    providers,
    reasons,
  }];
});

console.log(JSON.stringify({
  totalUsers: users.length,
  phoneReadyUsers: users.length - needsMigration.length,
  usersNeedingMigration: needsMigration.length,
  migrationReport: needsMigration,
}, null, 2));

if (needsMigration.length > 0) process.exitCode = 2;
