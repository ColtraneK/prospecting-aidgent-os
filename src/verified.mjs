// verified.mjs — "this was proved to work", recorded where a later command can read it.
//
// WHY THIS EXISTS
// `npm run start` is offline by contract: no browser, no network. So for
// anything that can only be settled by talking to a remote service — is this
// LinkedIn session live, can the service account actually open this Sheet — it
// has two choices. Guess from something local that correlates, or read a record
// left by a command that genuinely checked.
//
// It used to guess, twice, and was wrong both times in the same direction: a
// green tick over a broken setup. A cookie file inside a Chrome profile stood
// in for a LinkedIn session, and Chrome creates that file the moment it opens.
// Nothing at all stood in for "you shared the sheet with the service account",
// which is the single step people skip.
//
// So the commands that DO reach out record what they proved, and the checklist
// reads that. A proof is bound to a fingerprint of the exact thing it proved,
// so changing the thing invalidates the proof rather than inheriting its tick,
// and it expires, because remote access is not permanent.

import fsDefault from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { REPO_ROOT } from "./config.mjs";

/** Proofs live in private/, which is git-ignored: they describe one machine. */
export const PROOF_DIR = path.join(REPO_ROOT, "private");

export const DEFAULT_MAX_AGE_DAYS = 14;

/** Short, non-reversible stand-in for a value we must not store. */
export function fingerprintSecret(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

/**
 * Record that something was just proved to work.
 * Never throws: a read-only disk is a worse reason to fail than the state this
 * is trying to describe.
 */
export function recordProof({ file, fingerprint, method = "", nowIso } = {}, deps = {}) {
  const fs = deps.fs || fsDefault;
  if (!file || !fingerprint) return null;
  const proof = { fingerprint, method, verifiedAt: nowIso || new Date().toISOString() };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(proof, null, 2)}\n`);
  } catch {
    return null;
  }
  return proof;
}

export function readProof({ file } = {}, deps = {}) {
  const fs = deps.fs || fsDefault;
  try {
    const p = JSON.parse(fs.readFileSync(file, "utf8"));
    return p && typeof p.fingerprint === "string" ? p : null;
  } catch {
    return null;
  }
}

/**
 * Was THIS exact thing proved, recently enough to believe?
 * `missing`, `mismatch` and `expired` are given separately because they need
 * different sentences in front of a person: never checked, checked something
 * else, checked too long ago.
 *
 * @returns {{ok:boolean, state:string, verifiedAt:string, method:string, ageDays:number}}
 */
export function proofState(
  { file, fingerprint, nowMs = Date.now(), maxAgeDays = DEFAULT_MAX_AGE_DAYS } = {},
  deps = {},
) {
  if (!fingerprint) return { ok: false, state: "nothing-configured", verifiedAt: "", method: "", ageDays: 0 };
  const proof = readProof({ file }, deps);
  if (!proof) return { ok: false, state: "missing", verifiedAt: "", method: "", ageDays: 0 };
  if (proof.fingerprint !== fingerprint) {
    return { ok: false, state: "mismatch", verifiedAt: proof.verifiedAt || "", method: proof.method || "", ageDays: 0 };
  }
  const ageMs = nowMs - Date.parse(proof.verifiedAt || "");
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return { ok: false, state: "undated", verifiedAt: proof.verifiedAt || "", method: proof.method || "", ageDays: 0 };
  }
  const ageDays = Math.floor(ageMs / 86400000);
  if (ageMs > maxAgeDays * 86400000) {
    return { ok: false, state: "expired", verifiedAt: proof.verifiedAt, method: proof.method || "", ageDays };
  }
  return { ok: true, state: "ok", verifiedAt: proof.verifiedAt, method: proof.method || "", ageDays };
}

// --- the Sheet -------------------------------------------------------------

export const SHEET_PROOF_FILE = path.join(PROOF_DIR, "sheet-verified.json");

/**
 * Did `npm run check-sheet` actually open THIS spreadsheet as the service
 * account? That is the only evidence that the person completed the step
 * everyone skips: sharing the sheet with the key's client_email.
 */
export function recordSheetProof({ sheetId, nowIso } = {}, deps = {}) {
  return recordProof(
    { file: deps.proofFile || SHEET_PROOF_FILE, fingerprint: String(sheetId || ""), method: "service account", nowIso },
    deps,
  );
}

export function sheetProofState({ sheetId, nowMs, maxAgeDays, proofFile } = {}, deps = {}) {
  const id = String(sheetId || "");
  const st = proofState({ file: proofFile || SHEET_PROOF_FILE, fingerprint: id, nowMs, maxAgeDays }, deps);
  // Everything below is read by a person, so it describes what a PERSON does.
  // The command that checks it is the agent's job and is carried separately in
  // `command`: someone being walked through a setup should never be handed a
  // terminal instruction they did not ask for.
  const SHARE = [
    "Share your sheet with the service account, if you have not already. Open the .json key file, copy the client_email value inside it — it ends in .iam.gserviceaccount.com — then open your sheet, click Share, paste that address, set it to Editor, and Send.",
    "This is a separate action from making the sheet, and it is the one people skip. The service account is a different Google identity from your own login, so being able to open the sheet yourself says nothing about whether the tool can.",
  ].join("\n");
  const CHECK = "npm run check-sheet";
  switch (st.state) {
    case "ok":
      return { ...st, reason: `the service account opened this sheet on ${st.verifiedAt}.`, fix: "", command: "" };
    case "nothing-configured":
      return { ...st, reason: "no sheet is bound yet, so there is nothing to check.", fix: "Bind the sheet you own first.", command: CHECK };
    case "mismatch":
      return { ...st, reason: "the last sheet that was checked was a different one, so it says nothing about this sheet.", fix: SHARE, command: CHECK };
    case "expired":
      return { ...st, reason: `the service account last opened this sheet ${st.ageDays} days ago; access may have changed since.`, fix: "Nothing for you to do unless the check fails.", command: CHECK };
    case "undated":
      return { ...st, reason: "the recorded check has no usable date.", fix: "Nothing for you to do unless the check fails.", command: CHECK };
    default:
      return {
        ...st,
        reason: "nothing has confirmed the service account can open this sheet. Binding a sheet only writes down its id; it does not prove the robot account was given access to it.",
        fix: SHARE,
        command: CHECK,
      };
  }
}
