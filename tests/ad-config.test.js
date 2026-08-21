const test = require('node:test')
const assert = require('node:assert/strict')
const { hasConfiguredAdUnit } = require('../utils/ad-config')

test('empty and placeholder ad IDs stay disabled', () => {
  assert.equal(hasConfiguredAdUnit(''), false)
  assert.equal(hasConfiguredAdUnit('adunit-'), false)
  assert.equal(hasConfiguredAdUnit('replace-me'), false)
})

test('a valid banner unit ID enables the slot', () => {
  assert.equal(hasConfiguredAdUnit('adunit-a1B2c3D4'), true)
})
