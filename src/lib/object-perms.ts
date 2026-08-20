/**
 * Tipos e constantes compartilhadas do modelo de permissões por objeto.
 * Este arquivo é seguro para o bundle do cliente (sem acesso a banco).
 */

export const OBJECT_KEYS = ["contas", "contatos", "propostas", "pedidos", "tarefas"] as const;
export type ObjectKey = (typeof OBJECT_KEYS)[number];

export const OBJECT_LABELS: Record<ObjectKey, string> = {
  contas: "Contas (clientes)",
  contatos: "Contatos",
  propostas: "Propostas",
  pedidos: "Pedidos",
  tarefas: "Tarefas",
};

export type ObjectPerm = {
  can_read: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  /** View All Records */
  view_all: boolean;
  /** Modify All Records (implica View All) */
  modify_all: boolean;
  /** View All Fields */
  view_all_fields: boolean;
};

export const BASIC_FLAGS = ["can_read", "can_create", "can_edit", "can_delete"] as const;
export const MANAGER_FLAGS = ["view_all", "modify_all", "view_all_fields"] as const;

export const FLAG_LABELS: Record<keyof ObjectPerm, string> = {
  can_read: "Ler",
  can_create: "Criar",
  can_edit: "Editar",
  can_delete: "Excluir",
  view_all: "View All Records",
  modify_all: "Modify All Records",
  view_all_fields: "View All Fields",
};

export const EMPTY_PERM: ObjectPerm = {
  can_read: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
  view_all: false,
  modify_all: false,
  view_all_fields: false,
};

export const FULL_PERM: ObjectPerm = {
  can_read: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
  view_all: true,
  modify_all: true,
  view_all_fields: true,
};

/** Modify All sempre implica View All. */
export function normalizePerm(p: ObjectPerm): ObjectPerm {
  return p.modify_all ? { ...p, view_all: true } : p;
}

export type ObjectPermMap = Record<ObjectKey, ObjectPerm>;

export function emptyPermMap(): ObjectPermMap {
  return OBJECT_KEYS.reduce((acc, k) => {
    acc[k] = { ...EMPTY_PERM };
    return acc;
  }, {} as ObjectPermMap);
}
