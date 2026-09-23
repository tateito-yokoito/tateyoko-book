// New/changed PINs are four ASCII digits. Existing stored hashes are not migrated.
export const isWebBookPin = value => value === '' || (value.length === 4 && /^[0-9]{4}$/.test(value));
