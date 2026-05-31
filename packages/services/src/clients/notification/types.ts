/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
    ActionEvent,
    Notification,
    NotificationRecipient,
    Prisma,
    User,
} from "@mono/database";

export interface ActionEventData {
    actorId: number;
    entityId: number;
    respondentId?: number;
    verb: string;
    entityType: string;

    context?: Record<string, any>;

    entitySnapshot?: Record<string, any>;
    externalKey?: string;
}

export interface NotificationRecipientData {
    userId: number;

    recipientData?: Record<string, any>;
}

export type NotificationPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type NotificationStatus =
    | "PENDING"
    | "SCHEDULED"
    | "PROCESSING"
    | "SENT"
    | "DELIVERED"
    | "FAILED"
    | "CANCELLED";
export type DeliveryMethodType = "email" | "sms" | "push" | "in_app" | "webhook";

export interface CreateNotificationData {
    actionEventId: number;
    template?: string;

    payload?: Record<string, any>;
    deliveryMethods?: DeliveryMethodType[];
    priority?: NotificationPriority;
    recipients: NotificationRecipientData[];
    dedupeKey?: string;
    scheduledFor?: Date;
    expiresAt?: Date;
}

// Delivery result export interface
export interface DeliveryResult {
    success: boolean;
    deliveryMethod: DeliveryMethodType;
    deliveryId?: string;
    errorMessage?: string;
    retryCount?: number;
}

// Template interfaces with proper typing
export interface TemplateRenderContext<
    TPayload = Record<string, any>,
    TRecipientData = Record<string, any>,
> {
    payload: TPayload;
    recipientData: TRecipientData | null;
    actionEvent: ActionEvent;
    recipient: NotificationRecipient;
    user: User;
}

export interface NotificationTemplate<
    TPayload = Record<string, any>,
    TRecipientData = Record<string, any>,
> {
    getSubject(context: TemplateRenderContext<TPayload, TRecipientData>): string;
    getContent?(context: TemplateRenderContext<TPayload, TRecipientData>): string;
    getEmailTemplate?: (context: TemplateRenderContext<TPayload, TRecipientData>) => string;
    getEmailParams?: (
        context: TemplateRenderContext<TPayload, TRecipientData>
    ) => Record<string, any>;
    shouldNotify?: (actionEvent: ActionEvent, recipient: User) => boolean;
    getRecipients?: (actionEvent: ActionEvent) => Promise<NotificationRecipientData[]>;
}

// Delivery export interface with proper typing
export interface NotificationDelivery<
    TDeliveryMethod extends DeliveryMethodType = DeliveryMethodType,
> {
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

export enum NotificationTemplateName {
    ORDER_PAID_SUCCESS = "ORDER_PAID_SUCCESS",
    ORDER_ITEMS_UPDATED = "ORDER_ITEMS_UPDATED",
}

export type NotificationRecipientFilter = Prisma.NotificationRecipientWhereInput;
