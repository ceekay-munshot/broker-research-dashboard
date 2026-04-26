// Barrel for delivery templates + a list helper.

import type { DeliveryTemplateImpl } from '../types'
import { morningBookBriefTemplate } from './morningBookBrief'
import { intradayCriticalTemplate } from './intradayCritical'
import { coverageHygieneTemplate } from './coverageHygiene'
import { weeklyCatalystBriefTemplate } from './weeklyCatalystBrief'
import { sourceHealthIncidentTemplate } from './sourceHealthIncident'

export const ALL_TEMPLATES: readonly DeliveryTemplateImpl[] = [
  morningBookBriefTemplate,
  intradayCriticalTemplate,
  coverageHygieneTemplate,
  weeklyCatalystBriefTemplate,
  sourceHealthIncidentTemplate,
] as const

export {
  morningBookBriefTemplate, intradayCriticalTemplate, coverageHygieneTemplate,
  weeklyCatalystBriefTemplate, sourceHealthIncidentTemplate,
}
