// Building production assets is not permission to release the new contract/UI.
// Test credentials must be supplied separately; never infer them from NODE_ENV.
export function experienceRollout(env = {}) {
  const testOnly = env.VITE_EXPERIENCE_V2_TEST_ONLY === 'true';
  const contracts = testOnly || env.VITE_EXPERIENCE_V2_ENABLED === 'true';
  return {
    testOnly,
    contracts,
    conversion: contracts && (testOnly || env.VITE_TRIAL_CONVERSION_ENABLED === 'true'),
    notifications: !testOnly && env.VITE_EXPERIENCE_NOTIFICATIONS_ENABLED === 'true',
  };
}
