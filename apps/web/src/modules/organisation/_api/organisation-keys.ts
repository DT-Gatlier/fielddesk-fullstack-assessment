export const organisationKeys = {
  all: ['organisation'] as const,
  current: () => [...organisationKeys.all, 'current'] as const,
};
