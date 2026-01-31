export interface JourneyIdentificationRequestPayload {
    identifier: string;
    lastName: string;
    encrypted: boolean;
    firstName: string | null;
    program: string | null;
    encryptedParameters: unknown | null;
  }