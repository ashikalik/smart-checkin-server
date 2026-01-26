export const SsciJourneyIdentificationSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['identifier', 'lastName', 'encrypted'],
    properties: {
      identifier: { type: 'string', minLength: 1, description: 'Record locator / identifier' },
      lastName: { type: 'string', minLength: 1 },
      encrypted: { type: 'boolean' },
      firstName: { type: ['string', 'null'] },
      program: { type: ['string', 'null'] },
      encryptedParameters: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] },
      headers: {
        type: 'object',
        description:
          'Optional header overrides (e.g. x-correlation-id, x-transaction-id). Values here override defaults.',
        additionalProperties: { type: 'string' },
      },
    },
  } as const;
  