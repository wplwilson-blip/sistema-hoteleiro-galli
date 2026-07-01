export type SessionContext = {
  user: {
    id: string;
    name: string;
    username: string;
  };
  profile: {
    id: string;
    name: string;
    code: string;
  };
  units: Array<{
    id: string;
    name: string;
    code: string;
  }>;
  activeUnit: {
    id: string;
    name: string;
    code: string;
  };
  // Fase 1 (permissoes): codigos de permissao EFETIVOS do usuario (perfil + overrides), uniao entre
  // unidades. Super admin => ["*"] (sentinela: tudo). Usado para filtrar UI (menu); a validacao real
  // continua server-side (requirePermission). Ver docs/codex/17.
  permissions: string[];
};
