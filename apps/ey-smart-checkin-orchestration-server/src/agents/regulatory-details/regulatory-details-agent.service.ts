import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAgentService } from '../../ai-agent/ai-agent.service';
import { AiAgentStep } from '../../ai-agent/ai-agent.types';
import { CheckInState } from '../../shared/checkin-state.enum';
import { StateHelperService } from '../../shared/state-helper.service';
import { StageResponse } from '../../shared/stage-response.type';
import { STAGE_STATUS } from '../../shared/stage-status.type';
import { NATIONALITY_CODE_MAP } from './nationality-mapping';

@Injectable()
export class RegulatoryDetailsAgentService {
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
      allowedTools: ['ssci_regulatory_details', 'ssci_regulatory_details_update'],
      maxToolEnforcementRetries: this.parseNumber(
        this.configService.get<string>('REGULATORY_DETAILS_ORCHESTRATOR_TOOL_ENFORCE_RETRIES'),
      ) ?? 3,
      maxInvalidToolArgs: this.parseNumber(
        this.configService.get<string>('REGULATORY_DETAILS_ORCHESTRATOR_MAX_INVALID_TOOL_ARGS'),
      ) ?? 5,
      toolUsePrompt: this.buildToolUsePrompt(),
      systemPrompt: this.buildSystemPrompt(),
      continuePrompt:
        this.configService.get<string>('REGULATORY_DETAILS_ORCHESTRATOR_CONTINUE_PROMPT') ??
        'Continue. Use tools if needed.',
      computedNotesTemplate: this.buildComputedNotesTemplate(),
      maxModelCalls:
        this.parseNumber(this.configService.get<string>('REGULATORY_DETAILS_ORCHESTRATOR_MAX_CALLS')) ?? 6,
    });
  }

  async handleStage(
    sessionId: string,
    goal: string,
  ): Promise<StageResponse> {
    const normalizedGoal = this.normalizeNationalityGoal(goal);
    const result = await this.runAgentLoop(normalizedGoal);
    const payload = this.stateHelper.extractFinalObject(result.final) ?? result.final;
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
    if (record) {
      const required = Array.isArray(record.requiredFieldsMissing)
        ? (record.requiredFieldsMissing as string[])
        : [];
      const hasError = Boolean(record.error);
      if (required.length > 0) {
        record.status = STAGE_STATUS.USER_INPUT_REQUIRED;
        record.continue = false;
        const acknowledgement =
          this.isUserConfirming(goal)
            ? 'Thank you confirming we are proceeding with your check in process.'
            : '';
        const existing =
          typeof record.userMessage === 'string' && record.userMessage.trim().length > 0
            ? record.userMessage.trim()
            : '';
        const prefix = existing || acknowledgement;
        const needNationality = required.includes('nationalityCountryCode');
        const prompt = needNationality
          ? 'Please provide nationality country code (e.g., AE).'
          : `Please provide ${required.map(this.toFriendlyFieldName).join(', ')}.`;
        const consent =
          'Thank you for confirming. To continue with check-in, please confirm your consent for the dangerous goods declaration.';
        record.userMessage = prefix ? `${prefix} ${prompt} ${consent}`.trim() : `${prompt} ${consent}`;
        record.missingFields = required;
      } else if (hasError) {
        record.status = STAGE_STATUS.FAILED;
        record.continue = false;
      } else if (record.status === undefined) {
        record.status = STAGE_STATUS.SUCCESS;
        record.continue = true;
        if (!record.userMessage) {
          record.userMessage = 'Regulatory details updated successfully.';
        }
      }
    }
    return this.stateHelper.toStageResponse(sessionId, CheckInState.REGULATORY_DETAILS, payload, result.steps);
  }

  private parseNumber(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private buildSystemPrompt(): string {
    return this.getRequiredEnv('REGULATORY_DETAILS_ORCHESTRATOR_SYSTEM_PROMPT');
  }

  private buildToolUsePrompt(): string {
    return this.getRequiredEnv('REGULATORY_DETAILS_ORCHESTRATOR_TOOL_USE_PROMPT');
  }

  private buildComputedNotesTemplate(): string {
    return this.getRequiredEnv('REGULATORY_DETAILS_ORCHESTRATOR_COMPUTED_NOTES_TEMPLATE');
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not set`);
    }
    return value;
  }

  private toFriendlyFieldName(field: string): string {
    switch (field) {
      case 'nationalityCountryCode':
        return 'nationality';
      default:
        return field;
    }
  }

  private normalizeNationalityGoal(goal: string): string {
    const text = goal.trim();
    if (!text) return goal;
    if (/\bnationalityCountryCode\b/i.test(text)) {
      return goal;
    }
    const match = text.match(/\bnationality\s+([A-Za-z]+)\b/i);
    if (!match) {
      return goal;
    }
    const value = match[1].toLowerCase().replace(/[^a-z]/g, '');
    const code = NATIONALITY_CODE_MAP[value];
    if (!code) {
      return goal;
    }
    return `${goal} nationalityCountryCode ${code}`;
  }

  private isUserConfirming(goal: string): boolean {
    const text = goal.trim().toLowerCase();
    if (!text) return false;
    if (/\b(no|dont|don't|decline|cancel|stop)\b/.test(text)) {
      return false;
    }
    return /\b(yes|yep|yeah|confirm|confirmed|proceed|ok|okay|sure|continue)\b/.test(text);
  }
}
