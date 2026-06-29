'use strict';

/**
 * New Relic agent 설정.
 */
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'convene-backend'],
  agent_enabled: Boolean(process.env.NEW_RELIC_LICENSE_KEY),
  distributed_tracing: {
    enabled: true,
  },
  logging: {
    level: process.env.NEW_RELIC_LOG_LEVEL || 'info',
  },
  application_logging: {
    enabled: true,
    forwarding: {
      enabled: true,
    },
    local_decorating: {
      enabled: false,
    },
    metrics: {
      enabled: true,
    },
  },
  attributes: {
    exclude: [
      'request.headers.authorization',
      'request.headers.cookie',
      'request.headers.setCookie',
      'response.headers.setCookie',
    ],
  },
};
