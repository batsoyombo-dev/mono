import { NotFoundError } from "@mono/error-handling";

import type { UserRepository } from "../../repositories/user.repository";
import { updateProfileSchema } from "./schema";
import type {
    GetProfileInput,
    UpdateProfileInput,
    UserOperations,
    UserProfileResponse,
} from "./types";

const profileSelect = {
    id: true,
    name: true,
    email: true,
    emailVerified: true,
    image: true,
    createdAt: true,
} as const;

export type UserServiceDeps = {
    users: Pick<UserRepository, "getOne" | "exists" | "update">;
};

export function createUserService({ users }: UserServiceDeps): UserOperations {
    async function getProfile({ actorUserId }: GetProfileInput): Promise<UserProfileResponse> {
        const user = await users.getOne({
            where: { id: actorUserId },
            select: profileSelect,
        });
        if (!user) throw new NotFoundError("User");

        return user;
    }

    async function updateProfile(input: UpdateProfileInput): Promise<UserProfileResponse> {
        const { actorUserId, ...payload } = input;
        const parsed = updateProfileSchema.parse(payload);

        if (!(await users.exists({ id: actorUserId }))) throw new NotFoundError("User");

        return users.update({
            where: { id: actorUserId },
            data: parsed,
            select: profileSelect,
        });
    }

    return { getProfile, updateProfile };
}
