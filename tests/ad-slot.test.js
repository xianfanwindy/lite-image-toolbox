const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const componentPath = path.resolve(__dirname, '../components/ad-slot/ad-slot.js')

let definition
let previousComponent

function loadComponent() {
  definition = undefined
  delete require.cache[componentPath]
  global.Component = (value) => {
    definition = value
  }
  require(componentPath)
  return definition
}

test.afterEach(() => {
  delete require.cache[componentPath]
  if (previousComponent === undefined) {
    delete global.Component
  } else {
    global.Component = previousComponent
  }
  definition = undefined
})

test.beforeEach(() => {
  previousComponent = global.Component
})

test('ad config keeps both banner unit IDs empty by default', () => {
  const ads = require('../config/ads')

  assert.deepEqual(ads, {
    homeBannerUnitId: '',
    resultBannerUnitId: '',
  })
})

test('ad slot exposes only its unit property, data, and error method', () => {
  const component = loadComponent()

  assert.deepEqual(Object.keys(component).sort(), ['data', 'methods', 'properties'])
  assert.deepEqual(Object.keys(component.properties), ['unitId'])
  assert.deepEqual(Object.keys(component.properties.unitId).sort(), ['observer', 'type', 'value'])
  assert.equal(component.properties.unitId.type, String)
  assert.equal(component.properties.unitId.value, '')
  assert.deepEqual(component.data, { enabled: false, failed: false })
  assert.deepEqual(Object.keys(component.methods), ['onError'])
})

test('invalid unit IDs disable the slot and clear failure state', () => {
  const component = loadComponent()
  const updates = []
  const context = { setData(value) { updates.push(value) } }

  component.properties.unitId.observer.call(context, '')
  component.properties.unitId.observer.call(context, 'adunit-')

  assert.deepEqual(updates, [
    { enabled: false, failed: false },
    { enabled: false, failed: false },
  ])
})

test('valid unit ID enables the slot and resets a prior failure', () => {
  const component = loadComponent()
  const state = { enabled: false, failed: true }
  const updates = []
  const context = {
    setData(value) {
      updates.push(value)
      Object.assign(state, value)
    },
  }

  component.properties.unitId.observer.call(context, 'adunit-a1B2c3D4')

  assert.deepEqual(updates, [{ enabled: true, failed: false }])
  assert.deepEqual(state, { enabled: true, failed: false })
})

test('onError hides the slot after an ad failure', () => {
  const component = loadComponent()
  let update

  component.methods.onError.call({
    setData(value) {
      update = value
    },
  })

  assert.deepEqual(update, { failed: true })
})
