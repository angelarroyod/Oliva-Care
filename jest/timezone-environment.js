// Runs one test file in a fixed IANA time zone, so clock logic can be checked
// against real DST rules instead of whatever zone the machine or CI uses:
//
//   /**
//    * @jest-environment ./jest/timezone-environment.js
//    * @jest-environment-options {"timezone": "Europe/Madrid"}
//    */
//
// Node re-reads TZ when process.env.TZ is assigned, so it has to be set on the
// worker's real process (here), not on the copy a test file sees.
const ReactNativeEnv = require('@react-native/jest-preset/jest/react-native-env.js');

module.exports = class TimezoneEnvironment extends ReactNativeEnv {
  constructor(config, context) {
    super(config, context);
    this.timezone = config.projectConfig.testEnvironmentOptions?.timezone;
  }

  async setup() {
    this.previous = process.env.TZ;
    if (this.timezone) process.env.TZ = this.timezone;
    await super.setup();
  }

  async teardown() {
    if (this.previous === undefined) delete process.env.TZ;
    else process.env.TZ = this.previous;
    await super.teardown();
  }
};
