// pipeline.mjs — pure orchestration: score candidates, compose evidence-based
// fields (recent post cell, why-them, suggested comment, suggested intro DM) for
// accepted ones, and plan the sheet update. No network, no browser.

import { scoreCandidate } from "./scoring.mjs";
import { recentPostCell, composeWhyThem, composeComment, composeIntroDM } from "./evidence.mjs";
import { planSheetUpdate } from "./merge.mjs";

export function runPipeline({ persona, existingSheet, candidates, nowMs = Date.now(), nowIso = new Date().toISOString(), sourceType = "LinkedIn", threshold } = {}) {
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
      out.whyThem = c.whyThem || composeWhyThem(c);
      out.comment = c.comment || composeComment(c);
      out.introDM = c.introDM || composeIntroDM(c, persona);
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
