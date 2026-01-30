
  import { GenericEligibility, JourneysListReply } from '@etihad-core/models';
import {
  JourneyIdentificationRequestPayload,
    SsciJourneyIdentificationSchema,
    type SsciJourneyIdentificationService,
    type SsciJourneyIdentificationToolInput,
    buildMockJourneyResponse,
    isMockEnabled,
    maybeMockDelay,
  } from '../tools/retrieve-journey.tool';

  type McpToolResponse = {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  };
  
  function toToolResponse(data: unknown): McpToolResponse {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
  
  type CheckInMessage =
    | { key: 'CHECK_IN_WINDOW_UNAVAILABLE' }
    | { key: 'CHECK_IN_OPENING_TIME_UNAVAILABLE' }
    | { key: 'CHECK_IN_CLOSING_TIME_UNAVAILABLE' }
    | { key: 'CHECK_IN_UNAVAILABLE' }
    | { key: 'CHECK_IN_NOT_YET_OPEN' }
    | { key: 'CHECK_IN_OPENS_IN_MINUTES'; params: { minutes: number } }
    | { key: 'CHECK_IN_OPENS_IN_HOURS_MINUTES'; params: { hours: number; minutes: number } }
    | { key: 'CHECK_IN_OPENS_IN_DAY_HOURS'; params: { days: 1; hours: number } }
    | { key: 'CHECK_IN_OPENS_IN_DAYS_HOURS'; params: { days: number; hours: number } }
    | { key: 'CHECK_IN_OPENS_ON'; params: { date: string } }
    | { key: 'CHECK_IN_CLOSES_IN_MINUTES'; params: { minutes: number } }
    | { key: 'CHECK_IN_CLOSES_IN_HOURS_MINUTES'; params: { hours: number; minutes: number } }
    | { key: 'CHECK_IN_CLOSES_IN_DAY_HOURS'; params: { days: 1; hours: number } }
    | { key: 'CHECK_IN_CLOSES_IN_DAYS_HOURS'; params: { days: number; hours: number } }
    | { key: 'CHECK_IN_CLOSES_ON'; params: { date: string } }
    | { key: 'CHECK_IN_CLOSED_ON'; params: { date: string } };
  
  type JourneyEligibilityResult = {
    journeyId: string;
    checkInStatus: string;
    matchedRule: string | null;
    matchedEligibility: GenericEligibility | null;
    messageKey: string | null;
    message: string | null;
    operatingAirlineName: string | null;
    checkInMessage: CheckInMessage;
  };
  
  type JourneyEligibilityResponse = {
    eligibility: { journeys: JourneyEligibilityResult[] } | null;
    error: string | null;
  };
  
  function normalizeEligibilityName(name: unknown): string {
    return String(name ?? '').trim().toLowerCase();
  }
  
  function parseIsoDateTime(value: unknown): Date | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  
  function formatDdMmmUtc(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    }).format(date);
  }
  
  function computeCheckInMessage(params: {
    checkInStatus: string;
    openingDateAndTime?: unknown;
    closingDateAndTime?: unknown;
    now?: Date;
  }): CheckInMessage {
    const now = params.now ?? new Date();
    const opening = parseIsoDateTime(params.openingDateAndTime);
    const closing = parseIsoDateTime(params.closingDateAndTime);
  
    if (!params.openingDateAndTime && !params.closingDateAndTime) {
      return { key: 'CHECK_IN_WINDOW_UNAVAILABLE' };
    }
    if (!opening) {
      return { key: 'CHECK_IN_OPENING_TIME_UNAVAILABLE' };
    }
    if (!closing) {
      return { key: 'CHECK_IN_CLOSING_TIME_UNAVAILABLE' };
    }
  
    const unavailableStatuses = new Set([
      'serviceNotSupported',
      'ineligible',
      'deeplinkInhibition',
      'firstFlightOtherAirline',
      'notAvailable',
    ]);
    if (unavailableStatuses.has(params.checkInStatus)) {
      return { key: 'CHECK_IN_UNAVAILABLE' };
    }
  
    const nowMs = now.getTime();
    const openingMs = opening.getTime();
    const closingMs = closing.getTime();
  
    if (nowMs >= closingMs) {
      return { key: 'CHECK_IN_CLOSED_ON', params: { date: formatDdMmmUtc(closing) } };
    }
  
    if (nowMs < openingMs) {
      const secondsBeforeOpening = Math.max(0, Math.floor((openingMs - nowMs) / 1000));
  
      if (secondsBeforeOpening >= 259200) {
        return { key: 'CHECK_IN_NOT_YET_OPEN' };
      }
  
      if (secondsBeforeOpening < 3600) {
        return { key: 'CHECK_IN_OPENS_IN_MINUTES', params: { minutes: Math.floor(secondsBeforeOpening / 60) } };
      }
  
      if (secondsBeforeOpening <= 108000) {
        return {
          key: 'CHECK_IN_OPENS_IN_HOURS_MINUTES',
          params: {
            hours: Math.floor(secondsBeforeOpening / 3600),
            minutes: Math.floor((secondsBeforeOpening % 3600) / 60),
          },
        };
      }
  
      const days = Math.floor(secondsBeforeOpening / 86400);
      const hours = Math.floor((secondsBeforeOpening % 86400) / 3600);
      if (days === 1) {
        return { key: 'CHECK_IN_OPENS_IN_DAY_HOURS', params: { days: 1, hours } };
      }
      return { key: 'CHECK_IN_OPENS_IN_DAYS_HOURS', params: { days, hours } };
    }
  
    const secondsBeforeClosing = Math.max(0, Math.floor((closingMs - nowMs) / 1000));
    if (secondsBeforeClosing < 3600) {
      return { key: 'CHECK_IN_CLOSES_IN_MINUTES', params: { minutes: Math.floor(secondsBeforeClosing / 60) } };
    }
    if (secondsBeforeClosing <= 108000) {
      return {
        key: 'CHECK_IN_CLOSES_IN_HOURS_MINUTES',
        params: {
          hours: Math.floor(secondsBeforeClosing / 3600),
          minutes: Math.floor((secondsBeforeClosing % 3600) / 60),
        },
      };
    }
    if (secondsBeforeClosing < 259200) {
      const days = Math.floor(secondsBeforeClosing / 86400);
      const hours = Math.floor((secondsBeforeClosing % 86400) / 3600);
      if (days === 1) {
        return { key: 'CHECK_IN_CLOSES_IN_DAY_HOURS', params: { days: 1, hours } };
      }
      return { key: 'CHECK_IN_CLOSES_IN_DAYS_HOURS', params: { days, hours } };
    }
    return { key: 'CHECK_IN_CLOSES_ON', params: { date: formatDdMmmUtc(closing) } };
  }
  
  
  function computeJourneyEligibility(data: JourneysListReply): JourneyEligibilityResponse {
    try {
      const journeys = Array.isArray(data?.journeys) ? data.journeys : [];
      const genericEligibilities = Array.isArray(data?.genericEligibilities) ? data.genericEligibilities : [];
   
      const results: JourneyEligibilityResult[] = journeys.map((journey) => {
        const journeyId = String(journey?.id ?? '');
   
        const accepted =
          journey.acceptance?.isAccepted === true ||
          (journey.acceptance?.checkedInJourneyElements?.length ?? 0) > 0;

   
        let checkInStatus = 'ineligible';
        let matchedRule: string | null = null;
        let matchedEligibility: GenericEligibility | null = null;
   
        // ---- 1) If accepted -> completed (strongest signal)
        if (accepted) {
          checkInStatus = 'completed';
          matchedRule = 'Acceptance.isAccepted';
          matchedEligibility = null;
        } else {
          // helper to match any eligibility name for this journey
          const findEligibility = (names: string[]) =>
            genericEligibilities.find((e) => {
              if (!e || typeof e !== 'object') return false;
              if (e.isEligible !== true) return false;
              const ids = Array.isArray(e.journeyIds) ? e.journeyIds : [];
              if (!ids.includes(journeyId)) return false;
   
              const n = normalizeEligibilityName(e.eligiblityName);
              return names.map((x) => x.toLowerCase()).includes(n);
            });
   
          // ---- 2) Your requirement: if isCheckInOpen/opened=true -> opened
          const openMatch = findEligibility(['ischeckinopen', 'ischeckinopened']);
          if (openMatch) {
            checkInStatus = 'opened';
            matchedRule = 'IsCheckInOpened';
            matchedEligibility = openMatch;
          } else {
            // ---- 3) Fallback ordered rules (excluding opened because handled above)
            const rules: Array<{ ruleName: string; status: string }> = [
              { ruleName: 'IsBusJourney', status: 'busJourney' },
              { ruleName: 'IsTrainJourney', status: 'trainJourney' },
              { ruleName: 'IsFirstFlightOtherAirline', status: 'firstFlightOtherAirline' },
              { ruleName: 'IsCheckInCompleted', status: 'completed' },
              { ruleName: 'IsDeeplinkInhibition', status: 'deeplinkInhibition' },
              { ruleName: 'IsCheckInNotAvailable', status: 'notAvailable' },
              { ruleName: 'IsPartialClosedNotFlown', status: 'partialClosedNotFlown' },
              { ruleName: 'IsPartial', status: 'partial' },
              { ruleName: 'IsCheckedInAndClosedNotFlown', status: 'checkedInAndClosedNotFlown' },
              { ruleName: 'IsCheckInClosedNotFlown', status: 'closedNotFlown' },
              { ruleName: 'IsNotOpened', status: 'notOpened' },
              { ruleName: 'ServiceNotSupported', status: 'serviceNotSupported' },
            ];
   
            for (const rule of rules) {
              const match = genericEligibilities.find((e) => {
                if (!e || typeof e !== 'object') return false;
                if (e.isEligible !== true) return false;
                if (normalizeEligibilityName(e.eligiblityName) !== normalizeEligibilityName(rule.ruleName)) return false;
                const ids = Array.isArray(e.journeyIds) ? e.journeyIds : [];
                return ids.includes(journeyId);
              });
   
              if (match) {
                checkInStatus = rule.status;
                matchedRule = rule.ruleName;
                matchedEligibility = match;
                break;
              }
            }
          }
        }
   
        const operatingAirlineName = 'EY';
   
        let messageKey: string | null = null;
        let message: string | null = null;
        if (
          checkInStatus === 'serviceNotSupported' ||
          checkInStatus === 'ineligible' ||
          checkInStatus === 'deeplinkInhibition'
        ) {
          messageKey = 'CHECK_IN_UNAVAILABLE';
          message = 'Check-in not available online, please check-in at the airport';
        } else if (checkInStatus === 'firstFlightOtherAirline') {
          messageKey = 'CHECK_IN_OTHER_AIRLINE';
          message = operatingAirlineName
            ? `Please check-in at ${operatingAirlineName} website`
            : 'Please check-in at the operating airline website';
        }
   
        // ---- 4) Correct window source: journey window OR journeyElement window fallback
        const window =
          journey.acceptanceEligibility?.eligibilityWindow;
   
        const checkInMessage = computeCheckInMessage({
          checkInStatus,
          openingDateAndTime: window?.openingDateAndTime,
          closingDateAndTime: window?.closingDateAndTime,
        });
   
        return {
          journeyId,
          checkInStatus,
          matchedRule,
          matchedEligibility,
          messageKey,
          message,
          operatingAirlineName,
          checkInMessage,
        };
      });
   
      return { eligibility: { journeys: results }, error: null };
    } catch (e: any) {
      return { eligibility: null, error: e?.message ?? 'Failed to compute eligibility' };
    }
  }
  
  /**
   * MCP tool: Fetch journey then compute eligibility deterministically.
   */
  export const ssciIdentificationJourneyEligibilityMcpTool = {
    name: 'ssci_identification_journey_eligibility',
    definition: {
      description:
        'Call SSCI Journey Identification API and return computed check-in eligibility/messages (opens in / closed on / not open yet).',
      inputSchema: SsciJourneyIdentificationSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    handler:
    (journeyService: SsciJourneyIdentificationService) =>
    async (input: SsciJourneyIdentificationToolInput): Promise<McpToolResponse> => {
      try {
        const { headers, ...payload } = input;
   
        const apiPayload: JourneyIdentificationRequestPayload = {
          identifier: payload.identifier,
          lastName: payload.lastName,
          encrypted: payload.encrypted ?? false,
          firstName: payload.firstName ?? null,
          program: payload.program ?? null,
          encryptedParameters: payload.encryptedParameters ?? null,
        };
   
        let apiRes: JourneysListReply;
   
        if (isMockEnabled()) {
          await maybeMockDelay();
          apiRes = buildMockJourneyResponse(apiPayload.identifier, apiPayload.lastName);
        } else {
          const headerOverrides =
            headers && typeof headers === 'object'
              ? (Object.fromEntries(
                  Object.entries(headers).filter(([, v]) => typeof v === 'string' && v.length > 0),
                ) as Partial<Record<string, string>>)
              : undefined;
   
          apiRes = await journeyService.fetchJourneyIdentification(apiPayload, headerOverrides);
        }
   
        return toToolResponse(computeJourneyEligibility(apiRes));
      } catch (e: any) {
        return toToolResponse({
          eligibility: null,
          error: e?.message ?? 'ssci_identification_journey_eligibility failed',
        });
      }
    },
  } as const;
  
  