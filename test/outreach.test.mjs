// The rules that make "a model may write the words" safe.
//
// Every one of these is the code half of a promise AGENTS.md makes. If a check
// here goes soft, the promise becomes doctrine — and doctrine is what an agent
// talks itself out of at 2am when the sheet looks empty.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateDraft, enforceOutreach, sharesPhrase, normalizeWords, firstNameOf,
  formatOutreachRejections, postTextOf, unfoundedClaim, planOutreachWrites,
  MAX_DM, MAX_COMMENT,
} from "../src/outreach.mjs";
import { composeComment, composeIntroDM, recentPostCell } from "../src/evidence.mjs";
import { toLeadRow, toRefreshSet, planSheetUpdate } from "../src/merge.mjs";
import { buildValueUpdates } from "../src/sheetPlan.mjs";
import { canonicalKey } from "../src/url.mjs";
import { runPipeline } from "../src/pipeline.mjs";

const POST =
  '"Capacity is the constraint nobody budgets for. We stopped hiring against the backlog ' +
  'and mapped the handoffs instead."\n(2026-07-29)';

const good = {
  name: "Dara Okonjo",
  postText: POST,
  dm: 'Hi Dara, "capacity is the constraint nobody budgets for" is the bit I keep coming back to — we see the same thing. What made you look at the handoffs first?',
};

test("a grounded, in-voice draft passes", () => {
  const r = validateDraft({ text: good.dm, kind: "dm", name: good.name, postText: good.postText });
  assert.equal(r.ok, true, r.errors.join("; "));
});

test("grounding is the anti-fabrication check and it cannot be talked around", () => {
  // Fluent, on-topic, complimentary, addressed correctly — and about a post
  // this person never wrote. This is the exact failure a model introduces and
  // the only one a human reading the sheet would not catch.
  const invented = "Hi Dara, loved your piece on hiring senior operators before product-market fit. Curious how that has played out?";
  const r = validateDraft({ text: invented, kind: "dm", name: good.name, postText: good.postText });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /consecutive words/);

  assert.equal(sharesPhrase("we mapped the handoffs instead of hiring", POST), true);
  assert.equal(sharesPhrase("mapped the handoffs", POST), false, "three words is not enough");
  assert.equal(sharesPhrase("something else entirely", POST), false);
  // Typography must never be the reason a real quote fails: curly quotes, an em
  // dash and a stray capital are all the same four words underneath.
  assert.equal(sharesPhrase("“Capacity is the constraint” — nobody budgets for it", POST), true);
  assert.equal(sharesPhrase("‘capacity is the constraint nobody budgets’ for", POST), true);
  // And a paraphrase that reuses only the topic words is still not a quotation.
  assert.equal(sharesPhrase("capacity, backlog, handoffs — the usual three", POST), false);
});

test("length limits are per field", () => {
  const filler = " " + "the constraint nobody budgets for".repeat(20);
  const long = "Hi Dara, capacity is the constraint nobody budgets for." + filler;
  assert.ok(long.length > MAX_DM);
  assert.match(
    validateDraft({ text: long, kind: "dm", name: good.name, postText: POST }).errors.join(" "),
    new RegExp(`${MAX_DM}-character`),
  );
  assert.match(
    validateDraft({ text: long, kind: "comment", name: good.name, postText: POST }).errors.join(" "),
    new RegExp(`${MAX_COMMENT}-character`),
  );
});

test("pipe soup, URLs and mid-word truncation are each named", () => {
  const base = { kind: "dm", name: good.name, postText: POST };
  assert.match(
    validateDraft({ ...base, text: "Hi Dara, capacity is the constraint nobody budgets for | Founder | Advisor" }).errors.join(" "),
    /"\|"/,
  );
  assert.match(
    validateDraft({ ...base, text: "Hi Dara, capacity is the constraint nobody budgets for — see https://example.com" }).errors.join(" "),
    /URL/,
  );
  // "backl…" is the start of "backlog" in the post and not a word of its own.
  assert.match(
    validateDraft({ ...base, text: "Hi Dara, capacity is the constraint nobody budgets for, hiring against the backl… stood out" }).errors.join(" "),
    /mid-word/,
  );
  // "backlog…" ends a whole word, so it is a quotation, not a bug.
  assert.equal(
    validateDraft({ ...base, text: 'Hi Dara, "capacity is the constraint nobody budgets for, we stopped hiring against the backlog…" — what changed first?' }).ok,
    true,
  );
});

test("a draft may not greet somebody else", () => {
  const r = validateDraft({
    text: "Hi Sam, capacity is the constraint nobody budgets for — how did you get there?",
    kind: "dm", name: "Dara Okonjo", postText: POST,
  });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /greets "Sam" but column A says "Dara"/);
  assert.equal(firstNameOf("Dara Okonjo"), "Dara");
  assert.equal(firstNameOf(""), "");
  // Accents and case are not a mismatch.
  assert.equal(
    validateDraft({ text: "hi josé, capacity is the constraint nobody budgets for?", kind: "dm", name: "José Marín", postText: POST }).ok,
    true,
  );
});

test("with no post captured, a draft may not pretend there was one", () => {
  const claim = "Hi Dara, your recent post really landed with me. Open to connecting?";
  const r = validateDraft({ text: claim, kind: "dm", name: "Dara Okonjo", postText: "" });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /nobody observed/);

  // A message that claims nothing is fine without a post.
  assert.equal(
    validateDraft({
      text: "Hi Dara, I have been paying attention to how people in Fractional COO roles are approaching this. Open to connecting?",
      kind: "dm", name: "Dara Okonjo", postText: "",
    }).ok,
    true,
  );
  // But a COMMENT with no post behind it is always wrong: there is nothing to
  // comment on. This is the invariant column D and column I have always had.
  assert.equal(validateDraft({ text: "Great thread, thanks for sharing.", kind: "comment", name: "Dara", postText: "" }).ok, false);
});

test("an empty draft is not a failure — it is what a failed draft becomes", () => {
  assert.equal(validateDraft({ text: "", kind: "dm", name: "Dara", postText: POST }).ok, true);
  assert.equal(validateDraft({ text: "   ", kind: "comment", name: "Dara", postText: "" }).ok, true);
});

test("enforceOutreach blanks what fails and says why, keeping what passes", () => {
  const r = enforceOutreach({
    name: good.name,
    postText: POST,
    comment: "Nice one.",                       // ungrounded -> blanked
    dm: good.dm,                                 // grounded  -> kept
  });
  assert.equal(r.comment, "", "a failing draft is blanked, never repaired");
  assert.equal(r.dm, good.dm);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].field, "Suggested Comment");
  assert.match(formatOutreachRejections([{ name: good.name, rejected: r.rejected }]), /Dara Okonjo — Suggested Comment left blank/);
  assert.equal(formatOutreachRejections([]), "");
});

// --- the gate is on the WRITE path, so nothing reaches a cell unchecked -----

test("an invented message cannot reach a sheet cell by any route", () => {
  const cells = toLeadRow({
    name: "Dara Okonjo",
    url: "https://www.linkedin.com/in/dara-okonjo",
    recentPost: POST,
    comment: "Totally agree, this is why we built our whole practice around it.",
    introDM: "Hi Dara, loved your piece on hiring senior operators. Coffee?",
  }, { nowIso: "2026-08-01T00:00:00Z" });
  assert.equal(cells["Suggested Comment"], "", "an ungrounded comment must not be written");
  assert.equal(cells["Suggested Intro DM"], "", "an ungrounded DM must not be written");
  // The evidence around it is untouched: the gap is visible, not papered over.
  assert.equal(cells["Recent Post (verbatim + date)"], POST);
});

test("a plan reports the drafts it blanked, and never writes the reason to Notes", () => {
  const plan = planSheetUpdate({ rows: [] }, [{
    name: "Dara Okonjo",
    url: "https://www.linkedin.com/in/dara-okonjo",
    accepted: true, score: 60,
    recentPost: POST,
    comment: "Nice one.",
    introDM: good.dm,
  }], { nowIso: "2026-08-01T00:00:00Z" });

  assert.equal(plan.counts.outreachRejected, 1);
  assert.equal(plan.outreachRejected[0].name, "Dara Okonjo");
  assert.match(plan.outreachRejected[0].rejected[0].reasons.join(" "), /consecutive words/);
  // The reason exists and is reported — and it appears in no cell of the row.
  // Notes (column Q) is the obvious place to put it and belongs to the person.
  const reason = plan.outreachRejected[0].rejected[0].reasons[0];
  for (const [header, value] of Object.entries(plan.newRows[0].cells)) {
    assert.ok(!String(value).includes(reason.slice(0, 25)),
      `the rejection reason leaked into column "${header}"`);
  }
  assert.equal(plan.newRows[0].cells["Notes"], "");
});

// --- the offline templates are held to the same bar as an agent's drafts ----

test("the fallback templates pass the validator they now share", () => {
  const candidate = {
    name: "Dara Okonjo",
    activity: {
      type: "post",
      date: "2026-07-29",
      url: "https://www.linkedin.com/feed/update/urn:li:activity:1",
      summary: "Capacity is the constraint nobody budgets for. We stopped hiring against the backlog and mapped the handoffs instead.",
    },
  };
  const postText = `"${candidate.activity.summary}"\n(2026-07-29)`;
  const comment = composeComment(candidate);
  const dm = composeIntroDM(candidate, { buyer_titles: ["Fractional COO"] });

  const c = validateDraft({ text: comment, kind: "comment", name: candidate.name, postText });
  const d = validateDraft({ text: dm, kind: "dm", name: candidate.name, postText });
  assert.equal(c.ok, true, `template comment fails its own validator: ${c.errors.join("; ")}`);
  assert.equal(d.ok, true, `template DM fails its own validator: ${d.errors.join("; ")}`);
});

test("normalizeWords is punctuation- and accent-blind", () => {
  assert.deepEqual(normalizeWords('  "José’s   ops-team" — fast! '), ["jose", "s", "ops", "team", "fast"]);
  assert.deepEqual(normalizeWords(""), []);
});

// --- with NO post captured, a draft may claim nothing at all ----------------

test("an invented biography is rejected even though it names no post", () => {
  // The first version of this check was a blocklist of four nouns — post,
  // comment, update, article — and every one of these walked straight past it.
  // The space of ways to make something up about a stranger is unbounded, so
  // the check is an allowlist of abstract nouns instead.
  const fabrications = [
    "Hi Dara, loved your piece on hiring senior operators before product-market fit. How did it land?",
    "Hi Dara, your thread on scaling ops without headcount was excellent. Open to connecting?",
    "Hi Dara, you published something last week about capacity that stuck with me. Open to a chat?",
    "Hi Dara, I read your newsletter on operating cadence and had a question.",
    "Hi Dara, saw you have been rebuilding the ops function at Vale Partners after the Series B.",
    "Hi Dara, your recent write-up on delivery quality was sharp. Open to connecting?",
  ];
  for (const text of fabrications) {
    const r = validateDraft({ text, kind: "dm", name: "Dara Okonjo", postText: "" });
    assert.equal(r.ok, false, `a fabricated claim passed: ${text}`);
    assert.match(r.errors.join(" "), /nobody observed/);
  }
});

test("with no post, asking for their view is still allowed", () => {
  const honest = [
    "Hi Dara, I have been paying attention to how people in Fractional COO roles are approaching this and would value your perspective. Open to connecting?",
    "Hi Dara, I work with fractional operators on delivery capacity and would value your take. Open to connecting?",
    "Hi Dara, would love your read on how advisory firms handle delivery handoffs. Worth a quick exchange?",
  ];
  for (const text of honest) {
    const r = validateDraft({ text, kind: "dm", name: "Dara Okonjo", postText: "" });
    assert.equal(r.ok, true, `an honest, claim-free message was rejected: ${text} -> ${r.errors.join("; ")}`);
  }
  assert.equal(unfoundedClaim("would value your take and your perspective"), "");
  assert.match(unfoundedClaim("loved your piece on ops"), /your piece/);
  // The rule is strict on purpose, and this is the edge it cuts: "firms your
  // size" sounds harmless and asserts a company size nobody looked up.
  assert.match(unfoundedClaim("how firms your size handle handoffs"), /your size/);
});

// --- grounding runs against the POST, not the cell we wrapped it in ---------

test("the date stamp this system adds is not something a draft may quote", () => {
  const cell = recentPostCell({ activity: { summary: "We are hiring.", date: "2026-07-29" } }, false);
  assert.match(cell, /older than 7 days/);
  assert.equal(postTextOf(cell), "We are hiring.");
  // Echoing our own formatting is not evidence of having read anything.
  const r = validateDraft({
    text: "Hi Dara, saw this was older than 7 days but wanted to reach out anyway.",
    kind: "dm", name: "Dara Okonjo", postText: cell,
  });
  assert.equal(r.ok, false, "a draft quoted the date stamp instead of the post");

  assert.equal(postTextOf('"A post."\n(2026-07-29)'), "A post.");
  assert.equal(postTextOf("(2026-07-29)"), "", "a cell with only a stamp holds no post");
  assert.equal(postTextOf(""), "");
});

test("a post shorter than four words can still be quoted", () => {
  // "We are hiring." is a real post. Demanding four consecutive words from a
  // three-word post made the row permanently unfillable and blamed the drafter.
  const cell = recentPostCell({ activity: { summary: "We are hiring.", date: "2026-07-29" } }, true);
  const ok = validateDraft({
    text: 'Hi Dara, "we are hiring" — what is the first role you are trying to take off your own plate?',
    kind: "dm", name: "Dara Okonjo", postText: cell,
  });
  assert.equal(ok.ok, true, ok.errors.join("; "));
  // And a draft that does not quote it at all still fails.
  assert.equal(
    validateDraft({ text: "Hi Dara, congratulations on the growth. Worth a chat?", kind: "dm", name: "Dara Okonjo", postText: cell }).ok,
    false,
  );
  // The templates cope with a short post too, which is what the earlier version
  // of this suite only ever checked against one long one.
  const short = { name: "Dara Okonjo", activity: { type: "post", date: "2026-07-29", summary: "We are hiring." } };
  const c = composeComment(short);
  assert.equal(validateDraft({ text: c, kind: "comment", name: short.name, postText: cell }).ok, true, c);
  const d = composeIntroDM(short, { buyer_titles: ["Fractional COO"] });
  assert.equal(validateDraft({ text: d, kind: "dm", name: short.name, postText: cell }).ok, true, d);
});

// --- a refresh must never erase the drafts validate-outreach just wrote -----

test("re-sourcing someone does not blank the comment and DM already in their row", () => {
  // The failure this prevents: pilot writes rows with I and J blank, the agent
  // drafts them, validate-outreach fills them in — and the next scheduled run
  // re-inspects the same people and writes "" over both. Silent weekly deletion
  // of the only cells the person was told to act on.
  const set = toRefreshSet({
    name: "Dara Okonjo", title: "Fractional COO", url: "https://www.linkedin.com/in/dara-okonjo",
    score: 60, recentPost: POST, comment: "", introDM: "",
  }, { nowIso: "2026-08-01T00:00:00Z" });
  assert.ok(!("Suggested Comment" in set), "a blank draft must leave column I alone");
  assert.ok(!("Suggested Intro DM" in set), "a blank draft must leave column J alone");
  // The concrete write must not target I or J either.
  const { cellUpdates } = buildValueUpdates({ newRows: [], updates: [{ rowNumber: 7, set }] });
  for (const u of cellUpdates) {
    assert.ok(!/^Leads![IJ]\d/.test(u.range), `${u.range} would overwrite a drafted message`);
  }
  // A draft that IS supplied still refreshes.
  const withDraft = toRefreshSet({ name: "Dara Okonjo", recentPost: POST, dm: "", introDM: good.dm, score: 60 }, {});
  assert.equal(withDraft["Suggested Intro DM"], good.dm);
});

test("a live run leaves I and J blank; an offline one fills them from templates", () => {
  const persona = {
    buyer_titles: ["Fractional COO"], core_topics: ["capacity"],
    geography: { include: ["United States"] }, exclusions: [],
  };
  const candidate = {
    name: "Dara Okonjo", title: "Fractional COO", location: "Austin, United States",
    url: "https://www.linkedin.com/in/dara-okonjo",
    activity: { summary: "Capacity is the constraint nobody budgets for.", date: "2026-07-29", url: "u", type: "post" },
  };
  const args = { persona, existingSheet: { rows: [] }, candidates: [candidate], nowMs: Date.parse("2026-08-01T00:00:00Z"), nowIso: "2026-08-01T00:00:00Z" };

  const live = runPipeline({ ...args, composeOpeners: false }).plan.newRows[0].cells;
  assert.equal(live["Suggested Comment"], "");
  assert.equal(live["Suggested Intro DM"], "");
  assert.match(live["Recent Post (verbatim + date)"], /Capacity is the constraint/, "the evidence still lands");
  assert.ok(live["Why Them"].length > 0);

  const offline = runPipeline({ ...args, composeOpeners: true }).plan.newRows[0].cells;
  assert.ok(offline["Suggested Comment"].length > 0);
  assert.ok(offline["Suggested Intro DM"].length > 0);
});

// --- what validate-outreach actually does, without a Google account ---------

const sheetRows = [
  {
    rowNumber: 4,
    cells: {
      "Name": "Dara Okonjo",
      "LinkedIn (or profile URL)": "https://www.linkedin.com/in/dara-okonjo",
      "Recent Post (verbatim + date)": POST,
      "Canonical Key": "https://www.linkedin.com/in/dara-okonjo",
      "Reached Out": "TRUE", "Notes": "spoke at the summit",
    },
  },
];

test("planOutreachWrites writes only what passed, only to I and J", () => {
  const { updates, failures, unmatched } = planOutreachWrites({
    rows: sheetRows,
    drafts: [
      { url: "https://www.linkedin.com/in/dara-okonjo", comment: "Nice one.", dm: good.dm },
      { url: "https://www.linkedin.com/in/nobody-here", dm: "Hi there." },
    ],
    keyOf: canonicalKey,
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].rowNumber, 4);
  assert.deepEqual(Object.keys(updates[0].set), ["Suggested Intro DM"], "the failing comment is simply absent");
  assert.equal(failures.length, 1);
  assert.deepEqual(unmatched, ["https://www.linkedin.com/in/nobody-here"]);

  // And the concrete ranges never reach the human band.
  const { cellUpdates } = buildValueUpdates({ newRows: [], updates });
  for (const u of cellUpdates) assert.match(u.range, /^Leads![IJ]4$/);
});

test("a draft cannot be written onto a person this system never researched", () => {
  const { updates, unmatched } = planOutreachWrites({
    rows: [],
    drafts: [{ url: "https://www.linkedin.com/in/dara-okonjo", dm: good.dm }],
    keyOf: canonicalKey,
  });
  assert.equal(updates.length, 0);
  assert.equal(unmatched.length, 1);
});

test("every draft is checked against ITS OWN row's post, not any row's", () => {
  // Grounding is only a real check if the post it grounds against belongs to the
  // person being messaged.
  const rows = [
    ...sheetRows,
    { rowNumber: 5, cells: { "Name": "Marisol Vega", "Canonical Key": "https://www.linkedin.com/in/marisol-vega", "LinkedIn (or profile URL)": "https://www.linkedin.com/in/marisol-vega", "Recent Post (verbatim + date)": '"Every ops audit finds the same thing first."\n(2026-07-26)' } },
  ];
  const { updates, failures } = planOutreachWrites({
    rows,
    // Dara's post, sent to Marisol.
    drafts: [{ url: "https://www.linkedin.com/in/marisol-vega", dm: good.dm }],
    keyOf: canonicalKey,
  });
  assert.equal(updates.length, 0);
  assert.equal(failures[0].rowNumber, 5);
  assert.match(failures[0].rejected[0].reasons.join(" "), /consecutive words/);
});
