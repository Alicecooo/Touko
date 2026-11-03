// Nothing here reaches a real browser, the user's data or port 8799.

const asked = (turn: any): string => JSON.stringify(turn.prompt?.message?.content ?? "");

// The browser stand-in is a shell script; the mount only needs it to exist.
