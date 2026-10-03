// npm test  (Node 22+, no dependencies)
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import worker from '../src/index.js'

const SECRET = 'test-secret'
const env = {
  DISCORD_WEBHOOK_URL: 'https://discord.invalid/api/webhooks/1/x',
  GITHUB_WEBHOOK_SECRET: SECRET,
  GITHUB_ORG: 'HackYeah-TuttiTripTeam',
  PROJECT_NODE_ID: 'PVT_1',
  PROJECT_URL: 'https://github.com/orgs/HackYeah-TuttiTripTeam/projects/1',
  PROJECT_FIELDS: '',
  FORWARD_ISSUES_PRS: 'true',
}

const sent = []
globalThis.fetch = async (url, init) => {
  sent.push({ url, body: JSON.parse(init.body) })
  return new Response(null, { status: 204 })
}

function deliver(event, payload, { secret = SECRET } = {}) {
  const body = JSON.stringify({ organization: { login: 'HackYeah-TuttiTripTeam' }, ...payload })
  const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  return worker.fetch(
    new Request('https://tuttitrip-hooks.gburek.app/github', {
      method: 'POST',
      headers: { 'x-github-event': event, 'x-hub-signature-256': sig, 'content-type': 'application/json' },
      body,
    }),
    env,
  )
}

const item = (extra = {}) => ({
  id: 123,
  node_id: 'PVTI_1',
  project_node_id: 'PVT_1',
  content_node_id: 'DI_1',
  content_type: 'DraftIssue',
  updated_at: '2026-10-03T12:00:00Z',
  ...extra,
})
const sender = { login: 'alice', type: 'User' }

test('rejects a bad signature', async () => {
  const res = await deliver('projects_v2_item', { action: 'created', projects_v2_item: item() }, { secret: 'nope' })
  assert.equal(res.status, 401)
})

test('answers ping', async () => {
  const res = await deliver('ping', { zen: 'hi' })
  assert.equal(res.status, 200)
})

test('posts a Status change with old and new value', async () => {
  sent.length = 0
  const res = await deliver('projects_v2_item', {
    action: 'edited',
    sender,
    projects_v2_item: item(),
    changes: {
      field_value: {
        field_node_id: 'F',
        field_type: 'single_select',
        field_name: 'Status',
        project_number: 1,
        from: { id: 'a', name: 'Todo', color: 'GRAY' },
        to: { id: 'b', name: 'In Progress', color: 'YELLOW' },
      },
    },
  })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { posted: true, discord: 204 })
  const embed = sent[0].body.embeds[0]
  assert.match(embed.description, /\*\*Status\*\*: Todo → \*\*In Progress\*\*/)
  assert.match(embed.url, /pane=issue&itemId=123/)
  assert.deepEqual(sent[0].body.allowed_mentions, { parse: [] })
})

test('skips label edits, reorders and other projects', async () => {
  sent.length = 0
  const labels = await deliver('projects_v2_item', {
    action: 'edited',
    sender,
    projects_v2_item: item(),
    changes: { field_value: { field_type: 'labels', field_name: 'Labels', from: null, to: null } },
  })
  assert.equal((await labels.json()).posted, false)
  const reorder = await deliver('projects_v2_item', { action: 'reordered', sender, projects_v2_item: item() })
  assert.equal((await reorder.json()).posted, false)
  const other = await deliver('projects_v2_item', {
    action: 'created',
    sender,
    projects_v2_item: item({ project_node_id: 'PVT_other' }),
  })
  assert.equal((await other.json()).posted, false)
  assert.equal(sent.length, 0)
})

test('posts created/archived/deleted items', async () => {
  sent.length = 0
  for (const action of ['created', 'converted', 'archived', 'restored', 'deleted']) {
    const res = await deliver('projects_v2_item', { action, sender, projects_v2_item: item() })
    assert.equal(res.status, 200, action)
  }
  assert.equal(sent.length, 5)
})

test('escapes markdown in issue titles and skips bots', async () => {
  sent.length = 0
  const repository = { name: 'tuttitrip-backend', html_url: 'https://github.com/x/y' }
  const issue = { number: 5, title: 'feat: [x](http://evil)', html_url: 'https://github.com/x/y/issues/5', updated_at: 'now' }
  await deliver('issues', { action: 'opened', sender, repository, issue })
  await deliver('issues', { action: 'closed', sender: { login: 'github-actions[bot]', type: 'Bot' }, repository, issue })
  assert.equal(sent.length, 1)
  assert.match(sent[0].body.embeds[0].description, /Nowe zgłoszenie/)
})

test('posts merged PRs', async () => {
  sent.length = 0
  const res = await deliver('pull_request', {
    action: 'closed',
    sender,
    repository: { name: 'tuttitrip-frontend', html_url: 'https://github.com/x/f' },
    pull_request: { number: 3, title: 'chore: x', html_url: 'u', merged: true, base: { ref: 'develop' }, head: { ref: 'chore/x' } },
  })
  assert.equal(res.status, 200)
  assert.match(sent[0].body.embeds[0].description, /Scalony do develop/)
})
