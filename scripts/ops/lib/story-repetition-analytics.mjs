const HIGH_WORD_REPEAT_RATE = 0.8
const HIGH_NGRAM_SIMILARITY = 0.85
const WATCH_WORD_REPEAT_RATE = 0.6
const WATCH_NGRAM_SIMILARITY = 0.7
const RECENT_ROUNDS = 5
const TREND_ROUNDS = 6
const TREND_DELTA = 0.08

export function operationalTimestamp(record) {
  const raw = record?.receivedAt ?? record?.timestamp
  const value = typeof raw === 'number' ? raw : Date.parse(String(raw ?? ''))
  return Number.isFinite(value) ? value : 0
}

export function diagnosticCodeOf(record) {
  if (typeof record?.diagnosticCode === 'string' && record.diagnosticCode) return record.diagnosticCode
  if (typeof record?.diagnostic_code === 'string' && record.diagnostic_code) return record.diagnostic_code
  return undefined
}

export function deriveStoryRepetitionQuality(metric) {
  const wordRepeatRate = Number(metric?.wordRepeatRate)
  const ngramSimilarity = Number(metric?.maxRecentNgramSimilarity)
  if (wordRepeatRate >= HIGH_WORD_REPEAT_RATE || ngramSimilarity >= HIGH_NGRAM_SIMILARITY) return 'high'
  if (wordRepeatRate >= WATCH_WORD_REPEAT_RATE || ngramSimilarity >= WATCH_NGRAM_SIMILARITY) return 'watch'
  return 'normal'
}

function metricOf(record) {
  return record?.metric && typeof record.metric === 'object' ? record.metric : undefined
}

function storyIdentity(record) {
  const metric = metricOf(record)
  if (!metric || metric.kind !== 'story_repetition' || typeof metric.lifeRunId !== 'string' || !metric.lifeRunId) {
    return undefined
  }
  const round = Number(metric.round)
  if (!Number.isSafeInteger(round) || round < 1) return undefined
  const player = diagnosticCodeOf(record) || 'anonymous'
  return {
    canonicalKey: JSON.stringify([player, metric.lifeRunId, round]),
    gameKey: JSON.stringify([player, metric.lifeRunId]),
    round,
  }
}

function numericRate(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1 ? numeric : undefined
}

function normalizeStoryRow(entry) {
  const identity = storyIdentity(entry.record)
  const metric = metricOf(entry.record)
  if (!identity || !metric) return undefined
  const windowSize = Number(metric.windowSize)
  const maxWindowSize = Math.min(identity.round - 1, RECENT_ROUNDS)
  const wordRepeatRate = numericRate(metric.wordRepeatRate)
  const maxRecentWordOverlap = numericRate(metric.maxRecentWordOverlap)
  const maxRecentNgramSimilarity = numericRate(metric.maxRecentNgramSimilarity)
  if (
    !Number.isSafeInteger(windowSize)
    || windowSize < 0
    || windowSize > maxWindowSize
    || wordRepeatRate === undefined
    || maxRecentWordOverlap === undefined
    || maxRecentNgramSimilarity === undefined
  ) return undefined
  return {
    gameKey: identity.gameKey,
    round: identity.round,
    windowSize,
    wordRepeatRate,
    maxRecentWordOverlap,
    maxRecentNgramSimilarity,
    qualityLevel: deriveStoryRepetitionQuality(metric),
    timestamp: entry.timestamp,
    sequence: entry.sequence,
  }
}

export function buildCanonicalStoryRepetitionSet(records) {
  const passthrough = []
  const latestByRound = new Map()
  records.forEach((record, sequence) => {
    const entry = { record, sequence, timestamp: operationalTimestamp(record) }
    const identity = storyIdentity(record)
    if (!identity) {
      passthrough.push(entry)
      return
    }
    const existing = latestByRound.get(identity.canonicalKey)
    if (
      !existing
      || entry.timestamp > existing.timestamp
      || (entry.timestamp === existing.timestamp && entry.sequence > existing.sequence)
    ) latestByRound.set(identity.canonicalKey, entry)
  })

  const entries = [...passthrough, ...latestByRound.values()]
    .sort((left, right) => left.timestamp - right.timestamp || left.sequence - right.sequence)
  const normalizedRows = [...latestByRound.values()]
    .map(normalizeStoryRow)
    .filter(Boolean)
  const firstObservedByGame = new Map()
  for (const row of normalizedRows) {
    const existing = firstObservedByGame.get(row.gameKey)
    if (
      !existing
      || row.timestamp < existing.timestamp
      || (row.timestamp === existing.timestamp && row.sequence < existing.sequence)
    ) firstObservedByGame.set(row.gameKey, row)
  }
  const gameOrdinals = new Map(
    [...firstObservedByGame.entries()]
      .sort((left, right) => (
        left[1].timestamp - right[1].timestamp
        || left[1].sequence - right[1].sequence
        || left[0].localeCompare(right[0])
      ))
      .map(([gameKey], index) => [gameKey, index + 1]),
  )
  return {
    records: entries.map((entry) => entry.record),
    rows: normalizedRows
      .map((row) => ({
        ...row,
        gameOrdinal: gameOrdinals.get(row.gameKey),
        gameAlias: `game-${gameOrdinals.get(row.gameKey)}`,
      }))
      .sort((left, right) => left.timestamp - right.timestamp || left.sequence - right.sequence),
  }
}

function average(values) {
  return values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))
    : 0
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0
}

function trendOf(rows) {
  const sample = rows.slice(-Math.min(TREND_ROUNDS, rows.length))
  if (sample.length < 2) return 'stable'
  const midpoint = Math.floor(sample.length / 2)
  const first = average(sample.slice(0, midpoint).map((row) => row.wordRepeatRate))
  const second = average(sample.slice(midpoint).map((row) => row.wordRepeatRate))
  return second - first > TREND_DELTA ? 'rising' : first - second > TREND_DELTA ? 'falling' : 'stable'
}

function summarizeGames(rows) {
  const grouped = new Map()
  for (const row of rows) {
    const gameRows = grouped.get(row.gameKey) ?? []
    gameRows.push(row)
    grouped.set(row.gameKey, gameRows)
  }
  return [...grouped.entries()].map(([gameKey, gameRows]) => {
    const observed = [...gameRows].sort((left, right) => left.round - right.round)
    const compared = observed.filter((row) => row.windowSize > 0)
    const recent = compared.slice(-RECENT_ROUNDS)
    const peak = compared.reduce((best, row) => (
      !best || row.wordRepeatRate > best.wordRepeatRate ? row : best
    ), undefined)
    const highRepeatRounds = compared.filter((row) => row.qualityLevel === 'high').length
    return {
      gameKey,
      gameOrdinal: observed[0].gameOrdinal,
      gameAlias: observed[0].gameAlias,
      observedRows: observed,
      comparedRows: compared,
      recentRows: recent,
      observedRounds: observed.length,
      comparedRounds: compared.length,
      lastRound: observed.at(-1)?.round ?? 0,
      averageWordRepeatRate: average(compared.map((row) => row.wordRepeatRate)),
      recentAverageWordRepeatRate: average(recent.map((row) => row.wordRepeatRate)),
      peakWordRepeatRate: peak?.wordRepeatRate ?? 0,
      peakRound: peak?.round ?? null,
      maxRecentNgramSimilarity: compared.length
        ? Number(Math.max(...compared.map((row) => row.maxRecentNgramSimilarity)).toFixed(4))
        : 0,
      highRepeatRounds,
      highRepeatRatio: ratio(highRepeatRounds, compared.length),
      trend: trendOf(compared),
    }
  }).sort((left, right) => left.gameOrdinal - right.gameOrdinal)
}

function publicRecentRound(row) {
  return {
    round: row.round,
    windowSize: row.windowSize,
    wordRepeatRate: row.wordRepeatRate,
    maxRecentWordOverlap: row.maxRecentWordOverlap,
    maxRecentNgramSimilarity: row.maxRecentNgramSimilarity,
    qualityLevel: row.qualityLevel,
  }
}

export function summarizeStoryRepetitionRows(rows, { includePerGame = false } = {}) {
  const games = summarizeGames(rows)
  const compared = games.flatMap((game) => game.comparedRows)
  const recent = games.flatMap((game) => game.recentRows)
  const highRepeatRounds = compared.filter((row) => row.qualityLevel === 'high').length
  const result = {
    observedGames: games.length,
    observedRounds: rows.length,
    comparedRounds: compared.length,
    averageWordRepeatRate: average(compared.map((row) => row.wordRepeatRate)),
    recentAverageWordRepeatRate: average(recent.map((row) => row.wordRepeatRate)),
    peakWordRepeatRate: compared.length
      ? Number(Math.max(...compared.map((row) => row.wordRepeatRate)).toFixed(4))
      : 0,
    highRepeatRounds,
    highRepeatRatio: ratio(highRepeatRounds, compared.length),
    risingGames: games.filter((game) => game.trend === 'rising').length,
  }
  if (!includePerGame) return result
  return {
    ...result,
    perGame: games.map((game) => ({
      gameAlias: game.gameAlias,
      observedRounds: game.observedRounds,
      comparedRounds: game.comparedRounds,
      lastRound: game.lastRound,
      averageWordRepeatRate: game.averageWordRepeatRate,
      recentAverageWordRepeatRate: game.recentAverageWordRepeatRate,
      peakWordRepeatRate: game.peakWordRepeatRate,
      peakRound: game.peakRound,
      maxRecentNgramSimilarity: game.maxRecentNgramSimilarity,
      highRepeatRounds: game.highRepeatRounds,
      highRepeatRatio: game.highRepeatRatio,
      trend: game.trend,
      recentRounds: game.recentRows.map(publicRecentRound),
    })),
  }
}
