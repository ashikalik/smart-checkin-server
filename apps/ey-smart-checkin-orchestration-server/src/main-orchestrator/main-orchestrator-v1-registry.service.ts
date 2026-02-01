import { Injectable } from '@nestjs/common';
import { CheckInState } from '../shared/checkin-state.enum';
import { SessionState } from '../shared/session-state.interface';
import { MainOrchestratorV1HelperService } from './main-orchestrator-v1-helper.service';
import { StageResponse } from '../shared/stage-response.type';
import { STAGE_STATUS } from '../shared/stage-status.type';
import { StateHelperService } from '../shared/state-helper.service';

export type StageHandler = (state: SessionState, goal: string) => Promise<StageResponse>;

@Injectable()
export class MainOrchestratorV1RegistryService {
  private readonly handlers: Partial<Record<CheckInState, StageHandler>>;

  constructor(
    private readonly helper: MainOrchestratorV1HelperService,
    private readonly stateHelper: StateHelperService,
  ) {
    this.handlers = {
      [CheckInState.BEGIN_CONVERSATION]: async (state, goal) => {
        const result = await this.helper.runBeginConversation(state, goal);
        if (result.status === STAGE_STATUS.SUCCESS && result.continue === true) {
          const hasFfp =
            typeof (result as { frequentFlyerNumber?: string }).frequentFlyerNumber === 'string' &&
            (result as { frequentFlyerNumber?: string }).frequentFlyerNumber!.trim().length > 0;
          return this.helper.navigate(
            state,
            goal,
            hasFfp ? CheckInState.TRIP_IDENTIFICATION : CheckInState.JOURNEY_IDENTIFICATION,
          );
        }
        return result;
      },
      [CheckInState.TRIP_IDENTIFICATION]: (state, goal) =>
        (async () => {
          const hasBookingRef = /\b(bookingReference|pnr)\s+[A-Za-z0-9]{5,8}\b/i.test(goal);
          if (hasBookingRef) {
            return this.helper.navigate(state, goal, CheckInState.JOURNEY_IDENTIFICATION);
          }
          return this.helper.runTripIdentification(state, goal);
        })(),
      [CheckInState.JOURNEY_IDENTIFICATION]: (state, goal) =>
        (async () => {
          const result = await this.helper.runJourneyIdentification(state, goal);
          if (result.status === STAGE_STATUS.SUCCESS && result.continue === true) {
            return this.helper.navigate(state, goal, CheckInState.VALIDATE_PROCESS_CHECKIN);
          }
          return result;
        })(),
      [CheckInState.JOURNEY_SELECTION]: (state, goal) =>
        this.helper.runJourneySelection(state, goal),
      [CheckInState.VALIDATE_PROCESS_CHECKIN]: (state, goal) =>
        (async () => {
          const result = await this.helper.runValidateProcessCheckin(state, goal);
          if (this.isUserConfirming(goal)) {
            return this.helper.navigate(state, goal, CheckInState.REGULATORY_DETAILS);
          }
          return result;
        })(),
      [CheckInState.PROCESS_CHECK_IN]: (state, goal) =>
        this.helper.runValidateProcessCheckin(state, goal),
      [CheckInState.CHECKIN_ACCEPTANCE]: (state, goal) =>
        (async () => {
          if (this.isBoardingPassIntent(goal)) {
            return this.helper.navigate(state, goal, CheckInState.BOARDING_PASS);
          }
          const result = await this.helper.runCheckinAcceptance(state, goal);
          if ((result as { isAccepted?: boolean }).isAccepted === true && this.isUserConfirming(goal)) {
            return this.helper.navigate(state, goal, CheckInState.BOARDING_PASS);
          }
          return result;
        })(),
      [CheckInState.BOARDING_PASS]: (state, goal) =>
        (async () => {
          const result = await this.helper.runBoardingPass(state, goal);
          if (this.isUserConfirming(goal)) {
            return this.helper.navigate(state, goal, CheckInState.ANCILLARY_SELECTION);
          }
          return result;
        })(),
      [CheckInState.ANCILLARY_SELECTION]: (state, goal) =>
        this.helper.runAncillaryCatalogue(state, goal),
      [CheckInState.REGULATORY_DETAILS]: (state, goal) =>
        (async () => {
          const result = await this.helper.runRegulatoryDetails(state, goal);
          const missingFields = Array.isArray((result as { missingFields?: string[] }).missingFields)
            ? (result as { missingFields?: string[] }).missingFields
            : undefined;
          if (missingFields && missingFields.length > 0) {
            const nextState = {
              ...state,
              data: {
                ...(state.data ?? {}),
                requiredRegulatoryFields: missingFields,
              },
            };
            await this.stateHelper.stateService.saveState(state.sessionId, nextState);
          }
          if (result.status === STAGE_STATUS.SUCCESS && result.continue === true) {
            return this.helper.navigate(state, goal, CheckInState.CHECKIN_ACCEPTANCE);
          }
          return result;
        })(),
    };
  }

  getHandler(stage: CheckInState): StageHandler | undefined {
    return this.handlers[stage];
  }

  private isUserConfirming(goal: string): boolean {
    const text = goal.trim().toLowerCase();
    if (!text) return false;
    if (/\b(no|dont|don't|decline|cancel|stop)\b/.test(text)) {
      return false;
    }
    return /\b(yes|yep|yeah|confirm|confirmed|proceed|ok|okay|sure|continue)\b/.test(text);
  }

  private isRegulatoryDetailsIntent(goal: string): boolean {
    return /\b(regulatory|missing details|regulatory details)\b/i.test(goal);
  }

  private hasRegulatoryFieldInput(goal: string): boolean {
    const text = goal.trim();
    if (!text) return false;
    return /\b(nationality|nationalityCountryCode)\b/i.test(text);
  }

  private isBoardingPassIntent(goal: string): boolean {
    return /\b(boarding pass|boarding-pass|boardingpass)\b/i.test(goal);
  }
}
