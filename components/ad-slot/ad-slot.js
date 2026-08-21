const { hasConfiguredAdUnit } = require('../../utils/ad-config')

Component({
  properties: {
    unitId: {
      type: String,
      value: '',
      observer(value) {
        this.setData({ enabled: hasConfiguredAdUnit(value), failed: false })
      },
    },
  },
  data: { enabled: false, failed: false },
  methods: {
    onError() { this.setData({ failed: true }) },
  },
})
