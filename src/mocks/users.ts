import type { User } from '../domain'
import { asUserId, asOrgId } from '../lib/ids'

export const users: readonly User[] = [
  {
    id: asUserId('usr_amelia'),
    orgId: asOrgId('org_acme'),
    email: 'amelia.chen@acmecap.example',
    displayName: 'Amelia Chen',
    role: 'pm',
    createdAt: '2025-09-14T10:00:00.000Z',
  },
  {
    id: asUserId('usr_ben'),
    orgId: asOrgId('org_acme'),
    email: 'ben.torres@acmecap.example',
    displayName: 'Ben Torres',
    role: 'analyst',
    createdAt: '2025-10-02T10:00:00.000Z',
  },
  {
    id: asUserId('usr_clara'),
    orgId: asOrgId('org_northstar'),
    email: 'clara.olsen@northstar.example',
    displayName: 'Clara Olsen',
    role: 'analyst',
    createdAt: '2026-01-08T10:00:00.000Z',
  },
]

export const DEFAULT_USER_ID = users[0]!.id
