const droneEvents = require('./drone-events')

async function start () {
  const events = await droneEvents({
    postgres: process.env.POSTGRES_CONNECTION,
    droneHost: process.env.DRONE_HOST
  })

  const steps = {
    eslint: {
      started: 'Eslint Started',
      succeeded: 'No eslint errors',
      errored: 'eslint errored',
      failed: 'Failed to run eslint'
    },
    test: {
      started: 'Test Started',
      succeeded: 'There are Test Errors',
      errored: 'The Tests errored',
      failed: 'Failed to run the Tests'
    },
    'downstream-nzz': {
      started: 'NZZ Downstream Tests Started',
      succeeded: 'There are Test Errors',
      errored: 'The NZZ Downstream Tests errored',
      failed: 'Failed to run the NZZ Downstream tests'
    },
    'downstream-bluewin': {
      started: 'Bluewin Downstream Tests Started',
      succeeded: 'There are Test Errors',
      errored: 'The Bluewin Downstream Tests errored',
      failed: 'Failed to run the Bluewin Downstream tests'
    }
  }

  events.on('step.started', function (step) {
    const handler = steps[step.name]
    if (!handler) return
    step.postStatus({ state: 'pending', description: handler.started }).catch(console.error)
  })

  events.on('step.succeeded', function (step) {
    const handler = steps[step.name]
    if (!handler) return
    step.postStatus({ state: 'success', description: handler.succeeded }).catch(console.error)
    // step.getLog().then(console.log).catch(console.error)
  })

  events.on('step.errored', function (step) {
    const handler = steps[step.name]
    if (!handler) return
    step.postStatus({ state: 'error', description: handler.errored }).catch(console.error)
  })

  events.on('step.failed', function (step) {
    const handler = steps[step.name]
    if (!handler) return
    step.postStatus({ state: 'failure', description: handler.failed }).catch(console.error)
    // step.getLog().then(console.log).catch(console.error)
  })

  events.on('error', console.error)
}

start()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
