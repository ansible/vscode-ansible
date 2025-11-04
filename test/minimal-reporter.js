/**
 * Minimal Mocha Reporter
 * 
 * Shows only test suite names (file level) during execution.
 * Only expands to show individual test cases when they fail.
 * 
 * Output example:
 *   ✓ terminalUiTest (4 tests, 10.2s)
 *   ✓ settingsUiTest (1 test, 5.1s)
 *   ✗ lightspeedUiTest (3/4 tests passed, 8.5s)
 *     ✗ Should connect to Lightspeed (TimeoutError: ...)
 */

'use strict';

const Mocha = require('mocha');
const {
  EVENT_RUN_BEGIN,
  EVENT_RUN_END,
  EVENT_SUITE_BEGIN,
  EVENT_SUITE_END,
  EVENT_TEST_PASS,
  EVENT_TEST_FAIL,
  EVENT_TEST_PENDING,
} = Mocha.Runner.constants;

class MinimalReporter {
  constructor(runner, options) {
    this._indents = 0;
    this._suites = new Map();
    this._currentSuite = null;
    const stats = runner.stats;

    runner
      .once(EVENT_RUN_BEGIN, () => {
        console.log('');
      })
      .on(EVENT_SUITE_BEGIN, (suite) => {
        if (suite.root) return;
        
        // Only track top-level suites (test files)
        if (!suite.parent || suite.parent.root) {
          this._currentSuite = {
            title: this.getSuiteDisplayName(suite),
            file: suite.file,
            passed: 0,
            failed: 0,
            pending: 0,
            failures: [],
            startTime: Date.now(),
          };
          this._suites.set(suite, this._currentSuite);
        }
      })
      .on(EVENT_TEST_PASS, (test) => {
        const suite = this.getTopLevelSuite(test);
        if (suite && this._suites.has(suite)) {
          this._suites.get(suite).passed++;
        }
      })
      .on(EVENT_TEST_FAIL, (test, err) => {
        const suite = this.getTopLevelSuite(test);
        if (suite && this._suites.has(suite)) {
          const suiteData = this._suites.get(suite);
          suiteData.failed++;
          suiteData.failures.push({ test, err });
        }
      })
      .on(EVENT_TEST_PENDING, (test) => {
        const suite = this.getTopLevelSuite(test);
        if (suite && this._suites.has(suite)) {
          this._suites.get(suite).pending++;
        }
      })
      .on(EVENT_SUITE_END, (suite) => {
        if (suite.root) return;
        
        // Only report top-level suites
        if (this._suites.has(suite)) {
          const suiteData = this._suites.get(suite);
          const duration = Date.now() - suiteData.startTime;
          this.reportSuite(suiteData, duration);
        }
      })
      .once(EVENT_RUN_END, () => {
        this.epilogue(stats);
      });
  }

  getSuiteDisplayName(suite) {
    // Extract file name without path and extension
    if (suite.file) {
      const parts = suite.file.split('/');
      const fileName = parts[parts.length - 1];
      return fileName.replace(/\.(test|spec)?\.(js|ts)$/, '');
    }
    return suite.title || 'unknown';
  }

  getTopLevelSuite(test) {
    let suite = test.parent;
    while (suite && suite.parent && !suite.parent.root) {
      suite = suite.parent;
    }
    return suite;
  }

  reportSuite(suiteData, duration) {
    const total = suiteData.passed + suiteData.failed + suiteData.pending;
    const durationSec = (duration / 1000).toFixed(1);
    
    if (suiteData.failed > 0) {
      // Failed - show details
      console.log(`  \x1b[31m✗\x1b[0m ${suiteData.title} (${suiteData.passed}/${total} tests passed, ${durationSec}s)`);
      
      // Show each failure
      suiteData.failures.forEach(({ test, err }) => {
        console.log(`    \x1b[31m✗\x1b[0m ${test.title}`);
        
        // Show error message (first line only)
        const errorMsg = err.message.split('\n')[0];
        console.log(`      \x1b[90m${errorMsg}\x1b[0m`);
      });
      console.log('');
    } else if (suiteData.pending > 0) {
      // Pending tests
      console.log(`  \x1b[36m-\x1b[0m ${suiteData.title} (${total} tests, ${suiteData.pending} pending, ${durationSec}s)`);
    } else {
      // All passed
      const testWord = total === 1 ? 'test' : 'tests';
      console.log(`  \x1b[32m✓\x1b[0m ${suiteData.title} (${total} ${testWord}, ${durationSec}s)`);
    }
  }

  epilogue(stats) {
    console.log('');
    
    // Summary
    const fmt = (n, word) => {
      return n + ' ' + (n === 1 ? word : word + 's');
    };

    if (stats.passes > 0) {
      console.log(`  \x1b[32m${fmt(stats.passes, 'passing')}\x1b[0m \x1b[90m(${(stats.duration / 1000).toFixed(1)}s)\x1b[0m`);
    }
    
    if (stats.pending > 0) {
      console.log(`  \x1b[36m${fmt(stats.pending, 'pending')}\x1b[0m`);
    }
    
    if (stats.failures > 0) {
      console.log(`  \x1b[31m${fmt(stats.failures, 'failing')}\x1b[0m`);
    }
    
    console.log('');
  }
}

module.exports = MinimalReporter;

