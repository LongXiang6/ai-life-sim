import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import Database from 'better-sqlite3'

const projectRoot = process.cwd()
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-game-record-migration-'))
const accountDatabase = path.join(tempRoot, 'accounts.sqlite')
const playerContentDatabase = path.join(tempRoot, 'player-content.sqlite')
const backupDirectory = path.join(tempRoot, 'backup')
const migrationCommand = path.join('scripts', 'ops', 'migrate-game-record-lifespan-adjustments.ts')
const typescriptLoader = pathToFileURL(path.join(projectRoot, 'scripts', 'check', 'lib', 'typescript-loader.mjs')).href

function currentRecord(recordId) {
  return {
    recordId,
    completedAt: 10,
    characterName: 'Migration Player',
    worldName: 'Migration World',
    finalAge: 80,
    rounds: 1,
    died: false,
    moralityLabel: 'Neutral',
    overallScore: 0,
    dimensions: [],
    destinyNames: [],
    achievements: [{
      id: `${recordId}-adjustment`,
      kind: 'lifespan-adjustment',
      title: 'Lifespan adjustment',
      detail: 'The literal word breakthroughs in prose must remain unchanged.',
      timeLabel: 'Round 1',
    }],
    scoring: {
      version: 1,
      profile: {
        profileVersion: 1,
        worldId: 'migration-world',
        dimensions: [
          {
            id: 'growth',
            label: 'Growth',
            description: 'Growth evidence',
            weight: 34,
            evidenceKinds: ['attributes', 'lifespan-adjustments'],
            curveId: 'growth',
          },
          {
            id: 'agency',
            label: 'Agency',
            description: 'Agency evidence',
            weight: 33,
            evidenceKinds: ['choices'],
            curveId: 'agency',
          },
          {
            id: 'impact',
            label: 'Impact',
            description: 'Impact evidence',
            weight: 33,
            evidenceKinds: ['achievements', 'completion'],
            curveId: 'impact',
          },
        ],
      },
      rawScore: 0,
      validCompletedLife: false,
      evidence: {
        attributes: 0,
        journey: 0,
        choices: 0,
        'lifespan-adjustments': 0,
        achievements: 0,
        completion: 0,
      },
      integrity: {
        passed: false,
        perfectGatePassed: false,
        checks: {},
        reasons: [],
      },
      audit: {
        schemaVersion: 1,
        lifeRunId: `life-${recordId}`,
        committedRounds: 1,
        narrativeIds: [],
        resolvedChoiceCount: 0,
        lifespanAdjustmentCount: 1,
        achievementIds: [`${recordId}-adjustment`],
        completed: true,
        terminalCommitted: true,
        stateTransitionsTrusted: true,
        hasValidationFailure: false,
        transitionAudits: [],
      },
    },
    gameVersion: '5.6.8',
  }
}

function legacyRecord(recordId) {
  const record = structuredClone(currentRecord(recordId))
  record.achievements[0].kind = 'breakthrough'
  record.scoring.profile.dimensions[0].evidenceKinds = ['attributes', 'breakthroughs']
  record.scoring.evidence.breakthroughs = record.scoring.evidence['lifespan-adjustments']
  delete record.scoring.evidence['lifespan-adjustments']
  record.scoring.audit.breakthroughCount = record.scoring.audit.lifespanAdjustmentCount
  delete record.scoring.audit.lifespanAdjustmentCount
  return record
}

function runMigration(mode, ...args) {
  return execFileSync(process.execPath, [
    '--no-warnings=ExperimentalWarning',
    '--loader', typescriptLoader,
    migrationCommand,
    mode,
    '--player-content-database', playerContentDatabase,
    '--account-database', accountDatabase,
    ...args,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
}

async function backupDatabase(sourcePath, destinationPath) {
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true })
  try {
    await source.backup(destinationPath)
  } finally {
    source.close()
  }
}

function readJson(databasePath, table, column, recordId) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const row = database.prepare(`SELECT ${column} AS payload FROM ${table} WHERE record_id = ?`).get(recordId)
    return JSON.parse(row.payload)
  } finally {
    database.close()
  }
}

try {
  await fs.mkdir(backupDirectory)
  const legacy = legacyRecord('legacy-record')

  const accounts = new Database(accountDatabase)
  accounts.exec(`
    CREATE TABLE account_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO account_meta(key, value) VALUES ('schema_version', '5');
    CREATE TABLE account_game_records (
      account_id TEXT NOT NULL,
      slot INTEGER NOT NULL,
      record_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, slot),
      UNIQUE (account_id, record_id)
    );
  `)
  accounts.prepare(`
    INSERT INTO account_game_records(account_id, slot, record_id, data_json, updated_at)
    VALUES ('account-legacy', 1, 'legacy-record', ?, 10)
  `).run(JSON.stringify(legacy))
  accounts.close()

  const playerContent = new Database(playerContentDatabase)
  playerContent.exec(`
    CREATE TABLE player_content_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO player_content_meta(key, value) VALUES ('schema_version', '5');
    CREATE TABLE leaderboard_best_runs (
      account_id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      rounds INTEGER NOT NULL,
      completed_at INTEGER NOT NULL,
      record_json TEXT NOT NULL,
      portrait_asset_id TEXT,
      updated_at INTEGER NOT NULL
    );
  `)
  playerContent.prepare(`
    INSERT INTO leaderboard_best_runs(
      account_id, record_id, score, rounds, completed_at, record_json, portrait_asset_id, updated_at
    ) VALUES ('account-legacy', 'legacy-record', 100, 1, 10, ?, NULL, 10)
  `).run(JSON.stringify(legacy))
  playerContent.close()

  await backupDatabase(accountDatabase, path.join(backupDirectory, 'accounts.sqlite'))
  await backupDatabase(playerContentDatabase, path.join(backupDirectory, 'player-content.sqlite'))

  assert.match(runMigration('apply'), /"mode":"apply"/)
  assert.match(runMigration('verify'), /"mode":"verify"/)
  for (const [databasePath, table, column] of [
    [accountDatabase, 'account_game_records', 'data_json'],
    [playerContentDatabase, 'leaderboard_best_runs', 'record_json'],
  ]) {
    const migrated = readJson(databasePath, table, column, 'legacy-record')
    assert.equal(migrated.achievements[0].kind, 'lifespan-adjustment')
    assert.deepEqual(migrated.scoring.profile.dimensions[0].evidenceKinds, ['attributes', 'lifespan-adjustments'])
    assert.equal(migrated.scoring.audit.lifespanAdjustmentCount, 1)
    assert.equal(migrated.scoring.evidence['lifespan-adjustments'], 0)
    assert.equal(migrated.achievements[0].detail, 'The literal word breakthroughs in prose must remain unchanged.')
  }

  const current = currentRecord('candidate-record')
  const accountCandidate = new Database(accountDatabase)
  accountCandidate.prepare(`
    INSERT INTO account_game_records(account_id, slot, record_id, data_json, updated_at)
    VALUES ('account-candidate', 1, 'candidate-record', ?, 20)
  `).run(JSON.stringify(current))
  accountCandidate.close()
  const playerCandidate = new Database(playerContentDatabase)
  playerCandidate.prepare(`
    INSERT INTO leaderboard_best_runs(
      account_id, record_id, score, rounds, completed_at, record_json, portrait_asset_id, updated_at
    ) VALUES ('account-candidate', 'candidate-record', 100, 1, 20, ?, NULL, 20)
  `).run(JSON.stringify(current))
  playerCandidate.close()

  assert.match(
    runMigration('rollback', '--backup-directory', backupDirectory),
    /"mode":"rollback"/,
  )
  assert.equal(readJson(accountDatabase, 'account_game_records', 'data_json', 'legacy-record').achievements[0].kind, 'breakthrough')
  assert.equal(readJson(playerContentDatabase, 'leaderboard_best_runs', 'record_json', 'legacy-record').achievements[0].kind, 'breakthrough')

  const accountArchive = path.join(backupDirectory, 'accounts-game-record-lifespan-adjustments-rollback.sqlite')
  const playerArchive = path.join(backupDirectory, 'player-content-game-record-lifespan-adjustments-rollback.sqlite')
  assert.equal(readJson(accountArchive, 'account_game_records', 'data_json', 'candidate-record').achievements[0].kind, 'lifespan-adjustment')
  assert.equal(readJson(playerArchive, 'leaderboard_best_runs', 'record_json', 'candidate-record').achievements[0].kind, 'lifespan-adjustment')

  assert.match(
    runMigration('rollback', '--backup-directory', backupDirectory),
    /"mode":"rollback"/,
  )
  console.log('[game-record-lifespan-adjustment-migration-smoke] PASS')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}
