/**
 * Build the Aidgent OS v7 tabs and exact A-AC Leads schema.
 * Run only in a new or empty workshop Sheet. Live lead rows are never relabeled.
 */
function buildLeadSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const headers = [
    'Name', 'Title / Company', 'LinkedIn (or profile URL)',
    'Recent Post (verbatim + date)', 'Post Link', 'Degree', 'Score (1-10)',
    'Why Them', 'Suggested Comment', 'Suggested Intro DM',
    'Reached Out On', 'Connected/Req Sent', 'Replied', 'Outcome',
    'Date Added', 'Source Type', 'Batch', 'Notes',
    'Activity Date', 'Activity Type', 'Fit Score', 'Last Verified',
    'Canonical Key', 'Research Source', 'Research Status',
    'Browser Connection Status', 'Connection Checked On', 'Next Action',
    'Next Action Due'
  ];

  const leads = getOrCreate_(ss, 'Leads');
  if (leads.getMaxColumns() < headers.length) {
    leads.insertColumnsAfter(leads.getMaxColumns(), headers.length - leads.getMaxColumns());
  }
  const hasLiveData = leads.getLastRow() > 3 &&
    leads.getRange(4, 1, leads.getLastRow() - 3, headers.length)
      .getDisplayValues().some(row => row.some(Boolean));
  if (hasLiveData) {
    throw new Error('Leads already contains data. Make a backup and migrate it into a fresh v7 Sheet.');
  }

  leads.getRange(1, 1, 2, headers.length).breakApart();
  leads.getRange(1, 1, 1, headers.length).merge()
    .setValue('Aidgent OS — qualified B2B prospects')
    .setFontSize(16).setFontWeight('bold').setBackground('#16324F').setFontColor('#FFFFFF');
  leads.getRange(2, 1, 1, headers.length).merge()
    .setValue('Research only. Nothing is sent automatically. Human tracking lives in K:R.')
    .setBackground('#DCEAF7');
  leads.getRange(3, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#EAF2F8').setWrap(true);
  leads.setFrozenRows(3);
  leads.getRange('L4:L').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Request sent', 'Connected'], true)
    .setAllowInvalid(false).build());
  leads.getRange('M4:M').insertCheckboxes();
  ['K4:K', 'O4:O', 'AA4:AA', 'AC4:AC'].forEach(range =>
    leads.getRange(range).setNumberFormat('yyyy-mm-dd'));
  leads.setColumnWidth(1, 160);
  leads.setColumnWidth(2, 220);
  leads.setColumnWidth(3, 260);
  leads.setColumnWidths(4, 7, 220);
  leads.setColumnWidths(11, 8, 130);
  leads.setColumnWidths(19, 11, 145);

  buildSimpleTab_(ss, 'Feedback', ['Date', 'What should change?', 'Type', 'Status', 'Applied On', 'What changed']);
  buildSimpleTab_(ss, 'ICP + Schedule', ['Field', 'Confirmed value']);
  buildSimpleTab_(ss, 'Prompt Library', ['Prompt', 'Purpose']);
  buildSimpleTab_(ss, 'Lists', ['List', 'Value']);
  buildSimpleTab_(ss, 'Run Log', [
    'Run ID', 'Timestamp', 'Persona', 'Requested Target', 'Candidates Inspected',
    'New Leads', 'Updated Leads', 'Duplicates Skipped', 'Rejected Candidates',
    'Blocker / Failure', 'Duration (s)'
  ]);
  buildStartHere_(ss);
  ss.setActiveSheet(leads);
}

function getOrCreate_(ss, title) {
  return ss.getSheetByName(title) || ss.insertSheet(title);
}

function buildSimpleTab_(ss, title, headers) {
  const sheet = getOrCreate_(ss, title);
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#EAF2F8');
  sheet.setFrozenRows(1);
}

function buildStartHere_(ss) {
  const sheet = getOrCreate_(ss, 'Start Here');
  sheet.getRange('A1:A6').setValues([
    ['Aidgent OS v7'],
    ['1. Share this Sheet with the Google service-account client_email as Editor.'],
    ['2. Let Codex bind and verify this exact Sheet.'],
    ['3. Codex sources publicly, enriches through Apify, and Browser-verifies profiles.'],
    ['4. You make every connection request and send every message yourself.'],
    ['5. Use the Leads tab Next Action column as the daily queue.']
  ]);
  sheet.getRange('A1').setFontWeight('bold').setFontSize(16);
  sheet.setColumnWidth(1, 850);
}
