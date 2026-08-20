/**
 * Canonical actions understood by the RBAC engine.
 *
 * Actions are lowercase, colon-delimited strings: `<domain>:<verb>`. The
 * permission matrix maps each role to the set of actions it may perform.
 *
 * Action name is a stable API contract — rename carefully.
 */
export const ACTIONS = {
  // Dashboard
  DASHBOARD_READ: "dashboard:read",

  // Tenant (self-service, within the tenant boundary)
  TENANT_READ: "tenant:read",
  TENANT_UPDATE: "tenant:update",

  // Tenant (platform-level — MASTER only)
  TENANT_CHANGE_STATUS: "tenant:change-status",

  // Users
  USERS_READ: "users:read",
  USERS_CREATE: "users:create",
  USERS_UPDATE: "users:update",
  USERS_DELETE: "users:delete",

  // Properties
  PROPERTIES_READ: "properties:read",
  PROPERTIES_CREATE: "properties:create",
  PROPERTIES_UPDATE: "properties:update",
  PROPERTIES_DELETE: "properties:delete",
  PROPERTIES_EXPORT: "properties:export",

  // Leads
  LEADS_READ: "leads:read",
  LEADS_CREATE: "leads:create",
  LEADS_UPDATE: "leads:update",
  LEADS_DELETE: "leads:delete",
  LEADS_ASSIGN: "leads:assign",
  LEADS_EXPORT: "leads:export",
  LEADS_ROUTE: "leads:route",

  // Governance & platform
  AUDIT_READ: "audit:read",
  INTEGRATIONS_MANAGE: "integrations:manage",
  SETTINGS_MANAGE: "settings:manage",

  // Billing & platform administration (Phase 5) — MASTER only
  BILLING_ADMIN: "billing:admin",

  // Billing self-service (Phase 5) — tenant billing + highlight add-on
  BILLING_SELF: "billing:self",
} as const;

export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

/** Every action every role can enumerate (used by UIs to render feature flags). */
export const ALL_ACTIONS: readonly Action[] = Object.values(ACTIONS);