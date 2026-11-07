codex
The new admin candidate listing omits currency evidence required to review EPS candidates whose currency is inherited from their table.

Review comment:

- [P2] Include currency evidence in candidate citations — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/app/api/admin/documents/candidates/route.ts:19-19
  For EPS candidates expressed in `仙` or `cents`, `generate.ts` stores the inherited table currency in `citations.unit_currency`, but this whitelist omits that role. Consequently the admin listing drops the citation ID and snippet needed to verify the candidate's currency before confirmation, even though `promote.ts` subsequently publishes that evidence. Include `unit_currency` in the collected and returned citations and cover this case in the route test.
The new admin candidate listing omits currency evidence required to review EPS candidates whose currency is inherited from their table.

Review comment:

- [P2] Include currency evidence in candidate citations — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/document-pipeline-3cfbb4/src/app/api/admin/documents/candidates/route.ts:19-19
  For EPS candidates expressed in `仙` or `cents`, `generate.ts` stores the inherited table currency in `citations.unit_currency`, but this whitelist omits that role. Consequently the admin listing drops the citation ID and snippet needed to verify the candidate's currency before confirmation, even though `promote.ts` subsequently publishes that evidence. Include `unit_currency` in the collected and returned citations and cover this case in the route test.
