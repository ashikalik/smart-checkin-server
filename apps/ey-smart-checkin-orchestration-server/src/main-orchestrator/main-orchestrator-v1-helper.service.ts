import { Injectable } from '@nestjs/common';
import { BeginConversationAgentService } from '../agents/begin-conversation/begin-conversation-agent.service';
import { CheckInState } from '../shared/checkin-state.enum';
import { OrchestratorState } from '../state/state-store.interface';
import { TripIdentificationAgentService } from '../agents/trip-identification/trip-identification-agent.service';
import { StageResponse } from '../shared/stage-response.type';
import { StateHelperService } from '../shared/state-helper.service';
import { JourneyIdentificationAgentService } from '../agents/journey-identification/journey-identification-agent.service';
import { ValidateProcessCheckInAgentService } from '../agents/validate-process-checkin/validate-process-checkin-agent.service';
import { CheckinAcceptanceAgentService } from '../agents/checkin-acceptance/checkin-acceptance-agent.service';
import { BoardingPassAgentService } from '../agents/boarding-pass/boarding-pass-agent.service';
import { RegulatoryDetailsAgentService } from '../agents/regulatory-details/regulatory-details-agent.service';
import { AncillaryCatalogueAgentService } from '../agents/ancillary-catalogue/ancillary-catalogue-agent.service';

@Injectable()
export class MainOrchestratorV1HelperService {
  constructor(
    private readonly stateHelper: StateHelperService,
    private readonly beginConversation: BeginConversationAgentService,
    private readonly tripIdentification: TripIdentificationAgentService,
    private readonly journeyIdentification: JourneyIdentificationAgentService,
    private readonly validateProcessCheckin: ValidateProcessCheckInAgentService,
    private readonly checkinAcceptance: CheckinAcceptanceAgentService,
    private readonly boardingPass: BoardingPassAgentService,
    private readonly regulatoryDetails: RegulatoryDetailsAgentService,
    private readonly ancillaryCatalogue: AncillaryCatalogueAgentService,
  ) { }
  buildInitialState(sessionId: string): OrchestratorState {
    return this.stateHelper.buildInitialState(sessionId);
  }

  getCurrentStage(state: OrchestratorState): CheckInState {
    return this.stateHelper.getCurrentStage(state);
  }

  

  async runBeginConversation(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    const response = await this.beginConversation.handleStage(state.sessionId, goal);
    if (state.beginConversation && response) {
      const merged = this.beginConversation.updateBeginConversationState(
        state.beginConversation,
        response as unknown as Partial<import('../shared/begin-conversation-state').BeginConversationState>,
      );
      const useMock = merged.bookingReference === '7MHQTY';
      const nextState: OrchestratorState = {
        ...state,
        beginConversation: merged,
        data: {
          ...state.data,
          ...(useMock ? { useMock: true } : {}),
        },
      };
      await this.stateHelper.stateService.saveState(state.sessionId, nextState);
      return {
        ...response,
        ...merged,
        sessionId: state.sessionId,
        stage: response.stage,
      };
    }
    return response;
  }

  async runTripIdentification(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    const context = this.stateHelper.buildContext(state);
    const response = await this.tripIdentification.handleStage(state.sessionId, goal, context);
    if (state.tripIdentificationState && response) {
      const merged = this.tripIdentification.updateTripIdentificationState(
        state.tripIdentificationState,
        response as unknown as Partial<import('../shared/trip-identification-state.interface').TripIdentificationState>,
      );
      const selectedPnr =
        typeof merged.selectedPnr === 'string' && merged.selectedPnr.trim().length > 0
          ? merged.selectedPnr.trim()
          : undefined;
      const responseLastName =
        typeof (response as { data?: { lastName?: string } }).data?.lastName === 'string'
          ? (response as { data?: { lastName?: string } }).data!.lastName
          : undefined;
      const nextState: OrchestratorState = {
        ...state,
        tripIdentificationState: merged,
        beginConversation: selectedPnr
          ? {
              ...state.beginConversation,
              bookingReference: selectedPnr,
            }
          : state.beginConversation,
        data: {
          ...state.data,
          ...(selectedPnr ? { bookingReference: selectedPnr } : {}),
          ...(responseLastName ? { lastName: responseLastName } : {}),
        },
      };
      await this.stateHelper.stateService.saveState(state.sessionId, nextState);
      return {
        ...response,
        ...merged,
        sessionId: state.sessionId,
        stage: response.stage,
      };
    }
    return response;
  }

  async runJourneyIdentification(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    let bookingReferenceFromGoal = goal.match(/\b(bookingReference|pnr)\s+([A-Za-z0-9]{5,8})\b/i)?.[2];
    if (!bookingReferenceFromGoal) {
      const pnrOnly = goal.trim();
      if (/^[A-Za-z0-9]{5,8}$/.test(pnrOnly)) {
        bookingReferenceFromGoal = pnrOnly;
      }
    }
    let lastNameFromGoal = goal.match(/\blastName\s+([A-Za-z]+)/i)?.[1];
    const bookingReference =
      state.beginConversation?.bookingReference ??
      (state.data && typeof state.data.bookingReference === 'string' ? (state.data.bookingReference as string) : undefined) ??
      bookingReferenceFromGoal;
    const lastName =
      state.beginConversation?.lastName ??
      (state.data && typeof state.data.lastName === 'string' ? (state.data.lastName as string) : undefined) ??
      lastNameFromGoal;
    if (bookingReference === '7MHQTY' && state.data?.useMock !== true) {
      const nextState: OrchestratorState = {
        ...state,
        data: {
          ...state.data,
          useMock: true,
        },
      };
      await this.stateHelper.stateService.saveState(state.sessionId, nextState);
      state = nextState;
    }
    if ((bookingReferenceFromGoal || lastNameFromGoal) && state.beginConversation) {
      const useMock = bookingReferenceFromGoal === '7MHQTY';
      if (bookingReferenceFromGoal) {
        const isPnrOnly = /^[A-Za-z0-9]{5,8}$/.test(goal.trim());
        if (isPnrOnly && !lastNameFromGoal && state.beginConversation.lastName) {
          lastNameFromGoal = state.beginConversation.lastName;
        }
      }
      const nextState: OrchestratorState = {
        ...state,
        beginConversation: {
          ...state.beginConversation,
          bookingReference: bookingReferenceFromGoal ?? state.beginConversation.bookingReference,
          lastName: lastNameFromGoal ?? state.beginConversation.lastName,
        },
        data: {
          ...state.data,
          ...(useMock ? { useMock: true } : {}),
          ...(bookingReferenceFromGoal ? { bookingReference: bookingReferenceFromGoal } : {}),
          ...(lastNameFromGoal ? { lastName: lastNameFromGoal } : {}),
        },
      };
      await this.stateHelper.stateService.saveState(state.sessionId, nextState);
      state = nextState;
    }
    if ((bookingReferenceFromGoal || lastNameFromGoal) && !state.beginConversation) {
      const nextState: OrchestratorState = {
        ...state,
        data: {
          ...state.data,
          ...(bookingReferenceFromGoal ? { bookingReference: bookingReferenceFromGoal } : {}),
          ...(lastNameFromGoal ? { lastName: lastNameFromGoal } : {}),
        },
      };
      await this.stateHelper.stateService.saveState(state.sessionId, nextState);
      state = nextState;
    }
    if (!bookingReference || !lastName) {
      const missingParts: string[] = [];
      if (!bookingReference) missingParts.push('PNR/bookingReference');
      if (!lastName) missingParts.push('lastName');
      return this.stateHelper.toStageResponse(
        state.sessionId,
        CheckInState.JOURNEY_IDENTIFICATION,
        {
          status: 'USER_INPUT_REQUIRED',
          continue: false,
          userMessage: `Please provide ${missingParts.join(' and ')}.`,
        },
        [],
      );
    }
    const response = await this.journeyIdentification.handleStage(
      state.sessionId,
      this.appendMockFlag(goal, state),
      CheckInState.JOURNEY_IDENTIFICATION,
    );
    if (state.journeyIdentificationState && response) {
      const journeyId =
        typeof (response as { journeyId?: string }).journeyId === 'string'
          ? (response as { journeyId?: string }).journeyId
          : undefined;
      const travelerId =
        typeof (response as { travelerId?: string }).travelerId === 'string'
          ? (response as { travelerId?: string }).travelerId
          : undefined;
      const nextState: OrchestratorState = {
        ...state,
        journeyIdentificationState: {
          ...state.journeyIdentificationState,
          status: response.status,
          continue: response.continue,
          updatedAtUtc: response.updatedAtUtc,
          startedAtUtc: response.startedAtUtc,
          completedAtUtc: response.completedAtUtc,
          lastEventId: response.lastEventId,
          attempt: response.attempt,
          error: response.error,
          userMessage: response.userMessage,
          bookingReference,
          lastName,
          journeyReply: (response as { eligibility?: unknown }).eligibility as any,
        },
        data: {
          ...state.data,
          ...(journeyId ? { journeyId } : {}),
          ...(travelerId ? { travelerId } : {}),
        },
      };
      await this.stateHelper.stateService.saveState(state.sessionId, nextState);
      return {
        ...response,
        sessionId: state.sessionId,
        stage: response.stage,
      };
    }
    return response;
  }

  async runJourneySelection(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    const trimmed = goal.trim();
    const looksLikePnr = /^[A-Za-z0-9]{5,8}$/.test(trimmed);
    const enrichedGoal = looksLikePnr ? `bookingReference ${trimmed}` : goal;
    return this.journeyIdentification.handleStage(
      state.sessionId,
      this.appendMockFlag(enrichedGoal, state),
      CheckInState.JOURNEY_SELECTION,
    );
  }

  async runValidateProcessCheckin(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    return this.validateProcessCheckin.handleStage(state.sessionId, this.appendMockFlag(goal, state));
  }

  async runCheckinAcceptance(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    return this.checkinAcceptance.handleStage(state.sessionId, this.appendMockFlag(goal, state));
  }

  async runBoardingPass(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    return this.boardingPass.handleStage(state.sessionId, this.appendMockFlag(goal, state));
  }

  async runAncillaryCatalogue(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    const data = state.data ?? {};
    const journeyId = typeof data.journeyId === 'string' ? data.journeyId : undefined;
    const journeyElementId = typeof data.journeyElementId === 'string' ? data.journeyElementId : undefined;
    const enrichedGoal =
      journeyId && journeyElementId
        ? `ancillary catalogue for journey ${journeyId} journeyElementId ${journeyElementId}`
        : goal;
    return this.ancillaryCatalogue.handleStage(
      state.sessionId,
      this.appendMockFlag(enrichedGoal, state),
    );
  }

  async runRegulatoryDetails(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    const data = state.data ?? {};
    const journeyId = typeof data.journeyId === 'string' ? data.journeyId : undefined;
    const travelerId = typeof data.travelerId === 'string' ? data.travelerId : undefined;
    const enrichedGoal =
      journeyId && travelerId
        ? `regulatory details for journey ${journeyId} travelerId ${travelerId}`
        : goal;
    return this.regulatoryDetails.handleStage(
      state.sessionId,
      this.appendMockFlag(enrichedGoal, state),
    );
  }

  private appendMockFlag(goal: string, state: OrchestratorState): string {
    const useMock = Boolean(state.data && state.data.useMock === true);
    if (!useMock) return goal;
    return /\buseMock\b/i.test(goal) ? goal : `${goal} useMock true`;
  }

  resolveSession(
    sessionId: string | undefined,
  ): Promise<{ sessionId: string; state: OrchestratorState; response?: StageResponse }> {
    return this.stateHelper.resolveSession(sessionId);
  }

  async navigate(
    state: OrchestratorState,
    goal: string,
    nextStage: CheckInState,
  ): Promise<StageResponse> {
    const baseState = (await this.stateHelper.stateService.getState(state.sessionId)) ?? state;
    const nextState: OrchestratorState = {
      ...baseState,
      currentStage: nextStage,
    };
    await this.stateHelper.stateService.saveState(state.sessionId, nextState);
    switch (nextStage) {
      case CheckInState.BEGIN_CONVERSATION:
        return this.runBeginConversation(nextState, goal);
      case CheckInState.TRIP_IDENTIFICATION:
        return this.runTripIdentification(nextState, goal);
      case CheckInState.JOURNEY_IDENTIFICATION:
        return this.runJourneyIdentification(nextState, goal);
      case CheckInState.JOURNEY_SELECTION:
        return this.runJourneySelection(nextState, goal);
      case CheckInState.VALIDATE_PROCESS_CHECKIN:
        return this.runValidateProcessCheckin(nextState, goal);
      case CheckInState.PROCESS_CHECK_IN:
        return this.runValidateProcessCheckin(nextState, goal);
      case CheckInState.CHECKIN_ACCEPTANCE:
        return this.runCheckinAcceptance(nextState, goal);
      case CheckInState.BOARDING_PASS:
        return this.runBoardingPass(nextState, goal);
      case CheckInState.REGULATORY_DETAILS:
        return this.runRegulatoryDetails(nextState, goal);
      case CheckInState.ANCILLARY_SELECTION:
        return this.runAncillaryCatalogue(nextState, goal);
      default:
        return this.stateHelper.buildUnknownStageResponse(state.sessionId, nextStage);
    }
  }

}
