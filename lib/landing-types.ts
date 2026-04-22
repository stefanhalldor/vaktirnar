export type GuardianRole = 'FULL_FORSJA' | 'UMSJON' | 'ADSTOD';

export const ROLE_PERMISSIONS = {
  FULL_FORSJA: {
    label: 'Full forsjá',
    color: 'blue',
    canPickup: true,
    canApprove: true,
    canEditTeam: true,
    description: 'Má sækja · má samþykkja',
  },
  UMSJON: {
    label: 'Umsjón',
    color: 'green',
    canPickup: true,
    canApprove: true,
    canEditTeam: false,
    description: 'Má sækja · má samþykkja',
  },
  ADSTOD: {
    label: 'Aðstoð',
    color: 'gray',
    canPickup: true,
    canApprove: false,
    canEditTeam: false,
    description: 'Má sækja',
  },
} as const;
