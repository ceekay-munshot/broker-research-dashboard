import type { User } from '../domain'
import { asUserId, asOrgId } from '../lib/ids'

export const users: readonly User[] = [
  {
    id: asUserId('usr_arjun'),
    orgId: asOrgId('org_aranya'),
    email: 'arjun.mehta@aranyacap.example',
    displayName: 'Arjun Mehta',
    role: 'pm',
    createdAt: '2025-09-14T10:00:00.000Z',
  },
  {
    id: asUserId('usr_kavita'),
    orgId: asOrgId('org_aranya'),
    email: 'kavita.iyer@aranyacap.example',
    displayName: 'Kavita Iyer',
    role: 'analyst',
    createdAt: '2025-10-02T10:00:00.000Z',
  },
  {
    id: asUserId('usr_nikhil'),
    orgId: asOrgId('org_sahyadri'),
    email: 'nikhil.desai@sahyadri.example',
    displayName: 'Nikhil Desai',
    role: 'analyst',
    createdAt: '2026-01-08T10:00:00.000Z',
  },
]

export const DEFAULT_USER_ID = users[0]!.id
