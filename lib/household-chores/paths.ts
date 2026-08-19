import { TASKS_PATH } from './contracts'

export const householdChoreCirclePath = (circleId: string) =>
  `${TASKS_PATH}/${circleId}`

export const householdChoreInvitationPath = (invitationId: string) =>
  `${TASKS_PATH}/bod/${invitationId}`

export const householdChoreMembershipsPath = () =>
  `${TASKS_PATH}/adild`

export const householdChoreNewCirclePath = () =>
  `${TASKS_PATH}/hringir/nyr`

export const householdChorePeoplePath = (circleId: string) =>
  `${householdChoreCirclePath(circleId)}/folk`

export const householdChoreDefinitionsPath = (circleId: string) =>
  `${householdChoreCirclePath(circleId)}/verk`

export const householdChoreNewDefinitionPath = (circleId: string) =>
  `${householdChoreDefinitionsPath(circleId)}/nytt`

export const householdChoreDefinitionPath = (
  circleId: string,
  definitionId: string,
) => `${householdChoreDefinitionsPath(circleId)}/${definitionId}`

export const householdChoreEditDefinitionPath = (
  circleId: string,
  definitionId: string,
) => `${householdChoreDefinitionPath(circleId, definitionId)}/breyta`

export const householdChoreAssignPath = (circleId: string) =>
  `${householdChoreCirclePath(circleId)}/utdeila`

export const householdChoreSelfServicePath = (circleId: string) =>
  `${householdChoreCirclePath(circleId)}/taka-ad-mer`

export const householdChoreAssignmentPath = (
  circleId: string,
  assignmentId: string,
) => `${householdChoreCirclePath(circleId)}/framkvaemdir/${assignmentId}`
