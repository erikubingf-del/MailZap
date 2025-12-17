export enum OnboardingState {
    NEW = 'NEW',
    AWAITING_EMAIL_LINK = 'AWAITING_EMAIL_LINK',
    EMAIL_LINKED = 'EMAIL_LINKED',
    COLLECTING_PROMO_PREFERENCE = 'COLLECTING_PROMO_PREFERENCE',
    COLLECTING_IMPORTANT_RULES = 'COLLECTING_IMPORTANT_RULES',
    COLLECTING_STYLE_SAMPLES = 'COLLECTING_STYLE_SAMPLES',
    COMPLETED = 'COMPLETED',
}

export interface ConversationState {
    whatsappNumber: string;
    userId?: number;
    onboardingState: OnboardingState;
    tempData?: any;
    step?: 'COMPOSING_TO' | 'COMPOSING_BODY' | 'CONFIRMING_DRAFT' | 'COMPLETED';
}
