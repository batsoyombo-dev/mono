/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Prisma } from "@mono/database";
import {
    prisma,
    type ActionEvent,
    type Notification,
    type NotificationRecipient,
    type User,
} from "@mono/database";
import { PaginationRequest } from "@mono/utils";

import { PlainTextEmailOptions, TemplateEmailOptions } from "../mail/types";

import { mailClient } from "../mail";

import { notificationRecipientRepository } from "../../repositories";
import type {
    ActionEventData,
    DeliveryMethodType,
    DeliveryResult,
    NotificationPriority,
    NotificationRecipientData,
    NotificationRecipientFilter,
    NotificationTemplate,
    TemplateRenderContext,
} from "./types";

interface NotificationDelivery<TDeliveryMethod extends DeliveryMethodType = DeliveryMethodType> {
    send(
        notification: Notification,
        recipient: NotificationRecipient,
        user: User
    ): Promise<DeliveryResult>;
    getType(): TDeliveryMethod;
    validate?(
        notification: Notification,
        recipient: NotificationRecipient,
        user: User
    ): Promise<boolean>;
}

class EmailDelivery implements NotificationDelivery<"email"> {
    getType(): "email" {
        return "email";
    }

    async validate(
        _notification: Notification,
        _recipient: NotificationRecipient,
        user: User
    ): Promise<boolean> {
        if (!user.email) return false;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!user.email || !emailRegex.test(user.email)) {
            return false;
        }

        return true;
    }

    async send(
        notification: Prisma.NotificationGetPayload<{ include: { actionEvent: true } }>,
        recipient: NotificationRecipient,
        user: User
    ): Promise<DeliveryResult> {
        try {
            const isValid = await this.validate(notification, recipient, user);
            if (!isValid) {
                return {
                    success: false,
                    deliveryMethod: "email",
                    errorMessage: "Invalid email or user opted out",
                };
            }

            if (!notification.template) {
                throw new Error("Email delivery requires a template");
            }

            const template = NotificationTemplateRegistry.getTemplate(notification.template);

            const renderContext: TemplateRenderContext = {
                payload: (notification.payload || {}) as Record<string, any>,

                recipientData: recipient.recipientData as Record<string, any>,
                actionEvent: notification.actionEvent,
                recipient,
                user,
            };

            const mailData: TemplateEmailOptions | PlainTextEmailOptions = {
                to: user.email ?? "-",
                subject: template.getSubject(renderContext),
                ...(template.getEmailTemplate
                    ? {
                          template: template.getEmailTemplate(renderContext),
                          data: template.getEmailParams?.(renderContext) || {},
                      }
                    : {
                          text: template.getContent?.(renderContext) ?? "",
                      }),
            };

            if ((mailData as PlainTextEmailOptions).text)
                await mailClient.sendPlainText(mailData as PlainTextEmailOptions);

            if ((mailData as TemplateEmailOptions).template)
                await mailClient.sendTemplate(mailData as TemplateEmailOptions);

            return {
                success: true,
                deliveryMethod: "email",
                deliveryId: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            };
        } catch (error) {
            return {
                success: false,
                deliveryMethod: "email",
                errorMessage:
                    error instanceof Error ? error.message : "Unknown email delivery error",
            };
        }
    }
}

class InAppDelivery implements NotificationDelivery<"in_app"> {
    getType(): "in_app" {
        return "in_app";
    }

    async validate(
        _notification: Notification,
        _recipient: NotificationRecipient,
        _user: User
    ): Promise<boolean> {
        return true;
    }

    async send(
        notification: Notification,
        recipient: NotificationRecipient,
        user: User
    ): Promise<DeliveryResult> {
        try {
            const isValid = await this.validate(notification, recipient, user);
            if (!isValid) {
                return {
                    success: false,
                    deliveryMethod: "in_app",
                    errorMessage: "User has disabled in-app notifications",
                };
            }

            return {
                success: true,
                deliveryMethod: "in_app",
                deliveryId: `in_app_${notification.id}_${recipient.id}`,
            };
        } catch (error) {
            return {
                success: false,
                deliveryMethod: "in_app",
                errorMessage:
                    error instanceof Error ? error.message : "Unknown in-app delivery error",
            };
        }
    }
}

export class NotificationTemplateRegistry {
    private static templates: Map<string, NotificationTemplate<any, any>> = new Map();

    static register<TPayload = Record<string, any>, TRecipientData = Record<string, any>>(
        name: string,
        template: NotificationTemplate<TPayload, TRecipientData>
    ): void {
        NotificationTemplateRegistry.templates.set(name, template);
    }

    static getTemplate<TPayload = Record<string, any>, TRecipientData = Record<string, any>>(
        name: string
    ): NotificationTemplate<TPayload, TRecipientData> {
        const template = NotificationTemplateRegistry.templates.get(name);
        if (!template) {
            throw new Error(`Template '${name}' not found`);
        }
        return template as NotificationTemplate<TPayload, TRecipientData>;
    }

    static hasTemplate(name: string): boolean {
        return NotificationTemplateRegistry.templates.has(name);
    }

    static getAllTemplateNames(): string[] {
        return Array.from(NotificationTemplateRegistry.templates.keys());
    }
}

export class EventNotificationClient {
    private deliveryMethods: Map<DeliveryMethodType, NotificationDelivery<any>> = new Map();

    constructor() {
        this.addDeliveryMethod(new EmailDelivery());
        this.addDeliveryMethod(new InAppDelivery());
    }

    addDeliveryMethod<T extends DeliveryMethodType>(delivery: NotificationDelivery<T>): void {
        this.deliveryMethods.set(delivery.getType(), delivery);
    }

    getDeliveryMethod<T extends DeliveryMethodType>(type: T): NotificationDelivery<T> | undefined {
        return this.deliveryMethods.get(type) as NotificationDelivery<T> | undefined;
    }

    async createActionEvent(
        eventData: ActionEventData,
        notificationConfigs?: Array<{
            template: string;
            deliveryMethods?: DeliveryMethodType[];
            priority?: NotificationPriority;

            payload?: Record<string, any>;
            scheduledFor?: Date;
            expiresAt?: Date;
        }>
    ): Promise<{
        actionEvent: ActionEvent;
        notifications: (Notification | null)[];
    }> {
        const actor = await prisma.user.findUnique({
            where: { id: eventData.actorId },
        });

        if (!actor) throw new Error(`Actor with id ${eventData.actorId} not found`);

        const actionEvent = (await prisma.actionEvent.create({
            data: {
                actorId: eventData.actorId,
                entityId: eventData.entityId,
                verb: eventData.verb,
                entityType: eventData.entityType,
                context: (eventData.context || null) as Prisma.NullableJsonNullValueInput,
                entitySnapshot: (eventData.entitySnapshot ||
                    null) as Prisma.NullableJsonNullValueInput,
                externalKey: eventData.externalKey || null,
            },
            include: {
                actor: true,
            },
        })) as ActionEvent;

        const autoNotifications = await this.getAutoNotificationsForEvent(actionEvent);

        const allNotificationConfigs = [...autoNotifications, ...(notificationConfigs || [])];

        const notifications: (Notification | null)[] = [];

        for (const config of allNotificationConfigs) {
            try {
                const notification = await this.createNotificationFromEvent(actionEvent, config);
                notifications.push(notification);
            } catch (error) {
                console.error("Failed to create notification:", error);
                notifications.push(null);
            }
        }

        return {
            actionEvent,
            notifications: notifications.filter((n) => n !== null),
        };
    }

    private async createNotificationFromEvent(
        actionEvent: ActionEvent,
        config: {
            template: string;
            deliveryMethods?: DeliveryMethodType[];
            priority?: NotificationPriority;

            payload?: Record<string, any>;
            recipients?: NotificationRecipientData[];
            scheduledFor?: Date;
            expiresAt?: Date;
        }
    ): Promise<Notification | null> {
        if (!NotificationTemplateRegistry.hasTemplate(config.template)) {
            throw new Error(`Template '${config.template}' not found`);
        }

        const template = NotificationTemplateRegistry.getTemplate(config.template);

        let recipients = config.recipients;

        if (!recipients && template.getRecipients) {
            recipients = await template.getRecipients(actionEvent);
        }

        if (!recipients || recipients.length === 0) {
            console.warn(`No recipients specified for notification template '${config.template}'`);
            return null;
        }

        const userIds = recipients.map((r) => r.userId);
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
        });

        if (users.length !== userIds.length) {
            const missingIds = userIds.filter((id) => !users.find((u) => u.id === id));
            throw new Error(`Users with ids ${missingIds.join(", ")} not found`);
        }

        if (template.shouldNotify) {
            recipients = recipients.filter((recipient) => {
                const user = users.find((u) => u.id === recipient.userId);

                return user && template.shouldNotify!(actionEvent, user);
            });
        }

        if (recipients.length === 0) {
            return null;
        }

        const validDeliveryMethods = (config.deliveryMethods || ["in_app"]).filter((method) => {
            if (!this.deliveryMethods.has(method)) {
                console.warn(`Delivery method '${method}' not registered`);
                return false;
            }
            return true;
        });

        if (validDeliveryMethods.length === 0) {
            throw new Error("No valid delivery methods specified");
        }

        const dedupeKey = `${config.template}_${actionEvent.id}_${recipients
            .map((r) => r.userId)
            .sort()
            .join("_")}`;

        const existing = await prisma.notification.findUnique({
            where: { dedupeKey },
            include: {
                recipients: { include: { user: true } },
                actionEvent: { include: { actor: true } },
            },
        });

        if (existing) {
            return existing as Notification;
        }

        const notification = (await prisma.notification.create({
            data: {
                actionEventId: actionEvent.id,
                template: config.template,
                payload: config.payload || {},
                deliveryMethods: validDeliveryMethods,
                priority: config.priority || "MEDIUM",
                status: config.scheduledFor ? "SCHEDULED" : "PENDING",
                scheduledFor: config.scheduledFor || null,
                expiresAt: config.expiresAt || null,
                dedupeKey,
                recipients: {
                    create: recipients.map((recipient) => ({
                        user: {
                            connect: {
                                id: recipient.userId,
                            },
                        },
                        recipientData: (recipient.recipientData ||
                            null) as Prisma.NullableJsonNullValueInput,
                    })),
                },
            },
            include: {
                recipients: {
                    include: { user: true },
                },
                actionEvent: {
                    include: { actor: true },
                },
            },
        })) as Notification;

        if (!config.scheduledFor) {
            this.processNotificationDelivery(notification.id).catch((error) => {
                console.error(`Failed to process notification ${notification.id}:`, error);
            });
        }

        return notification;
    }

    async processNotificationDelivery(notificationId: number): Promise<void> {
        const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
            include: {
                recipients: {
                    include: { user: true },
                },
                actionEvent: {
                    include: { actor: true },
                },
            },
        });

        if (!notification || notification.status !== "PENDING") {
            return;
        }

        await prisma.notification.update({
            where: { id: notificationId },
            data: { status: "PROCESSING" },
        });

        const deliveryPromises = [];

        for (const recipient of notification.recipients) {
            for (const methodName of notification.deliveryMethods) {
                const delivery = this.deliveryMethods.get(methodName as DeliveryMethodType);
                if (delivery) {
                    deliveryPromises.push(
                        this.deliverToRecipient(notification, recipient, delivery)
                    );
                }
            }
        }

        await Promise.all(deliveryPromises);

        const deliveryResults = await prisma.deliveryResult.findMany({
            where: { notificationId: notification.id },
        });

        const allFailed = deliveryResults.every((r) => !r.success);
        const anySuccess = deliveryResults.some((r) => r.success);
        const finalStatus = allFailed ? "FAILED" : anySuccess ? "DELIVERED" : "SENT";

        await prisma.notification.update({
            where: { id: notificationId },
            data: { status: finalStatus },
        });
    }

    private async deliverToRecipient(
        notification: Notification,
        recipient: Prisma.NotificationRecipientGetPayload<{ include: { user: true } }>,
        delivery: NotificationDelivery
    ): Promise<void> {
        try {
            const result = await delivery.send(notification, recipient, recipient.user);

            await prisma.deliveryResult.create({
                data: {
                    notificationId: notification.id,
                    recipientId: recipient.id,
                    deliveryMethod: result.deliveryMethod,
                    success: result.success,
                    deliveryId: result.deliveryId,
                    errorMessage: result.errorMessage,
                    retryCount: result.retryCount || 0,
                },
            });
        } catch (error) {
            await prisma.deliveryResult.create({
                data: {
                    notificationId: notification.id,
                    recipientId: recipient.id,
                    deliveryMethod: delivery.getType(),
                    success: false,
                    errorMessage: error instanceof Error ? error.message : "Unknown error",
                    retryCount: 0,
                },
            });
        }
    }

    private async getAutoNotificationsForEvent(_actionEvent: any): Promise<any[]> {
        return [];
    }

    async getUserNotificationsWithPage(
        pagination: PaginationRequest,
        filters: NotificationRecipientFilter
    ) {
        const { collection, meta } = await notificationRecipientRepository.getManyWithPage(
            pagination,
            {
                where: filters,
                include: {
                    notification: {
                        include: {
                            actionEvent: {
                                include: { actor: true },
                            },
                        },
                    },
                    user: true,
                },
                orderBy: {
                    createdAt: "desc",
                },
            }
        );

        const unreadCount =
            (await notificationRecipientRepository.count({
                where: {
                    ...filters,
                    readAt: null,
                },
            })) || 0;

        const notifications = await Promise.all(
            collection.map(async (recipient) => {
                const notification = recipient.notification;
                let renderedContent = null;

                if (
                    notification.template &&
                    NotificationTemplateRegistry.hasTemplate(notification.template)
                ) {
                    const template = NotificationTemplateRegistry.getTemplate(
                        notification.template
                    );
                    renderedContent = {
                        subject: template.getSubject({
                            payload: notification.payload as Record<string, any>,

                            recipientData: recipient.recipientData as Record<string, any>,
                            actionEvent: notification.actionEvent,
                            recipient,
                            user: recipient.user,
                        }),
                        content: template.getContent?.({
                            payload: notification.payload as Record<string, any>,

                            recipientData: recipient.recipientData as Record<string, any>,
                            actionEvent: notification.actionEvent,
                            recipient,
                            user: recipient.user,
                        }),
                    };
                }

                return {
                    id: recipient.id,
                    notificationId: notification.id,
                    actionEvent: notification.actionEvent,
                    template: notification.template,
                    payload: notification.payload,
                    priority: notification.priority,
                    readAt: recipient.readAt,
                    createdAt: recipient.createdAt,
                    renderedContent,
                };
            })
        );

        return { notifications, meta, unreadCount };
    }

    async markAsRead(recipientId: number): Promise<void> {
        await prisma.notificationRecipient.update({
            where: { id: recipientId },
            data: {
                readAt: new Date(),
            },
        });
    }

    async markAllAsRead(userId: number): Promise<void> {
        await prisma.notificationRecipient.updateMany({
            where: {
                userId,
            },
            data: {
                readAt: new Date(),
            },
        });
    }

    async processScheduledNotifications(): Promise<void> {
        const scheduledNotifications = await prisma.notification.findMany({
            where: {
                status: "SCHEDULED",
                scheduledFor: {
                    lte: new Date(),
                },
            },
        });

        for (const notification of scheduledNotifications) {
            await this.processNotificationDelivery(notification.id);
        }
    }

    async cleanupExpiredNotifications(): Promise<number> {
        const result = await prisma.notification.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date(),
                },
            },
        });

        return result.count;
    }
}
