export const config = {
  pagination: { defaultLimit: 20, maxLimit: 100 },
  rateLimit: { requests: 100, window: '1 m' as const, prefix: 'freelance-api:v1' },
};
