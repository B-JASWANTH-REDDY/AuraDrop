// AuraDrop Privacy-First Client Analytics & Event Logger
// Strictly DPDP Act 2023 & GDPR Compliant: Zero Cookies, Zero Fingerprinting, Zero PII

export type AnalyticsEventType =
  | 'page_view'
  | 'download_setup_exe'
  | 'download_apk'
  | 'download_msi'
  | 'download_zip'
  | 'transfer_start'
  | 'transfer_complete'
  | 'device_paired'
  | 'command_menu_opened'
  | 'policy_viewed'
  | 'theme_toggled';

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  timestamp: number;
  metadata?: Record<string, string | number | boolean>;
}

class PrivacyAnalytics {
  private static instance: PrivacyAnalytics;
  private readonly storageKey = 'auradrop_privacy_events';

  private constructor() {}

  public static getInstance(): PrivacyAnalytics {
    if (!PrivacyAnalytics.instance) {
      PrivacyAnalytics.instance = new PrivacyAnalytics();
    }
    return PrivacyAnalytics.instance;
  }

  public track(type: AnalyticsEventType, metadata?: Record<string, string | number | boolean>): void {
    try {
      const evt: AnalyticsEvent = {
        type,
        timestamp: Date.now(),
        metadata,
      };

      const existing: AnalyticsEvent[] = this.getRecentEvents();
      existing.unshift(evt);
      // Keep only last 50 events locally for debugging and diagnostics
      const trimmed = existing.slice(0, 50);
      localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
    } catch {
      // Ignore localStorage availability issues in private mode
    }
  }

  public getRecentEvents(): AnalyticsEvent[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public clear(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {}
  }
}

export const analytics = PrivacyAnalytics.getInstance();
