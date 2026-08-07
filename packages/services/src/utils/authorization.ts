/* eslint-disable @typescript-eslint/no-explicit-any */

interface Permission {
    subject: string;
    resource: string;
    action: string;
    type: "direct" | "role";
    role?: string;
}

interface AuthorizationRequest {
    user: string;
    resource: string;
    action: string;
    context?: Record<string, any>;
}

interface AuthorizationResponse extends AuthorizationRequest {
    allowed: boolean;
}

interface PolicyRule {
    subject: string;
    resource: string;
    action: string;
    effect?: "allow" | "deny";
}

interface RolePermissions {
    [resource: string]: string[];
}

interface AuthorizationConfig {
    rolePermissions: { [role: string]: RolePermissions };
    policies?: PolicyRule[];
}

interface UserRole {
    userId: string;
    role: string;
}

interface DatabaseAdapter {
    getUserRoles(userId: string): Promise<string[]>;
    getAllUserRoles(): Promise<UserRole[]>;
    addUserRole(userId: string, role: string): Promise<void>;
    removeUserRole(userId: string, role: string): Promise<void>;
    getAllPolicies(): Promise<PolicyRule[]>;
    getAllRolePermissions(): Promise<{ role: string; resource: string; action: string }[]>;
}

type MatcherFunction = (
    user: string,
    resource: string,
    action: string,
    context: Record<string, any>
) => boolean | undefined;

type PolicyMap = Map<string, Map<string, Map<string, boolean>>>;

export class PolicyBasedAuthorization {
    private policies: PolicyMap = new Map();
    private rolePermissions: PolicyMap = new Map();
    private matchers: Map<string, MatcherFunction> = new Map();
    private dbAdapter?: DatabaseAdapter;
    private databaseLoad: Promise<void>;

    constructor(config: AuthorizationConfig, dbAdapter?: DatabaseAdapter) {
        this.dbAdapter = dbAdapter;
        this.importPolicies(config);
        this.databaseLoad = this.loadFromDatabase();
    }

    async loadFromDatabase(): Promise<void> {
        if (!this.dbAdapter) return;

        const dbPolicies = await this.dbAdapter.getAllPolicies();
        for (const { subject, resource, action, effect } of dbPolicies) {
            this.addPolicy(subject, resource, action, effect);
        }

        const dbRolePerms = await this.dbAdapter.getAllRolePermissions();
        for (const { role, resource, action } of dbRolePerms) {
            this.addRolePermission(role, resource, action);
        }
    }

    setDatabaseAdapter(dbAdapter: DatabaseAdapter): void {
        this.dbAdapter = dbAdapter;
        this.databaseLoad = this.loadFromDatabase();
    }

    addPolicy(
        subject: string,
        resource: string,
        action: string,
        effect: "allow" | "deny" = "allow"
    ): void {
        if (!this.policies.has(subject)) {
            this.policies.set(subject, new Map());
        }

        const subjectPolicies = this.policies.get(subject)!;
        if (!subjectPolicies.has(resource)) {
            subjectPolicies.set(resource, new Map());
        }

        subjectPolicies.get(resource)!.set(action, effect === "allow");
    }

    removePolicy(subject: string, resource: string, action: string): boolean {
        const subjectPolicies = this.policies.get(subject);
        if (!subjectPolicies) return false;

        const resourcePolicies = subjectPolicies.get(resource);
        if (!resourcePolicies) return false;

        return resourcePolicies.delete(action);
    }

    addRolePermission(
        role: string,
        resource: string,
        action: string,
        effect: "allow" | "deny" = "allow"
    ): void {
        if (!this.rolePermissions.has(role)) {
            this.rolePermissions.set(role, new Map());
        }

        const rolePolicies = this.rolePermissions.get(role)!;
        if (!rolePolicies.has(resource)) {
            rolePolicies.set(resource, new Map());
        }

        rolePolicies.get(resource)!.set(action, effect === "allow");
    }

    removeRolePermission(role: string, resource: string, action: string): boolean {
        const rolePolicies = this.rolePermissions.get(role);
        if (!rolePolicies) return false;

        const resourcePolicies = rolePolicies.get(resource);
        if (!resourcePolicies) return false;

        return resourcePolicies.delete(action);
    }

    async addRoleForUser(userId: string, role: string): Promise<void> {
        if (!this.dbAdapter) {
            throw new Error("Database adapter not configured");
        }
        await this.dbAdapter.addUserRole(userId, role);
    }

    async removeRoleForUser(userId: string, role: string): Promise<void> {
        if (!this.dbAdapter) {
            throw new Error("Database adapter not configured");
        }
        await this.dbAdapter.removeUserRole(userId, role);
    }

    async getRolesForUser(userId: string): Promise<string[]> {
        if (!this.dbAdapter) {
            throw new Error("Database adapter not configured");
        }
        return await this.dbAdapter.getUserRoles(userId);
    }

    async getUsersForRole(role: string): Promise<string[]> {
        if (!this.dbAdapter) {
            throw new Error("Database adapter not configured");
        }

        const allUserRoles = await this.dbAdapter.getAllUserRoles();
        return allUserRoles.filter((ur) => ur.role === role).map((ur) => ur.userId);
    }

    addMatcher(name: string, matcherFn: MatcherFunction): void {
        this.matchers.set(name, matcherFn);
    }

    removeMatcher(name: string): boolean {
        return this.matchers.delete(name);
    }

    async enforce(
        user: string,
        resource: string,
        action: string,
        context: Record<string, any> = {}
    ): Promise<boolean> {
        await this.databaseLoad;

        if (this.policies.has(user)) {
            const userPolicies = this.policies.get(user)!;
            if (userPolicies.has(resource)) {
                const resourcePolicies = userPolicies.get(resource)!;
                if (resourcePolicies.has(action)) {
                    return resourcePolicies.get(action)!;
                }
            }
        }

        if (this.dbAdapter) {
            const userRoles = await this.dbAdapter.getUserRoles(user);

            for (const role of userRoles) {
                if (this.rolePermissions.has(role)) {
                    const rolePolicies = this.rolePermissions.get(role)!;
                    if (rolePolicies.has(resource)) {
                        const resourcePolicies = rolePolicies.get(resource)!;
                        if (resourcePolicies.has(action)) {
                            return resourcePolicies.get(action)!;
                        }
                    }
                }
            }
        }

        for (const matcher of this.matchers.values()) {
            const result = matcher(user, resource, action, context);
            if (result !== undefined) {
                return result;
            }
        }

        return false;
    }

    async enforceMultiple(requests: AuthorizationRequest[]): Promise<AuthorizationResponse[]> {
        const responses: AuthorizationResponse[] = [];

        for (const req of requests) {
            const allowed = await this.enforce(
                req.user,
                req.resource,
                req.action,
                req.context || {}
            );
            responses.push({ ...req, allowed });
        }

        return responses;
    }

    async getAllPermissions(user: string): Promise<Permission[]> {
        await this.databaseLoad;

        const permissions: Permission[] = [];

        if (this.policies.has(user)) {
            const userPolicies = this.policies.get(user)!;
            for (const [resource, actions] of userPolicies) {
                for (const [action, allowed] of actions) {
                    if (allowed) {
                        permissions.push({ subject: user, resource, action, type: "direct" });
                    }
                }
            }
        }

        if (this.dbAdapter) {
            const userRoles = await this.dbAdapter.getUserRoles(user);

            for (const role of userRoles) {
                if (this.rolePermissions.has(role)) {
                    const rolePolicies = this.rolePermissions.get(role)!;
                    for (const [resource, actions] of rolePolicies) {
                        for (const [action, allowed] of actions) {
                            if (allowed) {
                                permissions.push({
                                    subject: user,
                                    resource,
                                    action,
                                    type: "role",
                                    role,
                                });
                            }
                        }
                    }
                }
            }
        }

        return permissions;
    }

    getAllRoles(): string[] {
        return Array.from(this.rolePermissions.keys());
    }

    getAllResources(): string[] {
        const resources = new Set<string>();

        for (const userPolicies of this.policies.values()) {
            for (const resource of userPolicies.keys()) {
                resources.add(resource);
            }
        }

        for (const rolePolicies of this.rolePermissions.values()) {
            for (const resource of rolePolicies.keys()) {
                resources.add(resource);
            }
        }

        return Array.from(resources);
    }

    getAllActions(): string[] {
        const actions = new Set<string>();

        for (const userPolicies of this.policies.values()) {
            for (const resourcePolicies of userPolicies.values()) {
                for (const action of resourcePolicies.keys()) {
                    actions.add(action);
                }
            }
        }

        for (const rolePolicies of this.rolePermissions.values()) {
            for (const resourcePolicies of rolePolicies.values()) {
                for (const action of resourcePolicies.keys()) {
                    actions.add(action);
                }
            }
        }

        return Array.from(actions);
    }

    private importPolicies(config: AuthorizationConfig): void {
        if (config.rolePermissions) {
            for (const [role, resources] of Object.entries(config.rolePermissions)) {
                for (const [resource, actions] of Object.entries(resources)) {
                    for (const action of actions) {
                        this.addRolePermission(role, resource, action);
                    }
                }
            }
        }

        if (config.policies) {
            for (const policy of config.policies) {
                this.addPolicy(policy.subject, policy.resource, policy.action, policy.effect);
            }
        }
    }
}

export type { AuthorizationConfig, DatabaseAdapter, UserRole };
