import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MainOrchestratorHelperService {
  constructor(
    private readonly configService: ConfigService,
  ) {}

  parseNumber(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not set`);
    }
    return value;
  }

  extractFinalObject(final: unknown): Record<string, unknown> | undefined {
    if (!final) {
      return undefined;
    }
    if (typeof final === 'object') {
      return final as Record<string, unknown>;
    }
    if (typeof final === 'string') {
      try {
        const parsed = JSON.parse(final) as Record<string, unknown>;
        return parsed;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  extractSelectedBookingId(goal: string): string | undefined {
    const match = goal.match(/\b([A-Z0-9]{5,8})\b/);
    return match ? match[1] : undefined;
  }

  extractFfpBookings(steps: unknown): { data: Array<Record<string, unknown>> } | undefined {
    if (!Array.isArray(steps)) {
      return undefined;
    }
    const lastCall = [...steps]
      .reverse()
      .find(
        (step) =>
          step &&
          typeof step === 'object' &&
          (step as { action?: string }).action === 'call-tool' &&
          (step as { tool?: string }).tool === 'get_ffp_booking' &&
          (step as { result?: unknown }).result,
      ) as { result?: { content?: Array<{ text?: string }> } } | undefined;
    const text = lastCall?.result?.content?.[0]?.text;
    if (!text) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(text) as { data?: Array<Record<string, unknown>> };
      if (!Array.isArray(parsed.data)) {
        return undefined;
      }
      return {
        data: parsed.data.map((item) => this.compactBooking(item)),
      };
    } catch {
      return undefined;
    }
  }

  formatBookingSummary(booking: Record<string, unknown>): string {
    const flights = Array.isArray(booking.flights) ? booking.flights : [];
    const first = flights[0] as
      | { departure?: { locationCode?: string; dateTime?: string }; arrival?: { locationCode?: string } }
      | undefined;
    const from = first?.departure?.locationCode ?? 'origin';
    const to = first?.arrival?.locationCode ?? 'destination';
    const date = first?.departure?.dateTime ?? '';
    return date ? `${from} → ${to} on ${date}` : `${from} → ${to}`;
  }

  compactBooking(booking: Record<string, unknown>): Record<string, unknown> {
    const flights = Array.isArray(booking.flights)
      ? (booking.flights as Array<Record<string, unknown>>).map((flight) => ({
          marketingAirlineCode: flight.marketingAirlineCode,
          marketingFlightNumber: flight.marketingFlightNumber,
          departure: flight.departure,
          arrival: flight.arrival,
        }))
      : [];
    const travelers = Array.isArray(booking.travelers)
      ? (booking.travelers as Array<Record<string, unknown>>).map((traveler) => ({
          names: Array.isArray(traveler.names)
            ? (traveler.names as Array<Record<string, unknown>>).map((name) => ({
                lastName: name.lastName,
              }))
            : [],
        }))
      : [];
    return {
      id: booking.id,
      flights,
      travelers,
    };
  }

  extractSelectionResult(steps: unknown, toolName = 'select_booking'): string | undefined {
    if (!Array.isArray(steps)) {
      return undefined;
    }
    const lastCall = [...steps]
      .reverse()
      .find(
        (step) =>
          step &&
          typeof step === 'object' &&
          (step as { action?: string }).action === 'call-tool' &&
          (step as { tool?: string }).tool === toolName &&
          (step as { result?: unknown }).result,
      ) as { result?: { content?: Array<{ text?: string }> } } | undefined;
    const text = lastCall?.result?.content?.[0]?.text;
    if (!text) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(text) as { bookingId?: string | null };
      if (typeof parsed.bookingId === 'string' && parsed.bookingId.length > 0) {
        return parsed.bookingId;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  extractToolResult<T = Record<string, unknown>>(steps: unknown, toolName: string): T | undefined {
    if (!Array.isArray(steps)) {
      return undefined;
    }
    const lastCall = [...steps]
      .reverse()
      .find(
        (step) =>
          step &&
          typeof step === 'object' &&
          (step as { action?: string }).action === 'call-tool' &&
          (step as { tool?: string }).tool === toolName &&
          (step as { result?: unknown }).result,
      ) as { result?: { content?: Array<{ text?: string }> } } | undefined;
    const text = lastCall?.result?.content?.[0]?.text;
    if (!text) {
      return undefined;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined;
    }
  }
}
