export const CHECKLIST: string[];
export const SIGNOFFS: string;
export const SIGNERS: string;
type Row = { date: string; who: string; fingerprint: string; files: string[]; signature: string };
type Signer = { who: string; key: string; added: string; endorsed: string };
export function sensitiveFiles(changed: string[], paths: string[], matches: (f: string, globs: string[]) => boolean): string[];
export function fingerprint(files: string[], read: (f: string) => string | null | undefined): string;
export function makeKey(passphrase: string): { publicKey: string; privateKey: string };
export function parseSignoffs(md: string | null | undefined): Row[];
export function parseSigners(md: string | null | undefined): Signer[];
export function signoffRow(r: { date: string; who: string; print: string; files: string[]; privateKey: string; passphrase: string }): string;
export function signerRow(r: { who: string; key: string; date: string; endorser?: { privateKey: string; passphrase: string } }): string;
export function trustedKeys(baseSigners: string | null | undefined, nowSigners: string | null | undefined): string[];
export function signoffVerdict(a: {
  changed: string[];
  paths: string[];
  matches: (f: string, globs: string[]) => boolean;
  read: (f: string) => string | null | undefined;
  signoffs: string | null | undefined;
  /** SIGNERS.md on the branch the change left (main), and as it is now */
  baseSigners: string | null | undefined;
  signers: string | null | undefined;
}): { ok: boolean; files: string[]; print?: string; line?: string };
