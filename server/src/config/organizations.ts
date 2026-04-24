import {
  organizations, users, brokers, sectors, stocks,
  DEFAULT_ORG_ID, DEFAULT_USER_ID,
} from '../../../src/mocks'

// Reference data seeded into the in-memory store at server startup. In
// production this would come from a database; for the fixture-backed proof
// we share the same canonical directory the frontend uses so broker IDs,
// sector IDs and ticker strings line up 1:1 across ingestion, API, and UI.
export {
  organizations,
  users,
  brokers,
  sectors,
  stocks,
  DEFAULT_ORG_ID,
  DEFAULT_USER_ID,
}
