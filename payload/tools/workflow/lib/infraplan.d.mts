export interface PlanChange { address: string; type: string; action: 'create' | 'update' | 'delete' | 'replace'; startup: boolean; name?: string; labels?: string[] }
export interface NamingOptions { rules?: { pattern: string; say?: string; except?: string[] }[]; labels?: string[] }
export function namingProblems(changes: PlanChange[], options?: NamingOptions): string[];
export interface ExpectLine { action: string; address: string; matches: (c: PlanChange) => boolean }
export interface PlanReview { rows: (PlanChange & { expected: boolean })[]; problems: string[]; warnings: string[] }
export const PROTECTED: RegExp;
export function fromTofuPlan(json: unknown): PlanChange[];
export function fromPulumiPreview(json: unknown): PlanChange[];
export function parseExpect(text: string): ExpectLine[];
export function reviewPlan(changes: PlanChange[], options?: { expect?: ExpectLine[] | null; protect?: RegExp; allowDestroy?: string[]; naming?: NamingOptions }): PlanReview;
export function renderReview(stack: string, review: PlanReview): string;
