import { NotFoundError } from "@mono/error-handling";

import { userRepository } from "../../repositories";
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

async function getProfile({ actorUserId }: GetProfileInput): Promise<UserProfileResponse> {
    const user = await userRepository.getOne({
        where: { id: actorUserId },
        select: profileSelect,
    });
    if (!user) throw new NotFoundError("User");

    return user;
}

async function updateProfile(input: UpdateProfileInput): Promise<UserProfileResponse> {
    const { actorUserId, ...payload } = input;
    const parsed = updateProfileSchema.parse(payload);

    if (!(await userRepository.exists({ id: actorUserId }))) throw new NotFoundError("User");

    return userRepository.update({
        where: { id: actorUserId },
        data: parsed,
        select: profileSelect,
    });
}

export const userService: UserOperations = {
    getProfile,
    updateProfile,
};
