export const SsciRetrieveOrderGqlSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['lastName', 'recordLocator'],
    properties: {
      lastName: { type: 'string', minLength: 1 },
      recordLocator: { type: 'string', minLength: 1 },
      headers: {
        type: 'object',
        description:
          'Optional header overrides (e.g. x-correlation-id, x-transaction-id). Values here override defaults.',
        additionalProperties: { type: 'string' },
      },
    },
  } as const;