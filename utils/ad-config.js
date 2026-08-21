function hasConfiguredAdUnit(unitId) {
  return /^adunit-[a-z0-9]+$/i.test(String(unitId || '').trim())
}

module.exports = { hasConfiguredAdUnit }
