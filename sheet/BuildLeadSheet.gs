/**
 * ============================================================================
 *  AIDGENT OS  ·  Lead Sheet builder
 *  aidgentic.com
 * ----------------------------------------------------------------------------
 *  Builds a simple, branded outreach sheet: a Leads tab (agent output in A-F,
 *  your tracking in G-M) and a Start Here dashboard. Nothing auto-sends.
 *
 *  SETUP
 *    1. Open a new Google Sheet (sheets.new).
 *    2. Extensions > Apps Script. Delete the stub. Paste this file. Save.
 *    3. Run  buildLeadSheet  once. Approve the permission prompt.
 *    4. Share it: swap /edit at the end of the link for /copy so others get a copy.
 *
 *  The sourcing prompts return exactly columns A-F, in order, so a paste lands clean.
 * ============================================================================
 */

var NAVY='#0A2540', CYAN='#14CCF7', INK='#1A2230', GRAY='#8A93A2';
var SOFT='#F2FBFE', SOFTBORDER='#BDE9FA', ROWBG='#F7FAFC', WHITE='#FFFFFF', FONT='Arial';

var OUTCOMES = ['No response','Neutral','Positive','Not a fit','Follow up'];

// [title, widthPx, type]  type: text | link | check | date | outcome
var LEADS = [
  ['Name',                          170,'text'],
  ['Title / Company',               220,'text'],
  ['LinkedIn (or profile URL)',     180,'link'],
  ['Latest Post (or relevant link)',180,'link'],
  ['Why Them',                      260,'text'],
  ['Suggested Opener',              360,'text'],
  ['Reached Out',                   90, 'check'],
  ['Replied',                       80, 'check'],
  ['Outcome',                       120,'outcome'],
  ['Date Added',                    110,'date'],
  ['Source Type',                   120,'text'],
  ['Batch',                         90, 'text'],
  ['Notes',                         220,'text']
];

function onOpen(){
  SpreadsheetApp.getUi().createMenu('⚡ Aidgent OS')
    .addItem('Rebuild / refresh styling','buildLeadSheet')
    .addItem('Clear the Leads list','clearLeads')
    .addToUi();
}

function buildLeadSheet(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  buildLeads_(ss);
  buildStart_(ss);
  orderTabs_(ss, ['Start Here','Leads']);
  var s = ss.getSheetByName('Start Here'); if (s) ss.setActiveSheet(s);
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length>1){ try{ ss.deleteSheet(def); }catch(e){} }
  SpreadsheetApp.getActive().toast('Lead sheet ready.','⚡ Built',5);
}

function buildLeads_(ss){
  var sh = ss.getSheetByName('Leads') || ss.insertSheet('Leads');
  var n = LEADS.length;
  sh.setHiddenGridlines(true);
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());

  sh.getRange(1,1,1,n).merge().setValue('AIDGENT OS   ·   LEADS')
    .setBackground(NAVY).setFontColor(WHITE).setFontFamily(FONT).setFontSize(14)
    .setFontWeight('bold').setVerticalAlignment('middle');
  sh.setRowHeight(1,40);
  sh.getRange(2,1,1,n).merge().setValue('Agent output in A-F  ·  your review in G-M  ·  paste sourced rows under the headers')
    .setBackground(SOFT).setFontColor(INK).setFontFamily(FONT).setFontSize(10).setFontStyle('italic');
  sh.setRowHeight(2,24);

  sh.getRange(3,1,1,n).setValues([LEADS.map(function(c){return c[0];})])
    .setBackground(NAVY).setFontColor(WHITE).setFontFamily(FONT).setFontWeight('bold')
    .setFontSize(10).setWrap(true).setVerticalAlignment('middle');
  sh.setRowHeight(3,30);

  var dataRows = sh.getMaxRows()-3;
  for (var c=0;c<n;c++){
    var col=c+1, type=LEADS[c][2];
    sh.setColumnWidth(col, LEADS[c][1]);
    var body = sh.getRange(4,col,dataRows,1);
    body.setFontFamily(FONT).setFontColor(INK).setFontSize(10).setVerticalAlignment('top');
    body.setWrapStrategy(type==='text' ? SpreadsheetApp.WrapStrategy.WRAP : SpreadsheetApp.WrapStrategy.CLIP);
    if (type==='check'){ body.insertCheckboxes(); body.setHorizontalAlignment('center'); }
    else if (type==='date'){ body.setNumberFormat('mmm d, yyyy'); body.setHorizontalAlignment('center'); }
    else if (type==='outcome'){
      body.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(OUTCOMES, true).setAllowInvalid(true).build());
    }
  }
  sh.setFrozenRows(3);
  sh.setFrozenColumns(1);
  var rng = sh.getRange(4,1,dataRows,n);
  var rules = [SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=ISEVEN(ROW())').setBackground(ROWBG).setRanges([rng]).build()];
  var outRng = sh.getRange(4,9,dataRows,1); // Outcome = column I
  [['Positive','#0F9D58',WHITE],['Follow up','#FFF2CC',INK],['Neutral',SOFT,INK],
   ['No response','#F1F3F4',GRAY],['Not a fit','#F4CCCC','#7A1F1F']].forEach(function(m){
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(m[0]).setBackground(m[1]).setFontColor(m[2]).setRanges([outRng]).build());
  });
  sh.setConditionalFormatRules(rules);
  rng.setBorder(null,null,true,null,false,true,SOFTBORDER,SpreadsheetApp.BorderStyle.SOLID);
  if (sh.getMaxColumns() > n) sh.deleteColumns(n+1, sh.getMaxColumns()-n);
}

function buildStart_(ss){
  var sh = ss.getSheetByName('Start Here') || ss.insertSheet('Start Here');
  sh.clear(); sh.setHiddenGridlines(true);
  var W=4;
  sh.setColumnWidth(1,40); for (var c=2;c<=W;c++) sh.setColumnWidth(c,220);

  sh.getRange(1,1,1,W).merge().setValue('AIDGENT OS').setBackground(NAVY).setFontColor(WHITE)
    .setFontFamily(FONT).setFontSize(22).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(1,54);
  sh.getRange(2,1,1,W).merge().setValue('A human-approved prospecting system  ·  aidgentic.com')
    .setBackground(SOFT).setFontColor(INK).setFontFamily(FONT).setFontSize(11).setFontStyle('italic').setHorizontalAlignment('center');
  sh.setRowHeight(2,26);

  var r=4;
  sec_(sh,r,W,'Today at a glance'); r++;
  [['Prospects','=COUNTA(Leads!A4:A)'],['Reached out','=COUNTIF(Leads!G4:G,TRUE)'],
   ['Replies','=COUNTIF(Leads!H4:H,TRUE)'],['Positive','=COUNTIF(Leads!I4:I,"Positive")']].forEach(function(m){
    sh.getRange(r,2).setValue(m[0]).setFontColor(INK).setFontFamily(FONT).setFontSize(11).setVerticalAlignment('middle');
    sh.getRange(r,3).setFormula(m[1]).setFontColor(NAVY).setFontWeight('bold').setFontFamily(FONT).setFontSize(16)
      .setHorizontalAlignment('center').setBackground(SOFT).setBorder(true,true,true,true,false,false,SOFTBORDER,SpreadsheetApp.BorderStyle.SOLID);
    sh.setRowHeight(r,28); r++;
  });

  r++; sec_(sh,r,W,'The daily loop'); r++;
  [['1','Open Leads and read the newest names and their evidence.'],
   ['2','Check the fit: read Why Them, open the public source links.'],
   ['3','Make it yours: use or edit the Suggested Opener.'],
   ['4','Reach out yourself. Nothing auto-sends.'],
   ['5','Track reality: tick Reached Out and Replied, pick an Outcome.']].forEach(function(row){
    sh.getRange(r,2).setValue(row[0]).setFontColor(CYAN).setFontWeight('bold').setFontFamily(FONT).setHorizontalAlignment('center');
    sh.getRange(r,3,1,W-2).merge().setValue(row[1]).setFontColor(INK).setFontFamily(FONT).setFontSize(10).setWrap(true).setVerticalAlignment('middle');
    sh.setRowHeight(r,28); r++;
  });

  r++;
  sh.getRange(r,2,1,W-1).merge().setValue('Safety rule: the agent reads and drafts. It never sends, connects, comments, or posts on your behalf. Every outward action is something you do yourself.')
    .setFontColor(INK).setFontFamily(FONT).setFontSize(10).setWrap(true).setBackground(SOFT)
    .setBorder(true,true,true,true,false,false,SOFTBORDER,SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(r,44); r+=2;
  sh.getRange(r,1,1,W).merge().setValue('Aidgentic  ·  AI automation for founder-led businesses  ·  aidgentic.com')
    .setFontColor(GRAY).setFontFamily(FONT).setFontSize(9).setHorizontalAlignment('center')
    .setBorder(true,false,false,false,false,false,CYAN,SpreadsheetApp.BorderStyle.SOLID_THICK);

  sh.setFrozenRows(2);
  if (sh.getMaxColumns()>W) sh.deleteColumns(W+1, sh.getMaxColumns()-W);
}

function sec_(sh,row,W,label){
  sh.getRange(row,1,1,W).merge().setValue(label.toUpperCase())
    .setFontColor(NAVY).setFontWeight('bold').setFontFamily(FONT).setFontSize(11).setVerticalAlignment('middle')
    .setBorder(false,false,true,false,false,false,CYAN,SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.setRowHeight(row,26);
}

function orderTabs_(ss, order){
  order.forEach(function(name, idx){
    var sh = ss.getSheetByName(name);
    if (sh && !sh.isSheetHidden()){ ss.setActiveSheet(sh); ss.moveActiveSheet(idx+1); }
  });
}

function clearLeads(){
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Leads');
  if (!sh) return;
  var last = sh.getLastRow();
  if (last>3) sh.getRange(4,1,last-3,LEADS.length).clearContent();
  SpreadsheetApp.getActive().toast('Leads cleared.','⚡',3);
}
