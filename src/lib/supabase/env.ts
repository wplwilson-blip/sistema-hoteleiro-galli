const missingEnvMessage = (name: string) => `Variavel de ambiente obrigatoria ausente: ${name}.`;

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(missingEnvMessage(name));
  }

  return value;
}

export function getPublicSupabaseEnv() {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  };
}

export function getAdminSupabaseEnv() {
  return {
    ...getPublicSupabaseEnv(),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  };
}

export function getSupabaseProjectRef() {
  const { url } = getPublicSupabaseEnv();
  const host = new URL(url).hostname;
  return host.split(".")[0];
}
