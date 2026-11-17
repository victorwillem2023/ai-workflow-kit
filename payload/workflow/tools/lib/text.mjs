// Splitting a file's text into lines, whatever its line endings: on Windows (core.autocrlf=true) checked-out files have CRLF,
// and a plain split('\n') leaves a \r on every line, so a rule that anchors on $ misses. Git's own output and the logs the tools
// write are always LF; anything read from a checked-out file goes through here.

/** The lines of a text, split on LF or CRLF (no line keeps a \r). */
export const lines = (text) => text.split(/\r?\n/);
