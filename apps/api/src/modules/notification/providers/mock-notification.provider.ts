import type { NotificationPayload } from '../interfaces/notification.interface';

export interface ProviderSendResult {
  success: boolean;
  isTransient: boolean;
  externalMessageId?: string;
  errorMessage?: string;
}

export interface NotificationProviderPort {
  send(payload: NotificationPayload): Promise<ProviderSendResult>;
}

export type MockProviderBehavior =
  | 'ALWAYS_SUCCEED'
  | 'FAIL_TRANSIENT'
  | 'FAIL_PERMANENT'
  | 'CONFIG_DRIVEN';

export class MockNotificationProvider implements NotificationProviderPort {
  private forcedBehavior: MockProviderBehavior = 'CONFIG_DRIVEN';

  setBehavior(behavior: MockProviderBehavior): void {
    this.forcedBehavior = behavior;
  }

  async send(payload: NotificationPayload): Promise<ProviderSendResult> {
    // Artificial mini latency simulating external API network call
    await new Promise((res) => setTimeout(res, 20));

    // 1. Direct forced override (useful in automated tests)
    if (this.forcedBehavior === 'ALWAYS_SUCCEED') {
      return {
        success: true,
        isTransient: false,
        externalMessageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      };
    }

    if (this.forcedBehavior === 'FAIL_TRANSIENT') {
      return {
        success: false,
        isTransient: true,
        errorMessage: 'Simulated 503 Gateway Timeout from SMS gateway provider',
      };
    }

    if (this.forcedBehavior === 'FAIL_PERMANENT') {
      return {
        success: false,
        isTransient: false,
        errorMessage: 'Simulated 400 Bad Request: Invalid or unreachable recipient identifier',
      };
    }

    // 2. Deterministic configuration-driven / payload-driven behaviour
    // Technicians with specific test patterns trigger deterministic failure cases
    const techName = payload.technicianName.toLowerCase();

    if (techName.includes('transient') || techName.includes('timeout')) {
      return {
        success: false,
        isTransient: true,
        errorMessage: 'Temporary rate limit reached on provider SMS account',
      };
    }

    if (techName.includes('invalid') || techName.includes('permanent')) {
      return {
        success: false,
        isTransient: false,
        errorMessage: 'Permanent delivery failure: Destination address does not exist',
      };
    }

    // Default: Normal success delivery
    return {
      success: true,
      isTransient: false,
      externalMessageId: `mock_sms_${Date.now()}_${payload.workOrderId.slice(0, 8)}`,
    };
  }
}
