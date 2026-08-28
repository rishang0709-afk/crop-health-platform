# Database Design

## User

Fields:

- _id
- name
- email
- passwordHash
- role
- language
- location
- createdAt

Roles:

- farmer
- extension_worker
- expert
- admin

---

## Field

Fields:

- _id
- userId
- name
- crop
- variety
- growthStage
- area
- latitude
- longitude
- createdAt

---

## Detection

Fields:

- _id
- userId
- fieldId
- imageUrl
- crop
- prediction
- confidence
- severity
- riskScore
- weatherSnapshot
- latitude
- longitude
- status
- createdAt

---

## ExpertReview

Fields:

- _id
- detectionId
- expertId
- decision
- correctedDisease
- comment
- createdAt

---

## Alert

Fields:

- _id
- userId
- type
- title
- message
- severity
- location
- read
- createdAt