'use strict';

// Canonical AgentPaw identity. Runtime modules import these values instead of
// repeating product, protocol and storage names in several independent places.
module.exports = Object.freeze({
  name: 'AgentPaw',
  displayName: 'AgentPaw',
  fullName: 'AgentPaw',
  appId: 'io.github.vista-zhangg.agentpaw',
  serverId: 'agentpaw',
  serverHeader: 'x-agentpaw-server',
  tokenHeader: 'x-agentpaw-token',
  stateDirName: '.agentpaw',
});
