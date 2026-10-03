// tuttitrip-discord-relay: receives the HackYeah-TuttiTripTeam org webhook,
// verifies X-Hub-Signature-256 and posts Polish Discord embeds for changes in
// GitHub Project #1 (projects_v2_item, projects_v2) and, optionally, for opened /
// closed / merged issues and PRs. Workflow runs are not handled here (GitHub
// Actions posts them itself, see .github/workflows/discord-notify.yml).
//
// Secrets: DISCORD_WEBHOOK_URL, GITHUB_WEBHOOK_SECRET, optional GITHUB_TOKEN
// (fine-grained PAT, read-only: titles and current Status of project items).
import {
  issueMessage,
  projectItemMessage,
  projectMessage,
  pullRequestMessage,
} from './format.js'

const MAX_BODY = 5 * 1024 * 1024

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function hexToBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** HMAC-SHA256 check of the raw body; crypto.subtle.verify compares in constant time. */
export async function verifySignature(secret, body, header) {
  if (!secret || !header?.startsWith('sha256=')) return false
  const signature = hexToBytes(header.slice('sha256='.length))
  if (!signature) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  return crypto.subtle.verify('HMAC', key, signature, body)
}

const ITEM_QUERY = `query($ids: [ID!]!) {
  nodes(ids: $ids) {
    __typename
    ... on ProjectV2Item {
      fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
    }
    ... on DraftIssue { title }
    ... on Issue { title number url repository { name } }
    ... on PullRequest { title number url repository { name } }
  }
}`

/** Title, link and current Status of a project item. Empty without a token or on any error. */
async function itemInfo(env, item) {
  if (!env.GITHUB_TOKEN) return {}
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'content-type': 'application/json',
        'user-agent': 'tuttitrip-discord-relay',
      },
      body: JSON.stringify({
        query: ITEM_QUERY,
        variables: { ids: [item.node_id, item.content_node_id].filter(Boolean) },
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.log(JSON.stringify({ graphql: res.status }))
      return {}
    }
    // Deleted items/drafts come back as null nodes with NOT_FOUND errors.
    const nodes = (await res.json()).data?.nodes ?? []
    const info = {}
    for (const node of nodes) {
      if (!node) continue
      if (node.__typename === 'ProjectV2Item') info.status = node.fieldValueByName?.name
      else {
        info.title = node.title
        info.number = node.number
        info.url = node.url
        info.repo = node.repository?.name
      }
    }
    return info
  } catch (e) {
    console.log(JSON.stringify({ graphql: e.name }))
    return {}
  }
}

async function postToDiscord(env, message) {
  const post = () =>
    fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
    })
  let res = await post()
  if (res.status === 429) {
    const retryAfter = Number((await res.json().catch(() => ({}))).retry_after ?? 2)
    if (retryAfter <= 5) {
      await new Promise((r) => setTimeout(r, retryAfter * 1000))
      res = await post()
    }
  }
  return res
}

async function buildMessage(event, payload, env) {
  const anyProject = !env.PROJECT_NODE_ID
  switch (event) {
    case 'projects_v2_item': {
      const item = payload.projects_v2_item
      if (!anyProject && item.project_node_id !== env.PROJECT_NODE_ID) return { skip: 'other project' }
      if (payload.action === 'reordered') return { skip: 'reordered' }
      return projectItemMessage(payload, env, await itemInfo(env, item))
    }
    case 'projects_v2':
      if (!anyProject && payload.projects_v2?.node_id !== env.PROJECT_NODE_ID) return { skip: 'other project' }
      return projectMessage(payload, env)
    case 'issues':
    case 'pull_request':
      if (env.FORWARD_ISSUES_PRS !== 'true') return { skip: 'issue/PR forwarding off' }
      // Bot actions (format checks closing/reopening, release bots) stay quiet.
      if (payload.sender?.type === 'Bot') return { skip: 'bot' }
      return event === 'issues' ? issueMessage(payload) : pullRequestMessage(payload)
    default:
      return { skip: `event ${event} not handled` }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('tuttitrip-discord-relay: POST GitHub webhooks to /github\n')
    }
    if (url.pathname !== '/github') return json(404, { error: 'not found' })
    if (request.method !== 'POST') return json(405, { error: 'POST only' })
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return json(413, { error: 'too large' })

    const body = await request.arrayBuffer()
    if (body.byteLength > MAX_BODY) return json(413, { error: 'too large' })
    const signature = request.headers.get('x-hub-signature-256')
    if (!(await verifySignature(env.GITHUB_WEBHOOK_SECRET, body, signature))) {
      return json(401, { error: 'bad signature' })
    }

    const event = request.headers.get('x-github-event') ?? ''
    const delivery = request.headers.get('x-github-delivery') ?? ''
    let payload
    try {
      payload = JSON.parse(new TextDecoder().decode(body))
    } catch {
      return json(400, { error: 'invalid JSON' })
    }
    if (event === 'ping') return json(200, { pong: true, zen: payload.zen })
    if (env.GITHUB_ORG && payload.organization?.login !== env.GITHUB_ORG) {
      return json(200, { posted: false, reason: 'other organization' })
    }

    const message = await buildMessage(event, payload, env)
    const log = { delivery, event, action: payload.action }
    if (message.skip) {
      console.log(JSON.stringify({ ...log, skipped: message.skip }))
      return json(200, { posted: false, reason: message.skip })
    }
    if (!env.DISCORD_WEBHOOK_URL) return json(500, { error: 'DISCORD_WEBHOOK_URL not set' })

    const res = await postToDiscord(env, message)
    console.log(JSON.stringify({ ...log, discord: res.status }))
    if (!res.ok) {
      return json(502, { posted: false, discord: res.status, detail: (await res.text()).slice(0, 300) })
    }
    return json(200, { posted: true, discord: res.status })
  },
}
