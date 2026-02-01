import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAgentService } from '../../ai-agent/ai-agent.service';
import { AiAgentStep } from '../../ai-agent/ai-agent.types';
import { CheckInState } from '../../shared/checkin-state.enum';
import { StateHelperService } from '../../shared/state-helper.service';
import { StageResponse } from '../../shared/stage-response.type';
import { STAGE_STATUS } from '../../shared/stage-status.type';

@Injectable()
export class AncillaryCatalogueAgentService {
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
      allowedTools: ['ssci_ancillary_catalogue'],
      maxToolEnforcementRetries: this.parseNumber(
        this.configService.get<string>('ANCILLARY_CATALOGUE_ORCHESTRATOR_TOOL_ENFORCE_RETRIES'),
      ) ?? 3,
      maxInvalidToolArgs: this.parseNumber(
        this.configService.get<string>('ANCILLARY_CATALOGUE_ORCHESTRATOR_MAX_INVALID_TOOL_ARGS'),
      ) ?? 5,
      toolUsePrompt: this.buildToolUsePrompt(),
      systemPrompt: this.buildSystemPrompt(),
      continuePrompt:
        this.configService.get<string>('ANCILLARY_CATALOGUE_ORCHESTRATOR_CONTINUE_PROMPT') ??
        'Continue. Use tools if needed.',
      computedNotesTemplate: this.buildComputedNotesTemplate(),
      maxModelCalls:
        this.parseNumber(this.configService.get<string>('ANCILLARY_CATALOGUE_ORCHESTRATOR_MAX_CALLS')) ?? 6,
    });
  }

  async handleStage(
    sessionId: string,
    goal: string,
  ): Promise<StageResponse> {
    const result = await this.runAgentLoop(goal);
    const payload = this.stateHelper.extractFinalObject(result.final) ?? result.final;
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
    if (record) {
      const hasAncillary = record.hasAncillaryForPurchase === true;
      const hasError = Boolean(record.error);
      if (hasAncillary) {
        const services = Array.isArray(record.availableServices)
          ? (record.availableServices as Array<{ key?: string }>).map((s) => s?.key).filter(Boolean)
          : [];
        const labels = services.map((key) => this.toFriendlyServiceName(key as string)).filter(Boolean);
        record.status = STAGE_STATUS.USER_INPUT_REQUIRED;
        record.continue = false;
        const suffix =
          labels.length > 0
            ? `Do you want to purchase ${labels.join(', ')}?`
            : 'Do you want to purchase ancillary services?';
        record.userMessage = `Boarding pass added to wallet. ${suffix}`;
      } else if (hasError) {
        record.status = STAGE_STATUS.FAILED;
        record.continue = false;
      } else if (record.status === undefined) {
        record.status = STAGE_STATUS.SUCCESS;
        record.continue = true;
      }
    }
    return this.stateHelper.toStageResponse(sessionId, CheckInState.ANCILLARY_SELECTION, payload, result.steps);
  }

  private parseNumber(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private buildSystemPrompt(): string {
    return this.getRequiredEnv('ANCILLARY_CATALOGUE_ORCHESTRATOR_SYSTEM_PROMPT');
  }

  private buildToolUsePrompt(): string {
    return this.getRequiredEnv('ANCILLARY_CATALOGUE_ORCHESTRATOR_TOOL_USE_PROMPT');
  }

  private buildComputedNotesTemplate(): string {
    return this.getRequiredEnv('ANCILLARY_CATALOGUE_ORCHESTRATOR_COMPUTED_NOTES_TEMPLATE');
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not set`);
    }
    return value;
  }

  private toFriendlyServiceName(key: string): string {
    switch (key) {
      case 'priorityAccessDetails':
        return 'priority access';
      case 'businessClassLoungeAccessDetails':
        return 'business class lounge access';
      case 'firstClassLoungeAccessDetails':
        return 'first class lounge access';
      default:
        return key;
    }
  }
}
