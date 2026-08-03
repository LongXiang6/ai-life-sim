#!/usr/bin/env node
/**
 * Purpose: Run the project standardization checks through one deterministic entry point.
 * Owner: quality:standardization
 * Responsibility: Orchestrate format, Skill, structure, generated-file, and report components.
 */

import { checkGeneratedFiles, checkManagedJson, checkManagedText } from './lib/format-checks.mjs'
import { reportStandardization } from './lib/report.mjs'
import { checkSkills } from './lib/skill-checks.mjs'
import { checkStructure } from './lib/structure-checks.mjs'

checkManagedText()
checkSkills()
checkManagedJson()
checkGeneratedFiles()
reportStandardization(checkStructure())
