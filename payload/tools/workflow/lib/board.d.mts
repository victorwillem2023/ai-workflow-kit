/** `types`: the type labels (ui, feature, bug, workflow); when set, a card needs exactly one. */
/** `labels`: the area, effort and feasibility labels /idea may use; `--init` makes them and `--check` reports the ones the repo lacks. */
export interface Board { owner: string; repo: string; project: number; field?: string; columns: string[]; types?: string[]; labelColor?: string; labels?: { areas?: string[]; effort?: string[]; feasibility?: string[] } }
export interface GhResult { status: number | null; stdout: string; stderr: string; error?: Error & { code?: string } }
export type GhRunner = (args: string[], input?: string) => GhResult;
export interface Card { number: number; title: string; body: string; state: string; url: string; labels: string[]; column: string | null }
/** Board and label facts read once and reused across calls. */
export interface BoardCache { field?: unknown; projectId?: string; labels?: Set<string>; itemIds?: Map<number, string> }
export function boardCache(): BoardCache;
/** `card` is set when createCard made the issue but could not put it on the board or in its column. */
export class BoardError extends Error { card?: { number: number; url: string } }
export function createCard(board: Board, run: GhRunner, card: { title: string; body?: string; labels?: string[]; column: string }, cache?: BoardCache): { number: number; url: string; itemId: string };
export function moveCard(board: Board, run: GhRunner, number: number, column: string, cache?: BoardCache): void;
export function commentCard(board: Board, run: GhRunner, number: number, text: string): void;
/** Moves card #number to the Blocked column and comments "Blocked: <reason>"; an empty reason is refused before any call. */
export function blockCard(board: Board, run: GhRunner, number: number, reason: string, cache?: BoardCache): void;
export function readCard(board: Board, run: GhRunner, number: number): Card;
export function searchCards(board: Board, run: GhRunner, words: string): { number: number; title: string; state: string; column: string | null }[];
/** `unknownLabels`: labels the config names (types and `labels`) that the repo does not have. */
export function checkBoard(board: Board, run: GhRunner, cache?: BoardCache): { columns: string[]; missing: string[]; untyped: { number: number; title: string }[]; unknownLabels: string[] };
export function labelGroups(board: Board): { types: string[]; areas: string[]; effort: string[]; feasibility: string[] };
/** Makes what the config describes and the board lacks: labels, the project itself (when `project` is not a number), the columns. */
export function initBoard(board: Board, run: GhRunner, cache?: BoardCache, opts?: { title?: string }): { project: number; created: boolean; labelsMade: string[]; columnsAdded: string[] };
