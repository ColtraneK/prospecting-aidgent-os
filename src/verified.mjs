// verified.mjs — "this was proved to work", recorded where a later command can
// read it.
//
// `npm run start` is offline by contract, so for anything only a remote
// service can settle — is this LinkedIn session live, can the service account
// open this Sheet — the commands that DO reach out record what they proved,
// and the checklist reads the record instead of guessing. A proof is bound to
// the exact thing it proved, so changing the thing invalidates the proof.
// Proof files describe one machine, live in git-ignored private/, and are
// NEVER written by hand — forging one re-creates the false-READY bug.

import fsDefault from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./config.mjs";

/** Proofs live in private/, which is git-ignored: they describe one machine. */
export const PROOF_DIR = path.join(REPO_ROOT, "private");

/**
 * Record that something was just proved to work. Never throws: a read-only
 * disk is a worse reason to fail than the state this describes.
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

// --- the Sheet -------------------------------------------------------------

export const SHEET_PROOF_FILE = path.join(PROOF_DIR, "sheet-verified.json");

/**
 * Did `npm run check-sheet` actually open THIS spreadsheet as the service
 * account? That is the only evidence the person completed the step everyone
 * skips: sharing the sheet with the key's client_email.
 */
export function recordSheetProof({ sheetId, nowIso } = {}, deps = {}) {
  return recordProof(
    { file: deps.proofFile || SHEET_PROOF_FILE, fingerprint: String(sheetId || ""), method: "service account", nowIso },
    deps,
  );
}

export function sheetProofState({ sheetId, proofFile } = {}, deps = {}) {
  const id = String(sheetId || "");
  const SHARE = [
    "Share your sheet with the service account, if you have not already. Open the .json key file, copy the client_email value inside it — it ends in .iam.gserviceaccount.com — then open your sheet, click Share, paste that address, set it to Editor, and Send.",
    "This is a separate action from making the sheet, and it is the one people skip. The service account is a different Google identity from your own login, so being able to open the sheet yourself says nothing about whether the tool can.",
  ].join("\n");
  const CHECK = "npm run check-sheet";
  if (!id) {
    return { ok: false, reason: "no sheet is bound yet, so there is nothing to check.", fix: "Bind the sheet you own first.", command: CHECK };
  }
  const proof = readProof({ file: proofFile || SHEET_PROOF_FILE }, deps);
  if (!proof) {
    return {
      ok: false,
      reason: "nothing has confirmed the service account can open this sheet. Binding a sheet only writes down its id; it does not prove the robot account was given access to it.",
      fix: SHARE, command: CHECK,
    };
  }
  if (proof.fingerprint !== id) {
    return { ok: false, reason: "the last sheet that was checked was a different one, so it says nothing about this sheet.", fix: SHARE, command: CHECK };
  }
  return { ok: true, reason: `the service account opened this sheet on ${proof.verifiedAt}.`, fix: "", command: "" };
}
