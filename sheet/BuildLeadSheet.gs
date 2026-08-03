/**
 * Maintainer utility for generating the canonical workshop template.
 * Attendees never run this: they use File > Make a copy of the hosted template.
 * It only initializes an empty workbook and never repairs a live Lead Sheet.
 */
function createWorkshopTemplate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const headers = [
    'Name', 'Title / Company', 'LinkedIn (or profile URL)',
    'Recent Signal', 'Evidence Link', 'Why Them', 'Suggested Opener', 'Fit Score',
    'Verification / Connection', 'Verified On', 'Next Step', 'Next Follow-up',
    'Connection Status', 'Reached Out On', 'Replied', 'Outcome', 'Date Added', 'Notes'
  ];
  const leads = getOrCreate_(ss, 'Leads');
  if (leads.getLastRow() > 1 && leads.getDataRange().getDisplayValues().some(row => row.some(Boolean))) {
    throw new Error('This workbook already contains data. Use a fresh workbook to generate a template. Never rebuild a live Leads tab.');
  }
  if (leads.getMaxColumns() < headers.length) leads.insertColumnsAfter(leads.getMaxColumns(), headers.length - leads.getMaxColumns());
  leads.clear({ contentsOnly: false });
  leads.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#EAF2F8').setWrap(true);
  leads.setFrozenRows(1);
  leads.getRange('M2:M').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Request sent', 'Connected'], true).setAllowInvalid(false).build());
  leads.getRange('O2:O').insertCheckboxes();
  ['J2:J', 'L2:L', 'N2:N', 'Q2:Q'].forEach(range => leads.getRange(range).setNumberFormat('yyyy-mm-dd'));
  [150, 210, 250, 260, 230, 260, 260, 90, 170, 110, 170, 130, 150, 110, 80, 140, 110, 240]
    .forEach((width, index) => leads.setColumnWidth(index + 1, width));
  buildStartHere_(ss);
  buildSimpleTab_(ss, 'Run Log', ['Run ID', 'Timestamp', 'Persona', 'Requested Target', 'Candidates Inspected', 'New Leads', 'Updated Leads', 'Duplicates Skipped', 'Rejected Candidates', 'Blocker / Failure', 'Duration (s)']);
  ss.setActiveSheet(leads);
}

function getOrCreate_(ss, title) { return ss.getSheetByName(title) || ss.insertSheet(title); }

function buildSimpleTab_(ss, title, headers) {
  const sheet = getOrCreate_(ss, title);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#EAF2F8');
  sheet.setFrozenRows(1);
}

function buildStartHere_(ss) {
  const sheet = getOrCreate_(ss, 'Start Here');
  sheet.clear();
  sheet.getRange('A1:A7').setValues([
    ['Aidgent Prospecting'],
    ['1. Make a copy of this template and share it with the service account Codex gives you.'],
    ['2. Codex guides you through your business, ICP approval, and a five-lead pilot.'],
    ['3. Codex researches publicly, uses Apify for posts, and asks you to verify profiles in LinkedIn.'],
    ['4. You make every connection request and send every message yourself.'],
    ['5. You may reorder, add, or rename ordinary Leads columns; Codex maps them by meaning.'],
    ['6. Never delete Name or LinkedIn/profile URL.'],
  ]);
  sheet.getRange('A1').setFontWeight('bold').setFontSize(16);
  sheet.setColumnWidth(1, 900);
}
