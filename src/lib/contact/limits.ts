/** Délkové limity kontaktního formuláře (sdílené klientem i serverem). */
export const LIMITS = {
  nameMin: 2,
  nameMax: 80,
  emailMax: 254,
  messageMin: 10,
  messageMax: 4000,
} as const;
