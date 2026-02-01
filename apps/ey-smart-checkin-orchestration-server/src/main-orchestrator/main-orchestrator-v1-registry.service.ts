import { Injectable } from '@nestjs/common';
import { CheckInState } from '../shared/checkin-state.enum';
import { SessionState } from '../shared/session-state.interface';
import { MainOrchestratorV1HelperService } from './main-orchestrator-v1-helper.service';
import { StageResponse } from '../shared/stage-response.type';
import { STAGE_STATUS } from '../shared/stage-status.type';

export type StageHandler = (state: SessionState, goal: string) => Promise<StageResponse>;

@Injectable()
export class MainOrchestratorV1RegistryService {
  private readonly handlers: Partial<Record<CheckInState, StageHandler>>;

  constructor(
    private readonly helper: MainOrchestratorV1HelperService,
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
          const hasFfp =
            typeof state.beginConversation?.frequentFlyerNumber === 'string' &&
            state.beginConversation.frequentFlyerNumber.trim().length > 0;
          const hasBookingRef = /\b(bookingReference|pnr)\s+[A-Za-z0-9]{5,8}\b/i.test(goal);
          if (!hasFfp && hasBookingRef) {
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
            return this.helper.navigate(state, goal, CheckInState.CHECKIN_ACCEPTANCE);
          }
          return result;
        })(),
      [CheckInState.PROCESS_CHECK_IN]: (state, goal) =>
        this.helper.runValidateProcessCheckin(state, goal),
      [CheckInState.CHECKIN_ACCEPTANCE]: (state, goal) =>
        (async () => {
          const result = await this.helper.runCheckinAcceptance(state, goal);
          if ((result as { isAccepted?: boolean }).isAccepted === true && this.isUserConfirming(goal)) {
            return this.helper.navigate(state, goal, CheckInState.BOARDING_PASS);
          }
          return result;
        })(),
      [CheckInState.BOARDING_PASS]: (state, goal) =>
        this.helper.runBoardingPass(state, goal),
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
}
