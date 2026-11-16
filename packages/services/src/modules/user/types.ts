import type { z } from "zod";

import type { updateProfileSchema } from "./schema";

export type UpdateProfilePayload = z.infer<typeof updateProfileSchema>;

export type GetProfileInput = {
    actorUserId: number;
};

export type UpdateProfileInput = UpdateProfilePayload & {
    actorUserId: number;
};

export type UserProfileResponse = {
    id: number;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    createdAt: Date;
};

export type UserOperations = {
    getProfile(input: GetProfileInput): Promise<UserProfileResponse>;
    updateProfile(input: UpdateProfileInput): Promise<UserProfileResponse>;
};
