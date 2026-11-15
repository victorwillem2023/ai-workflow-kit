/** A node of the app map (docs/flow/map.js): a question with branches, or an end. */
export interface FlowNode { q?: string; yes?: FlowNode[]; no?: FlowNode[]; opts?: [string, FlowNode[]][]; t?: string; s?: string; card?: number[]; n?: string; f?: string }
export interface Flow { groups: { name: string; stages: { name: string; src?: string; tree: FlowNode[] }[] }[] }
export interface WorksheetCard { number: number; title: string; state: string; labels: string[]; column: string | null }
/** An end of the map: where it is (group › stage), its stage's source file, status ('built' when unmarked), cards and note. */
export interface MapEnd { where: string; src: string; text: string; status: string; cards: number[]; note: string }
/** Reads docs/flow/requests.js and docs/flow/map.js under `root` (requests first, as the page shows them). */
export function loadFlow(root: string): Flow;
export function mapEnds(flow: Flow): MapEnd[];
/** The worksheet as text, and the hygiene problems one line each; `all` lists every Backlog and Done card too. */
export function worksheet(flow: Flow, cards: WorksheetCard[], columns: string[], opts?: { all?: boolean }): { text: string; problems: string[] };
