// pipeline.mjs — pure orchestration: score candidates, compose evidence-based
// fields (recent post cell, why-them, suggested comment, suggested intro DM) for
// accepted ones, and plan the sheet update. No network, no browser.

import { scoreCandidate } from "./scoring.mjs";
import { recentPostCell, postLinkCell, composeWhyThem, composeComment, composeIntroDM } from "./evidence.mjs";
import { planSheetUpdate } from "./merge.mjs";

/**
 * @param {object} o
 * @param {boolean} [o.composeOpeners=true]
 *   Whether to fill columns I and J from the templates in evidence.mjs.
 *
 *   v5 splits this. On a LIVE run cli.mjs passes false: the row lands carrying
 *   only evidence — the post verbatim in D, its link in E, the scorer's reasons
 *   in H — and the driving agent then drafts I and J against that evidence and
 *   submits them through `npm run validate-outreach`, which checks them in code
 *   before a cell is written. A model writes the words; nothing about who
 *   qualifies moved.
 *
 *   Offline paths keep the templates, because a dry-run on a laptop with no
 *   model has to show what the output looks like, and a demo of two empty
 *   columns demonstrates nothing.
 */
export function runPipeline({ persona, existingSheet, candidates, nowMs = Date.now(), nowIso = new Date().toISOString(), sourceType = "LinkedIn", threshold, composeOpeners = true } = {}) {
  const scored = candidates.map((c) => {
    const s = scoreCandidate(persona, c, { nowMs, ...(threshold ? { threshold } : {}) });
    const out = {
      ...c,
      score: s.score,
      accepted: s.accepted,
      rejectedReason: s.rejectedReason,
      scoreFactors: s.factors,
      recent: s.recent,
      topicHit: s.topicHit,
    };
    if (s.accepted) {
      out.recentPost = c.recentPost || recentPostCell(c, s.recent);
      out.postLink = c.postLink || postLinkCell(c);
      out.whyThem = c.whyThem || composeWhyThem(c, s.factors);
      if (composeOpeners) {
        out.comment = c.comment || composeComment(c);
        out.introDM = c.introDM || composeIntroDM(c, persona);
      } else {
        out.comment = c.comment || "";
        out.introDM = c.introDM || "";
      }
    }
    return out;
  });

  // Rank: recent-topic activity first, then score. (Priority signal.)
  scored.sort((a, b) => rankKey(b) - rankKey(a));

  const plan = planSheetUpdate(existingSheet, scored, { nowIso, sourceType });
  return { scored, plan, counts: plan.counts };
}

function rankKey(s) {
  const priority = s.recent && s.topicHit ? 2 : s.recent || s.topicHit ? 1 : 0;
  return priority * 1000 + (Number(s.score) || 0);
}
