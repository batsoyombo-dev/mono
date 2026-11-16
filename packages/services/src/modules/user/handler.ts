import { userRepository } from "../../repositories";
import { createUserService } from "./service";
import type { UserOperations } from "./types";

export const userService: UserOperations = createUserService({ users: userRepository });
