import { prisma, Prisma } from "@mono/database";

import { PaginationRequest, PaginationResponse, serializePagination } from "@mono/utils";

type Tx = Prisma.TransactionClient;

type BaseRepositoryOptions = {
    softDelete?: boolean;
};

export abstract class BaseRepository<T> {
    protected readonly model: any;
    protected readonly clientModelName: Prisma.TypeMap["meta"]["modelProps"];
    protected readonly softDelete: boolean;

    constructor(
        model: T,
        clientModelName: Prisma.TypeMap["meta"]["modelProps"],
        opts?: BaseRepositoryOptions
    ) {
        this.model = model;
        this.clientModelName = clientModelName;
        this.softDelete = opts?.softDelete ?? false;
    }

    protected getModel(transaction?: Tx): any {
        if (transaction) {
            return transaction[this.clientModelName];
        }

        return this.model;
    }

    protected withSoftDelete<W>(where?: W, includeDeleted = false): W {
        if (includeDeleted) return where ?? ({} as W);

        return {
            ...(this.softDelete ? { deletedAt: null } : {}),
            ...(where ?? {}),
        } as W;
    }

    getMany<A extends Prisma.Args<T, "findMany">>(
        args?: A,
        transaction?: Tx
    ): Promise<Prisma.Result<T, A, "findMany">> {
        return this.getModel(transaction).findMany({
            ...(args ?? {}),
            where: this.withSoftDelete(args?.where),
        });
    }

    async safeDeleteById(id: number, transaction?: Tx): Promise<boolean> {
        const result = await this.deleteMany(
            {
                where: { id },
            } as Prisma.Args<T, "deleteMany">,
            transaction
        );

        return result.count > 0;
    }

    updateByIds(ids: number[], data: Prisma.Args<T, "updateMany">["data"], tx?: Tx) {
        return this.updateMany(
            {
                where: {
                    id: { in: ids },
                },
                data,
            } as Prisma.Args<T, "updateMany">,
            tx
        );
    }

    getDeletedMany<A extends Prisma.Args<T, "findMany">>(args?: A, transaction?: Tx) {
        return this.getModel(transaction).findMany({
            ...(args ?? {}),
            where: {
                ...(args?.where ?? {}),
                deletedAt: { not: null },
            },
        });
    }

    async getManyWithPage<A extends Prisma.Args<T, "findMany">>(
        pagination: PaginationRequest,
        args?: A,
        transaction?: Tx
    ): Promise<{
        collection: Prisma.Result<T, A, "findMany">;
        meta: PaginationResponse;
    }> {
        const where = this.withSoftDelete(args?.where);

        const [records, total] = await Promise.all([
            this.getModel(transaction).findMany({
                ...(args ?? {}),
                where,
                skip: pagination.skip,
                take: pagination.pageSize,
            }),
            this.getModel(transaction).count({
                where,
            }),
        ]);

        return serializePagination(pagination, records, total) as {
            collection: Prisma.Result<T, A, "findMany">;
            meta: PaginationResponse;
        };
    }

    getOne<A extends Prisma.Args<T, "findFirst">>(
        args: A,
        transaction?: Tx
    ): Promise<Prisma.Result<T, A, "findFirst">> {
        return this.getModel(transaction).findFirst({
            ...args,
            where: this.withSoftDelete(args.where),
        });
    }

    async getOneThrow<A extends Prisma.Args<T, "findFirst">>(
        args: A,
        transaction?: Tx
    ): Promise<NonNullable<Prisma.Result<T, A, "findFirst">>> {
        const record = await this.getOne(args, transaction);

        if (!record) {
            throw new Error("Өгөгдөл олдсонгүй!");
        }

        return record as NonNullable<Prisma.Result<T, A, "findFirst">>;
    }

    getOneById<
        I extends Prisma.Args<T, "findFirst">["include"],
        S extends Prisma.Args<T, "findFirst">["select"],
    >(
        id: number,
        args?: {
            include?: I;
            select?: S;
        },
        transaction?: Tx
    ): Promise<
        Prisma.Result<
            T,
            {
                where: { id: number };
                include: I;
                select: S;
            },
            "findFirst"
        >
    > {
        return this.getModel(transaction).findFirst({
            where: this.withSoftDelete({ id }),
            include: args?.include,
            select: args?.select,
        });
    }

    async getOneByIdThrow<
        I extends Prisma.Args<T, "findFirst">["include"],
        S extends Prisma.Args<T, "findFirst">["select"],
    >(
        id: number,
        args?: {
            include?: I;
            select?: S;
        },
        transaction?: Tx
    ): Promise<
        NonNullable<
            Prisma.Result<
                T,
                {
                    where: { id: number };
                    include: I;
                    select: S;
                },
                "findFirst"
            >
        >
    > {
        const record = await this.getOneById(id, args, transaction);

        if (!record) {
            throw new Error("Өгөгдөл олдсонгүй!");
        }

        return record as NonNullable<typeof record>;
    }

    create<A extends Prisma.Args<T, "create">>(
        args: A,
        transaction?: Tx
    ): Promise<Prisma.Result<T, A, "create">> {
        return this.getModel(transaction).create(args);
    }

    createMany<A extends Prisma.Args<T, "createMany">>(
        args: A,
        transaction?: Tx
    ): Promise<Prisma.Result<T, A, "createMany">> {
        return this.getModel(transaction).createMany(args);
    }

    update<A extends Prisma.Args<T, "update">>(
        args: A,
        transaction?: Tx
    ): Promise<Prisma.Result<T, A, "update">> {
        return this.getModel(transaction).update(args);
    }

    updateById<D extends Prisma.Args<T, "update">["data"]>(
        id: number,
        data: D,
        transaction?: Tx
    ): Promise<Prisma.Result<T, { where: { id: number }; data: D }, "update">> {
        return this.getModel(transaction).update({
            where: { id },
            data,
        });
    }

    updateMany<A extends Prisma.Args<T, "updateMany">>(
        args: A,
        transaction?: Tx
    ): Promise<Prisma.Result<T, A, "updateMany">> {
        return this.getModel(transaction).updateMany(args);
    }

    delete<A extends Prisma.Args<T, "delete">>(
        args: A,
        transaction?: Tx
    ): Promise<Prisma.Result<T, A, "delete">> {
        if (this.softDelete) {
            return this.getModel(transaction).update({
                where: args.where,
                data: {
                    deletedAt: new Date(),
                },
            });
        }

        return this.getModel(transaction).delete(args);
    }

    deleteById(
        id: number,
        transaction?: Tx
    ): Promise<Prisma.Result<T, { where: { id: number } }, "delete">> {
        if (this.softDelete) {
            return this.getModel(transaction).update({
                where: { id },
                data: {
                    deletedAt: new Date(),
                },
            });
        }

        return this.getModel(transaction).delete({
            where: { id },
        });
    }

    deleteMany<A extends Prisma.Args<T, "deleteMany">>(
        args: A,
        transaction?: Tx
    ): Promise<Prisma.Result<T, A, "deleteMany">> {
        if (this.softDelete) {
            return this.getModel(transaction).updateMany({
                where: args.where,
                data: {
                    deletedAt: new Date(),
                },
            });
        }

        return this.getModel(transaction).deleteMany(args);
    }

    restoreMany<W extends Prisma.Args<T, "updateMany">["where"]>(
        where: W,
        transaction?: Tx
    ): Promise<Prisma.Result<T, { where: W; data: { deletedAt: null } }, "updateMany">> {
        return this.getModel(transaction).updateMany({
            where,
            data: {
                deletedAt: null,
            },
        });
    }

    upsert<A extends Prisma.Args<T, "upsert">>(
        args: A,
        transaction?: Tx
    ): Promise<Prisma.Result<T, A, "upsert">> {
        return this.getModel(transaction).upsert(args);
    }

    aggregate<A extends Prisma.Args<T, "aggregate">>(
        args: A,
        transaction?: Tx
    ): Promise<Prisma.Result<T, A, "aggregate">> {
        return this.getModel(transaction).aggregate(args);
    }

    count<A extends Prisma.Args<T, "count">>(
        args?: A,
        transaction?: Tx
    ): Promise<Prisma.Result<T, A, "count">> {
        return this.getModel(transaction).count({
            ...(args ?? {}),
            where: this.withSoftDelete(args?.where),
        });
    }

    async exists<W extends Prisma.Args<T, "findFirst">["where"]>(
        where: W,
        transaction?: Tx
    ): Promise<boolean> {
        const count = await this.count({ where, take: 1 } as Prisma.Args<T, "count">, transaction);
        return Number(count) > 0;
    }

    createManyAndReturn<A extends Prisma.Args<T, "createManyAndReturn">>(
        args: A,
        transaction?: Tx
    ): Promise<Prisma.Result<T, A, "createManyAndReturn">> {
        return this.getModel(transaction).createManyAndReturn(args);
    }

    upsertById<
        C extends Prisma.Args<T, "upsert">["create"],
        U extends Prisma.Args<T, "upsert">["update"],
    >(id: number, create: C, update: U, transaction?: Tx) {
        return this.upsert(
            {
                where: { id },
                create,
                update,
            } as Prisma.Args<T, "upsert">,
            transaction
        );
    }
}

export function withTransaction<R>(
    prisma: { $transaction: (fn: (tx: Tx) => Promise<R>) => Promise<R> },
    callback: (tx: Tx) => Promise<R>
): Promise<R> {
    return prisma.$transaction(callback);
}
