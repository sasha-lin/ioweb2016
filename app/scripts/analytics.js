/**
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

window.IOWA = window.IOWA || {};

IOWA.Analytics = IOWA.Analytics || (function(exports) {
  'use strict';

  var GA_TRACKING_CODE = exports.ENV === 'prod' ? 'UA-58124138-1' : 'UA-58124138-2';

  /**
   * Analytics for the I/O Web App.
   *
   * @constructor
   * @param {string} trackingCode GA tracking code.
   */
  function Analytics(trackingCode) {
    this.loadTrackingCode();

    var opts = {siteSpeedSampleRate: 50}; // 50% of users.
    if (exports.ENV === 'dev') {
      // See https://developers.google.com/analytics/devguides/collection/analyticsjs/advanced#localhost
      opts.cookieDomain = 'none';
    } else {
      opts.cookiePath = window.PREFIX || '/io2016';
    }

    ga('create', trackingCode, opts);

    this.trackPageView(); // Track initial pageview.

    this.trackPerfEvent('HTMLImportsLoaded', 'Polymer');
    this.trackPerfEvent('WebComponentsReady', 'Polymer');

    this.trackNotificationPermission();

    var matches = exports.location.search.match(/utm_error=([^&]+)/);
    if (matches) {
      // Assume that the only time we'll be setting utm_error= is from the notification code.
      this.trackError('notification', decodeURIComponent(matches[1]));
    }

    /**
     * A collection of timing categories, each a collection of start times.
     * @private {!Object<string, Object<string, ?number>}
     */
    this.startTimes_ = {};
  }

  Analytics.prototype.POLYMER_ANALYTICS_TIMEOUT_ = 60 * 1000;

  // Disable es-lint for this boilerplate GA code.
  /* eslint-disable */
  Analytics.prototype.loadTrackingCode = function() {
    (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
    m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
    })(window,document,'script','//www.google-analytics.com/analytics.js','ga');
  };
  /*eslint-enable */

  /**
   * Tracks a page view. Page view tracking is throttled to prevent logging
   * page redirects by the URL router.
   * @param {string} opt_path Optional override page path to record.
   * @param {function} opt_callback Optional callback to be invoked after the
   *                   hit is recorded.
   */
  Analytics.prototype.trackPageView = function(opt_path, opt_callback) {
    var obj = {};
    if (opt_path) {
      obj.page = opt_path;
    }
    if (typeof opt_callback === 'function') {
      obj.hitCallback = opt_callback;
    }

    ga('send', 'pageview', obj);
  };

  /**
   * Tracks a performance timing. See
   * https://developers.google.com/analytics/devguides/collection/gajs/gaTrackingTiming#settingUp
   * @param {string} category Category of timing (e.g. 'Polymer')
   * @param {string} variable Name of the timing (e.g. 'polymer-ready')
   * @param {number} time Time, in milliseconds.
   * @param {string=} opt_label An optional sublabel, for e.g. A/B test identification.
   * @param {number=} opt_maxTime An optional max time, after which '- outliers' will be appended to variable name.
   * @param {object=} opt_obj Optional field object for additional params to send to GA.
   */
  Analytics.prototype.trackPerf = function(category, variable, time, opt_label, opt_maxTime, opt_obj) {
    if (opt_maxTime !== null && time > opt_maxTime) {
      variable += ' - outliers';
    }
    ga('send', 'timing', category, variable, parseInt(time, 10), opt_label, opt_obj);
  };

  /**
   * Tracks an event
   *
   * @param {string} category
   * @param {string} action
   * @param {string=} opt_label
   * @param {number=} opt_value
   * @param {function()} opt_callback Optional callback to be invoked after the
   *                   hit is recorded.
   */
  Analytics.prototype.trackEvent = function(category, action, opt_label, opt_value, opt_callback) {
    ga('send', {
      hitType: 'event',
      eventCategory: category,
      eventAction: action,
      eventLabel: opt_label,
      eventValue: opt_value,
      hitCallback: opt_callback
    });
  };

  /**
   * Tracks an error event.
   *
   * @param {string} location
   * @param {string} message
   */
  Analytics.prototype.trackError = function(location, message) {
    ga('send', 'event', 'error', location, String(message));

    // Note: GA has exception type but it does not show up in realtime so catching
    // errors would be 24hrs delayed. Stick with an error event until we decide
    // to switch. It also looks difficult to get this data out later on:
    // http://stackoverflow.com/questions/21718481/report-for-exceptions-from-google-analytics-analytics-js-exception-tracking
    // ga('send', 'exception', {
    //   //'exFatal': true,
    //   'exDescription': location + ' ' + String(message)
    // });
  };

  /**
   * Tracks a social action
   *
   * @param {string} network
   * @param {string} action
   * @param {string} target
   */
  Analytics.prototype.trackSocial = function(network, action, target) {
    ga('send', 'social', network, action, target);
  };

  /**
   * Log Polymer startup performance numbers.
   */
  Analytics.prototype.trackPerfEvent = function(eventName, categoryName) {
    // performance.now() is sadly disabled even in some very recent browsers
    // TODO(bckenny): for now, only do polymer perf analytics in browsers with it.
    if (!(exports.performance && exports.performance.now)) {
      return;
    }

    document.addEventListener(eventName, function() {
      var now = exports.performance.now();

      if (exports.ENV === 'dev') {
        console.info(eventName, '@', now);
      }

      this.trackPerf(categoryName, eventName, now, null,
                     this.POLYMER_ANALYTICS_TIMEOUT_, {page: location.pathname});
    }.bind(this));
  };

  /**
   * Stores a start time associated with a category and variable name. When an
   * end time is registered with matching variables, the time difference is
   * sent to analytics. Use unique names if a race condition between timings is
   * possible; if a start time with the same names is registerd without an end
   * time in between, the original start time is discarded.
   * @param {string} category Category of timing (e.g. 'Assets load time')
   * @param {string} variable Name of the timing (e.g. 'polymer-ready')
   * @param {number} timeStart A timestamp associated with start, in ms.
   */
  Analytics.prototype.timeStart = function(category, variable, timeStart) {
    var categoryTimes = this.startTimes_[category] || (this.startTimes_[category] = {});
    categoryTimes[variable] = timeStart;
  };

  /**
   * Ends a timing event. The difference between the time associated with this
   * event and the timeStart event with the matching category and variable names
   * is sent to analytics. If no match can be found, the time is discarded.
   * @param {string} category Category of timing (e.g. 'Assets load time')
   * @param {string} variable Name of the timing (e.g. 'polymer-ready')
   * @param {number} timeEnd A timestamp associated with end, in ms.
   * @param {string=} opt_label An optional sublabel, for e.g. A/B test identification.
   * @param {number=} opt_maxTime An optional max time, after which '- outliers' will be appended to variable name.
   */
  Analytics.prototype.timeEnd = function(category, variable, timeEnd, opt_label, opt_maxTime) {
    var categoryTimes = this.startTimes_[category];
    if (!categoryTimes) {
      return;
    }
    var timeStart = categoryTimes[variable];
    if (timeStart !== null) {
      this.trackPerf(category, variable, timeEnd - timeStart, opt_label, opt_maxTime);
      categoryTimes[variable] = null;
    }
  };

  /**
   * Sets up tracking for a notification permissions.
   * Tracks the current notification state at startup, and for browsers that support the
   * Permissions API, tracks changes to the notification state as well.
   */
  Analytics.prototype.trackNotificationPermission = function() {
    this.trackEvent('notifications', 'startup',
      exports.Notification ? exports.Notification.permission : 'unsupported');

    if (navigator.permissions) {
      var thisAnalytics = this;
      navigator.permissions.query({name: 'notifications'}).then(function(p) {
        p.onchange = function() {
          thisAnalytics.trackEvent('notifications', 'change', this.status);
        };
      });
    }
  };

  return new Analytics(GA_TRACKING_CODE);
})(window);
