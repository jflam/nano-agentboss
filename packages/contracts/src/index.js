export function createRunRef(sessionId, runId) {
    return { sessionId, runId };
}
export function createRef(run, path) {
    return { run, path };
}
export function createSessionRef(sessionId) {
    return { sessionId };
}
