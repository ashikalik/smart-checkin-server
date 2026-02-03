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
        if (this.isUserConfirming(goal)) {
          const payment = this.extractPaymentInfo(record);
          const amountText =
            payment?.amount && payment?.currency
              ? `The amount is ${payment.amount} ${payment.currency}.`
              : 'Please proceed to payment.';
          const link = payment?.paymentLink ?? this.defaultPaymentLink();
          record.userMessage = `Payment required for ancillary purchase. ${amountText} Please complete payment at ${link}.`;
          record.data = {
            ...(record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : {}),
            ...(payment ? { payment } : {}),
          };
        } else {
          const suffix =
            labels.length > 0
              ? `Do you want to purchase ${labels.join(', ')}?`
              : 'Do you want to purchase ancillary services?';
          record.userMessage = `Boarding pass added to wallet. ${suffix}`;
        }
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

  private isUserConfirming(goal: string): boolean {
    const text = goal.trim().toLowerCase();
    if (!text) return false;
    if (/\b(no|dont|don't|decline|cancel|stop)\b/.test(text)) {
      return false;
    }
    return /\b(yes|yep|yeah|confirm|confirmed|proceed|ok|okay|sure|continue|buy|purchase)\b/.test(text);
  }

  private extractPaymentInfo(record: Record<string, unknown>): { amount?: number; currency?: string; paymentLink?: string } | null {
    const serviceDetails = record.serviceDetails as Record<string, any> | undefined;
    const priority = serviceDetails?.priorityAccessDetails;
    const business = serviceDetails?.businessClassLoungeAccessDetails;
    const first = serviceDetails?.firstClassLoungeAccessDetails;
    const detail = priority ?? business ?? first;
    if (!detail || typeof detail !== 'object') return null;
    const amount = typeof detail.totalAmount === 'number' ? detail.totalAmount : undefined;
    const currency = typeof detail.currency === 'string' ? detail.currency : undefined;
    return { amount, currency, paymentLink: this.defaultPaymentLink() };
  }

  private defaultPaymentLink(): string {
    return 'https://payments.etihad.com/ancillaries/checkout';
  }
}
