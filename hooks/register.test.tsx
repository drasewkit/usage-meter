import { expect, mock, test } from 'claude-code/testing'
import { format, modelName, parts, settingsEffort } from './register.js'

const START = Date.parse('2026-10-03T02:00:00Z')
const RESETS = '2026-10-03T04:14:00Z'
const WEEK_RESETS = '2026-10-08T00:00:00Z'

const pad = (n: number) => String(n).padStart(2, '0')

const localClock = (iso: string) => {
  const d = new Date(Date.parse(iso))
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const localDay = (iso: string) => {
  const d = new Date(Date.parse(iso))
  return `${d.getMonth() + 1}/${d.getDate()}(${'日月火水木金土'[d.getDay()]})`
}

const localDayEn = (iso: string) => {
  const d = new Date(Date.parse(iso))
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
}

const week = (percent: number) =>
  `週 ${percent}%使用 · ${localDay(WEEK_RESETS)} ${localClock(WEEK_RESETS)}リセット`

const weekEn = (percent: number) =>
  `Week: ${percent}% used · resets ${localDayEn(WEEK_RESETS)} ${localClock(WEEK_RESETS)}`

const fiveHour = { percentUsed: 63.4, resetsAt: RESETS }
const sevenDay = { percentUsed: 40.6, resetsAt: WEEK_RESETS }
const opus = 'claude-opus-5-5'

test('formats both windows, the model and the effort in English', () => {
  expect(format(parts({ fiveHour, sevenDay }, { model: opus, effort: 'medium' }, START, 'en'))).toBe(
    `5h: 2h14m left · 63% used · resets ${localClock(RESETS)} | ${weekEn(41)} | Opus 5.5 medium`,
  )
  expect(format(parts({ fiveHour, sevenDay }, {}, Date.parse(RESETS) + 1, 'en'))).toBe(
    `5h: reset (updates on next reply) | ${weekEn(41)}`,
  )
  expect(format(parts({ sevenDay: { percentUsed: 100, resetsAt: '2026-10-03T01:00:00Z' } }, {}, START, 'en'))).toBe(
    'Week: reset',
  )
  expect(format(parts({ sevenDay: { percentUsed: 12 } }, {}, START, 'en'))).toBe('Week: 12% used')
  expect(format(parts({}, {}, START, 'en'))).toBeUndefined()
})

test('formats both windows, the model and the effort in Japanese', () => {
  expect(format(parts({ fiveHour, sevenDay }, { model: opus, effort: 'max' }, START, 'ja'))).toBe(
    `5h枠 残り2h14m · 63%使用 · ${localClock(RESETS)}リセット | ${week(41)} | Opus 5.5 max`,
  )
  expect(format(parts({ fiveHour, sevenDay }, {}, START + 30 * 60_000, 'ja'))).toBe(
    `5h枠 残り1h44m · 63%使用 · ${localClock(RESETS)}リセット | ${week(41)}`,
  )
  expect(format(parts({ fiveHour }, {}, Date.parse(RESETS) + 1, 'ja'))).toBe(
    '5h枠 リセット済み (次の応答で更新)',
  )
})

test('marks only the windows at or past 90%', () => {
  const shown = parts(
    { fiveHour: { percentUsed: 91, resetsAt: '2026-10-03T02:45:00Z' }, sevenDay: { percentUsed: 89.4, resetsAt: WEEK_RESETS } },
    { effort: 'high' },
    START,
    'en',
  )
  expect(shown.map(part => part.warn)).toEqual([true, false, false])
  expect(shown[0]?.text).toBe(`⚠ 5h: 45m left · 91% used · resets ${localClock('2026-10-03T02:45:00Z')}`)
  expect(shown[1]?.text.startsWith('Week: 89% used')).toBe(true)
})

test('marks a window shown at 90%, rounded up from 89.5', () => {
  const [shown] = parts({ fiveHour: { percentUsed: 89.5, resetsAt: '2026-10-03T02:45:00Z' } }, {}, START, 'en')
  expect(shown?.warn).toBe(true)
  expect(shown?.text.startsWith('⚠ 5h: 45m left · 90% used')).toBe(true)
})

test('shows the model alone without an effort, the effort alone without a model', () => {
  expect(format(parts({}, { model: 'claude-haiku-4-5-20251001' }, START, 'en'))).toBe('Haiku 4.5')
  expect(format(parts({}, { effort: 'low' }, START, 'ja'))).toBe('effort low')
})

test('modelName: the family and version as people say them', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-fable-5-1')).toBe('Fable 5.1')
  expect(modelName('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelName('claude-opus-4-20250514')).toBe('Opus 4')
  expect(modelName('us.anthropic.claude-sonnet-5-5-v1:0')).toBe('Sonnet 5.5')
  expect(modelName('my-proxy-model')).toBe('my-proxy-model')
})

test('settingsEffort: the model entry first, then the general one', () => {
  const settings = { effortLevel: 'high', modelSettings: { 'claude-opus-5-5': { effortLevel: 'medium' } } }
  expect(settingsEffort(settings, 'claude-opus-5-5')).toBe('medium')
  expect(settingsEffort(settings, 'claude-sonnet-5-5')).toBe('high')
  expect(settingsEffort({}, 'claude-opus-5-5')).toBeUndefined()
})

const start = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
const context = { window: 200_000 }
const step = { turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 }
const HINT = { isDraft: false, isWorking: false, hint: 'auto mode on (shift+tab to cycle)' }

const drain = async (stream: AsyncGenerator<unknown, unknown>) => {
  for await (const _ of stream);
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: draws the meter under the hint line and keeps it current`, async ($, on) => {
    const clock = mock.clock(on, { now: START })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.usage', () => ({
      value: {
        startedAt: START,
        context,
        rateLimits: [
          { kind: 'seven_day', percentUsed: 40.6, resetsAt: WEEK_RESETS },
          { kind: 'five_hour', percentUsed: 63.4, resetsAt: RESETS },
        ],
      },
    }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('settings.read', () => ({
      value: { effortLevel: 'high', modelSettings: { 'claude-opus-5-5': { effortLevel: 'medium' } } },
    }))
    on('session.measure', ($, e) => ({ changed: e.changed }))
    on('turn.step', async function* ($, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    on('ui.render', { component: 'PromptHint' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>{e.props.hint}</Text>
    })

    const ui = await $.ui.mount({ plugin: 'usage-meter', surface, component: 'PromptHint', props: HINT })
    expect(await ui.find({ text: /5h/ })).toBeUndefined()

    await $.session.start(start)
    const line = () => ui.find({ type: 'Text', text: /^5h: / })

    expect(await ui.find({ type: 'Text', text: /^auto mode on/ })).toBeDefined()
    expect((await line())?.text).toBe(
      `5h: 2h14m left · 63% used · resets ${localClock(RESETS)} | ${weekEn(41)} | Opus 5.5 medium`,
    )
    expect((await ui.findAll({ type: 'Text' })).filter(element => element.props.color === 'warning')).toHaveLength(0)

    await clock.advance(30 * 60_000)
    expect((await line())?.text).toContain('5h: 1h44m left')

    await drain($.turn.step({ ...step, effort: 'xhigh' }))
    expect((await line())?.text).toContain('Opus 5.5 xhigh')

    await drain($.turn.step({ ...step, index: 1, model: 'claude-sonnet-5-5', effort: 'xhigh' }))
    expect((await line())?.text).toContain('Sonnet 5.5 xhigh')

    await drain($.turn.step({ ...step, index: 2, model: 'claude-haiku-4-5', effort: 'low', agentId: 'sub-1' }))
    expect((await line())?.text).toContain('Sonnet 5.5 xhigh')

    await $.session.measure({
      context,
      rateLimits: [
        { kind: 'five_hour', percentUsed: 91, resetsAt: RESETS },
        { kind: 'seven_day', percentUsed: 40.6, resetsAt: WEEK_RESETS },
      ],
      changed: ['rateLimits'],
    })
    const warned = (await ui.findAll({ type: 'Text' })).filter(element => element.props.color === 'warning')
    expect(warned).toHaveLength(1)
    expect(warned[0]?.text).toBe(`⚠ 5h: 1h44m left · 91% used · resets ${localClock(RESETS)}`)
  })
}

test('ja: draws the meter in Japanese', { options: { japanese: true } }, async ($, on) => {
  mock.clock(on, { now: START })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })

  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'PromptHint', props: HINT })
  await $.session.measure({
    context,
    rateLimits: [{ kind: 'seven_day', percentUsed: 40.6, resetsAt: WEEK_RESETS }],
    changed: ['rateLimits'],
  })
  expect((await ui.find({ type: 'Text', text: /^週/ }))?.text).toBe(week(41))
})

test('shows a new model and effort as soon as /effort or /model changes the settings', async ($, on) => {
  const clock = mock.clock(on, { now: START })
  let level = 'medium'
  let current = 'claude-opus-5-5'
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: START, context, rateLimits: [] } }))
  on('session.model', () => ({ value: current }))
  on('settings.read', () => ({
    value: { effortLevel: 'high', modelSettings: { 'claude-opus-5-5': { effortLevel: level } } },
  }))
  on('command.run', () => ({ text: '' }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })

  const ui = await $.ui.mount({ plugin: 'usage-meter', surface: 'terminal', component: 'PromptHint', props: HINT })
  const line = async () => (await ui.find({ type: 'Text', text: /^Opus|^Sonnet/ }))?.text

  await $.session.start(start)
  expect(await line()).toBe('Opus 5.5 medium')

  level = 'high'
  await $.command.run({
    command: 'effort',
    args: 'high',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 200 },
  })
  expect(await line()).toBe('Opus 5.5 high')

  // A request at another level (a --effort flag) wins until the settings change again.
  await drain($.turn.step({ ...step, effort: 'low' }))
  await clock.advance(30_000)
  expect(await line()).toBe('Opus 5.5 low')

  // Changed some other way (the /model picker), it shows on the next tick.
  level = 'max'
  await clock.advance(30_000)
  expect(await line()).toBe('Opus 5.5 max')

  // `/model` switches the model; its effort is the settings' general one.
  current = 'claude-sonnet-5-5'
  await $.command.run({
    command: 'model',
    args: 'sonnet',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 200 },
  })
  expect(await line()).toBe('Sonnet 5.5 high')
})
