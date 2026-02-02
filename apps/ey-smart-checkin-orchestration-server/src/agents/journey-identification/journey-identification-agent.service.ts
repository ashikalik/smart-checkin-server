import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAgentService } from '../../ai-agent/ai-agent.service';
import { AiAgentStep } from '../../ai-agent/ai-agent.types';
import { CheckInState } from '../../shared/checkin-state.enum';
import { StateHelperService } from '../../shared/state-helper.service';
import { StageResponse } from '../../shared/stage-response.type';
import { STAGE_STATUS } from '../../shared/stage-status.type';

@Injectable()
export class JourneyIdentificationAgentService {
  constructor(
    private readonly agent: AiAgentService,
    private readonly configService: ConfigService,
    private readonly stateHelper: StateHelperService,
  ) {}

  listTools(): Promise<{ tools: Array<Record<string, unknown>> }> {
    return this.agent.listTools();
  }

  runAgentLoop(goal: string): Promise<{ goal: string; steps: AiAgentStep[]; final: unknown }> {
    return this.agent.runAgentLoop(goal, {
      enforceToolUse: true,
      toolChoice: 'auto',
      allowedTools: ['ssci_identification_journey',  'ssci_identification_journey_eligibility'],
      maxToolEnforcementRetries: this.parseNumber(
        this.configService.get<string>('JOURNEY_IDENTIFICATION_ORCHESTRATOR_TOOL_ENFORCE_RETRIES'),
      ) ?? 3,
      maxInvalidToolArgs: this.parseNumber(
        this.configService.get<string>('JOURNEY_IDENTIFICATION_ORCHESTRATOR_MAX_INVALID_TOOL_ARGS'),
      ) ?? 5,
      toolUsePrompt: this.buildToolUsePrompt(),
      systemPrompt: this.buildSystemPrompt(),
      continuePrompt:
        this.configService.get<string>('JOURNEY_IDENTIFICATION_ORCHESTRATOR_CONTINUE_PROMPT') ??
        'Continue. Use tools if needed.',
      computedNotesTemplate: this.buildComputedNotesTemplate(),
      maxModelCalls: this.parseNumber(this.configService.get<string>('JOURNEY_IDENTIFICATION_ORCHESTRATOR_MAX_CALLS')) ?? 6,
    });
  }

  async handleStage(
    sessionId: string,
    goal: string,
    stageOverride?: CheckInState,
  ): Promise<StageResponse> {
    const result = await this.runAgentLoop(goal);
    const payload = this.stateHelper.extractFinalObject(result.final) ?? result.final;
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
    if (record) {
      const journeySummary = this.extractJourneySummary(result.steps);
      if (journeySummary) {
        record.origin = journeySummary.origin;
        record.destination = journeySummary.destination;
        record.departureDate = journeySummary.departureDate;
        record.arrivalDate = journeySummary.arrivalDate;
        record.durationMinutes = journeySummary.durationMinutes;
        record.durationText = journeySummary.durationText;
      }
      const journeyId = this.extractJourneyId(result.steps);
      if (journeyId) {
        record.journeyId = journeyId;
      }
      const travelerId = this.extractTravelerId(result.steps);
      if (travelerId) {
        record.travelerId = travelerId;
      }
      const hasEligibility = record.eligibility !== undefined && record.eligibility !== null;
      const hasError = Boolean(record.error);
      if (hasEligibility && !hasError) {
        record.status = STAGE_STATUS.SUCCESS;
        record.continue = true;
      } else if (hasError) {
        record.status = STAGE_STATUS.USER_INPUT_REQUIRED;
        record.continue = false;
        if (!record.userMessage && typeof record.error === 'string') {
          record.userMessage = record.error;
        }
      } else if (record.status === undefined) {
        record.status = STAGE_STATUS.FAILED;
        record.continue = false;
      }
    }
    return this.stateHelper.toStageResponse(
      sessionId,
      stageOverride ?? CheckInState.JOURNEY_IDENTIFICATION,
      payload,
      result.steps,
    );
  }

  private extractJourneySummary(
    steps: AiAgentStep[],
  ): {
    origin: string;
    destination: string;
    departureDate: string;
    arrivalDate: string;
    durationMinutes: number;
    durationText: string;
  } | undefined {
    const lastCall = [...steps]
      .reverse()
      .find(
        (step) =>
          step &&
          typeof step === 'object' &&
          (step as { action?: string }).action === 'call-tool' &&
          (step as { tool?: string }).tool === 'ssci_identification_journey' &&
          (step as { result?: unknown }).result,
      ) as { result?: { content?: Array<{ text?: string }> } } | undefined;
    const text = lastCall?.result?.content?.[0]?.text;
    if (!text) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(text) as {
        journeys?: Array<{
          flights?: Array<{
            departure?: { locationCode?: string; dateTime?: string };
            arrival?: { locationCode?: string; dateTime?: string };
          }>;
        }>;
      };
      const flight = parsed.journeys?.[0]?.flights?.[0];
      const origin = flight?.departure?.locationCode;
      const destination = flight?.arrival?.locationCode;
      const departureDate = flight?.departure?.dateTime;
      const arrivalDate = flight?.arrival?.dateTime;
      const durationMinutes = this.computeDurationMinutes(departureDate, arrivalDate);
      const durationText = typeof durationMinutes === 'number' ? this.formatDuration(durationMinutes) : undefined;
      if (
        typeof origin === 'string' &&
        typeof destination === 'string' &&
        typeof departureDate === 'string' &&
        typeof arrivalDate === 'string' &&
        typeof durationMinutes === 'number' &&
        typeof durationText === 'string'
      ) {
        return { origin, destination, departureDate, arrivalDate, durationMinutes, durationText };
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private extractJourneyId(steps: AiAgentStep[]): string | undefined {
    const parsed = this.extractJourneyPayload(steps);
    const journeyId = parsed?.journeys?.[0]?.id;
    return typeof journeyId === 'string' && journeyId.length > 0 ? journeyId : undefined;
  }

  private computeDurationMinutes(departure?: unknown, arrival?: unknown): number | undefined {
    if (typeof departure !== 'string' || typeof arrival !== 'string') {
      return undefined;
    }
    const dep = new Date(departure);
    const arr = new Date(arrival);
    if (!Number.isFinite(dep.getTime()) || !Number.isFinite(arr.getTime())) {
      return undefined;
    }
    const diffMs = arr.getTime() - dep.getTime();
    if (!Number.isFinite(diffMs)) return undefined;
    return Math.round(diffMs / 60000);
  }

  private formatDuration(totalMinutes: number): string {
    const minutes = Math.max(0, Math.round(totalMinutes));
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  private extractTravelerId(steps: AiAgentStep[]): string | undefined {
    const parsed = this.extractJourneyPayload(steps);
    const travelerId = parsed?.journeys?.[0]?.travelers?.[0]?.id;
    return typeof travelerId === 'string' && travelerId.length > 0 ? travelerId : undefined;
  }

  private extractJourneyPayload(
    steps: AiAgentStep[],
  ):
    | {
        journeys?: Array<{
          id?: string;
          travelers?: Array<{ id?: string }>;
        }>;
      }
    | undefined {
    const lastCall = [...steps]
      .reverse()
      .find(
        (step) =>
          step &&
          typeof step === 'object' &&
          (step as { action?: string }).action === 'call-tool' &&
          (step as { tool?: string }).tool === 'ssci_identification_journey' &&
          (step as { result?: unknown }).result,
      ) as { result?: { content?: Array<{ text?: string }> } } | undefined;
    const text = lastCall?.result?.content?.[0]?.text;
    if (!text) {
      return undefined;
    }
    try {
      return JSON.parse(text) as {
        journeys?: Array<{
          id?: string;
          travelers?: Array<{ id?: string }>;
        }>;
      };
    } catch {
      return undefined;
    }
  }

  private parseNumber(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private buildSystemPrompt(): string {
    return this.getRequiredEnv('JOURNEY_IDENTIFICATION_ORCHESTRATOR_SYSTEM_PROMPT');
  }

  private buildToolUsePrompt(): string {
    return this.getRequiredEnv('JOURNEY_IDENTIFICATION_ORCHESTRATOR_TOOL_USE_PROMPT');
  }

  private buildComputedNotesTemplate(): string {
    return this.getRequiredEnv('JOURNEY_IDENTIFICATION_ORCHESTRATOR_COMPUTED_NOTES_TEMPLATE');
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not set`);
    }
    return value;
  }
}
