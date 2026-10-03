// Pure formatting: GitHub org webhook payloads -> Discord webhook messages (Polish).
// No I/O here; index.js verifies, enriches (GraphQL) and posts.

const COLORS = {
  blue: 0x3498db,
  green: 0x2ecc71,
  red: 0xe74c3c,
  purple: 0x8e44ad,
  grey: 0x95a5a6,
  yellow: 0xf1c40f,
}

// Colors of single-select options in GitHub Projects.
const OPTION_COLORS = {
  GRAY: 0x8c959f,
  BLUE: 0x0969da,
  GREEN: 0x1a7f37,
  YELLOW: 0xbf8700,
  ORANGE: 0xbc4c00,
  RED: 0xcf222e,
  PINK: 0xbf3989,
  PURPLE: 0x8250df,
}

// Field types whose changes are worth a message (custom fields: Status, Area,
// Priority, Estimate, Iteration...). Labels, assignees etc. are left out.
const FIELD_TYPES = new Set(['single_select', 'iteration', 'number', 'date', 'text'])

const CONTENT_TYPES = { Issue: 'Issue', PullRequest: 'Pull request', DraftIssue: 'Szkic' }

/** Untrusted text in descriptions/fields: one line, cut, Discord markdown escaped. */
export function esc(value, max = 200) {
  let s = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length > max) s = `${s.slice(0, max - 1)}…`
  return s.replace(/([\\`*_~|>[\]()<#])/g, '\\$1')
}

/** Embed titles do not render links, so only shorten them. */
function plain(value, max = 256) {
  const s = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

const cut = (s, max) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

const userLink = (user) =>
  user?.login ? `[${esc(user.login, 60)}](https://github.com/${encodeURIComponent(user.login)})` : '—'

/** A project field value from the webhook (`from` / `to`) as text. */
export function fieldValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') {
    if (value.name) return esc(value.name, 100) // single select option
    if (value.title) return esc(value.title, 100) // iteration
    return '—'
  }
  const s = String(value)
  return esc(/^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s, 100)
}

function message(embed) {
  return { username: 'TuttiTrip GitHub', embeds: [embed], allowed_mentions: { parse: [] } }
}

/**
 * projects_v2_item -> Discord message, or { skip: reason }.
 * `info` (optional, from GraphQL): { title, url, number, repo, state, status }.
 */
export function projectItemMessage(payload, env, info = {}) {
  const item = payload.projects_v2_item
  const action = payload.action
  const projectUrl = env.PROJECT_URL
  const paneUrl = `${projectUrl}?pane=issue&itemId=${item.id}`
  const kind = CONTENT_TYPES[item.content_type] ?? item.content_type

  let description
  let color = COLORS.blue
  switch (action) {
    case 'created':
      description = '➕ Dodano do projektu'
      break
    case 'edited': {
      const change = payload.changes?.field_value
      if (change) {
        const type = String(change.field_type ?? '').toLowerCase()
        const name = change.field_name ?? ''
        const allow = (env.PROJECT_FIELDS ?? '')
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean)
        const wanted = allow.length > 0 ? allow.includes(name) : FIELD_TYPES.has(type)
        if (!wanted) return { skip: `field ${name || type} not posted` }
        description = `✏️ **${esc(name || 'Pole', 80)}**: ${fieldValue(change.from)} → **${fieldValue(change.to)}**`
        color = OPTION_COLORS[change.to?.color] ?? COLORS.purple
      } else if (payload.changes?.body) {
        description = '📝 Zmieniono opis szkicu'
        color = COLORS.purple
      } else {
        return { skip: 'edit without a field change' }
      }
      break
    }
    case 'converted':
      description = '🔁 Szkic zamieniony na issue'
      break
    case 'archived':
      description = '🗄️ Zarchiwizowano'
      color = COLORS.grey
      break
    case 'restored':
      description = '♻️ Przywrócono z archiwum'
      color = COLORS.green
      break
    case 'deleted':
      description = '🗑️ Usunięto z projektu'
      color = COLORS.grey
      break
    default:
      return { skip: `action ${action} not posted` } // reordered
  }

  const title = info.title
    ? plain(info.number ? `#${info.number} ${info.title}` : info.title)
    : `${kind} (element ${item.id})`
  const fields = [
    { name: 'Typ', value: kind, inline: true },
    info.repo && { name: 'Repozytorium', value: esc(info.repo, 100), inline: true },
    { name: 'Kto', value: userLink(payload.sender), inline: true },
    info.status &&
      !description.includes('**Status**') && { name: 'Status', value: esc(info.status, 100), inline: true },
  ].filter(Boolean)

  return message({
    author: { name: 'Projekt TuttiTrip', url: projectUrl },
    title,
    url: action === 'deleted' ? info.url || projectUrl : info.url || paneUrl,
    description: cut(description, 4000),
    color,
    fields,
    footer: { text: 'GitHub Projects' },
    timestamp: item.updated_at || new Date().toISOString(),
  })
}

/** projects_v2 (the project itself) -> Discord message, or { skip }. */
export function projectMessage(payload, env) {
  const project = payload.projects_v2
  const labels = {
    created: '📋 Utworzono projekt',
    edited: '📋 Zmieniono ustawienia projektu',
    closed: '📋 Zamknięto projekt',
    reopened: '📋 Otwarto ponownie projekt',
    deleted: '📋 Usunięto projekt',
  }
  if (!labels[payload.action]) return { skip: `action ${payload.action} not posted` }
  return message({
    title: plain(`${labels[payload.action]}: ${project.title}`),
    url: env.PROJECT_URL,
    description: `Kto: ${userLink(payload.sender)}`,
    color: payload.action === 'closed' || payload.action === 'deleted' ? COLORS.grey : COLORS.blue,
    timestamp: project.updated_at || new Date().toISOString(),
  })
}

/** issues -> compact Discord message, or { skip }. */
export function issueMessage(payload) {
  const issue = payload.issue
  let label
  let color
  if (payload.action === 'opened') [label, color] = ['🆕 Nowe zgłoszenie', COLORS.green]
  else if (payload.action === 'reopened') [label, color] = ['🔄 Otwarte ponownie', COLORS.green]
  else if (payload.action === 'closed' && issue.state_reason === 'not_planned')
    [label, color] = ['🚫 Zamknięte (nie planujemy)', COLORS.grey]
  else if (payload.action === 'closed') [label, color] = ['✔️ Zamknięte (zrobione)', COLORS.purple]
  else return { skip: `issues.${payload.action} not posted` }
  return message({
    title: plain(`#${issue.number} ${issue.title}`),
    url: issue.html_url,
    description: `${label} · [${esc(payload.repository.name)}](${payload.repository.html_url}) · ${userLink(payload.sender)}`,
    color,
    timestamp: issue.updated_at,
  })
}

/** pull_request -> compact Discord message, or { skip }. */
export function pullRequestMessage(payload) {
  const pr = payload.pull_request
  let label
  let color
  if (payload.action === 'opened' && !pr.draft) [label, color] = ['🆕 Nowy PR', COLORS.green]
  else if (payload.action === 'ready_for_review') [label, color] = ['👀 Gotowy do review', COLORS.green]
  else if (payload.action === 'reopened') [label, color] = ['🔄 Otwarty ponownie', COLORS.green]
  else if (payload.action === 'closed' && pr.merged)
    [label, color] = [`🔀 Scalony do ${esc(pr.base?.ref, 60)}`, COLORS.purple]
  else if (payload.action === 'closed') [label, color] = ['🚫 Zamknięty bez scalenia', COLORS.grey]
  else return { skip: `pull_request.${payload.action} not posted` }
  return message({
    title: plain(`#${pr.number} ${pr.title}`),
    url: pr.html_url,
    description: `${label} · [${esc(payload.repository.name)}](${payload.repository.html_url}) · ${esc(pr.head?.ref, 80)} → ${esc(pr.base?.ref, 60)} · ${userLink(payload.sender)}`,
    color,
    timestamp: pr.updated_at,
  })
}
