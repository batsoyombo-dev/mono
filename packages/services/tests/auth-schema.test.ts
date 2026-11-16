import { describe, expect, test } from "bun:test";

import { verificationEmailSchema } from "../src/modules/auth/schema";

describe("auth email schemas", () => {
    test("accept a blank name so sign-up still sends the verification email", () => {
        expect(
            verificationEmailSchema.parse({
                email: "ada@example.com",
                name: "   ",
                verificationUrl: "https://example.com/verify",
            })
        ).toMatchObject({ name: "" });
    });
});
