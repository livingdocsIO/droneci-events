const Pool = require('pg').Pool
const LRU = require('lru-cache')
const axios = require('axios')
const EventEmitter = require('events').EventEmitter

module.exports = async function start ({ postgres, droneHost }) {
  const events = new EventEmitter()
  const pool = new Pool({ connectionString: postgres })
  const sub = await pool.connect()

  const reposCache = new LRU({ max: 500, maxAge: 1000 * 60 * 60 })
  const buildsCache = new LRU({ max: 500, maxAge: 1000 * 60 * 60 })

  const getRepo = async (repoId) => {
    const repo = reposCache.get(repoId)
    if (repo) return repo
    const res = await sub.query(`
      SELECT
        repo_id as id,
        repo_owner as owner,
        repo_name as repo,
        repo_link as url,
        user_token as token
      FROM repos
      LEFT JOIN users ON (user_id = repo_user_id)
      WHERE repo_id = $1
      LIMIT 1
    `, [repoId])
    const toCache = res.rows[0]
    reposCache.set(repoId, toCache)
    return toCache
  }

  const getBuild = async (buildId) => {
    const build = buildsCache.get(buildId)
    if (build) return build
    const res = await sub.query(`
      SELECT
        build_id as id,
        build_number,
        build_branch as branch,
        build_message as message,
        build_commit as commit,
        build_author as user
      FROM procs
      LEFT JOIN builds on (proc_build_id = build_id)
      WHERE build_id = $1
      LIMIT 1
    `, [buildId])

    const toCache = res.rows[0]
    buildsCache.set(buildId, toCache)
    return toCache
  }

  const supportedListeners = {
    'step.started': false,
    'step.succeeded': false,
    'step.errored': false,
    'step.failed': false
  }

  events.on('newListener', (event) => {
    if (supportedListeners[event] === false) {
      supportedListeners[event] = true
      sub.query(`LISTEN "${event}";`).catch((err) => events.emit('error', err))
    }
  })

  events.on('removeListener', (eventName) => {
    if (supportedListeners[eventName] === true) {
      if (events.listenerCount(eventName) > 0) return
      supportedListeners[eventName] = false
      sub.query(`UNLISTEN "${eventName}";`).catch((err) => events.emit('error', err))
    }
  })

  const states = {
    running: 'started',
    success: 'succeeded',
    error: 'errored',
    failure: 'failed'
  }

  class StepEvent {
    constructor (repo, build, step) {
      this.id = step.id
      this.time = step.time
      this.name = step.name
      this.number = step.number
      this.event = states[step.state]

      this.repo = repo
      this.build = build
    }

    getLog () {
      return pool.query('SELECT * FROM logs WHERE log_job_id = $1', [this.id])
        .then((res) => {
          const json = res.rows.length && res.rows[0].log_data.toString()
          return JSON.parse(json).map((l) => l.out)
        })
    }

    // state is one of [error, failure, pending, success]
    postStatus ({ context, state, description, targetUrl }) {
      return axios({
        method: 'post',
        url: `https://api.github.com/repos/${this.repo.owner}/${this.repo.repo}/statuses/${this.build.commit}`,
        headers: {
          Authorization: `token ${this.repo.token}`
        },
        data: {
          state: state,
          target_url: targetUrl || `${droneHost}/${this.repo.owner}/${this.repo.repo}/${this.build.number}/${this.number}`,
          description: description,
          context: context || `droneci/${this.name}`
        },
        validateStatus (status) { return status === 201 }
      })
    }
  }

  sub.on('notification', (msg) => {
    const step = JSON.parse(msg.payload)
    Promise.all([
      getRepo(step.repo_id),
      getBuild(step.build_id)
    ])
      .then(([repo, build]) => {
        events.emit(msg.channel, new StepEvent(repo, build, step))
      })
      .catch((err) => {
        events.emit('error', err)
      })
  })

  return events
}
