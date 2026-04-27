## ADDED Requirements

### Requirement: Field and form ordering use a single reorder contract
The system SHALL treat drag sorting and manual sequence editing as two UI entry points for the same reorder contract, using the existing reorder endpoints as the only persisted ordering path.

#### Scenario: Drag sorting immediately updates local ordering and then persists
- **WHEN** the user drags a field or form within a complete unfiltered list
- **THEN** the frontend immediately reorders the local list and recalculates dense `order_index` values from `1..n`
- **AND** it persists the complete ordered ID set through the existing reorder endpoint for that scope
- **AND** it reloads after persistence to align with backend truth

#### Scenario: Manual sequence editing uses the same reorder path
- **WHEN** the user changes a field or form sequence through the number input in a complete unfiltered list
- **THEN** the frontend computes the full reordered ID list in memory
- **AND** it persists that list through the existing reorder endpoint for the scope
- **AND** it does not route the change through unrelated entity update flows

#### Scenario: Reorder read-back is stable
- **WHEN** a valid complete ordered ID set is submitted to reorder
- **THEN** subsequent list reads return the same relative ordering
- **AND** the persisted `order_index` values for the scope remain dense `1..n`

#### Scenario: Invalid reorder payload does not mutate state
- **WHEN** a reorder payload is missing IDs, contains duplicate IDs, contains IDs from another scope, or contains unknown IDs
- **THEN** the backend rejects the request
- **AND** the existing ordering state remains unchanged

### Requirement: Filtering disables all ordering interactions
The system SHALL disable both drag sorting and manual sequence editing whenever the list is in a filtered or searched state.

#### Scenario: Field list disables drag and manual order editing while filtered
- **WHEN** the field list has an active search or filter keyword
- **THEN** drag sorting is disabled
- **AND** manual sequence inputs are disabled

#### Scenario: Form list disables drag and manual order editing while filtered
- **WHEN** the form list has an active search or filter keyword
- **THEN** drag sorting is disabled
- **AND** manual sequence inputs are disabled
