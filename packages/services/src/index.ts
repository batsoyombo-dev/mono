import { db } from "@mono/database";
import { formatData, formatDate } from "@mono/utils";
import { userRepository } from "./repositories/user.repository";

export const test = async () => {
    console.log(await db.user.count());

    console.log(await userRepository.getOneById(1));

    console.log(formatDate(new Date()));
};
