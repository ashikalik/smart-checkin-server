import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { AiAgentStep } from '../ai-agent/ai-agent.types';
import { OrchestratorState } from '../state/state-store.interface';
import { StateService } from '../state/state.service';
import { MainOrchestratorHelperService } from './main-orchestrator-helper.service';

@Injectable()
export class MainOrchestratorService {
  constructor(
    private readonly stateService: StateService,
    private readonly agent: AiAgentService,
    private readonly configService: ConfigService,
    private readonly helper: MainOrchestratorHelperService,
  ) {}

  async run(goal: string, sessionId?: string): Promise<Record<string, unknown>> {
    const currentSessionId = sessionId ?? uuidv4();
    const state = (await this.stateService.getState(currentSessionId)) ?? {
      sessionId: currentSessionId,
      data: {},
    };

    const stateData = (state.data ?? {}) as Record<string, unknown>;
    const pendingBookings = Array.isArray(stateData.pendingBookings)
      ? (stateData.pendingBookings as Array<Record<string, unknown>>)
      : [];
    if (pendingBookings.length > 0) {
      const selection = await this.runSelectionTool(goal, pendingBookings);
      if (!selection.bookingId) {
        const pendingState: OrchestratorState = {
          ...state,
          lastStep: 'ffp-booking-choice',
          data: {
            ...state.data,
            pendingBookings,
          },
        };
        await this.stateService.saveState(currentSessionId, pendingState);
        return {
          sessionId: currentSessionId,
          status: 'user_input_required',
          message: 'I found multiple bookings. Which one should I use?',
          choices: pendingBookings.map((booking) => ({
            id: booking.id,
            summary: this.helper.formatBookingSummary(booking),
            details: this.helper.compactBooking(booking),
          })),
          steps: selection.steps,
        };
      }

      const selectedBooking = pendingBookings.find((booking) => booking.id === selection.bookingId);
      const traveler = Array.isArray(selectedBooking?.travelers)
        ? (selectedBooking?.travelers[0] as { names?: Array<{ lastName?: string }> } | undefined)
        : undefined;
      const bookingLastName = traveler?.names?.[0]?.lastName;
      const lastName =
        typeof bookingLastName === 'string'
          ? bookingLastName
          : typeof stateData.lastName === 'string'
            ? stateData.lastName
            : undefined;
      if (!lastName) {
        return {
          sessionId: currentSessionId,
          status: 'error',
          message: 'Last name not found for selected booking.',
        };
      }

      const preState: OrchestratorState = {
        ...state,
        lastStep: 'ffp-booking-choice',
        data: {
          ...state.data,
          selectedBookingId: selection.bookingId,
          lastName,
        },
      };
      await this.stateService.saveState(currentSessionId, preState);

      const identification = await this.runToolFlow(
        `pnr ${selection.bookingId} lastName ${lastName}`,
        ['orchestrator_identification'],
      );
      const final = this.helper.extractToolResult<Record<string, unknown>>(
        identification.steps,
        'orchestrator_identification',
      );
      if (!final) {
        return {
          sessionId: currentSessionId,
          status: 'error',
          message: 'Identification tool did not return valid JSON.',
          steps: identification.steps,
        };
      }

      const nextState: OrchestratorState = {
        ...state,
        lastStep: 'main-orchestrator',
        data: {
          ...state.data,
          pnr: selection.bookingId,
          lastName,
          selectedBookingId: selection.bookingId,
          ...(final.eligibility ? { eligibility: final.eligibility } : {}),
        },
      };
      await this.stateService.saveState(currentSessionId, nextState);

      if (final.error) {
        return {
          sessionId: currentSessionId,
          status: 'error',
          message: String(final.error),
          steps: identification.steps,
        };
      }

      return {
        sessionId: currentSessionId,
        status: 'ok',
        message: 'Eligibility check complete.',
        data: {
          eligibility: final.eligibility ?? null,
          pnr: selection.bookingId,
          lastName,
        },
      };
    }

    const frequentFlyerCardNumber = this.extractField(goal, /frequentFlyerCardNumber\s+([A-Za-z0-9]+)/i);
    const pnr = this.extractField(goal, /\bpnr\s+([A-Za-z0-9]{5,8})\b/i);
    const lastName = this.extractField(goal, /lastName\s+([A-Za-z]+)/i);

    if (frequentFlyerCardNumber && lastName) {
      const booking = await this.runToolFlow(
        `frequentFlyerCardNumber ${frequentFlyerCardNumber} lastName ${lastName}`,
        ['get_ffp_booking'],
      );
      const bookingPayload = this.helper.extractFfpBookings(booking.steps);
      const availableBookings = bookingPayload?.data ?? [];
      if (availableBookings.length === 0) {
        return {
          sessionId: currentSessionId,
          status: 'error',
          message: 'No bookings found.',
          steps: booking.steps,
        };
      }

      if (availableBookings.length > 1) {
        const pendingState: OrchestratorState = {
          ...state,
          lastStep: 'ffp-booking-choice',
          data: {
            ...state.data,
            pendingBookings: availableBookings,
            lastName,
          },
        };
        await this.stateService.saveState(currentSessionId, pendingState);
        return {
          sessionId: currentSessionId,
          status: 'user_input_required',
          message: 'I found multiple bookings. Which one should I use?',
          choices: availableBookings.map((bookingItem) => ({
            id: bookingItem.id,
            summary: this.helper.formatBookingSummary(bookingItem),
            details: this.helper.compactBooking(bookingItem),
          })),
          steps: booking.steps,
        };
      }

      const singleBooking = availableBookings[0];
      const fallbackLastName =
        typeof lastName === 'string'
          ? lastName
          : typeof stateData.lastName === 'string'
            ? stateData.lastName
            : undefined;
      const chosenLastName = fallbackLastName ?? lastName;
      if (!chosenLastName) {
        return {
          sessionId: currentSessionId,
          status: 'error',
          message: 'Last name not found for booking.',
        };
      }

      const identification = await this.runToolFlow(
        `pnr ${singleBooking.id} lastName ${chosenLastName}`,
        ['orchestrator_identification'],
      );
      const final = this.helper.extractToolResult<Record<string, unknown>>(
        identification.steps,
        'orchestrator_identification',
      );
      if (!final) {
        return {
          sessionId: currentSessionId,
          status: 'error',
          message: 'Identification tool did not return valid JSON.',
          steps: identification.steps,
        };
      }

      return {
        sessionId: currentSessionId,
        status: final.error ? 'error' : 'ok',
        message: final.error ? String(final.error) : 'Eligibility check complete.',
        data: {
          eligibility: final.eligibility ?? null,
          pnr: singleBooking.id ?? null,
          lastName: chosenLastName ?? null,
        },
      };
    }

    if (pnr && lastName) {
      const identification = await this.runToolFlow(`pnr ${pnr} lastName ${lastName}`, ['orchestrator_identification']);
      const final = this.helper.extractToolResult<Record<string, unknown>>(
        identification.steps,
        'orchestrator_identification',
      );
      if (!final) {
        return {
          sessionId: currentSessionId,
          status: 'error',
          message: 'Identification tool did not return valid JSON.',
          steps: identification.steps,
        };
      }
      return {
        sessionId: currentSessionId,
        status: final.error ? 'error' : 'ok',
        message: final.error ? String(final.error) : 'Eligibility check complete.',
        data: {
          eligibility: final.eligibility ?? null,
          pnr,
          lastName,
        },
      };
    }

    return {
      sessionId: currentSessionId,
      status: 'error',
      message: 'Unable to determine flow. Provide frequentFlyerCardNumber + lastName or PNR + lastName.',
    };
  }

  private extractField(goal: string, pattern: RegExp): string | undefined {
    const match = goal.match(pattern);
    return match ? match[1] : undefined;
  }

  private async runSelectionTool(
    utterance: string,
    bookings: Array<Record<string, unknown>>,
  ): Promise<{ bookingId?: string; steps: AiAgentStep[] }> {
    const choices = bookings.map((booking) => ({
      id: booking.id,
      summary: this.helper.formatBookingSummary(booking),
    }));
    const selectionGoal = `utterance: ${utterance}\nchoices: ${JSON.stringify(choices)}`;
    const result = await this.runToolFlow(selectionGoal, ['select_booking']);
    const bookingId = this.helper.extractSelectionResult(result.steps);
    return { bookingId, steps: result.steps };
  }

  private async runToolFlow(goal: string, allowedTools: string[]): Promise<{ steps: AiAgentStep[] }> {
    const result = await this.agent.runAgentLoop(goal, {
      enforceToolUse: true,
      toolChoice: 'required',
      allowedTools,
      maxToolEnforcementRetries:
        this.helper.parseNumber(this.configService.get<string>('MAIN_ORCHESTRATOR_TOOL_ENFORCE_RETRIES')) ?? 3,
      maxInvalidToolArgs:
        this.helper.parseNumber(this.configService.get<string>('MAIN_ORCHESTRATOR_MAX_INVALID_TOOL_ARGS')) ?? 5,
      toolUsePrompt: this.helper.getRequiredEnv('MAIN_MCP_TOOL_USE_PROMPT'),
      systemPrompt: this.configService.get<string>('AI_AGENT_SYSTEM_PROMPT'),
      continuePrompt: this.configService.get<string>('AI_AGENT_CONTINUE_PROMPT'),
      computedNotesTemplate: this.helper.getRequiredEnv('MAIN_ORCHESTRATOR_COMPUTED_NOTES_TEMPLATE'),
      maxModelCalls: this.helper.parseNumber(this.configService.get<string>('MAIN_ORCHESTRATOR_MAX_CALLS')) ?? 6,
    });
    return { steps: result.steps };
  }
}
