#!/usr/bin/env node
/**
 * Purpose: Run the project standardization checks through one deterministic entry point.
 * Owner: quality:standardization
 * Responsibility: Orchestrate format, Skill, structure, generated-file, and report components.
 */

import { checkGeneratedFiles, checkManagedJson, checkManagedText } from './lib/format-checks.mjs'
import { checkBaselineHashPortability } from './lib/baseline-checks.mjs'
import { reportStandardization } from './lib/report.mjs'
import { checkSkills } from './lib/skill-checks.mjs'
import { checkCheckerSourcePackaging } from './lib/source-package-checks.mjs'
import { checkStructure } from './lib/structure-checks.mjs'

checkManagedText()
checkSkills()
checkManagedJson()
checkGeneratedFiles()
checkBaselineHashPortability()
checkCheckerSourcePackaging()
reportStandardization(checkStructure())
