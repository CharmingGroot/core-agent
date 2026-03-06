export const IPC_CHANNELS = {
    // Renderer -> Main
    SEND_MESSAGE: 'agent:send-message',
    ABORT: 'agent:abort',
    GET_CONFIG: 'config:get',
    SET_CONFIG: 'config:set',
    // Main -> Renderer
    AGENT_EVENT: 'agent:event',
    AGENT_RESPONSE: 'agent:response',
    AGENT_ERROR: 'agent:error',
    CONFIG_VALUE: 'config:value',
};
//# sourceMappingURL=ipc-channels.js.map